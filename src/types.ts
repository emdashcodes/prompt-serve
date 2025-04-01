export interface SchemaProperty {
  description?: string;
  required?: boolean;
}

export interface Schema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
}

export interface PromptMetadata {
  name: string;
  description: string;
  schema?: Schema;
}

export interface ParsedPrompt {
  metadata: PromptMetadata;
  content: string;
}

export interface PromptConfig {
  path: string;
  parsed: ParsedPrompt;
}

// Basic validator for prompt metadata
export function validatePromptMetadata(data: any): PromptMetadata {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Metadata must be an object');
  }

  if (typeof data.name !== 'string' || !data.name) {
    throw new Error('Name is required and must be a string');
  }

  if (typeof data.description !== 'string' || !data.description) {
    throw new Error('Description is required and must be a string');
  }

  if (data.schema !== undefined) {
    if (typeof data.schema !== 'object' || data.schema === null) {
      throw new Error('Schema must be an object if provided');
    }

    if (data.schema.type !== 'object') {
      throw new Error('Schema root must be of type object');
    }

    if (typeof data.schema.properties !== 'object' || data.schema.properties === null) {
      throw new Error('Schema must have properties object');
    }
  }

  return data as PromptMetadata;
}