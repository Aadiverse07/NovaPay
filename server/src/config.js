import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schema = z.object({
  PAYPAL_CLIENT_ID: z.string().optional().default(''),
  PAYPAL_CLIENT_SECRET: z.string().optional().default(''),
  PAYPAL_WEBHOOK_ID: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-5-5'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  STATIC_DIR: z.string().min(1).default(root),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid NovaPay configuration: ${details}`);
}

export const config = Object.freeze({
  ...parsed.data,
  STATIC_DIR: path.resolve(root, parsed.data.STATIC_DIR),
  hasPayPal: Boolean(parsed.data.PAYPAL_CLIENT_ID && parsed.data.PAYPAL_CLIENT_SECRET),
  hasAI: Boolean(parsed.data.ANTHROPIC_API_KEY),
});
