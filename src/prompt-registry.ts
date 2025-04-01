import path from 'path';
import { PromptLoader } from './prompt-loader.js';
import { getPromptArgsSchema } from './schema-handler.js';
import { server } from './server.js';
import { log } from './utils/logging.js';
import { PromptConfig, PromptMetadata } from './types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import './server-extension.js';

/**
 * Handles the registration and management of prompts with the MCP server
 */
export class PromptRegistry {
  private server: McpServer;

  /**
   * Creates a new PromptRegistry instance
   * @param mcpServer The MCP server instance to register prompts with
   */
  constructor(mcpServer: McpServer = server) {
    this.server = mcpServer;
  }

  /**
   * Registers all prompts from the prompt loader with the MCP server
   * @param promptLoader The PromptLoader instance containing the prompts to register
   */
  async registerAllPrompts(promptLoader: PromptLoader): Promise<void> {
    const prompts = promptLoader.getAllPrompts();
    
    for (const prompt of prompts) {
      const { metadata, content } = prompt.parsed;
      const promptName = path.basename(prompt.path, '.md');
      
      await this.registerPrompt(promptName, metadata, content);
    }
    
    log(`Registered ${prompts.length} prompts with the server`);
  }

  // Store mapping between filename-derived names and clean names
  private nameMapping: Map<string, string> = new Map();

