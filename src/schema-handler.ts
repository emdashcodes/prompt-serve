import { z } from 'zod';
import { Schema } from './types.js';

/**
 * Generates a Zod schema for prompt arguments based on the provided schema definition.
 */
export function getPromptArgsSchema(schema?: Schema): Record<string, z.ZodString> {
  if (!schema || !schema.properties) {
    return {};
  }

  const result: Record<string, z.ZodString> = {};
  
  for (const [key, value] of Object.entries(schema.properties)) {
    let zodString = z.string().describe(value.description || `The ${key} parameter`);
    if (value.required) {
      zodString = zodString.min(1, { message: `${key} is required` });
    }
    result[key] = zodString;
  }

  return result;
}