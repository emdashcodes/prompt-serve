import { FSWatcher } from 'chokidar';
import path from 'path';
import chokidar from 'chokidar';
import * as fs from 'fs';
import { PromptLoader } from './prompt-loader.js';
import { PromptRegistry } from './prompt-registry.js';
import './server-extension.js';
import { log } from './utils/logging.js';

/**
 * Responsible for monitoring the prompts directory for changes
 * and triggering appropriate actions when prompts are added, modified, or deleted.
 */
export class PromptWatcher {
  private watcher: FSWatcher;
  private loader: PromptLoader;
  private registry: PromptRegistry;
  private periodicScanInterval?: NodeJS.Timeout;
  
  /**
   * Creates a new PromptWatcher instance
   * @param promptsDir The directory to watch for prompt changes
   * @param loader The PromptLoader instance to use for loading prompts
   * @param registry The PromptRegistry instance to use for registering prompts
   */
  constructor(promptsDir: string, loader: PromptLoader, registry: PromptRegistry) {
    this.loader = loader;
    this.registry = registry;
    
    log(`Setting up watcher for ${promptsDir}`);
    
    // Ensure the directory exists
    try {
      if (!fs.existsSync(promptsDir)) {
        fs.mkdirSync(promptsDir, { recursive: true });
        log(`Created prompts directory: ${promptsDir}`);
      }
    } catch (error) {
      log(`Error checking/creating directory: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
    
    // Use a simplified watcher configuration since we have the periodic scan as fallback
    this.watcher = chokidar.watch(promptsDir, {
      persistent: true,
      ignoreInitial: true, // Don't trigger events for existing files - periodic scan will handle this
      depth: 2, // Watch subdirectories
      awaitWriteFinish: true, // Use default settings for stability
      usePolling: true, // Use polling for more reliable detection
      interval: 1000, // Standard polling interval
      ignored: [
        /(^|[\/\\])\../, // Ignore dotfiles
        /(^|[\/\\])node_modules(\/|$)/ // Ignore node_modules
      ]
    });
    
    // Add error handler
    this.watcher.on('error', (error) => {
      log(`Watcher error: ${error}`, 'error');
    });
    
    // Add ready event handler
    this.watcher.on('ready', () => {
      log('Watcher ready - now watching for changes', 'info');
      
      // Start the periodic scan as the primary mechanism for detecting files
      this.startPeriodicScan(promptsDir);
    });
    
    log(`Initialized prompt watcher for directory: ${promptsDir}`);
  }

  /**
   * Starts watching the prompts directory for changes
   */
  startWatching(): void {
    log('Starting prompt watcher with event handlers');
    
    this.watcher
      .on('add', (path) => {
        if (this.isValidPromptFile(path)) {
          log(`Add event detected for: ${path}`, 'info');
          this.handlePromptCreated(path);
        }
      })
      .on('change', (path) => {
        if (this.isValidPromptFile(path)) {
          log(`Change event detected for: ${path}`, 'info');
          this.handlePromptModified(path);
        }
      })
      .on('unlink', (path) => {
        if (this.isValidPromptFile(path)) {
          log(`Unlink event detected for: ${path}`, 'info');
          this.handlePromptDeleted(path);
        }
      });
    
    log('Prompt watcher started - hot reloading enabled');
  }
  
  /**
   * Checks if a file is a valid prompt file
   * @param filePath The path to check
   * @returns True if the file is a valid prompt file, false otherwise
   */
  private isValidPromptFile(filePath: string): boolean {
    return filePath.endsWith('.md');
  }
  
  /**
   * Starts a periodic scan of the prompts directory as the primary mechanism
   * @param promptsDir The directory to scan
   */
  private startPeriodicScan(promptsDir: string): void {
    const scanInterval = 5000; // 5 seconds
    
    log(`Starting periodic directory scan for ${promptsDir} every ${scanInterval}ms`);
    
    // Initial scan to load existing files
    this.performDirectoryScan(promptsDir);
    
    // Set up periodic scan
    this.periodicScanInterval = setInterval(() => {
      this.performDirectoryScan(promptsDir);
    }, scanInterval);
  }
  
  /**
   * Performs a scan of the prompts directory
   * @param promptsDir The directory to scan
   */
  private async performDirectoryScan(promptsDir: string): Promise<void> {
    try {
      // Get all files in the directory
      const files = fs.readdirSync(promptsDir);
      const mdFiles = files.filter(file => file.endsWith('.md'));
      
      // Get all currently loaded prompts
      const loadedPrompts = this.loader.getAllPrompts();
      
      // Only log when we find changes to reduce noise
      let changesFound = false;
      
      // Check for new files not already loaded
      for (const file of mdFiles) {
        const promptName = path.basename(file, '.md');
        const promptConfig = this.loader.getPrompt(promptName);
        
        if (!promptConfig) {
          if (!changesFound) {
            log(`Performing periodic directory scan of ${promptsDir}`);
            log(`Found ${mdFiles.length} markdown files: ${JSON.stringify(mdFiles)}`);
            changesFound = true;
          }
          
          log(`Detected new file via periodic scan: ${file}`);
          const filePath = path.join(promptsDir, file);
          await this.handlePromptCreated(filePath);
        }
      }
      
      // Check for deleted files that are still loaded
      for (const promptConfig of loadedPrompts) {
        // If the prompt's file no longer exists, remove it
        if (!fs.existsSync(promptConfig.path)) {
          if (!changesFound) {
            log(`Performing periodic directory scan of ${promptsDir}`);
            changesFound = true;
          }
          
          const promptName = path.basename(promptConfig.path, '.md');
          const cleanName = promptConfig.parsed.metadata.name;
          log(`Detected deleted file via periodic scan: ${promptName}.md (clean name: "${cleanName}")`);
          await this.handlePromptDeleted(promptConfig.path);
        }
      }
    } catch (error) {
      log(`Error during periodic scan: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  /**
   * Stops watching the prompts directory and cleans up resources
   */
  async stopWatching(): Promise<void> {
    // Clear the periodic scan interval if it exists
    if (this.periodicScanInterval) {
      clearInterval(this.periodicScanInterval);
      this.periodicScanInterval = undefined;
      log('Periodic directory scan stopped');
    }
    
    // Close the watcher
    await this.watcher.close();
    log('Prompt watcher stopped');
  }

  /**
   * Handles the creation of a new prompt file
   * @param filePath The path of the created file
   */
  private async handlePromptCreated(filePath: string): Promise<void> {
    try {
      // We already check if it's a valid prompt file in the caller,
      // but double-check here for safety when called directly
      if (!this.isValidPromptFile(filePath)) {
        return;
      }
      
      log(`New prompt file detected: ${filePath}`);
      
      // Load the new prompt
      await this.loader.loadPrompt(filePath);
      
      // Get the prompt name from the path
      const promptName = path.basename(filePath, '.md');
      
      // Get the loaded prompt config
      const promptConfig = this.loader.getPrompt(promptName);
      
      if (promptConfig) {
        // Get the clean name from frontmatter
        const cleanName = promptConfig.parsed.metadata.name;
        
        // Register the new prompt with the server
        await this.registry.updatePrompt(promptName, promptConfig);
        log(`New prompt registered: ${promptName} with clean name "${cleanName}"`);
      } else {
        log(`Failed to get prompt config for ${promptName}`, 'error');
      }
    } catch (error) {
      log(`Error loading new prompt: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  /**
   * Handles the modification of an existing prompt file
   * @param filePath The path of the modified file
   */
  private async handlePromptModified(filePath: string): Promise<void> {
    try {
      if (!this.isValidPromptFile(filePath)) {
        return;
      }
      
      log(`Prompt file modified: ${filePath}`);
      
      // Get the prompt name from the path
      const promptName = path.basename(filePath, '.md');
      
      // Get the original prompt config to check if the clean name has changed
      const originalConfig = this.loader.getPrompt(promptName);
      const originalCleanName = originalConfig?.parsed.metadata.name;
      
      // Reload the prompt in the loader
      await this.loader.reloadPrompt(filePath);
      
      // Get the updated prompt config
      const updatedConfig = this.loader.getPrompt(promptName);
      
      if (updatedConfig) {
        const newCleanName = updatedConfig.parsed.metadata.name;
        
        // Check if the clean name has changed
        const isCleanNameChanging = originalCleanName && originalCleanName !== newCleanName;
        
        if (isCleanNameChanging) {
          log(`Clean name changing from "${originalCleanName}" to "${newCleanName}"`);
          
          // IMPORTANT: For clean name changes, we need to ensure the old prompt is completely removed
          // before registering the new one to prevent duplicates
          
          // Step 1: First, completely remove the prompt with the old clean name
          this.registry.removePrompt(promptName);
          log(`Completely removed prompt ${promptName} before re-registering with new clean name`);
          
          // Step 2: Verify no prompts exist with the new clean name to avoid duplicates
          // This is handled in registry.updatePrompt, but we log it here for clarity
          log(`Checking for existing prompts with clean name "${newCleanName}" before registration`);
          
          // Step 3: Register with the new clean name
          // The updatePrompt method will handle deregistering any duplicates
          await this.registry.updatePrompt(promptName, updatedConfig);
          log(`Re-registered prompt ${promptName} with new clean name "${newCleanName}"`);
        } else {
          // If the clean name hasn't changed, just update normally
          await this.registry.updatePrompt(promptName, updatedConfig);
          log(`Updated prompt: ${promptName} with clean name "${newCleanName}"`);
        }
      } else {
        log(`Failed to get updated prompt config for ${promptName}`, 'error');
      }
    } catch (error) {
      log(`Error reloading modified prompt: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  /**
   * Handles the deletion of a prompt file
   * @param filePath The path of the deleted file
   */
  private async handlePromptDeleted(filePath: string): Promise<void> {
    try {
      if (!this.isValidPromptFile(filePath)) {
        return;
      }
      
      // Get the prompt name from the path
      const promptName = path.basename(filePath, '.md');
      log(`Prompt file deleted: ${filePath}`);
      
      // Get the prompt config before removing it from the loader
      // This allows us to access the clean name from frontmatter
      const promptConfig = this.loader.getPrompt(promptName);
      let cleanName: string | undefined;
      
      if (promptConfig) {
        cleanName = promptConfig.parsed.metadata.name;
        log(`Found clean name "${cleanName}" for deleted prompt ${promptName}`);
      }
      
      // Remove the prompt from the loader
      this.loader.removePrompt(promptName);
      
      // Deregister the prompt from the server using the filename-derived name
      // The removePrompt method will handle the mapping to the clean name
      this.registry.removePrompt(promptName);
      
      log(`Prompt removed: ${promptName}`);
    } catch (error) {
      log(`Error removing deleted prompt: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }
}