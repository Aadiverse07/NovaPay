import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schema = z.object({
  PAYPAL_CLIENT_ID: z.string().optional().default(''),
  PAYPAL_CLIENT_SECRET: z.string().optional().default(''),
  PAYPAL_WEBHOOK_ID: z.string().optional().default(''),
  PAYPAL_INVOICE_SEND_MODE: z.enum(['simulated', 'live']).default('simulated'),
  LLM_PROVIDER: z.enum(['gemini', 'anthropic']).default('gemini'),
  LLM_API_KEY: z.string().optional().default(''),
  LLM_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  LLM_FALLBACK_MODEL: z.string().min(1).default('gemini-3.1-flash-lite'),
  AI_DAILY_USER_LIMIT: z.coerce.number().int().min(1).max(1000).default(5),
  AI_DAILY_ORG_LIMIT: z.coerce.number().int().min(1).max(10000).default(20),
  AI_MAX_INPUT_CHARS: z.coerce.number().int().min(100).max(1000).default(1000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(400).default(400),
  AI_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(3600).default(300),
  DOCUMENT_MAX_FILE_MB: z.coerce.number().int().min(1).max(10).default(10),
  DOCUMENT_MAX_PAGES: z.coerce.number().int().min(1).max(10).default(10),
  DOCUMENT_MAX_CONCURRENT_JOBS_PER_ORG: z.coerce.number().int().min(1).max(20).default(2),
  DOCUMENT_MAX_UPLOADS_PER_ORG_PER_HOUR: z.coerce.number().int().min(1).max(1000).default(20),
  ANOMALY_FEE_SPIKE_MULTIPLIER: z.coerce.number().min(1.1).max(10).default(2),
  ANOMALY_FEE_SPIKE_MIN_SAMPLES: z.coerce.number().int().min(2).max(100).default(3),
  ANOMALY_DUPLICATE_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(10),
  ANOMALY_REFUND_RATE_THRESHOLD: z.coerce.number().min(0.01).max(1).default(0.25),
  ANOMALY_LARGE_PAYOUT_MINOR: z.coerce.number().int().min(1).default(1000000),
  ANOMALY_STALE_WEBHOOK_MINUTES: z.coerce.number().int().min(1).max(1440).default(10),
  ANOMALY_SCAN_INTERVAL_MS: z.coerce.number().int().min(60000).max(86400000).default(21600000),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-5-5'),
  SUPABASE_URL: z.string().url().optional().or(z.literal('')).default(''),
  SUPABASE_ANON_KEY: z.string().trim().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().optional().default(''),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  STATIC_DIR: z.string().min(1).default(root),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid NovaPay configuration: ${details}`);
}
const supabaseValues = [parsed.data.SUPABASE_URL, parsed.data.SUPABASE_ANON_KEY, parsed.data.SUPABASE_SERVICE_ROLE_KEY];
if (supabaseValues.some(Boolean) && !supabaseValues.every(Boolean)) {
  throw new Error('Invalid NovaPay configuration: SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY must be set together.');
}

export const config = Object.freeze({
  ...parsed.data,
  STATIC_DIR: path.resolve(root, parsed.data.STATIC_DIR),
  hasPayPal: Boolean(parsed.data.PAYPAL_CLIENT_ID && parsed.data.PAYPAL_CLIENT_SECRET),
  hasSupabase: supabaseValues.every(Boolean),
  resolvedLLMApiKey: parsed.data.LLM_API_KEY || (parsed.data.LLM_PROVIDER === 'anthropic' ? parsed.data.ANTHROPIC_API_KEY : ''),
  resolvedLLMModel: parsed.data.LLM_PROVIDER === 'anthropic' && !process.env.LLM_MODEL ? parsed.data.ANTHROPIC_MODEL : parsed.data.LLM_MODEL,
  hasAI: Boolean(parsed.data.LLM_API_KEY || (parsed.data.LLM_PROVIDER === 'anthropic' && parsed.data.ANTHROPIC_API_KEY)),
});
