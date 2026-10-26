import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as defaultConfig } from './config.js';
import { requestId } from './middleware/requestId.js';
import { legacyErrorCompatibility } from './middleware/errorResponses.js';
import { createRepositories } from './repos/memory.js';
import { createPostgresRepositories } from './repos/postgres.js';
import { createPayPalService } from './services/paypal.js';
import { createAIService } from './services/ai.js';
import { createSupabaseServices } from './services/supabase.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimit } from 'express-rate-limit';
import { onboardingRoutes } from './routes/onboarding.js';
import { statusRoutes } from './routes/status.js';
import { webhookRoutes } from './routes/webhook.js';
import { aiRoutes } from './routes/ai.js';
import { approvalRoutes } from './routes/approvals.js';
import { paypalRoutes } from './routes/paypal.js';
import { financialRoutes } from './routes/financial.js';
import { startWebhookWorker } from './services/webhookProcessor.js';
import { createFxService } from './services/fx.js';
import { fxRoutes } from './routes/fx.js';
import { reportRoutes } from './routes/reports.js';
import { invoiceRoutes } from './routes/invoices.js';
import { notificationRoutes } from './routes/notifications.js';
import { createAnomalyService, startAnomalyWorker } from './services/anomalies.js';
import { fundRoutes } from './routes/funds.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const requestBody = z.record(z.string(), z.unknown());

