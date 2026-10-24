import test from 'node:test';
import assert from 'node:assert/strict';
import { convertMinorUnits, createFxService } from '../src/services/fx.js';
import { buildInvoiceDraft, decideInvoiceSend, extractPayPalInvoiceId } from '../src/services/invoices.js';
import { reportCsvCell, reportTotals } from '../src/routes/reports.js';
import { createApp } from '../src/app.js';
import { createRepositories } from '../src/repos/memory.js';

test('FX conversion uses decimal integer arithmetic and half-up minor-unit rounding',()=>{
  assert.equal(convertMinorUnits(1001,'1.2345'),1236);
  assert.throws(()=>convertMinorUnits(100,'1e2'));
});

test('FX service caches provider rates and returns source, timestamp, label, and separate fees',async()=>{
  let calls=0;const rows=new Map();const now=()=>Date.parse('2026-10-24T00:00:00.000Z');
  const service=createFxService({now,rates:{async get(_org,base,quote){return rows.get(`${base}:${quote}`)||null;},async put(row){rows.set(`${row.base_currency}:${row.quote_currency}`,row);}},fetchImpl:async(url)=>{calls++;assert.equal(new URL(url).hostname,'api.frankfurter.dev');return {ok:true,json:async()=>({date:'2026-10-23',rates:{EUR:1.2345}})};}});
  const first=await service.convert({orgId:'org',amount:'10.01',base:'USD',quote:'EUR'});
  const second=await service.convert({orgId:'org',amount:'1.00',base:'USD',quote:'EUR'});
  assert.equal(first.convertedAmount,'12.36');assert.equal(first.rate,'1.2345');assert.equal(first.source,'Frankfurter');
  assert.equal(first.label,'indicative, not a guaranteed settlement rate');assert.deepEqual(first.fees,[]);assert.ok(first.timestamp);assert.equal(second.convertedAmount,'1.23');assert.equal(calls,1);
});

test('FX provider throttle reserves distinct slots for concurrent currency pairs',async()=>{
  const waits=[];const starts=[];const now=()=>1000;
  const service=createFxService({now,sleep:async(ms)=>{waits.push(ms);},rates:{async get(){return null;},async put(){}},fetchImpl:async(url)=>{starts.push(new URL(url).searchParams.get('symbols'));return {ok:true,json:async()=>({rates:{EUR:1.1,GBP:1.2}})};}});
  await Promise.all([
    service.convert({orgId:'org',amount:'1.00',base:'USD',quote:'EUR'}),
    service.convert({orgId:'org',amount:'1.00',base:'USD',quote:'GBP'}),
  ]);
  assert.deepEqual(waits,[1000]);
  assert.deepEqual(starts.sort(),['EUR','GBP']);
});

test('invoice draft recalculates line, tax, and grand totals while ignoring client totals',()=>{
  const draft=buildInvoiceDraft({invoiceNumber:'N-1',customerName:'Test Customer',customerEmail:'test@example.test',currency:'USD',
    subtotalMinor:1,taxMinor:1,totalMinor:1,lines:[{description:'Service',quantity:'1.250',unitPrice:'10.00',taxRate:'0.0825'}]},'user');
  assert.equal(draft.invoice.subtotal_minor,1250);assert.equal(draft.invoice.tax_minor,103);assert.equal(draft.invoice.total_minor,1353);
  assert.deepEqual(draft.lines.map((line)=>line.line_total_minor),[1353]);
});

test('PayPal invoice create response extracts and validates the invoice id from its self href',()=>{
  const id='INV2-W44B-KRGF-JM6R-26VU';
  const createResponse={links:[{href:`https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${id}`,rel:'self',method:'GET'}]};
  assert.equal(extractPayPalInvoiceId(createResponse),id);
  assert.equal(extractPayPalInvoiceId({links:[{href:`/v2/invoicing/invoices/INV2-ABCD-EFGH?fields=id`,rel:'create'}]}),'INV2-ABCD-EFGH');
  assert.equal(extractPayPalInvoiceId({id}),id);
  assert.equal(extractPayPalInvoiceId({links:[{href:`https://evil.example/v2/invoicing/invoices/${id}`,rel:'self'}]}),null);
  assert.equal(extractPayPalInvoiceId({links:[{href:`https://api-m.sandbox.paypal.com/v2/invoicing/invoices/not-an-invoice-id`,rel:'self'}]}),null);
});

