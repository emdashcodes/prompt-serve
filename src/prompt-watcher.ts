import path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises'; // Use promises for async stat
import { PromptLoader } from './prompt-loader.js';
import { PromptRegistry } from './prompt-registry.js';
import './server-extension.js';
import { log } from './utils/logging.js';

// Default scan interval in milliseconds
const DEFAULT_SCAN_INTERVAL_MS = 5000;

// Interface for storing file state
interface FileState {
  mtimeMs: number;
}

/**
 * Monitors the prompts directory for changes using periodic scanning.
 */
export class PromptWatcher {
  private loader: PromptLoader;
  private registry: PromptRegistry;
  private periodicScanInterval?: NodeJS.Timeout;
  private promptsDir: string;
  private scanIntervalMs: number;
  // Map to store the last known state (mtime) of processed files
  private knownFilesState: Map<string, FileState> = new Map();

  /**
   * Creates a new PromptWatcher instance
   * @param promptsDir The directory to watch for prompt changes
   * @param loader The PromptLoader instance to use for loading prompts
   * @param registry The PromptRegistry instance to use for registering prompts
   */
  constructor(promptsDir: string, loader: PromptLoader, registry: PromptRegistry) {
    this.loader = loader;
    this.registry = registry;
    this.promptsDir = promptsDir; // Store promptsDir for later use

    log(`Initializing PromptWatcher for ${promptsDir}`);

    // Determine scan interval
    const envInterval = process.env.PROMPT_SCAN_INTERVAL_MS;
    let parsedInterval = parseInt(envInterval || '', 10);
    if (isNaN(parsedInterval) || parsedInterval <= 0) {
      if (envInterval) {
        log(`Invalid PROMPT_SCAN_INTERVAL_MS value "${envInterval}". Using default: ${DEFAULT_SCAN_INTERVAL_MS}ms`, 'warn');
      }
      parsedInterval = DEFAULT_SCAN_INTERVAL_MS;
    }
    this.scanIntervalMs = parsedInterval;

    // Ensure the directory exists synchronously during construction
    try {
      if (!fs.existsSync(promptsDir)) {
        fs.mkdirSync(promptsDir, { recursive: true });
        log(`Created prompts directory: ${promptsDir}`);
      }
    } catch (error) {
      log(`Error checking/creating directory: ${error instanceof Error ? error.message : String(error)}`, 'error');
      // Allow continuing, scan will likely fail and log errors
    }
  }

  /**
   * Starts the periodic scan of the prompts directory.
   */
  startWatching(): void {
    log(`Starting periodic directory scan for ${this.promptsDir} every ${this.scanIntervalMs}ms`);

    // Perform initial scan immediately to load existing files and populate state
    this.performDirectoryScan().catch(error => {
      log(`Error during initial directory scan: ${error instanceof Error ? error.message : String(error)}`, 'error');
    });

    // Set up the periodic scan interval
    this.periodicScanInterval = setInterval(() => {
      this.performDirectoryScan().catch(error => {
        // Log errors from periodic scans but don't stop the interval
        log(`Error during periodic directory scan: ${error instanceof Error ? error.message : String(error)}`, 'error');
      });
    }, this.scanIntervalMs);

    log('Prompt watcher started using periodic scan.');
  }

  /**
   * Stops the periodic scan.
   */
  async stopWatching(): Promise<void> {
    if (this.periodicScanInterval) {
      clearInterval(this.periodicScanInterval);
      this.periodicScanInterval = undefined;
      log('Periodic directory scan stopped');
    }
  }

