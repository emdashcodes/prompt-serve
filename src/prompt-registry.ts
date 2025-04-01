import path from 'path';
import { PromptLoader } from './prompt-loader.js';
import { getPromptArgsSchema } from './schema-handler.js';
import { server } from './server.js';
import { log } from './utils/logging.js';
import { PromptConfig, PromptMetadata } from './types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Handles the registration of prompts with the MCP server.
 * Relies on the documented `server.prompt()` method for adding prompts.
 */
export class PromptRegistry {
  private server: McpServer;
  // Store mapping between filename-derived names and clean names (from frontmatter)
  private nameMapping: Map<string, string> = new Map();

  /**
   * Creates a new PromptRegistry instance
   * @param mcpServer The MCP server instance to register prompts with
   */
  constructor(mcpServer: McpServer = server) {
    this.server = mcpServer;
  }

  /**
   * Registers all prompts from the prompt loader with the MCP server.
   * Uses registerPrompt for consistency in registration logic.
   * @param promptLoader The PromptLoader instance containing the prompts to register
   */
  async registerAllPrompts(promptLoader: PromptLoader): Promise<void> {
    const prompts = promptLoader.getAllPrompts();
    log(`Registering ${prompts.length} prompts...`);
    let successCount = 0;
    let errorCount = 0;
    for (const prompt of prompts) {
      const filenameDerivedName = path.basename(prompt.path, '.md');
      try {
        await this.registerPrompt(filenameDerivedName, prompt);
        successCount++;
      } catch (error) {
        errorCount++;
        // Error is already logged within registerPrompt if it's not handled
      }
    }
    log(`Finished registration attempt. Successful: ${successCount}, Failed: ${errorCount}. Total tracked prompts: ${this.nameMapping.size}`);
  }

  /**
   * Registers a new prompt with the MCP server using `server.prompt()`.
   * Also used for initial loading.
   * @param filenameDerivedName The filename-derived name of the prompt (e.g., 'my-prompt' for 'my-prompt.md')
   * @param config The prompt configuration
   * @throws Throws an error if registration via `server.prompt()` fails for reasons other than "already registered".
   */
  async registerPrompt(filenameDerivedName: string, config: PromptConfig): Promise<void> {
    const { metadata, content } = config.parsed;
    const newCleanName = metadata.name; // The name from frontmatter

    log(`Registering prompt: Filename="${filenameDerivedName}", CleanName="${newCleanName}"`, 'info');

    let registrationAttempted = false;
    try {
      const conflictingPrompts = Array.from(this.nameMapping.entries())
        .filter(([key, value]) => value === newCleanName && key !== filenameDerivedName);

      if (conflictingPrompts.length > 0) {
         log(`Warning: New clean name "${newCleanName}" is already used by other file(s): ${conflictingPrompts.map(e => e[0]).join(', ')}. Registration will overwrite the existing prompt definition associated with "${newCleanName}".`, 'warn');
      }

      registrationAttempted = true; 
      this.server.prompt(
        newCleanName,
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
      log(`Called server.prompt() for clean name: "${newCleanName}"`, 'info');

      this.nameMapping.set(filenameDerivedName, newCleanName);
      log(`Updated internal mapping: "${filenameDerivedName}" -> "${newCleanName}"`, 'info');

      log(`Successfully registered prompt: CleanName="${newCleanName}" (Filename="${filenameDerivedName}")`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (registrationAttempted && errorMessage.includes('is already registered')) {
        log(`Prompt "${newCleanName}" registration failed with 'already registered'. Assuming registration successful.`, 'warn');
        if (!this.nameMapping.has(filenameDerivedName) || this.nameMapping.get(filenameDerivedName) !== newCleanName) {
            this.nameMapping.set(filenameDerivedName, newCleanName);
            log(`Corrected internal mapping during 'already registered' handling: "${filenameDerivedName}" -> "${newCleanName}"`, 'info');
        }
      } else {
        log(`Failed to register prompt via server.prompt() (Filename="${filenameDerivedName}", CleanName="${newCleanName}"): ${errorMessage}`, 'error');
        throw error;
      }
    }
  }
}