test('invoice send logs create, id extraction, and send stages without exposing the invoice id',async()=>{
  const id='INV2-W44B-KRGF-JM6R-26VU', logs=[], paypalPaths=[];
  const approval={proposalType:'send-invoice',status:'pending',invoiceId:'invoice-row-1'};
  const invoice={id:'invoice-row-1',state:'reviewed',invoiceNumber:'N-1',currency:'USD',customerName:'Test Customer',customerEmail:'test@example.test',lines:[{description:'Service',quantity:'1',unitPrice:'1.00',taxRate:'0'}]};
  const repos={
    approvals:{async get(){return approval;},async decideInvoiceSend(){return{result:'decided',approval};}},
    invoices:{async get(){return invoice;},async setPayPalDraft(_org,_id,paypalId){assert.equal(paypalId,id);},async completeSend(){return{};},async failSend(){throw new Error('unexpected failure');}},
    events:{async addCall(call){logs.push(call.m);}},
  };
  const paypal={async pp(_method,path){paypalPaths.push(path);return path.endsWith('/send')?{}:{links:[{href:`https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${id}`,rel:'self',method:'GET'}]};}};
  const result=await decideInvoiceSend({repos,paypal,req:{orgId:'org-1',user:{id:'reviewer-1'},id:'request-1'},approvalId:'approval-1',decision:'approve'});
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(result.status,200);
  assert.deepEqual(paypalPaths,['/v2/invoicing/invoices',`/v2/invoicing/invoices/${id}/send`]);
  assert.ok(logs.includes('invoice_send:paypal_create_ok'));
  assert.ok(logs.includes('invoice_send:invoice_id_extracted'));
  assert.ok(logs.includes('invoice_send:paypal_send_called'));
  assert.ok(logs.every((message)=>!message.includes(id)));
});

test('invalid PayPal invoice create response keeps the client error structured',async()=>{
  const logs=[];
  const approval={proposalType:'send-invoice',status:'pending',invoiceId:'invoice-row-1'};
  const invoice={id:'invoice-row-1',state:'reviewed',customerName:'Test Customer',customerEmail:'test@example.test',lines:[]};
  const repos={approvals:{async get(){return approval;},async decideInvoiceSend(){return{result:'decided',approval};}},invoices:{async get(){return invoice;},async failSend(){}},events:{async addCall(call){logs.push(call.m);}}};
  const result=await decideInvoiceSend({repos,paypal:{async pp(){return{links:[{href:'https://evil.example/invoice/INV2-W44B-KRGF-JM6R-26VU',rel:'self'}]};}},req:{orgId:'org-1',user:{id:'reviewer-1'},id:'request-1'},approvalId:'approval-1',decision:'approve'});
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(result.status,502);
  assert.deepEqual(result.body,{error:{code:'INVOICE_SEND_FAILED',message:'PayPal could not send the invoice. Check the Sandbox invoice before retrying.'}});
  assert.ok(logs.includes('invoice_send:invoice_id_extraction_failed'));
  assert.ok(logs.includes('invoice_send:failed_at_invoice_id_extract'));
});

test('simulated invoice send preserves approval and local tracking without calling PayPal',async()=>{
  const logs=[],calls=[];
  const approval={proposalType:'send-invoice',status:'pending',invoiceId:'invoice-row-1'};
  const invoice={id:'invoice-row-1',state:'reviewed',paypalInvoiceId:null};
  const repos={approvals:{async get(){return approval;},async decideInvoiceSend(){return{result:'decided',approval};}},invoices:{async get(){return invoice;},async completeSend(...args){calls.push(args);return{};}},events:{async addCall(call){logs.push(call.m);}}};
  const result=await decideInvoiceSend({repos,paypal:{async pp(){throw new Error('PayPal must not be called in simulated mode');}},req:{orgId:'org-1',user:{id:'approver-1'},id:'request-1'},approvalId:'approval-1',decision:'approve',simulate:true});
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(result.status,200);
  assert.equal(result.body.sendMode,'SIMULATED');assert.equal(result.body.simulated,true);assert.equal(result.body.paypalInvoiceId,null);
  assert.equal(calls.length,1);assert.equal(calls[0][2],null);assert.deepEqual(calls[0][3],{status:'SIMULATED',simulated:true});
  assert.ok(logs.includes('invoice_send:simulated_send'));
});

test('report totals computed from ledger views balance and match the underlying ledger fixture',()=>{
  const pnl=reportTotals('profit-and-loss',[
    {account_type:'revenue',amount_minor:'10000'},
    {account_type:'contra_revenue',amount_minor:'100'},
    {account_type:'expense',amount_minor:'300'},
  ]);
  const trial=reportTotals('trial-balance',[
    {debit_minor:'9600',credit_minor:'0'},
    {debit_minor:'300',credit_minor:'0'},
    {debit_minor:'100',credit_minor:'0'},
    {debit_minor:'0',credit_minor:'10000'},
  ]);
  assert.equal(pnl.netIncomeMinor,'9600');assert.deepEqual(trial,{debitMinor:'10000',creditMinor:'10000',balanced:true});
});

