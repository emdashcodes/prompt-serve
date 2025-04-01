import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Create and configure the server instance
export const server = new McpServer({
  name: "prompt-serve",
  version: "1.0.0"
});

/**
 * Initialize and start the MCP server with stdio transport
 */
export async function initializeServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Prompt MCP server running on stdio');
}

/**
 * Gracefully shut down the server
 */
export async function shutdownServer(): Promise<void> {
  await server.close();
}