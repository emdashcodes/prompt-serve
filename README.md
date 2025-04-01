# Prompt Serve

A Model Context Protocol (MCP) server implementation designed for managing, organizing, and serving AI prompts.

## Description

Prompt Serve allows you to create, manage, and serve structured prompts to AI models through MCP Prompts. It follows a "Prompts as Code" paradigm, where prompts are stored in text files and loaded into the application and have basic support for things like variables and imports.

Key benefits include:

- **Centralized Prompt Management**: Store and organize your prompts in one location
- **Standardized Format**: Use Markdown with frontmatter for human-readable, version-control friendly prompt definitions
- **Dynamic Parameters**: Define schemas for prompt variables, enabling runtime customization
- **Real-time Updates**: Edit prompts without restarting your applications
- **Integration Ready**: Works seamlessly with Claude Desktop and other MCP-compatible applications

## Technologies

- TypeScript
- MCP SDK (@modelcontextprotocol/sdk)
- Zod (for schema validation)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Build the project:

```bash
npm run build
```

### Client Configurations

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "prompt-serve": {
      "command": "node",
      "args": ["/Users/ember/Dev/prompt-serve/dist/index.js"],
      "env": {
        "PROMPTS_DIR": "/path/to/your/prompts"
      }
    }
  }
}
```

#### Cursor

#### RooCode

#### GitHub Copilot

> **Important**: The `PROMPTS_DIR` environment variable must be set.

## Development

- Use `npm run dev` to run in watch mode during development
- Use `npm run clean` to clean the build directory

## Project Structure

```
mcp-prompt-server/
├── src/           # Source code
├── dist/          # Compiled JavaScript (generated)
├── docs/          # Documentation
├── package.json   # Project configuration
└── tsconfig.json  # TypeScript configuration
```

## Key Features

- **Hot-reloading of Prompts**: Automatically detects changes to prompt files and updates them in real-time without server restart
- **Markdown-based Prompt Files**: Uses Markdown files with frontmatter for easy editing and version control
- **Schema Validation**: Validates prompt parameters using Zod for type safety and better error messages

## Prompt Files

Prompt files are Markdown files with frontmatter metadata. Example:

```markdown
---
name: Github PR
description: Generates a PR, git commit message, and provides a code review.
schema:
  type: object
  properties:
    changes:
      description: The code changes to review
      required: true
    issueNumber:
      description: The issue number this PR addresses
    context:
      description: Additional context about the changes
---

Your prompt content here...
```

### Frontmatter Fields

- `name`: The display name for the prompt (can include spaces and special characters)
- `description`: A description of what the prompt does
- `schema`: (Optional) A JSON schema defining the prompt's parameters

The server uses the `name` field from frontmatter as the prompt identifier in the UI, allowing for more user-friendly prompt names with spaces and special characters.

### Schema Definition

The schema field uses a simplified schema format to define prompt parameters, based on the [Model Context Protocol documentation](https://modelcontextprotocol.io/docs/concepts/prompts#prompt-structure).

- **Properties**: Define parameters with their descriptions and requirements
- **Required Fields**: Mark required parameters using `required: true` in the property definition
- **Types**: All parameters are handled as strings
- **Descriptions**: Each parameter can have a description that will appear in the UI of your AI client

Example schema:

```json
{
  "type": "object",
  "properties": {
    "changes": {
      "description": "The code changes to review",
      "required": true
    },
    "issueNumber": {
      "description": "The issue number this PR addresses"
    },
    "context": {
      "description": "Additional context about the changes"
    }
  }
}
```

## Troubleshooting

Common issues and solutions:

1. **PROMPTS_DIR not set**: Make sure to set the PROMPTS_DIR environment variable
2. **Changes not detected**: Ensure file system events are working in your environment, report a bug if not
3. **Schema validation errors**: Check that your prompt parameters match the schema definition

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

Please ensure your changes follow the existing code style and include appropriate documentation.

## License

This project is licensed under the GNU General Public License v2.0 or later (GPLv2+). See the LICENSE file for details.
