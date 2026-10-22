import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as defaultConfig } from './config.js';
import { requestId } from './middleware/requestId.js';
import { legacyErrorCompatibility } from './middleware/errorResponses.js';
import { createRepositories } from './repos/memory.js';
import { createPayPalService } from './services/paypal.js';
import { createAIService } from './services/ai.js';
import { statusRoutes } from './routes/status.js';
import { webhookRoutes } from './routes/webhook.js';
import { aiRoutes } from './routes/ai.js';
import { approvalRoutes } from './routes/approvals.js';
import { paypalRoutes } from './routes/paypal.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const requestBody = z.record(z.string(), z.unknown());

export function createApp({ config = defaultConfig, repos = createRepositories(), paypal, askAI } = {}) {
  const app = express();
  paypal ||= createPayPalService({ config, events: repos.events });
  askAI ||= createAIService({ config, events: repos.events });

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(legacyErrorCompatibility);
  // The existing UI relies on inline scripts/styles; helmet remains enabled without a CSP that blocks them.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => console.log(JSON.stringify({ level: 'info', requestId: req.id, method: req.method, path: req.originalUrl, status: res.statusCode, durationMs: Date.now() - started })));
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.use((req, _res, next) => { if (req.body === undefined) req.body = {}; next(); });
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') && req.method === 'POST' && !requestBody.safeParse(req.body).success) return res.status(400).json({ error: 'Request body must be valid JSON.' });
    return next();
  });
  app.get('/', (_req, res, next) => res.sendFile(path.join(config.STATIC_DIR || root, 'preview.html'), (error) => error && next(error)));
  app.use('/api', statusRoutes({ config, paypal, repos }));
  app.use('/api', webhookRoutes({ paypal, repos }));
  app.use('/api', aiRoutes({ config, askAI }));
  app.use('/api', approvalRoutes({ config, repos }));
  app.use('/api', paypalRoutes({ config, paypal, repos }));

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
    const status = error.statusCode || error.status || (error.type === 'entity.too.large' ? 413 : 500);
    const message = error.type === 'entity.too.large' ? 'Request body is too large.' : error.type === 'entity.parse.failed' ? 'Request body must be valid JSON.' : error.message || 'The request could not be completed.';
    if (status >= 500) repos.events.addCall({ t: new Date().toISOString(), m: `${req.path} failed: ${message}`, ok: false });
    return res.status(status).json({ error: message });
  });
  return app;
}
