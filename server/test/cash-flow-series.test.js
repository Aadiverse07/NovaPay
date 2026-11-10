import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { reportRoutes } from '../src/routes/reports.js';

test('cash-flow-series aggregates cash ledger lines by month and currency with BigInt-safe values', async () => {
  let requestedOrg;
  const router=reportRoutes({repos:{async listLedgerEntries(orgId){requestedOrg=orgId;return [
    {created_at:'2026-11-05T00:00:00Z',currency:'USD',lines:[{accounts:{code:'1000'},debit_minor:'9007199254740993',credit_minor:'0'},{accounts:{code:'1010'},debit_minor:'0',credit_minor:'200'}]},
    {created_at:'2026-11-09T00:00:00Z',currency:'EUR',lines:[{accounts:{code:'1000'},debit_minor:'1000',credit_minor:'0'}]},
  ]}}});
  const app=express();app.use((req,res,next)=>{req.orgId='org-cash';next()});app.use('/api',router);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/reports/cash-flow-series?from=2026-11-01&to=2026-11-30`);const body=await response.json();assert.equal(response.status,200);assert.equal(requestedOrg,'org-cash');assert.deepEqual(body.currencies,['EUR','USD']);assert.deepEqual(body.rows.find(row=>row.currency==='USD'),{period:'2026-11',currency:'USD',money_in_minor:'9007199254740993',money_out_minor:'200',net_minor:'9007199254740793'});}finally{await new Promise(resolve=>server.close(resolve))}
});
