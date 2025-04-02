import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { PromptConfig, PromptMetadata, ParsedPrompt, validatePromptMetadata } from './types.js';
import { log } from './utils/logging.js';

/**
 * Custom error class for prompts directory related errors
 */
export class PromptsDirectoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptsDirectoryError';
  }
}

export class PromptLoader {
  private prompts: Map<string, PromptConfig> = new Map();

  /**
   * Resolves the prompts directory path from environment variable
   * Creates the directory if it doesn't exist
   * @throws {PromptsDirectoryError} If PROMPTS_DIR is not set or directory cannot be created
   */
  async resolvePromptsDir(): Promise<string> {
    try {
      const envDir = process.env.PROMPTS_DIR;
      if (!envDir) {
        throw new PromptsDirectoryError(
          'PROMPTS_DIR environment variable must be set to specify the prompts directory'
        );
      }

      await fs.mkdir(envDir, { recursive: true });
      log(`Using prompts directory: ${envDir}`);
      return envDir;
    } catch (error: unknown) {
      if (error instanceof PromptsDirectoryError) {
        throw error;
      }
      
      if (error instanceof Error) {
        throw new PromptsDirectoryError(`Failed to create prompts directory: ${error.message}`);
      }
      
      throw new PromptsDirectoryError('An unknown error occurred while resolving prompts directory');
    }
  }

  /**
   * Recursively resolves @import directives in prompt content.
   * Handles cycles, duplicates, and file not found errors.
   * Supports escaping with \@.
   *
   * @param content The raw content containing import directives
   * @param currentFilePath Absolute path of the current file being processed
   * @param promptsDir Absolute path of the base prompts directory
   * @param visitedPaths Tracks files visited in the current branch for cycle detection
   * @param alreadyIncludedPaths Tracks all included files across branches to prevent duplicates
   * @returns Resolved content with all imports processed
   * @throws {PromptsDirectoryError} On circular dependencies or critical file errors
   */
  private async resolveIncludes(
    content: string,
    currentFilePath: string,
    promptsDir: string,
    visitedPaths: Set<string>,
    alreadyIncludedPaths: Set<string>
  ): Promise<string> {
    // Check for circular dependencies
    if (visitedPaths.has(currentFilePath)) {
      throw new PromptsDirectoryError(
        `Circular dependency detected: ${currentFilePath} is already being processed in this import chain.`
      );
    }
    visitedPaths.add(currentFilePath);

    // Constants for import resolution
    const ALLOWED_EXTENSIONS = ['md'];
    const importPattern = new RegExp(
      `(\\\\@)|@([\\w\\/-]+\\.(?:${ALLOWED_EXTENSIONS.join('|')}))`,
      'g'
    );
    const escapePattern = /\\@/g;

    let resolvedContent = content;
    let match: RegExpExecArray | null;

    while ((match = importPattern.exec(resolvedContent)) !== null) {
      const [fullMatch, escapedAt, relativePath] = match;

      // Skip if this is an escaped @
      if (escapedAt) continue;

      // Skip if no import path was found (shouldn't happen, but safety check)
      if (!relativePath) continue;

      const includePath = path.resolve(promptsDir, relativePath);

      // Skip if this file has already been included elsewhere
      if (alreadyIncludedPaths.has(includePath)) {
        log(`Skipping duplicate include: ${includePath} in ${currentFilePath}`, 'info');
        resolvedContent = resolvedContent.replace(fullMatch, '');
        importPattern.lastIndex = 0;
        continue;
      }

      try {
        // Mark as included before processing to prevent duplicates
        alreadyIncludedPaths.add(includePath);

        const includeContentRaw = await fs.readFile(includePath, 'utf-8');
        const resolvedIncludeContent = await this.resolveIncludes(
          includeContentRaw,
          includePath,
          promptsDir,
          new Set(visitedPaths),
          alreadyIncludedPaths
        );

        resolvedContent = resolvedContent.replace(fullMatch, resolvedIncludeContent);
        importPattern.lastIndex = 0;

      } catch (error) {
        // Remove from included set if processing failed
        alreadyIncludedPaths.delete(includePath);

        if (error instanceof Error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            log(`Include file not found: ${includePath} referenced in ${currentFilePath}. Skipping.`, 'warn');
            resolvedContent = resolvedContent.replace(fullMatch, '');
            importPattern.lastIndex = 0;
            continue;
          }
          
          if (error instanceof PromptsDirectoryError) {
            throw error;
          }

          log(`Error processing include ${includePath} in ${currentFilePath}: ${error.message}`, 'error');
          resolvedContent = resolvedContent.replace(
            fullMatch,
            `/* Error including ${relativePath}: ${error.message} */`
          );
          importPattern.lastIndex = 0;
          continue;
        }

        // Handle non-Error throws
        log(`An unknown error occurred while processing include ${includePath} in ${currentFilePath}: ${String(error)}`, 'error');
        resolvedContent = resolvedContent.replace(fullMatch, `/* Unknown error including ${relativePath} */`);
        importPattern.lastIndex = 0;
        continue;
      }
    }

