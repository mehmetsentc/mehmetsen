/** Shared classifier JSON Schema for Groq structured outputs (gpt-oss strict mode). */
export const CLASSIFIER_JSON_SCHEMA = {
  name: 'classifier_result',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      categoryId: { type: 'string' },
      confidence: { type: 'number' },
      reason: { type: 'string' },
    },
    required: ['categoryId', 'confidence', 'reason'],
    additionalProperties: false,
  },
} as const
