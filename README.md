# PromptServe -  File based prompt management for MCP

A Model Context Protocol (MCP) server designed for managing, organizing, and serving AI prompts. PromptServe follows a "Prompts as Code" paradigm where prompts are stored in text files with frontmatter metadata.

## Features

- **Centralized Prompt Management**: Store and organize your prompts and reusable workflows in one location.
- **Prompt as Code**: Use Markdown with frontmatter for human-readable and AI friendly, version-control compatible prompt definitions.
  - **Dynamic Parameters**: Use dynamic parameters in your prompts and fill them in at runtime.
  - **Template Parts**: Use template parts to build more complex prompts from reusable components.
- **Automatic Detection of New Prompts**: Automatically detects when new prompt files are added via periodic scanning.

## Dependencies

- TypeScript
- MCP SDK (@modelcontextprotocol/sdk)
- Zod (for schema validation)
- gray-matter (for frontmatter parsing)

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
      "args": ["/path/to/prompt-serve/dist/index.js"],
      "env": {
        "PROMPTS_DIR": "/path/to/your/prompts",
        "PROMPT_SCAN_INTERVAL_MS": "10000" // Example: 10 seconds
      }
    }
  }
}
```

*(Replace `/path/to/prompt-serve` and `/path/to/your/prompts` with your actual paths)*

#### Cursor

*(Configuration details needed)*

#### RooCode

*(Configuration details needed)*

#### GitHub Copilot

*(Configuration details needed)*

## Configuration

Prompt Serve uses environment variables for configuration:

- **`PROMPTS_DIR`** (Required): The absolute path to the directory containing your `.md` prompt files.
- **`PROMPT_SCAN_INTERVAL_MS`** (Optional): The interval, in milliseconds, at which the server scans the `PROMPTS_DIR` for new files. Defaults to `10000` (10 seconds) if not set or invalid.

## Development

- Use `npm run dev` to run in watch mode during development (compiles TypeScript on change).
- Use `npm run clean` to clean the build directory.

## Project Structure

```
prompt-serve/
├── src/           # Source code
├── dist/          # Compiled JavaScript (generated)
├── example-prompts/ # Example prompt files
├── package.json   # Project configuration
└── tsconfig.json  # TypeScript configuration
```

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

- `name`: The display name for the prompt (can include spaces and special characters). This is the primary identifier shown in MCP clients.
- `description`: A description of what the prompt does.
- `schema`: (Optional) A JSON schema defining the prompt's parameters.

The server uses the `name` field from frontmatter as the prompt identifier in the UI, allowing for more user-friendly prompt names with spaces and special characters.

### Schema Definition

The schema field uses a simplified schema format to define prompt parameters, based on the [Model Context Protocol documentation](https://modelcontextprotocol.io/docs/concepts/prompts#prompt-structure).

- **Properties**: Define parameters with their descriptions and requirements.
- **Required Fields**: Mark required parameters using `required: true` in the property definition.
- **Types**: All parameters are handled as strings.
- **Descriptions**: Each parameter can have a description that will appear in the UI of your AI client.

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

### Importing Content (`@import`) with Template Parts

You can include content from other Markdown files within your prompt directory using the `@import` directive. This allows you to reuse common sections or structure complex prompts.

Files whose names start with an underscore (e.g., `_shared_header.md`) are treated as partials. They won't be loaded as standalone prompts by the server but *can* be included using the `@import` syntax.

This allows you to build complex prompts from reusable components like building blocks.

- **Syntax**: Use `@path/to/file.md` or `@file.md`.
- **Base Path**: Paths are always resolved relative to the main `PROMPTS_DIR` specified in your environment configuration.
- **Supported Files**: Currently, only `.md` files can be imported.
- **Escaping**: If you need a literal `@` symbol at the beginning of a line that might otherwise look like an import, escape it with a backslash: `\\@`. For example, `\\@username` will appear as `@username` in the final prompt content.
- **Recursion & Cycles**: Imports are resolved recursively. The system detects and prevents circular dependencies (e.g., `a.md` importing `b.md` which imports `a.md`).
- **Duplicates**: The same file will only be included once per top-level prompt, even if imported multiple times through different paths.

## Example Prompts

The project includes several example prompts in the `example-prompts/` directory:

- `github-pr.md`: A comprehensive prompt for generating PR titles, descriptions, and code reviews

These examples demonstrate various features of the prompt system, including:

- Frontmatter usage
- Schema definitions
- Dynamic parameter substitution
- Complex prompt structures

## Troubleshooting

Common issues and solutions:

1. **`PROMPTS_DIR` not set**: Make sure to set the `PROMPTS_DIR` environment variable in your client configuration to the correct path.
2. **New prompts not detected quickly**: Detection occurs via periodic scanning. Check the `PROMPT_SCAN_INTERVAL_MS` setting (defaults to 10 seconds). If new files still aren't detected after the interval, check file permissions and ensure the server process is running correctly.
3. **Modifications to existing prompts not reflected**: This is the current expected behavior and is a limitation of the current MCP SDK (see [PR #247](https://github.com/modelcontextprotocol/typescript-sdk/pull/247)). Changes to existing prompt files require a server restart to be loaded.

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Submit a pull request.

Please ensure your changes follow the existing code style and include appropriate documentation.

## License

This project is licensed under the GNU General Public License v2.0 or later (GPLv2+). See the LICENSE file for details.