export function createApp({ config = defaultConfig, repos, paypal, askAI, identity = createSupabaseServices(config) } = {}) {
  const app = express();
  repos ||= config.hasSupabase && identity?.database ? createPostgresRepositories(identity.database) : createRepositories();
  paypal ||= createPayPalService({ config, events: repos.events });
  const fx = createFxService({ rates: repos.fxRates });
  askAI ||= createAIService({ config, events: repos.events, repos, fx });
  const runAnomalyScan = createAnomalyService({ repos, config });

  app.disable('x-powered-by');
  app.locals.startWebhookWorker = () => startWebhookWorker({ repos, paypal });
  app.locals.startAnomalyWorker = () => startAnomalyWorker({ repos, runAnomalyScan, intervalMs: config.ANOMALY_SCAN_INTERVAL_MS || 21600000 });
  app.use(requestId);
  app.use(legacyErrorCompatibility);
  // The existing UI relies on inline scripts/styles; helmet remains enabled without a CSP that blocks them.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => console.log(JSON.stringify({ level: 'info', requestId: req.id, method: req.method, path: String(req.originalUrl || req.path).split('?')[0], status: res.statusCode, durationMs: Date.now() - started })));
    next();
  });
  const publicPaths = ['/status', '/public-config', '/webhook'];
  const generalIpLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } }, skip: (req) => publicPaths.includes(req.path) });
  app.use('/api', generalIpLimit);
  app.use('/api', rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, skip: (req) => req.path !== '/onboarding' || req.method !== 'POST', message: { error: { code: 'ONBOARDING_IP_RATE_LIMITED', message: 'Too many onboarding attempts from this network. Try again later.' } } }));
  app.use('/api', authMiddleware({ config, identity }));
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: (req) => req.user.id, message: { error: { code: 'USER_RATE_LIMITED', message: 'Too many requests for this account. Try again later.' } }, skip: (req) => publicPaths.includes(req.path) }));
  app.use('/api', rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: (req) => `onboarding:${req.user.id}`, skip: (req) => req.path !== '/onboarding' || req.method !== 'POST', message: { error: { code: 'ONBOARDING_RATE_LIMITED', message: 'Too many onboarding attempts for this account. Try again later.' } } }));
  app.use('/api', webhookRoutes({ paypal, repos }));
  app.use(express.json({ limit: '64kb' }));
  app.use((req, _res, next) => { if (req.body === undefined) req.body = {}; next(); });
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') && req.method === 'POST' && !requestBody.safeParse(req.body).success) return res.status(400).json({ error: 'Request body must be valid JSON.' });
    return next();
  });
  app.get('/', (_req, res, next) => res.sendFile(path.join(config.STATIC_DIR || root, 'preview.html'), (error) => error && next(error)));
  app.use('/api', statusRoutes({ config, paypal, repos }));
  app.get('/api/public-config', (_req, res) => res.json({ supabaseUrl: config.hasSupabase ? config.SUPABASE_URL : null, supabaseAnonKey: config.hasSupabase ? config.SUPABASE_ANON_KEY : null }));
  app.use('/api', onboardingRoutes({ identity }));
  app.use('/api', aiRoutes({ config, askAI }));
  app.use('/api', approvalRoutes({ config, repos, identity, paypal }));
  app.use('/api', financialRoutes({ repos }));
  app.use('/api', fxRoutes({ fx }));
  app.use('/api', reportRoutes({ repos }));
  app.use('/api', invoiceRoutes({ repos }));
  app.use('/api', notificationRoutes({ repos, runAnomalyScan }));
  app.use('/api', paypalRoutes({ config, paypal, repos, identity, fx }));
  app.use('/api', fundRoutes({ config, paypal, repos }));

  app.use('/api', (req, res) => {
    if (req.path === '/status') return res.status(405).json({ error: 'Use GET for integration status.' });
    if (req.path === '/events') return res.status(405).json({ error: 'Use GET to read recent API activity.' });
    if (req.path === '/webhook') return res.status(405).json({ error: 'Use POST for PayPal webhook delivery.' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST for this API request.' });
    if (!config.hasPayPal) return res.status(503).json({ error: 'PayPal sandbox credentials not set' });
    return res.status(404).json({ error: 'unknown route' });
  });

  app.use(express.static(config.STATIC_DIR || root, { index: false, fallthrough: true }));
  app.use((req, res) => res.status(404).send('Not found'));
  app.use((error, req, res, _next) => {
    if (res.headersSent) return;
    const databaseStatus = ({ '22003': 400, '22023': 400, '23505': 409, '23514': 400, P0002: 404 })[error.databaseCode];
    const status = databaseStatus || error.statusCode || error.status || (error.type === 'entity.too.large' ? 413 : 500);
    const message = error.type === 'entity.too.large' ? 'Request body is too large.' : error.type === 'entity.parse.failed' ? 'Request body must be valid JSON.' : error.message || 'The request could not be completed.';
    if (status >= 500) Promise.resolve(repos.events.addCall({ t: new Date().toISOString(), m: `${req.path} failed`, ok: false }, req.orgId)).catch(() => {});
    const structuredRoute = req.path === '/api/onboarding' || req.path === '/api/public-config' || req.path === '/api/fx/convert' || req.path.startsWith('/api/reports') || req.path.startsWith('/api/invoices') || req.path.startsWith('/api/notifications') || req.path.startsWith('/api/anomalies') || req.path.startsWith('/api/funds') || req.path === '/api/transactions' || req.path.startsWith('/api/ledger/') || req.path.startsWith('/api/reconciliation') || (req.path.startsWith('/api/approvals') && req.path !== '/api/approvals/register');
    if (structuredRoute) {
      const code = status === 413 ? 'BODY_TOO_LARGE' : error.databaseCode ? ({ '22003': 'REFUND_AMOUNT_EXCEEDED', '22023': 'VALIDATION_ERROR', '23505': 'CONFLICT', '23514': 'LEDGER_UNBALANCED', P0002: 'NOT_FOUND' })[error.databaseCode] : status === 400 ? 'BAD_JSON' : error.code === 'DATABASE_UNAVAILABLE' ? error.code : 'INTERNAL_ERROR';
      return res.status(status).json({ error: { code, message: status >= 500 ? 'The request could not be completed.' : message } });
    }
    return res.status(status).json({ error: message });
  });
  return app;
}
