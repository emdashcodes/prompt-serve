import path from 'path';
import { PromptLoader } from './prompt-loader.js';
import { getPromptArgsSchema } from './schema-handler.js';
import { server } from './server.js';
import { log } from './utils/logging.js';
import { PromptConfig, PromptMetadata } from './types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import './server-extension.js';

/**
 * Manages prompt registration with the MCP server.
 */
export class PromptRegistry {
  private server: McpServer;
  private nameMapping: Map<string, string> = new Map();

  constructor(mcpServer: McpServer = server) {
    this.server = mcpServer;
  }

  /**
   * Registers all prompts from the prompt loader with the MCP server.
   */
  async registerAllPrompts(promptLoader: PromptLoader): Promise<void> {
    const prompts = promptLoader.getAllPrompts();
    log(`Registering ${prompts.length} prompts...`);
    let successCount = 0;
    let errorCount = 0;
    for (const prompt of prompts) {
      const filenameDerivedName = path.basename(prompt.path, '.md');
      try {
        await this.updatePrompt(filenameDerivedName, prompt);
        successCount++;
      } catch (error) {
        errorCount++;
      }
    }
    log(`Finished registration attempt. Successful: ${successCount}, Failed: ${errorCount}. Total tracked prompts: ${this.nameMapping.size}`);
  }

  /**
   * Updates or registers a prompt with the MCP server.
   */
  async updatePrompt(filenameDerivedName: string, config: PromptConfig): Promise<void> {
    const { metadata, content } = config.parsed;
    const newCleanName = metadata.name;

    log(`Updating/Registering prompt: Filename="${filenameDerivedName}", CleanName="${newCleanName}"`, 'info');

    try {
      const oldCleanName = this.nameMapping.get(filenameDerivedName);
      const isCleanNameChanging = oldCleanName !== undefined && oldCleanName !== newCleanName;

      if (isCleanNameChanging) {
        log(`Clean name changing from "${oldCleanName}" to "${newCleanName}" for filename "${filenameDerivedName}"`, 'info');
      }

      const conflictingPrompts = Array.from(this.nameMapping.entries())
        .filter(([key, value]) => value === newCleanName && key !== filenameDerivedName);

      if (conflictingPrompts.length > 0) {
         log(`Warning: New clean name "${newCleanName}" is already used by other file(s): ${conflictingPrompts.map(e => e[0]).join(', ')}. Registration will overwrite the existing prompt definition.`, 'warn');
      }

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

      log(`Successfully updated/registered prompt: CleanName="${newCleanName}" (Filename="${filenameDerivedName}")`);

    } catch (error) {
      log(`Failed to update/register prompt via server.prompt() (Filename="${filenameDerivedName}", CleanName="${newCleanName}"): ${error instanceof Error ? error.message : String(error)}`, 'error');
      throw error;
    }
  }

  /**
   * Removes a prompt from the internal registry mapping.
   * Note: This does not guarantee removal from the running MCP server.
   */
  removePrompt(filenameDerivedName: string): void {
    log(`Removing prompt from internal registry: Filename="${filenameDerivedName}"`, 'info');
    const cleanName = this.nameMapping.get(filenameDerivedName);

    const deleted = this.nameMapping.delete(filenameDerivedName);

    if (deleted) {
      log(`Removed internal mapping for "${filenameDerivedName}" (was mapped to "${cleanName}")`, 'info');
      log(`Note: Prompt "${cleanName}" may still be active on the server until overwritten or restarted.`, 'warn');
    } else {
      log(`Internal mapping for "${filenameDerivedName}" not found. No action taken.`, 'warn');
    }
  }
}