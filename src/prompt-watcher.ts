import path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises'; // Use promises for async stat
import { PromptLoader } from './prompt-loader.js';
import { PromptRegistry } from './prompt-registry.js';
import { log } from './utils/logging.js';

// Default scan interval in milliseconds
const DEFAULT_SCAN_INTERVAL_MS = 10000; // Scan every 10 seconds by default

/**
 * Monitors the prompts directory for new files using periodic scanning.
 * Modifications and deletions require a server restart.
 */
export class PromptWatcher {
  private loader: PromptLoader;
  private registry: PromptRegistry;
  private periodicScanInterval?: NodeJS.Timeout;
  private promptsDir: string;
  private scanIntervalMs: number;
  // Set to store the file paths of known prompts
  private knownFilePaths: Set<string> = new Set();

  /**
   * Creates a new PromptWatcher instance
   * @param promptsDir The directory to watch for prompt changes
   * @param loader The PromptLoader instance to use for loading prompts
   * @param registry The PromptRegistry instance to use for registering prompts
   */
  constructor(promptsDir: string, loader: PromptLoader, registry: PromptRegistry) {
    this.loader = loader;
    this.registry = registry;
    this.promptsDir = promptsDir;

    log(`Initializing PromptWatcher for ${promptsDir} (New files only)`);

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
    }
  }

  /**
   * Starts the periodic scan of the prompts directory.
   */
  startWatching(): void {
    log(`Starting periodic directory scan for ${this.promptsDir} every ${this.scanIntervalMs}ms (New files only)`);

    // Perform initial scan immediately to load existing files and populate state
    this.performDirectoryScan().catch(error => {
      log(`Error during initial directory scan: ${error instanceof Error ? error.message : String(error)}`, 'error');
    });

    // Set up the periodic scan interval
    this.periodicScanInterval = setInterval(() => {
      this.performDirectoryScan().catch(error => {
        log(`Error during periodic directory scan: ${error instanceof Error ? error.message : String(error)}`, 'error');
      });
    }, this.scanIntervalMs);

    log('Prompt watcher started using periodic scan (New files only).');
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
   * Performs a scan of the prompts directory, detecting new files.
   */
  private async performDirectoryScan(): Promise<void> {
    log(`Performing directory scan of ${this.promptsDir}...`, 'info');
    let currentFilesOnDiskPaths: Set<string>;

    try {
      const files = await fsPromises.readdir(this.promptsDir);
      const mdFiles = files.filter(file => this.isValidPromptFile(file));
      currentFilesOnDiskPaths = new Set(mdFiles.map(file => path.join(this.promptsDir, file)));
    } catch (error) {
      log(`Error reading prompts directory ${this.promptsDir}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      return; // Cannot proceed
    }

    let changesDetected = false;

    // Check for new files
    for (const filePath of currentFilesOnDiskPaths) {
      if (!this.knownFilePaths.has(filePath)) {
        log(`Detected new file: ${filePath}`, 'info');
        changesDetected = true;
        try {
          await this.handlePromptCreated(filePath);
          this.knownFilePaths.add(filePath);
        } catch (error) {
          log(`Failed to handle creation for ${filePath}: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
      }
    }

    if (!changesDetected) {
        log(`No new files detected in ${this.promptsDir}.`, 'info');
    }
  }
  /**
   * Checks if a file is a valid prompt file (markdown)
   */
  private isValidPromptFile(filePath: string): boolean {
    return path.basename(filePath)[0] !== '.' && filePath.endsWith('.md');
  }

  /**
   * Handles the creation of a new prompt file.
   */
  private async handlePromptCreated(filePath: string): Promise<void> {
    log(`Handling creation for: ${filePath}`);
    const promptName = path.basename(filePath, '.md');
    try {
      await this.loader.loadPrompt(filePath);
      const promptConfig = this.loader.getPrompt(promptName);
      if (promptConfig) {
        await this.registry.registerPrompt(promptName, promptConfig);
        log(`Registered new prompt: ${promptName} (Clean name: "${promptConfig.parsed.metadata.name}")`);
      } else {
        log(`Prompt config not found after loading ${promptName}`, 'warn');
      }
    } catch (error) {
      log(`Error processing created prompt ${filePath}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      throw error;
    }
  }
}