    // Replace escaped @ with @ after all imports are resolved
    return resolvedContent.replace(escapePattern, '@');
  }

  async loadPrompts(): Promise<void> {
    const promptsDir = await this.resolvePromptsDir();
    try {
      const files = await fs.readdir(promptsDir);
      // Filter for .md files, excluding those starting with '_' (partials)
      const mdFiles = files.filter(file => file.endsWith('.md') && !path.basename(file).startsWith('_'));

      if (mdFiles.length === 0) {
        log(`No .md files found in ${promptsDir}`, 'warn');
      }

      for (const file of mdFiles) {
        const promptPath = path.join(promptsDir, file);
        // Pass promptsDir for resolving includes relative to the base
        await this.loadPrompt(promptPath, promptsDir);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new PromptsDirectoryError(`Prompts directory not found: ${promptsDir}`);
        }
        throw new PromptsDirectoryError(`Error loading prompts: ${error.message}`);
      }
      throw new PromptsDirectoryError('An unknown error occurred while loading prompts');
    }
  }

  /**
   * Loads a prompt from a file
   * @param filePath The path to the prompt file
   * @param promptsDir The base directory for prompts, used for resolving includes
   * @throws {PromptsDirectoryError} If the prompt cannot be loaded or includes fail
   */
  async loadPrompt(filePath: string, promptsDir: string): Promise<void> {
    try {
      const rawContent = await fs.readFile(filePath, 'utf-8');

      // Resolve @import directives before parsing frontmatter
      const resolvedContent = await this.resolveIncludes(
        rawContent,
        filePath,
        promptsDir,
        new Set<string>(), // For cycle detection in current branch
        new Set<string>()  // For duplicate prevention across all branches
      );

      const { data, content: promptContent } = matter(resolvedContent);
      
      // Validate frontmatter using our custom validator
      const metadata = validatePromptMetadata(data);

      const parsed: ParsedPrompt = {
        metadata,
        content: promptContent.trim()
      };
      log(`[Loader] Content loaded for ${path.basename(filePath)}: ${promptContent.trim().substring(0, 100)}...`, 'info'); // Log first 100 chars

      const promptName = path.basename(filePath, '.md');
      this.prompts.set(promptName, {
        path: filePath,
        parsed
      });

      log(`Loaded prompt: ${promptName} with clean name "${metadata.name}"`);

    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new PromptsDirectoryError(
          `Error loading prompt ${filePath}: ${error.message}`
        );
      }
      throw new PromptsDirectoryError(
        `An unknown error occurred while loading prompt ${filePath}`
      );
    }
  }

  getPrompt(name: string): PromptConfig | undefined {
    return this.prompts.get(name);
  }

  getAllPrompts(): PromptConfig[] {
    return Array.from(this.prompts.values());
  }
}