test('CSV cells neutralize formula injection while preserving CSV quoting',()=>{
  assert.equal(reportCsvCell('=1+1'),"\"'=1+1\"");
  assert.equal(reportCsvCell('\t@SUM(A1:A2)'),"\"'\t@SUM(A1:A2)\"");
  assert.equal(reportCsvCell('Sales "North"'), '"Sales ""North"""');
});

test('invoice cannot be sent unless a send-invoice approval record exists',async()=>{
  let providerCalls=0;
  const result=await decideInvoiceSend({repos:{approvals:{async get(){return null;}}},paypal:{async pp(){providerCalls++;}},req:{orgId:'org',user:{id:'reviewer'},id:'req'},approvalId:'APR-INV-missing',decision:'approve'});
  assert.equal(result.status,404);assert.equal(result.body.error.code,'INVOICE_APPROVAL_NOT_FOUND');assert.equal(providerCalls,0);
});

test('Phase 3 routes return tenant-scoped FX, report, and recalculated invoice shapes',async()=>{
  const repos=createRepositories();
  repos.reports.rows=async()=>[{org_id:'a0000000-0000-4000-8000-000000000001',period:'2026-10-01',currency:'USD',code:'4000',name:'Sales Revenue',account_type:'revenue',amount_minor:'10000'}];
  repos.invoices.createDraft=async(_org,invoice,lines)=>({id:'00000000-0000-4000-8000-000000000001',...invoice,subtotalMinor:invoice.subtotal_minor,taxMinor:invoice.tax_minor,totalMinor:invoice.total_minor,lines});
  const config={PORT:3000,STATIC_DIR:process.cwd(),hasPayPal:true,hasAI:false,hasSupabase:true,SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'test-server'};
  const org='a0000000-0000-4000-8000-000000000001';
  const identity={async verifyToken(token){return ['ok','viewer'].includes(token)?{id:token==='viewer'?'viewer-user':'owner'}:null;},async membership(userId,orgId){return orgId===org&&['owner','viewer-user'].includes(userId)?{role:userId==='viewer-user'?'viewer':'owner',org_id:org,user_id:userId}:null;}};
  const app=createApp({config,repos,identity,paypal:{async pp(){throw new Error('unexpected provider call');}},askAI:async()=>({reply:'ok',evidence:[],proposal:null})});
  const server=app.listen(0,'127.0.0.1');await new Promise((resolve)=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=(path,options={})=>fetch(`${base}${path}`,{...options,headers:{authorization:`Bearer ${options.token||'ok'}`,'x-org-id':org,...(options.body?{'content-type':'application/json'}:{}),...options.headers}});
  try{
    const unauth=await fetch(`${base}/api/fx/convert?amount=1.00&base=USD&quote=EUR`);assert.equal(unauth.status,401);
    const fx=await call('/api/fx/convert?amount=1.00&base=USD&quote=USD');assert.equal(fx.status,200);assert.equal((await fx.json()).convertedAmount,'1.00');
    const badFx=await call('/api/fx/convert?amount=-1&base=USD&quote=EUR');assert.equal(badFx.status,400);
    const report=await call('/api/reports/profit-and-loss?from=2026-10-01&to=2026-10-31');const reportBody=await report.json();assert.equal(report.status,200);assert.equal(reportBody.totals.revenueMinor,'10000');
    assert.deepEqual(await (await call('/api/reports/profit-and-loss?from=2026-10-01&to=2026-10-31')).json(),reportBody);
    const invalidReport=await call('/api/reports/profit-and-loss?from=2026-11-01&to=2026-10-01');assert.equal(invalidReport.status,400);
    const viewerInvoice=await call('/api/invoices',{method:'POST',token:'viewer',body:JSON.stringify({})});assert.equal(viewerInvoice.status,403);
    const invalidInvoice=await call('/api/invoices',{method:'POST',body:JSON.stringify({invoiceNumber:'bad',lines:[]})});assert.equal(invalidInvoice.status,400);
    const invoice=await call('/api/invoices',{method:'POST',body:JSON.stringify({invoiceNumber:'INV-T',customerName:'Test Customer',customerEmail:'customer@example.test',currency:'USD',subtotalMinor:1,totalMinor:1,lines:[{description:'Service',quantity:'1',unitPrice:'12.00'}]})});
    const invoiceBody=await invoice.json();assert.equal(invoice.status,201);assert.equal(invoiceBody.invoice.totalMinor,1200);
    const tooLong=await call('/api/invoices',{method:'POST',body:JSON.stringify({invoiceNumber:'X'.repeat(26),customerName:'Test Customer',customerEmail:'customer@example.test',currency:'USD',lines:[{description:'Service',quantity:'1',unitPrice:'1.00'}]})});assert.equal(tooLong.status,400);
  }finally{await new Promise((resolve)=>server.close(resolve));}
});
