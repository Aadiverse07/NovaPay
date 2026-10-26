import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { fundRoutes } from '../src/routes/funds.js';

const orgId = 'a0000000-0000-4000-8000-000000000001';
const requestId = 'b0000000-0000-4000-8000-000000000002';
const quotationId = 'c0000000-0000-4000-8000-000000000003';

test('T3 database business rejections return safe, structured client errors', async () => {
  const cases = [
    ['42501', 403, 'FUND_FORBIDDEN'],
    ['22023', 400, 'VALIDATION_ERROR'],
    ['23505', 409, 'CONFLICT'],
    ['23514', 409, 'FUND_STATE_CONFLICT'],
    ['P0002', 404, 'NOT_FOUND'],
  ];

  for (const [databaseCode, expectedStatus, expectedCode] of cases) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.orgId = orgId;
      req.user = { id: 'test-actor' };
      req.orgRole = 'approver';
      next();
    });
    app.use('/api', fundRoutes({
      config: {},
      paypal: {},
      repos: { funds: { async approveMaintenanceScope() {
        throw Object.assign(new Error('database detail must not escape'), {
          statusCode: 503,
          code: 'DATABASE_UNAVAILABLE',
          databaseCode,
        });
      } } },
    }));

    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/funds/maintenance/${requestId}/scope-approval`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quotationId }),
      });
      const body = await response.json();
      assert.equal(response.status, expectedStatus, databaseCode);
      assert.equal(body.error?.code, expectedCode);
      assert.equal(typeof body.error?.message, 'string');
      assert.equal(JSON.stringify(body).includes('database detail'), false);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
});