  /**
   * Performs a scan of the prompts directory, comparing against known state.
   */
  private async performDirectoryScan(): Promise<void> {
    log(`Performing directory scan of ${this.promptsDir}...`, 'info');
    let currentFilesOnDisk: Set<string>;
    let filesStats: Map<string, fs.Stats>;

    try {
      const files = await fsPromises.readdir(this.promptsDir);
      const mdFiles = files.filter(file => this.isValidPromptFile(file));
      currentFilesOnDisk = new Set(mdFiles.map(file => path.join(this.promptsDir, file)));
      filesStats = new Map();

      // Get stats for all current markdown files
      for (const filePath of currentFilesOnDisk) {
        try {
          const stats = await fsPromises.stat(filePath);
          filesStats.set(filePath, stats);
        } catch (statError) {
          log(`Error getting stats for file ${filePath}: ${statError instanceof Error ? statError.message : String(statError)}`, 'warn');
          // Remove from set if we can't get stats, treat as non-existent for this scan
          currentFilesOnDisk.delete(filePath);
        }
      }
    } catch (error) {
      log(`Error reading prompts directory ${this.promptsDir}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      // Cannot proceed with scan if directory read fails
      return;
    }

    const knownFilePaths = new Set(this.knownFilesState.keys());
    let changesDetected = false;

    // Check for new or modified files
    for (const filePath of currentFilesOnDisk) {
      const stats = filesStats.get(filePath);
      if (!stats) continue; // Should not happen due to check above, but safety first

      const currentMtimeMs = stats.mtimeMs;
      const knownState = this.knownFilesState.get(filePath);

      if (!knownState) {
        // New file detected
        log(`Detected new file: ${filePath}`, 'info');
        changesDetected = true;
        try {
          await this.handlePromptCreated(filePath);
          // Add to known state only after successful processing
          this.knownFilesState.set(filePath, { mtimeMs: currentMtimeMs });
        } catch (error) {
          log(`Failed to handle creation for ${filePath}: ${error instanceof Error ? error.message : String(error)}`, 'error');
          // Do not add to known state if handling failed
        }
      } else if (currentMtimeMs > knownState.mtimeMs) {
        // Modified file detected
        log(`Detected modified file: ${filePath}`, 'info');
        changesDetected = true;
        try {
          await this.handlePromptModified(filePath);
          // Update known state only after successful processing
          this.knownFilesState.set(filePath, { mtimeMs: currentMtimeMs });
        } catch (error) {
          log(`Failed to handle modification for ${filePath}: ${error instanceof Error ? error.message : String(error)}`, 'error');
          // Do not update known state if handling failed
        }
      }
      // If mtime is the same or older (e.g., system time issue), do nothing.
    }

    // Check for deleted files
    for (const filePath of knownFilePaths) {
      if (!currentFilesOnDisk.has(filePath)) {
        // Deleted file detected
        log(`Detected deleted file: ${filePath}`, 'info');
        changesDetected = true;
        try {
          await this.handlePromptDeleted(filePath);
          // Remove from known state only after successful processing
          this.knownFilesState.delete(filePath);
        } catch (error) {
          log(`Failed to handle deletion for ${filePath}: ${error instanceof Error ? error.message : String(error)}`, 'error');
          // Do not remove from known state if handling failed, will retry next scan
        }
      }
    }

    if (!changesDetected) {
        log(`No changes detected in ${this.promptsDir}.`, 'info');
    }
  }

  /**
   * Checks if a file is a valid prompt file.
   */
  private isValidPromptFile(filePath: string): boolean {
    // Basic check, can be expanded (e.g., ignore dotfiles)
    return path.basename(filePath)[0] !== '.' && filePath.endsWith('.md');
  }

  // --- Handler Methods ---
  // These methods remain largely the same but are now called exclusively by performDirectoryScan

  /**
   * Handles the creation of a new prompt file.
   */
  private async handlePromptCreated(filePath: string): Promise<void> {
    // No need to double-check isValidPromptFile here, scan already filters
    log(`Handling creation for: ${filePath}`);
    const promptName = path.basename(filePath, '.md');
    try {
      await this.loader.loadPrompt(filePath);
      const promptConfig = this.loader.getPrompt(promptName);
      if (promptConfig) {
        await this.registry.updatePrompt(promptName, promptConfig);
        log(`Registered new prompt: ${promptName} (Clean name: "${promptConfig.parsed.metadata.name}")`);
      } else {
        // This case should ideally not happen if loadPrompt succeeded
        log(`Prompt config not found after loading ${promptName}`, 'warn');
      }
    } catch (error) {
      log(`Error processing created prompt ${filePath}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      // Rethrow to signal failure to the scanner
      throw error;
    }
  }

  /**
   * Handles the modification of an existing prompt file.
   */
  private async handlePromptModified(filePath: string): Promise<void> {
    log(`Handling modification for: ${filePath}`);
    const promptName = path.basename(filePath, '.md');
    try {
      // Reload first to get the updated content
      await this.loader.reloadPrompt(filePath);
      const updatedConfig = this.loader.getPrompt(promptName);

      if (updatedConfig) {
        // Let registry handle the update logic (including name changes)
        await this.registry.updatePrompt(promptName, updatedConfig);
        log(`Updated prompt: ${promptName} (Clean name: "${updatedConfig.parsed.metadata.name}")`);
      } else {
        // This case should ideally not happen if reloadPrompt succeeded
        log(`Prompt config not found after reloading ${promptName}`, 'warn');
        // Attempt to remove the potentially stale prompt from the registry
        this.registry.removePrompt(promptName);
      }
    } catch (error) {
      log(`Error processing modified prompt ${filePath}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      // Rethrow to signal failure to the scanner
      throw error;
    }
  }

  /**
   * Handles the deletion of a prompt file.
   */
  private async handlePromptDeleted(filePath: string): Promise<void> {
    log(`Handling deletion for: ${filePath}`);
    const promptName = path.basename(filePath, '.md');
    try {
      // Remove from registry first
      this.registry.removePrompt(promptName);
      // Then remove from loader
      this.loader.removePrompt(promptName);
      log(`Removed prompt: ${promptName}`);
    } catch (error) {
      log(`Error processing deleted prompt ${filePath}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      // Rethrow to signal failure to the scanner
      throw error;
    }
  }
}