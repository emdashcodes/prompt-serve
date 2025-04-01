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

  async loadPrompts(): Promise<void> {
    const promptsDir = await this.resolvePromptsDir();
    try {
      const files = await fs.readdir(promptsDir);
      const mdFiles = files.filter(file => file.endsWith('.md'));

      if (mdFiles.length === 0) {
        log(`No .md files found in ${promptsDir}`, 'warn');
      }

      for (const file of mdFiles) {
        const promptPath = path.join(promptsDir, file);
        await this.loadPrompt(promptPath);
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
   * @throws {PromptsDirectoryError} If the prompt cannot be loaded
   */
  async loadPrompt(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const { data, content: promptContent } = matter(content);
      
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