  /**
   * Registers a single prompt with the MCP server
   * @param name The name of the prompt (filename-derived)
   * @param metadata The prompt metadata
   * @param content The prompt content
   */
  private async registerPrompt(
    name: string,
    metadata: PromptMetadata,
    content: string
  ): Promise<void> {
    // Use the clean name from frontmatter instead of the filename-derived name
    const promptName = metadata.name;
    
    // Cast to any to avoid TypeScript errors
    const serverAny = this.server as any;
    
    // IMPORTANT: First, ensure the filename-derived name is NOT registered
    // This is critical to prevent duplicate prompts
    
    // Check if the filename-derived name is registered and remove it
    if (serverAny._prompts && serverAny._prompts instanceof Map && serverAny._prompts.has(name)) {
      log(`Removing filename-derived name "${name}" from server map to prevent duplication`, 'info');
      serverAny._prompts.delete(name);
    }
    
    // Also check in _handlers._prompts
    if (serverAny._handlers && serverAny._handlers._prompts instanceof Map && serverAny._handlers._prompts.has(name)) {
      log(`Removing filename-derived name "${name}" from _handlers._prompts map`, 'info');
      serverAny._handlers._prompts.delete(name);
    }
    
    // Check if we already have a prompt with this clean name
    // This helps prevent duplicate registrations
    const existingPrompts = Array.from(this.nameMapping.entries());
    const duplicatePrompts = existingPrompts.filter(([key, value]) =>
      value === promptName && key !== name
    );
    
    // If we found duplicates, handle them
    if (duplicatePrompts.length > 0) {
      log(`Warning: Found ${duplicatePrompts.length} existing prompt(s) with the clean name "${promptName}". Handling duplicates.`, 'warn');
      
      // Deregister all duplicates to prevent conflicts
      for (const [dupKey, _] of duplicatePrompts) {
        log(`Deregistering duplicate prompt with filename "${dupKey}" that uses the same clean name "${promptName}"`, 'warn');
        this.removePrompt(dupKey);
      }
    }
    
    // Double-check if the prompt with this clean name already exists in the server
    // and remove it directly if needed
    if (serverAny._prompts && serverAny._prompts instanceof Map && serverAny._prompts.has(promptName)) {
      log(`Warning: Found existing prompt with clean name "${promptName}" in server map. Removing it.`, 'warn');
      serverAny._prompts.delete(promptName);
    }
    
    try {
      // Register the prompt with the server using ONLY the clean name from frontmatter
      this.server.prompt(
        promptName, // Using clean name from frontmatter
        metadata.description,
        getPromptArgsSchema(metadata.schema),
        (args: Record<string, string>) => ({
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: content.replace(/\${(\w+)}/g, (_, key) => args[key] || '')
            }
          }]
        })
      );
      
      // Store the mapping between filename-derived name and clean name for later use
      this.nameMapping.set(name, promptName);
      
      log(`Registered prompt: ${promptName} (${name})`);
      
      // CRITICAL: Ensure the filename-derived name is NOT registered alongside the clean name
      // Check again after registration and remove if found
      if (serverAny._prompts && serverAny._prompts instanceof Map && serverAny._prompts.has(name) && name !== promptName) {
        log(`Found filename-derived name "${name}" in server map after registration. Removing to prevent duplication.`, 'warn');
        serverAny._prompts.delete(name);
      }
    } catch (error) {
      log(`Error registering prompt with clean name "${promptName}": ${error instanceof Error ? error.message : String(error)}`, 'error');
      
      // Only as a last resort, fallback to using the filename-derived name
      log(`Falling back to filename-derived name: ${name}`, 'warn');
      this.server.prompt(
        name,
        metadata.description,
        getPromptArgsSchema(metadata.schema),
        (args: Record<string, string>) => ({
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: content.replace(/\${(\w+)}/g, (_, key) => args[key] || '')
            }
          }]
        })
      );
      
      // Store the mapping with the filename as both key and value
      this.nameMapping.set(name, name);
      
      log(`Registered prompt with fallback name: ${name}`);
    }
  }

  /**
   * Updates a prompt in the registry
   * @param name The name of the prompt to update (filename-derived)
   * @param config The new prompt configuration
   */
  async updatePrompt(name: string, config: PromptConfig): Promise<void> {
    const { metadata, content } = config.parsed;
    
    try {
      // Get the current clean name if it exists in our mapping
      const oldCleanName = this.nameMapping.get(name);
      const newCleanName = metadata.name;
      
      // Check if the clean name is changing
      const isCleanNameChanging = oldCleanName && oldCleanName !== newCleanName;
      
      // Check if any other prompts are using the same old clean name
      // This helps prevent removing a name that's still in use by another prompt
      let otherPromptsWithSameOldName: [string, string][] = [];
      if (isCleanNameChanging) {
        otherPromptsWithSameOldName = Array.from(this.nameMapping.entries())
          .filter(([key, value]) => value === oldCleanName && key !== name);
        
        if (otherPromptsWithSameOldName.length > 0) {
          log(`Note: Clean name "${oldCleanName}" is also used by ${otherPromptsWithSameOldName.length} other prompt(s)`, 'info');
        }
      }
      
      // Check if any prompts are already using the new clean name
      let promptsWithNewName: [string, string][] = [];
      if (isCleanNameChanging) {
        promptsWithNewName = Array.from(this.nameMapping.entries())
          .filter(([key, value]) => value === newCleanName && key !== name);
        
        if (promptsWithNewName.length > 0) {
          log(`Warning: Clean name "${newCleanName}" is already used by ${promptsWithNewName.length} other prompt(s)`, 'warn');
          
          // If the new clean name is already in use, we need to handle this case
          // by deregistering those prompts to avoid duplicates
          for (const [otherKey, _] of promptsWithNewName) {
            log(`Deregistering duplicate prompt with filename "${otherKey}" that uses the same clean name "${newCleanName}"`, 'warn');
            this.removePrompt(otherKey);
          }
        }
      }
      
      // Cast to any to avoid TypeScript errors
      const serverAny = this.server as any;
      
      // IMPORTANT: Always deregister both the filename-derived name AND the old clean name
      // to ensure we don't have duplicates
      
      // Step 1: Deregister the old clean name if it's changing and not used by other prompts
      if (isCleanNameChanging && otherPromptsWithSameOldName.length === 0) {
        if (typeof serverAny.deregisterPrompt === 'function') {
          try {
            serverAny.deregisterPrompt(oldCleanName);
            log(`Explicitly deregistered old clean name: ${oldCleanName}`);
            
            // Double-check that it was actually removed
            if (serverAny._prompts && serverAny._prompts instanceof Map && serverAny._prompts.has(oldCleanName)) {
              log(`Warning: Old clean name ${oldCleanName} still exists in server map after deregistration, forcing removal`, 'warn');
              serverAny._prompts.delete(oldCleanName);
            }
          } catch (innerError) {
            log(`Note: Could not explicitly deregister old clean name: ${oldCleanName}`, 'info');
            
            // Try direct removal as fallback
            if (serverAny._prompts && serverAny._prompts instanceof Map) {
              const removed = serverAny._prompts.delete(oldCleanName);
              if (removed) {
                log(`Explicitly removed old clean name ${oldCleanName} from internal server map`, 'info');
              }
            }
          }
        } else if (serverAny._prompts && serverAny._prompts instanceof Map) {
          const removed = serverAny._prompts.delete(oldCleanName);
          if (removed) {
            log(`Explicitly removed old clean name ${oldCleanName} from internal server map`, 'info');
          }
        }
      }
      
      // Step 2: Always deregister the filename-derived name to ensure clean state
      if (typeof serverAny.deregisterPrompt === 'function') {
        try {
          serverAny.deregisterPrompt(name);
          log(`Deregistered prompt with filename-derived name: ${name}`);
        } catch (innerError) {
          log(`Note: Could not deregister prompt with filename-derived name: ${name}`, 'info');
        }
      }
      
      // Also try direct removal from internal maps
      if (serverAny._prompts && serverAny._prompts instanceof Map) {
        const removed = serverAny._prompts.delete(name);
        if (removed) {
          log(`Removed prompt with filename-derived name ${name} from internal server map`, 'info');
        }
      }
      
      // Step 3: Remove the old mapping before registering the new one
      this.nameMapping.delete(name);
      
      // Step 4: Register updated prompt with ONLY the clean name
      await this.registerPrompt(name, metadata, content);
      
      // Step 5: Double-check that the filename-derived name is not registered
      // This is critical to prevent duplicate prompts
      if (serverAny._prompts && serverAny._prompts instanceof Map &&
          serverAny._prompts.has(name) && name !== newCleanName) {
        log(`Found filename-derived name "${name}" in server map after update. Removing to prevent duplication.`, 'warn');
        serverAny._prompts.delete(name);
      }
      
      // Step 6: If the clean name has changed, log it
      if (isCleanNameChanging) {
        log(`Clean name changed from "${oldCleanName}" to "${newCleanName}"`);
      }
      
      log(`Updated prompt: ${metadata.name} (${name})`);
    } catch (error) {
      // If registration fails, log the error
      log(`Failed to update prompt ${name}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      
      // Rethrow to allow caller to handle
      throw error;
    }
  }

  /**
   * Removes a prompt from the registry
   * @param name The name of the prompt to remove (filename-derived)
   */
  removePrompt(name: string): void {
    try {
      // Cast to any to avoid TypeScript errors
      const serverAny = this.server as any;
      
      // Get the clean name if it exists in our mapping
      let promptNameToRemove = name;
      if (this.nameMapping.has(name)) {
        promptNameToRemove = this.nameMapping.get(name)!;
      }
      
      // Check if any other prompts are using the same clean name
      // This helps prevent removing a name that's still in use by another prompt
      const otherPromptsWithSameName = Array.from(this.nameMapping.entries())
        .filter(([key, value]) => value === promptNameToRemove && key !== name);
      
      const shouldRemoveCleanName = otherPromptsWithSameName.length === 0;
      
      log(`Removing prompt "${name}" with clean name "${promptNameToRemove}"`);
      log(`Other prompts using same clean name: ${otherPromptsWithSameName.length}`);
      
      // STEP 1: Always try to deregister the filename-derived name
      let filenameDeregistered = false;
      
      // Check if the server has a deregisterPrompt method
      if (typeof serverAny.deregisterPrompt === 'function') {
        try {
          serverAny.deregisterPrompt(name);
          log(`Deregistered prompt with filename-derived name: ${name}`);
          filenameDeregistered = true;
        } catch (innerError) {
          // Ignore errors when trying the filename-derived name
          log(`Note: Could not deregister prompt with filename-derived name: ${name}`, 'info');
        }
      }
      
      // If deregisterPrompt failed or doesn't exist, try direct map access
      if (!filenameDeregistered && serverAny._prompts && serverAny._prompts instanceof Map) {
        const removedFilename = serverAny._prompts.delete(name);
        if (removedFilename) {
          log(`Removed prompt with filename-derived name ${name} from internal server map`, 'info');
          filenameDeregistered = true;
        }
      }
      
      // STEP 2: Handle the clean name
      let cleanNameDeregistered = false;
      
      // Only deregister the clean name if no other prompts are using it
      if (shouldRemoveCleanName && promptNameToRemove !== name) {
        if (typeof serverAny.deregisterPrompt === 'function') {
          try {
            serverAny.deregisterPrompt(promptNameToRemove);
            log(`Deregistered prompt with clean name: ${promptNameToRemove}`);
            cleanNameDeregistered = true;
            
            // Double-check that it was actually removed
            if (serverAny._prompts && serverAny._prompts instanceof Map && serverAny._prompts.has(promptNameToRemove)) {
              log(`Warning: Clean name ${promptNameToRemove} still exists in server map after deregistration, forcing removal`, 'warn');
              serverAny._prompts.delete(promptNameToRemove);
            }
          } catch (innerError) {
            // Ignore errors when trying the clean name
            log(`Note: Could not deregister prompt with clean name: ${promptNameToRemove}`, 'info');
          }
        }
        
        // If deregisterPrompt failed or doesn't exist, try direct map access
        if (!cleanNameDeregistered && serverAny._prompts && serverAny._prompts instanceof Map) {
          const removedCleanName = serverAny._prompts.delete(promptNameToRemove);
          if (removedCleanName) {
            log(`Removed prompt with clean name ${promptNameToRemove} from internal server map`, 'info');
            cleanNameDeregistered = true;
          }
        }
      } else if (!shouldRemoveCleanName && promptNameToRemove !== name) {
        log(`Not deregistering clean name "${promptNameToRemove}" as it's still used by other prompts`, 'info');
      }
      
      // STEP 3: Try additional internal maps that might contain the prompt
      // Check for _handlers._prompts
      if (serverAny._handlers && serverAny._handlers._prompts instanceof Map) {
        const removedFromHandlers = serverAny._handlers._prompts.delete(name);
        if (removedFromHandlers) {
          log(`Removed prompt with filename-derived name ${name} from _handlers._prompts map`, 'info');
        }
        
        if (shouldRemoveCleanName && promptNameToRemove !== name) {
          const removedCleanFromHandlers = serverAny._handlers._prompts.delete(promptNameToRemove);
          if (removedCleanFromHandlers) {
            log(`Removed prompt with clean name ${promptNameToRemove} from _handlers._prompts map`, 'info');
          }
        }
      }
      
      // STEP 4: Force reinitialization of prompt handlers to ensure clean state
      if (serverAny._promptHandlersInitialized) {
        serverAny._promptHandlersInitialized = false;
        log(`Reset _promptHandlersInitialized flag to force reinitialization`, 'info');
      }
      
      // STEP 5: Reset the server's internal state to force a refresh
      if (serverAny.server && typeof serverAny.server.reset === 'function') {
        serverAny.server.reset();
        log(`Reset server internal state`, 'info');
      }
      
      // STEP 6: Clean up our name mapping
      this.nameMapping.delete(name);
      
      // Log a summary of what was done
      if (promptNameToRemove !== name) {
        if (shouldRemoveCleanName) {
          log(`Removed prompt "${name}" with clean name "${promptNameToRemove}"`);
        } else {
          log(`Removed prompt "${name}" but kept clean name "${promptNameToRemove}" as it's still used by other prompts`);
        }
      } else {
        log(`Removed prompt "${name}"`);
      }
    } catch (error) {
      // If the prompt doesn't exist or can't be deregistered, log but don't throw
      log(`Warning: Could not deregister prompt ${name}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    }
  }
}

/**
 * Legacy function to register prompts
 * @deprecated Use PromptRegistry.registerAllPrompts instead
 */
export async function registerPrompts(promptLoader: PromptLoader): Promise<void> {
  const registry = new PromptRegistry();
  await registry.registerAllPrompts(promptLoader);
}