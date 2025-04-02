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

1. Add the following to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "prompt-serve": {
      "command": "node",
      "args": ["/path/to/prompt-serve/dist/index.js"],
      "env": {
        "PROMPTS_DIR": "/path/to/your/prompts"
      }
    }
  }
}
```

2. Replace `/path/to/prompt-serve/dist/index.js` and `/path/to/your/prompts` with the correct **absolute paths** on your system.
3. After saving changes to `claude_desktop_config.json`, you will need to restart Claude Desktop for the new configuration to be loaded.

#### Cursor / RooCode / GitHub Copilot (via PromptLink Extension)

To use PromptServe prompts with Cursor, RooCode, or GitHub Copilot, you need the [PromptLink VS Code Extension](https://github.com/emdashcodes/prompt-link). This extension acts as a bridge between MCP servers (like PromptServe) and these tools.

1. Install the [PromptLink Extension](https://marketplace.visualstudio.com/items?itemName=emdashcodes.prompt-link) from the VS Code Marketplace.
2. Configure PromptLink in your VS Code `settings.json` to connect to your running PromptServe instance. Add an entry to the `promptLink.servers` array:

    ```json
    "promptLink.servers": [
      {
        "name": "PromptServe",
        "command": "node",
        "args": [
          "/path/to/prompt-serve/dist/index.js"
        ],
        "env": {
          "PROMPTS_DIR": "/path/to/your/prompts"
        }
      }
    ],
    ```

3. Replace `/path/to/prompt-serve/dist/index.js` and `/path/to/your/prompts` with the correct absolute paths on your system.
4. Once configured, you can use the PromptLink command (default: `Cmd+Shift+A` / `Ctrl+Shift+A`) to select a prompt from PromptServe and send it to Cursor, RooCode, or Copilot.

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

### Default Values for Parameters

You can provide default values for optional parameters directly within the prompt template using the `||` operator. This is useful when you want a fallback value if an optional argument isn't provided by the user.

- **Syntax**: `${parameterName || 'Your Default Value'}` or `${parameterName || "Your Default Value"}`
- **Requirement**: The parameter (`parameterName` in the example) must be defined as optional (i.e., *not* have `required: true`) in the prompt's schema.
- **Quotes**: The default value **must** be enclosed in either single (`'`) or double (`"`) quotes.

**Example:**

If you have an optional `language` parameter, you could use:

```markdown
Explain this code snippet, assuming it's ${language || 'code'}:
```

If the user provides a `language` argument, it will be used. If not, the text "code" will be substituted.

### Importing Content (`@import`) with Template Parts

You can include content from other Markdown files within your prompt directory using the `@import` directive. This allows you to reuse common sections or structure complex prompts.

Files whose names start with an underscore (e.g., `_shared_header.md`) are treated as partials. They won't be loaded as standalone prompts by the server but *can* be included using the `@import` syntax.

This allows you to build complex prompts from reusable components like building blocks.

## Example Prompts

The project includes several example prompts in the `example-prompts/` directory:

- `github-pr.md`: Demonstrates a complex prompt with both required (`changes`) and optional (`issueNumber`, `context`) arguments defined in the schema.
- `explain-code.md`: Shows a mix of required (`code`) and optional (`language`) arguments. It also utilizes the default value syntax (`${language || 'code'}`) for an optional parameter with a fallback value.
- `random-idea-generator.md`: An example of a prompt that requires no arguments (empty schema `properties`).
- `meeting-summary.md`: Uses a required argument (`notes`) and demonstrates the template part import feature by including `@_common-formatting.md`.
- `_common-formatting.md`: A partial file (name starts with `_`) intended to be included in other prompts. It is not loaded as a standalone prompt itself.

These examples showcase various features like:

- Defining required and optional arguments using the schema.
- Using default values for optional arguments (`${arg || 'default'}`).
- Creating prompts with no arguments.
- Reusing content via template parts (`@_partial.md`).

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
