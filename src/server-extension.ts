import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { log } from "./utils/logging.js";

/**
 * Extends the McpServer class with additional functionality
 * Specifically adds a deregisterPrompt method if it doesn't exist
 */
export function extendServer(server: McpServer): void {
  // Add deregisterPrompt method if it doesn't exist
  if (!(server as any).deregisterPrompt) {
    (server as any).deregisterPrompt = function(name: string): void {
      // Implementation depends on the internal structure of the McpServer class
      const serverAny = this as any;
      
      // Try to find and remove the prompt from internal maps
      let removed = false;
      
      // Check for _registeredPrompts property
      if (serverAny._registeredPrompts) {
        // If it's a Map, try to delete the prompt
        if (serverAny._registeredPrompts instanceof Map) {
          removed = serverAny._registeredPrompts.delete(name);
        }
        // If it's an object, try to delete the property
        else if (typeof serverAny._registeredPrompts === 'object') {
          if (name in serverAny._registeredPrompts) {
            delete serverAny._registeredPrompts[name];
            removed = true;
          }
        }
      }
      
      // Check for _prompts map
      if (!removed && serverAny._prompts && serverAny._prompts instanceof Map) {
        removed = serverAny._prompts.delete(name);
      }
      
      // Check for prompts map
      if (!removed && serverAny.prompts && serverAny.prompts instanceof Map) {
        removed = serverAny.prompts.delete(name);
      }
      
      // Check for _handlers._prompts
      if (!removed && serverAny._handlers && serverAny._handlers._prompts instanceof Map) {
        removed = serverAny._handlers._prompts.delete(name);
      }
      
      // Force reinitialization of prompt handlers
      if (serverAny._promptHandlersInitialized) {
        serverAny._promptHandlersInitialized = false;
        removed = true;
      }
      
      // Reset the server's internal state to force a refresh
      if (serverAny.server && typeof serverAny.server.reset === 'function') {
        serverAny.server.reset();
        removed = true;
      }
      
      if (removed) {
        log(`Prompt deregistered: ${name}`);
      } else {
        log(`Warning: Could not find prompt ${name} to deregister`, 'warn');
      }
    };
    
    log('Added deregisterPrompt method to McpServer');
  }
}

/**
 * Type declaration to extend McpServer with our custom methods
 */
declare module "@modelcontextprotocol/sdk/server/mcp.js" {
  interface McpServer {
    deregisterPrompt?(name: string): void;
  }
}