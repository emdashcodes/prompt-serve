import { PromptLoader, PromptsDirectoryError } from './prompt-loader.js';
import { initializeServer, shutdownServer, server } from './server.js';
import { PromptRegistry, registerPrompts } from './prompt-registry.js';
import { PromptWatcher } from './prompt-watcher.js';
import { extendServer } from './server-extension.js';
import { log } from './utils/logging.js';

process.on('uncaughtException', (error) => {
  log('Uncaught exception: ' + error.message, 'error');
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  log('Unhandled rejection: ' + (error instanceof Error ? error.message : String(error)), 'error');
  process.exit(1);
});

async function main() {
  try {
    // Extend the server with deregisterPrompt functionality
    extendServer(server);
    
    // Create components
    const loader = new PromptLoader();
    const registry = new PromptRegistry(server);
    
    // Load all prompts
    await loader.loadPrompts();
    
    // Register all prompts BEFORE server starts
    await registry.registerAllPrompts(loader);
    
    // Start server
    await initializeServer();
    log('Prompt MCP server running on stdio');
    
    // Initialize and start the prompt watcher AFTER server is running
    const promptsDir = await loader.resolvePromptsDir();
    const watcher = new PromptWatcher(promptsDir, loader, registry);
    watcher.startWatching();
    log('Prompt watcher started - hot reloading enabled');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      try {
        // Stop the watcher first
        if (watcher) {
          await watcher.stopWatching();
        }
        
        // Then shut down the server
        await shutdownServer();
        process.exit(0);
      } catch (error) {
        log('Error during shutdown: ' + (error instanceof Error ? error.message : String(error)), 'error');
        process.exit(1);
      }
    });
  } catch (error) {
    if (error instanceof PromptsDirectoryError) {
      log('Prompts directory error: ' + error.message, 'error');
    } else if (error instanceof Error) {
      log('Failed to start server: ' + error.message, 'error');
    } else {
      log('An unknown error occurred', 'error');
    }
    process.exit(1);
  }
}

// Run the server
main().catch(error => {
  log('Unhandled error: ' + (error instanceof Error ? error.message : String(error)), 'error');
  process.exit(1);
});