import { z } from 'zod';
import { Schema } from './types.js';

/**
 * Generates a Zod schema for prompt arguments based on the provided schema definition.
 */
export function getPromptArgsSchema(schema?: Schema): Record<string, z.ZodType> {
  if (!schema || !schema.properties) {
    return {};
  }

  const result: Record<string, z.ZodType> = {};
  
  for (const [key, value] of Object.entries(schema.properties)) {
    const baseSchema = z.string().describe(value.description || `The ${key} parameter`);
    if (value.required) {
      result[key] = baseSchema.min(1, { message: `${key} is required` });
    } else {
      result[key] = baseSchema.optional();
    }
  }

  return result;
}