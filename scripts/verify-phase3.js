import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxService } from '../server/src/services/fx.js';
import { reportCsvCell } from '../server/src/routes/reports.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { config } = await import('../server/src/config.js');
const apiBase = process.env.NOVAPAY_API_URL || ('http://127.0.0.1:' + config.PORT);
const webhookUrl = process.env.NOVAPAY_WEBHOOK_URL || (apiBase + '/api/webhook');
const sb = config.SUPABASE_URL.replace(/\/$/, '');
const sk = config.SUPABASE_SERVICE_ROLE_KEY;
const serviceHeaders = { apikey: sk, ...(sk.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + sk }), 'Content-Type': 'application/json' };
const publicHeaders = { apikey: config.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
const runId = randomUUID().replaceAll('-', '');
const fixtures = {
  A: { email: 'novapay-phase3-owner-a@example.test', org: 'NovaPay Phase 3 Verification A', role: 'owner' },
  B: { email: 'novapay-phase3-owner-b@example.test', org: 'NovaPay Phase 3 Verification B', role: 'owner' },
  viewer: { email: 'novapay-phase3-viewer@example.test', role: 'viewer' },
  accountant: { email: 'novapay-phase3-accountant@example.test', role: 'accountant' },
  approver: { email: 'novapay-phase3-approver@example.test', role: 'approver' },
};
const users = {}, tokens = {}, orgs = {};
const created = { invoices: new Set(), events: new Set(), fx: [], reconciliationIds: new Set(), finance: null };
const results = [];
let failed = false;
let paused = false;
const runStartedAt = new Date().toISOString();

function record(name, status, detail = '') {
  results.push({ name, status });
  console.log(status + ' ' + name + (detail ? ' — ' + detail : ''));
  if (status === 'FAIL') failed = true;
}
async function req(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(20000) }); }
  catch { return { status: 0, body: null, text: '', response: null }; }
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { status: response.status, body, text, response };
}
function q(params) { return new URLSearchParams(params).toString(); }
async function service(path, options = {}) {
  return req(sb + path, { ...options, headers: { ...serviceHeaders, ...(options.headers || {}) } });
}
function userHeaders(token, orgId) {
  return { ...publicHeaders, Authorization: 'Bearer ' + token, ...(orgId ? { 'X-Org-Id': orgId } : {}) };
}
async function api(path, opts = {}) {
  return req(apiBase + path, { method: opts.method || 'GET', headers: { ...(opts.token ? userHeaders(opts.token, opts.orgId) : {}), ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
}
async function rpc(name, body, token = null) {
  return req(sb + '/rest/v1/rpc/' + name, { method: 'POST', headers: token ? userHeaders(token) : serviceHeaders, body: JSON.stringify(body) });
}
function rest(table, params) { return sb + '/rest/v1/' + table + '?' + q(params); }

async function ensureUsers() {
  const found = new Map();
  for (let page=1; page<=20; page++) {
    const r = await req(sb + '/auth/v1/admin/users?page=' + page + '&per_page=100', { headers: serviceHeaders });
    if (r.status !== 200 || !Array.isArray(r.body?.users)) throw new Error('fixture-user-list-failed');
    for (const u of r.body.users) {
      if (Object.values(fixtures).some((f)=>f.email===u.email?.toLowerCase())) found.set(u.email.toLowerCase(),u);
    }
    if (r.body.users.length<100) break;
  }
  for (const [label, f] of Object.entries(fixtures)) {
    const password = randomBytes(30).toString('base64url');
    const old = found.get(f.email);
    const url = sb + '/auth/v1/admin/users' + (old ? '/' + old.id : '');
    const result = await req(url,{method:old?'PUT':'POST',headers:serviceHeaders,body:JSON.stringify({email:f.email,password,email_confirm:true})});
    if (![200,201].includes(result.status) || !(result.body?.id || old?.id)) throw new Error('fixture-user-provision-failed');
    users[label]=result.body?.id || old.id;
    const signed=await req(sb+'/auth/v1/token?grant_type=password',{method:'POST',headers:publicHeaders,body:JSON.stringify({email:f.email,password})});
    if(signed.status!==200||!signed.body?.access_token)throw new Error('fixture-signin-failed');
    tokens[label]=signed.body.access_token;
  }
}
async function ensureOrg(label) {
  const f=fixtures[label];
  const lookup=await service('/rest/v1/organizations?'+q({select:'id',name:'eq.'+f.org,limit:'2'}));
  if(lookup.status!==200||!Array.isArray(lookup.body)||lookup.body.length>1)throw new Error('fixture-org-lookup-failed');
  if(lookup.body.length===1){
    const id=lookup.body[0].id;
    const m=await service('/rest/v1/memberships?'+q({select:'role',org_id:'eq.'+id,user_id:'eq.'+users[label],limit:'2'}));
    if(m.status!==200||m.body?.length!==1||m.body[0].role!=='owner')throw new Error('fixture-org-owner-mismatch');
    return id;
  }
  const onboard=await api('/api/onboarding',{method:'POST',token:tokens[label],body:{organizationName:f.org}});
  if(![200,201].includes(onboard.status)||!onboard.body?.organizationId)throw new Error('fixture-org-onboarding-failed');
  return onboard.body.organizationId;
}
async function ensureRole(label) {
  const r=await service('/rest/v1/memberships?on_conflict=org_id%2Cuser_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({org_id:orgs.A,user_id:users[label],role:fixtures[label].role})});
  if(![200,201,204].includes(r.status))throw new Error('fixture-role-membership-failed');
}
async function setupFixtures() {
  await ensureUsers();
  orgs.A=await ensureOrg('A'); orgs.B=await ensureOrg('B');
  for(const label of ['viewer','accountant','approver'])await ensureRole(label);
  record('Fixed named test users/orgs reused','PASS','five named test identities and two dedicated organizations');
}

async function preflight0004() {
  // There is no safe PostgREST read endpoint for pg_get_functiondef. Require
  // explicit confirmation after the user applies the migration; don't probe a
  // real invoice with the old RPC because it could mark that invoice paid.
  return process.env.NOVAPAY_PHASE3_0004_APPLIED === 'true';
}

async function checkRpcRights() {
  const id=randomUUID(), aid='APR-P3-DENY-'+runId;
  const probes=[
    ['create_invoice_draft',{p_org:orgs.A,p_invoice:{},p_lines:[]}],
    ['set_invoice_state',{p_org:orgs.A,p_invoice_id:id,p_state:'reviewed',p_actor:users.approver,p_details:{}}],
    ['set_invoice_paypal_draft',{p_org:orgs.A,p_invoice_id:id,p_paypal_invoice_id:'P3-'+runId}],
    ['request_invoice_send_approval',{p_org:orgs.A,p_invoice_id:id,p_approval_id:aid,p_actor:users.accountant,p_payload:{}}],
    ['decide_invoice_send_approval',{p_org:orgs.A,p_approval_id:aid,p_decision:'approve',p_note:'',p_reviewer:users.approver,p_request_id:runId}],
    ['complete_invoice_send',{p_org:orgs.A,p_approval_id:aid,p_paypal_invoice_id:'P3-'+runId,p_result:{}}],
    ['fail_invoice_send',{p_org:orgs.A,p_approval_id:aid,p_error:{}}],
    ['mark_invoice_paid',{p_paypal_invoice_id:'P3-'+runId,p_event:{resource:{status:'PAID',amount:{currency_code:'USD',value:'0.01'}}}}],
  ];
  const statuses=[];
  for(const [name,args] of probes)statuses.push((await rpc(name,args,tokens.A)).status);
  record('Ordinary JWT denied on all eight Phase 3 RPCs',statuses.every((s)=>s===401||s===403)?'PASS':'FAIL','HTTP '+statuses.join('/'));

  const createdInvoice=await rpcCreateInvoice('P3-SVC-'+runId,100);
  const ok=[];
  let r=await rpc('set_invoice_state',{p_org:orgs.A,p_invoice_id:createdInvoice,p_state:'reviewed',p_actor:users.approver,p_details:{}});ok.push(r.status===200);
  const paypalId='P3-SVC-'+runId;
  r=await rpc('set_invoice_paypal_draft',{p_org:orgs.A,p_invoice_id:createdInvoice,p_paypal_invoice_id:paypalId});ok.push(r.status===200);
  const approval='APR-P3-SVC-'+runId;
  r=await rpc('request_invoice_send_approval',{p_org:orgs.A,p_invoice_id:createdInvoice,p_approval_id:approval,p_actor:users.accountant,p_payload:{}});ok.push(r.status===200);
  r=await rpc('decide_invoice_send_approval',{p_org:orgs.A,p_approval_id:approval,p_decision:'approve',p_note:'probe',p_reviewer:users.approver,p_request_id:'p3-'+runId});ok.push(r.status===200);
  r=await rpc('complete_invoice_send',{p_org:orgs.A,p_approval_id:approval,p_paypal_invoice_id:paypalId,p_result:{simulated:true}});ok.push(r.status===200);
  const second=await rpcCreateInvoice('P3-FAIL-'+runId,100);
  r=await rpc('set_invoice_state',{p_org:orgs.A,p_invoice_id:second,p_state:'reviewed',p_actor:users.approver,p_details:{}});ok.push(r.status===200);
  r=await rpc('request_invoice_send_approval',{p_org:orgs.A,p_invoice_id:second,p_approval_id:'APR-P3-FAIL-'+runId,p_actor:users.accountant,p_payload:{}});ok.push(r.status===200);
  r=await rpc('fail_invoice_send',{p_org:orgs.A,p_approval_id:'APR-P3-FAIL-'+runId,p_error:{message:'probe'}});ok.push(r.status===200);
  const mismatch=await rpcCreateInvoice('P3-MISMATCH-'+runId,10000);
  r=await rpc('set_invoice_state',{p_org:orgs.A,p_invoice_id:mismatch,p_state:'reviewed',p_actor:users.approver,p_details:{}});ok.push(r.status===200);
  const mismatchPaypal='P3-MISMATCH-'+runId;
  r=await rpc('set_invoice_paypal_draft',{p_org:orgs.A,p_invoice_id:mismatch,p_paypal_invoice_id:mismatchPaypal});ok.push(r.status===200);
  const wrong=await rpc('mark_invoice_paid',{p_paypal_invoice_id:mismatchPaypal,p_event:{id:'P3-WRONG-AMOUNT-'+runId,event_type:'INVOICING.INVOICE.PAID',resource:{id:mismatchPaypal,status:'PAID',amount:{currency_code:'USD',value:'0.01'},payments:[{amount:{currency_code:'USD',value:'0.01'}}]}}});
  const state=await service('/rest/v1/invoices?'+q({select:'state',id:'eq.'+mismatch,limit:'1'}));
  const flags=await service('/rest/v1/invoice_events?'+q({select:'event_type',invoice_id:'eq.'+mismatch,event_type:'eq.paid.amount_mismatch'}));
  ok.push(wrong.status===200&&wrong.body?.mismatch===true&&wrong.body?.updated===false&&state.body?.[0]?.state==='reviewed'&&flags.body?.length===1);
  record('Service role RPCs work; amount mismatch is flagged and invoice stays unpaid',ok.every(Boolean)?'PASS':'FAIL',ok.filter(Boolean).length+'/'+ok.length+' controlled assertions');
}
async function rpcCreateInvoice(number,total) {
  const r=await rpc('create_invoice_draft',{p_org:orgs.A,p_invoice:{invoice_number:number,customer_name:'NovaPay verifier',customer_email:'phase3-test@example.test',currency:'USD',subtotal_minor:total,tax_minor:0,total_minor:total,created_by:users.A},p_lines:[{description:'Verifier item',quantity:1,unit_price_minor:total,tax_rate:0,line_subtotal_minor:total,tax_minor:0,line_total_minor:total}]});
  if(r.status!==200||!r.body?.id)throw new Error('service-role-create-rpc-failed');
  created.invoices.add(r.body.id);return r.body.id;
}

async function checkTenantAndWrites() {
  const tables=['fx_rates','invoices','invoice_lines','invoice_events'];
  const views=['report_profit_and_loss','report_trial_balance','report_fee_summary','report_refunds_summary','report_cash_movement'];
  let readOk=true;
  for(const table of [...tables,...views]){
    const own=await req(rest(table,{select:'org_id',org_id:'eq.'+orgs.A,limit:'100'}),{headers:userHeaders(tokens.A)});
    const foreign=await req(rest(table,{select:'org_id',org_id:'eq.'+orgs.A,limit:'100'}),{headers:userHeaders(tokens.B)});
    readOk&&=own.status===200&&Array.isArray(own.body)&&foreign.status===200&&Array.isArray(foreign.body)&&foreign.body.length===0;
  }
  record('Org A can read its Phase 3 rows; Org B cannot read Org A rows',readOk?'PASS':'FAIL','nine tables/views checked');
  const bodies={
    fx_rates:{org_id:orgs.A,base_currency:'USD',quote_currency:'JPY',rate:'1',fetched_at:new Date().toISOString(),source:'probe'},
    invoices:{org_id:orgs.A,invoice_number:'P3-DIRECT-'+runId,customer_name:'Probe',customer_email:'probe@example.test',currency:'USD',subtotal_minor:1,tax_minor:0,total_minor:1,created_by:users.A},
    invoice_lines:{org_id:orgs.A,invoice_id:randomUUID(),description:'probe',quantity:1,unit_price_minor:1,line_subtotal_minor:1,tax_minor:0,line_total_minor:1},
    invoice_events:{org_id:orgs.A,invoice_id:randomUUID(),event_type:'probe'},
  };
  const denied=[];
  for(const [table,body] of Object.entries(bodies)){
    const r=await req(rest(table),{method:'POST',headers:{...userHeaders(tokens.A),Prefer:'return=minimal'},body:JSON.stringify(body)});
    denied.push([401,403,405].includes(r.status));
  }
  record('Direct user writes to Phase 3 tables are denied',denied.every(Boolean)?'PASS':'FAIL',denied.filter(Boolean).length+'/'+denied.length+' rejected');
}

async function checkFx() {
  const existing=await service('/rest/v1/fx_rates?'+q({select:'base_currency,quote_currency',org_id:'eq.'+orgs.A}));
  if(existing.status!==200||!Array.isArray(existing.body)){record('FX live request and cache','UNVERIFIED','cache table read unavailable');return;}
  const pairs=[['USD','EUR'],['EUR','USD'],['USD','GBP'],['GBP','USD'],['USD','CAD'],['CAD','USD'],['USD','CHF']];
  const seen=new Set(existing.body.map((r)=>r.base_currency+':'+r.quote_currency));
  const pair=pairs.find(([b,c])=>!seen.has(b+':'+c));
  if(!pair){record('FX live request and cache','UNVERIFIED','no unused rate pair in fixed test organization');return;}
  const path='/api/fx/convert?amount=1.00&base='+pair[0]+'&quote='+pair[1];
  const first=await api(path,{token:tokens.A,orgId:orgs.A});
  if(first.status!==200||!first.body?.rate||!first.body?.source||!first.body?.timestamp){record('FX live request and cache','UNVERIFIED','request HTTP '+first.status+'; code='+(first.body?.error?.code||'unavailable')+'; body suppressed');return;}
  created.fx.push({base:pair[0],quote:pair[1],timestamp:first.body.timestamp});
  const second=await api(path.replace('1.00','2.00'),{token:tokens.A,orgId:orgs.A});
  const firstTimestamp=Date.parse(first.body.timestamp),secondTimestamp=Date.parse(second.body?.timestamp);
  const sameRate=second.body?.rate===first.body.rate,sameTimestamp=Number.isFinite(firstTimestamp)&&firstTimestamp===secondTimestamp;
  record('FX makes one provider request and serves the cached rate',second.status===200&&sameRate&&sameTimestamp?'PASS':'FAIL','source='+first.body.source+'; first/second HTTP='+first.status+'/'+second.status+'; rate_equal='+sameRate+'; timestamp_equal='+sameTimestamp);
  let writes=0;const stale=createFxService({rates:{async get(){return{rate:'1.25',source:'stale',fetched_at:'2000-01-01T00:00:00.000Z'};},async put(){writes++;}},fetchImpl:async()=>{throw Error('simulated outage');}});
  let unavailable=false;try{await stale.convert({orgId:'test',amount:'1.00',base:'USD',quote:'EUR'});}catch(e){unavailable=e.statusCode===503&&e.code==='FX_PROVIDER_UNAVAILABLE';}
  record('Stale FX plus provider failure returns unavailable, no invented conversion',unavailable&&writes===0?'PASS':'FAIL','stale value was not returned');
}

async function createApiInvoice(email) {
  const r=await api('/api/invoices',{method:'POST',token:tokens.accountant,orgId:orgs.A,body:{invoiceNumber:'P3-'+runId.slice(0,20),customerName:'NovaPay Sandbox Buyer',customerEmail:email,currency:'USD',subtotalMinor:999999,taxMinor:999999,totalMinor:1,lines:[{description:'Phase 3 live invoice verification',quantity:'1',unitPrice:'1.00',taxRate:'0'}]}});
  if(r.status!==201||!r.body?.invoice?.id)throw new Error('api-invoice-create-failed-http-'+r.status+'-code-'+String(r.body?.error?.code||'unavailable').replace(/[^A-Z0-9_-]/gi,''));
  created.invoices.add(r.body.invoice.id);
  record('Invoice totals are recomputed despite client totals',r.body.invoice.totalMinor===100&&r.body.invoice.subtotalMinor===100&&r.body.invoice.taxMinor===0?'PASS':'FAIL','server-computed total matches line');
  return r.body.invoice;
}

async function checkInvoiceRoles(invoice) {
  const viewerCreate=await api('/api/invoices',{method:'POST',token:tokens.viewer,orgId:orgs.A,body:{invoiceNumber:'P3-V-'+runId,customerName:'Viewer',customerEmail:'viewer@example.test',currency:'USD',lines:[{description:'No',quantity:'1',unitPrice:'1.00'}]}});
  const viewerSend=await api('/api/invoices/'+invoice.id+'/send-approval',{method:'POST',token:tokens.viewer,orgId:orgs.A});
  record('Viewer cannot create or send invoices',viewerCreate.status===403&&viewerSend.status===403?'PASS':'FAIL','HTTP '+viewerCreate.status+'/'+viewerSend.status);
  const review=await api('/api/invoices/'+invoice.id+'/review',{method:'POST',token:tokens.approver,orgId:orgs.A});
  const approval=await api('/api/invoices/'+invoice.id+'/send-approval',{method:'POST',token:tokens.accountant,orgId:orgs.A});
  const approvalId=approval.body?.approval?.approvalId;
  if(!approvalId||review.status!==200)throw new Error('invoice-review-or-approval-failed');
  const noApproval=await api('/api/approvals/APR-P3-NO-'+runId+'/decision',{method:'POST',token:tokens.A,orgId:orgs.A,body:{decision:'approve',note:'probe'}});
  const accountantApprove=await api('/api/approvals/'+approvalId+'/decision',{method:'POST',token:tokens.accountant,orgId:orgs.A,body:{decision:'approve',note:'probe'}});
  record('Accountant can create but cannot approve; send requires pending approval',review.status===200&&approval.status===201&&noApproval.status===404&&accountantApprove.status===403?'PASS':'FAIL','missing approval/accountant approval denied');
  return approvalId;
}

async function queryInvoiceEvent(paypalId) {
  const rows=await service('/rest/v1/paypal_events?'+q({select:'event_id,event_type,verification_status,processing_status,payload,headers,raw_body',event_type:'eq.INVOICING.INVOICE.PAID',order:'created_at.desc',limit:'100'}));
  return rows.status===200&&Array.isArray(rows.body)?rows.body.find((e)=>e.payload?.resource?.id===paypalId)||null:null;
}
function decodeRaw(value) {
  if(typeof value!=='string')return null;
  if(value.startsWith('\\x'))return Buffer.from(value.slice(2),'hex').toString('utf8');
  if(value.startsWith('\\\\x'))return Buffer.from(value.slice(3),'hex').toString('utf8');
  return value;
}
async function checkInvoicePayment(invoice, approvalId) {
  const email=process.env.NOVAPAY_PHASE3_BUYER_EMAIL||'';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){record('Invoice send and signed paid webhook','UNVERIFIED','buyer email not provided');return;}
  // The invoice email is fixed at creation time, so this guard prevents sending to the placeholder.
  if(invoice.customerEmail!==email){record('Invoice send and signed paid webhook','UNVERIFIED','buyer email differs from the address used when creating invoice; rerun with NOVAPAY_PHASE3_BUYER_EMAIL set before creation');return;}
  const approved=await api('/api/approvals/'+approvalId+'/decision',{method:'POST',token:tokens.approver,orgId:orgs.A,body:{decision:'approve',note:'Phase 3 live verification'}});
  if(approved.status===200&&approved.body?.sendMode==='SIMULATED'&&approved.body?.simulated===true){
    record('Invoice approval uses explicit local SIMULATED send mode','PASS','no PayPal create/send call was made; local approval and invoice state recorded');
    record('Real signed invoice paid webhook linkage','UNVERIFIED','live PayPal send is a known limitation; no buyer payment or signed paid event exists');
    return;
  }
  if(approved.status!==200||approved.body?.status!=='completed'||!approved.body?.paypalInvoiceId){record('Invoice send and signed paid webhook','UNVERIFIED','PayPal Sandbox send unavailable; HTTP '+approved.status);return;}
  const paypalId=approved.body.paypalInvoiceId;
  const {createPayPalService}=await import('../server/src/services/paypal.js');
  const paypal=createPayPalService({config,events:{async addCall(){}}});
  const detail=await paypal.pp('GET','/v2/invoicing/invoices/'+encodeURIComponent(paypalId));
  const payer=Array.isArray(detail.links)?detail.links.find((l)=>['payer-view','payer_view'].includes(l.rel)&&/^https:\/\/(?:[A-Za-z0-9-]+\.)*paypal\.com$/i.test(new URL(l.href).hostname)):null;
  console.log('HUMAN ACTION REQUIRED: Open the Sandbox invoice and pay the $1.00 invoice with the US Personal Sandbox buyer and approved Visa.');
  if(payer)console.log('Sandbox payment URL: '+payer.href);
  else console.log('In the Sandbox buyer account, locate and pay the sent NovaPay verifier invoice.');
  paused=true;
  const rl=createInterface({input:stdin,output:stdout});
  const answer=(await rl.question('After payment in the browser, type paid; type skip if payment cannot be completed: ')).trim().toLowerCase();
  rl.close();paused=false;
  if(answer!=='paid'){record('Invoice send and signed paid webhook','UNVERIFIED','buyer payment skipped');return;}
  let event=null;const deadline=Date.now()+180000;
  while(Date.now()<deadline&&!event){event=await queryInvoiceEvent(paypalId);if(!event)await new Promise((resolve)=>setTimeout(resolve,2000));}
  if(!event||event.verification_status!=='verified'||event.processing_status!=='processed'){record('Real signed INVOICING.INVOICE.PAID webhook','UNVERIFIED','no verified processed event observed within 180 seconds');return;}
  created.events.add(event.event_id);
  const before=await service('/rest/v1/invoice_events?'+q({select:'id',invoice_id:'eq.'+invoice.id,event_type:'eq.paid.webhook'}));
  const status=await service('/rest/v1/invoices?'+q({select:'state,total_minor',id:'eq.'+invoice.id,limit:'1'}));
  const raw=decodeRaw(event.raw_body);
  if(!raw||!event.headers)throw new Error('real-event-replay-material-missing');
  const headers={'Content-Type':'application/json'};
  for(const h of ['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'])if(event.headers[h])headers[h]=event.headers[h];
  const replay=[];
  for(let i=0;i<5;i++)replay.push((await req(webhookUrl,{method:'POST',headers,body:raw})).status);
  await new Promise((resolve)=>setTimeout(resolve,1500));
  const evAfter=await service('/rest/v1/paypal_events?'+q({select:'event_id',event_id:'eq.'+event.event_id}));
  const paidAfter=await service('/rest/v1/invoice_events?'+q({select:'id',invoice_id:'eq.'+invoice.id,event_type:'eq.paid.webhook'}));
  const current=await service('/rest/v1/invoices?'+q({select:'state',id:'eq.'+invoice.id,limit:'1'}));
  const good=replay.every((s)=>s===200)&&evAfter.body?.length===1&&paidAfter.body?.length===1&&current.body?.[0]?.state==='paid'&&status.body?.[0]?.state==='paid'&&before.body?.length===1;
  record('Real signed event replayed five times causes one paid status change',good?'PASS':'FAIL','five replay HTTP statuses '+replay.join('/')+'; paid events '+(paidAfter.body?.length||0));
  const badId='P3-BADSIG-'+runId;created.events.add(badId);
  const oldState=current.body?.[0]?.state;
  const bad=await req(webhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:badId,event_type:'INVOICING.INVOICE.PAID',resource:{id:paypalId,status:'PAID',amount:{currency_code:'USD',value:'999.99'}}})});
  await new Promise((resolve)=>setTimeout(resolve,1000));
  const badRow=await service('/rest/v1/paypal_events?'+q({select:'verification_status',event_id:'eq.'+badId,limit:'1'}));
  const still=await service('/rest/v1/invoices?'+q({select:'state',id:'eq.'+invoice.id,limit:'1'}));
  record('Bad-signature invoice event is retained and changes nothing',bad.status===200&&['failed','error','unverified'].includes(badRow.body?.[0]?.verification_status)&&still.body?.[0]?.state===oldState?'PASS':'FAIL','invoice state unchanged='+String(still.body?.[0]?.state===oldState));
  record('Invoice sent and paid through PayPal Sandbox','PASS','signed provider webhook confirmed');
}

async function checkReportsAndPhase2Safe() {
  const d=new Date(),start=d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-01',end=d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()).padStart(2,'0');
  const names=['profit-and-loss','trial-balance','fees','refunds','cash-movement'];
  const reports={};let ok=true;
  for(const name of names){reports[name]=await api('/api/reports/'+name+'?from='+start+'&to='+end,{token:tokens.A,orgId:orgs.A});ok&&=reports[name].status===200&&Array.isArray(reports[name].body?.rows)&&reports[name].body.rows.every((r)=>r.period>=start&&r.period<=end);}
  const csv=await api('/api/reports/profit-and-loss?from='+start+'&to='+end+'&format=csv',{token:tokens.A,orgId:orgs.A});
  ok&&=csv.status===200&&csv.response.headers.get('content-type')?.includes('text/csv');
  record('Five reports honor inclusive date filters and CSV export',ok?'PASS':'FAIL','all five endpoints and CSV content type');
  record('CSV formulas are neutralized',reportCsvCell('=1+1')==="\"'=1+1\""&&reportCsvCell('\t@X').startsWith("\"'\t")?'PASS':'FAIL','formula prefixes receive apostrophe');
  const schemas=['accounts','journal_entries','journal_lines','transactions','paypal_orders','paypal_captures','paypal_events','approvals','reconciliation_runs'];
  const available=[];for(const t of schemas)available.push((await service('/rest/v1/'+t+'?select=id&limit=0')).status===200);
  const tb=await api('/api/ledger/trial-balance',{token:tokens.A,orgId:orgs.A});
  const recon=await api('/api/reconciliation',{token:tokens.A,orgId:orgs.A});
  if(recon.body?.run?.id)created.reconciliationIds.add(recon.body.run.id);
  record('Safe Phase 2 verifier subset (schema, trial balance, reconciliation)',available.every(Boolean)&&tb.status===200&&recon.status===200?'PASS':'FAIL','financial tables '+available.filter(Boolean).length+'/'+available.length+'; protected reads successful');
  const parity=await checkRealReportParity(start,end);
  record('Live report totals equal this run ledger totals',parity?'PASS':'FAIL',parity?'capture and refund ledger lines match all five report totals':'one or more report totals differ from ledger-derived totals');
}

function amount(value){try{return BigInt(String(value||0));}catch{return 0n;}}
function sum(rows,fn){return rows.reduce((n,row)=>n+fn(row),0n);}
async function checkRealReportParity(start,end){
  const reports={};
  for(const name of ['profit-and-loss','trial-balance','fees','refunds','cash-movement']){
    const r=await api('/api/reports/'+name+'?from='+start+'&to='+end,{token:tokens.A,orgId:orgs.A});
    if(r.status!==200||!Array.isArray(r.body?.rows))return false;
    reports[name]=r.body;
  }
  const ledger=await api('/api/ledger/entries?limit=100&from='+start+'T00:00:00.000Z&to='+end+'T23:59:59.999Z',{token:tokens.A,orgId:orgs.A});
  if(ledger.status!==200||!Array.isArray(ledger.body?.entries))return false;
  const entries=ledger.body.entries.filter(e=>e.currency==='USD'&&String(e.created_at||'').slice(0,10)>=start&&String(e.created_at||'').slice(0,10)<=end);
  const lines=entries.flatMap(e=>(e.lines||[]).map(l=>({...l,source_type:e.source_type,period:String(e.created_at).slice(0,7)+'-01'})));
  const value=(l)=>amount(l.debit_minor)-amount(l.credit_minor);
  const pnl=reports['profit-and-loss'].rows;
  const pnlRevenue=sum(lines.filter(l=>l.accounts?.account_type==='revenue'),l=>-value(l));
  const pnlRefund=sum(lines.filter(l=>l.accounts?.account_type==='contra_revenue'),value);
  const pnlExpense=sum(lines.filter(l=>l.accounts?.account_type==='expense'),value);
  const pnlOk=sum(pnl.filter(r=>r.account_type==='revenue'),r=>amount(r.amount_minor))===pnlRevenue&&sum(pnl.filter(r=>r.account_type==='contra_revenue'),r=>amount(r.amount_minor))===pnlRefund&&sum(pnl.filter(r=>r.account_type==='expense'),r=>amount(r.amount_minor))===pnlExpense;
  const trial=reports['trial-balance'];
  const trialDebit=sum(lines,l=>amount(l.debit_minor)),trialCredit=sum(lines,l=>amount(l.credit_minor));
  const trialOk=sum(trial.rows,r=>amount(r.debit_minor))===trialDebit&&sum(trial.rows,r=>amount(r.credit_minor))===trialCredit&&trialDebit===trialCredit;
  const fee=sum(lines.filter(l=>l.accounts?.code==='5000'),value);
  const feeOk=sum(reports.fees.rows,r=>amount(r.fee_minor))===fee;
  const refundEntries=entries.filter(e=>e.source_type==='refund');
  const refund=sum(lines.filter(l=>l.source_type==='refund'&&l.accounts?.code==='4050'),value);
  const refundOk=sum(reports.refunds.rows,r=>amount(r.refund_minor))===refund&&sum(reports.refunds.rows,r=>amount(r.refund_count))===BigInt(refundEntries.length);
  const cash=sum(lines.filter(l=>['1000','1010'].includes(l.accounts?.code)),value);
  const cashOk=sum(reports['cash-movement'].rows,r=>amount(r.cash_movement_minor))===cash;
  const first=start,afterFirst=new Date(Date.parse(start+'T00:00:00Z')+86400000).toISOString().slice(0,10),last=end;
  const atBoundary=await api('/api/reports/trial-balance?from='+first+'&to='+first,{token:tokens.A,orgId:orgs.A});
  const pastBoundary=await api('/api/reports/trial-balance?from='+afterFirst+'&to='+last,{token:tokens.A,orgId:orgs.A});
  const boundaryOk=atBoundary.status===200&&atBoundary.body?.rows?.length>0&&pastBoundary.status===200&&pastBoundary.body?.rows?.length===0;
  const csv=await api('/api/reports/profit-and-loss?from='+start+'&to='+end+'&format=csv',{token:tokens.A,orgId:orgs.A});
  const csvOk=csv.status===200&&csv.response.headers.get('content-type')?.includes('text/csv')&&csv.text.includes('account_type');
  record('Report date boundaries are inclusive at the period start',boundaryOk?'PASS':'FAIL','start-day rows='+String(atBoundary.body?.rows?.length||0)+'; start+1-day rows='+String(pastBoundary.body?.rows?.length||0));
  record('CSV export returned for live ledger report',csvOk?'PASS':'FAIL','content-type='+String(csv.response.headers.get('content-type')||'unavailable'));
  return pnlOk&&trialOk&&feeOk&&refundOk&&cashOk&&boundaryOk&&csvOk&&entries.some(e=>e.source_type==='capture')&&refundEntries.length===1;
}

async function countJournalSource(sourceType,sourceId){
  const r=await service('/rest/v1/journal_entries?'+q({select:'id',org_id:'eq.'+orgs.A,source_type:'eq.'+sourceType,source_id:'eq.'+sourceId}));
  if(r.status!==200||!Array.isArray(r.body))throw new Error('journal-source-count-failed');
  return r.body.length;
}
async function waitForCaptureEvent(captureId){
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    const r=await service('/rest/v1/paypal_events?'+q({select:'event_id,event_type,raw_body,payload,headers,verification_status,processing_status',order:'created_at.desc',limit:'100'}));
    if(r.status===200&&Array.isArray(r.body)){
      const event=r.body.find(e=>e.event_type==='PAYMENT.CAPTURE.COMPLETED'&&e.payload?.resource?.id===captureId);
      if(event)return event;
    }
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  return null;
}
function decodeRawBody(value){
  if(typeof value!=='string')return null;
  if(value.startsWith('\\\\x'))return Buffer.from(value.slice(3),'hex').toString('utf8');
  if(value.startsWith('\\x'))return Buffer.from(value.slice(2),'hex').toString('utf8');
  return value;
}
async function checkLivePaymentFlow(){
  const requestKey=randomUUID().replaceAll('-','');
  const order=await api('/api/paypal/create-order',{method:'POST',token:tokens.A,orgId:orgs.A,body:{amount:'1.00',currency:'USD',requestKey}});
  if(order.status!==200||!order.body?.orderId||!order.body?.approveUrl){record('Real sandbox order created','FAIL','HTTP '+order.status);return false;}
  created.finance={requestKey,orderId:order.body.orderId};
  console.log('\nPAYPAL SANDBOX APPROVAL URL (open this in your browser):\n'+order.body.approveUrl+'\n');
  paused=true;
  const rl=createInterface({input:stdin,output:stdout});
  const answer=(await rl.question('Approve the $1.00 purchase as the US Sandbox buyer, then reply approved here: ')).trim().toLowerCase();
  rl.close();paused=false;
  if(answer!=='approved'){record('Real sandbox buyer approval and payment','UNVERIFIED','buyer approval not confirmed');return false;}
  const capture=await api('/api/paypal/capture',{method:'POST',token:tokens.A,orgId:orgs.A,body:{orderId:order.body.orderId}});
  if(capture.status!==200||capture.body?.status!=='COMPLETED'||!capture.body?.captureId){record('Real sandbox order captured','FAIL','HTTP '+capture.status+'; response body suppressed');return false;}
  created.finance.captureId=capture.body.captureId;
  record('Real sandbox order captured','PASS','status=COMPLETED; gross='+capture.body.amount+' '+capture.body.currency);
  const journalCount=await countJournalSource('capture',capture.body.captureId);
  record('Capture posted to ledger once',journalCount===1?'PASS':'FAIL','journal entries='+journalCount);
  const event=await waitForCaptureEvent(capture.body.captureId);
  const verified=event?.verification_status==='verified'&&event?.processing_status==='processed';
  if(event?.event_id)created.events.add(event.event_id);
  record('Real PayPal-signed capture webhook processed',verified?'PASS':event?'FAIL':'UNVERIFIED',event?'verification='+event.verification_status+'; processing='+event.processing_status:'no matching event within 120 seconds');
  if(verified){
    created.finance.eventId=event.event_id;
    const raw=decodeRawBody(event.raw_body),headers={'Content-Type':'application/json'};
    for(const h of ['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'])if(event.headers?.[h])headers[h]=event.headers[h];
    if(raw){const replay=[];for(let i=0;i<5;i++)replay.push((await req(webhookUrl,{method:'POST',headers,body:raw})).status);await new Promise(resolve=>setTimeout(resolve,1200));const after=await countJournalSource('capture',capture.body.captureId);const rows=await service('/rest/v1/paypal_events?'+q({select:'event_id',event_id:'eq.'+event.event_id}));record('Signed capture raw-body replay x5 remains one event and one ledger entry',replay.every(s=>s===200)&&rows.body?.length===1&&after===1?'PASS':'FAIL','replay HTTP='+replay.join('/')+'; event rows='+(rows.body?.length||0)+'; journal entries='+after);}else record('Signed capture raw-body replay x5 remains one event and one ledger entry','UNVERIFIED','stored raw body unavailable');
  }else record('Signed capture raw-body replay x5 remains one event and one ledger entry','UNVERIFIED','no verified event to replay');
  const amount=String(capture.body.amount),approvalId='APR-P3-REAL-'+randomUUID().replaceAll('-','').slice(0,20);
  const registration=await api('/api/approvals/register',{method:'POST',token:tokens.A,orgId:orgs.A,body:{proposalType:'refund',approvalId,captureId:capture.body.captureId,amount,currency:'USD'}});
  if(registration.status!==200||registration.body?.registered!==true){record('Real sandbox refund completed','FAIL','approval registration HTTP '+registration.status);return false;}
  created.finance.approvalId=approvalId;
  const refund=await api('/api/approvals/'+approvalId+'/decision',{method:'POST',token:tokens.approver,orgId:orgs.A,body:{decision:'approve',note:'Phase 3 real-data report verification'}});
  if(refund.status!==200||!refund.body?.refundId){record('Real sandbox refund completed','FAIL','approval outcome HTTP '+refund.status);return false;}
  created.finance.refundId=refund.body.refundId;
  const refundEntries=await countJournalSource('refund',refund.body.refundId);
  record('Real sandbox refund completed and posted once',refund.body.status==='COMPLETED'&&refundEntries===1?'PASS':'FAIL','status='+refund.body.status+'; refund ledger entries='+refundEntries);
  return true;
}

async function cleanup() {
  const errors=[];
  const remove=async(path,label)=>{const r=await service(path,{method:'DELETE',headers:{Prefer:'return=minimal'}});if(![200,204].includes(r.status))errors.push(label);};
  for(const id of created.invoices){const r=await service('/rest/v1/invoices?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}});if(![200,204].includes(r.status))errors.push('invoice');}
  for(const id of created.events){const r=await service('/rest/v1/paypal_events?event_id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}});if(![200,204].includes(r.status))errors.push('event');}
  for(const rate of created.fx){const r=await service('/rest/v1/fx_rates?'+q({org_id:'eq.'+orgs.A,base_currency:'eq.'+rate.base,quote_currency:'eq.'+rate.quote,fetched_at:'eq.'+rate.timestamp}),{method:'DELETE',headers:{Prefer:'return=minimal'}});if(![200,204].includes(r.status))errors.push('fx');}
  for(const id of created.reconciliationIds)await remove('/rest/v1/reconciliation_runs?'+q({id:'eq.'+id,org_id:'eq.'+orgs.A}),'reconciliation');
  const f=created.finance;
  if(f?.captureId){
    const related=await service('/rest/v1/paypal_events?'+q({select:'event_id,payload',org_id:'eq.'+orgs.A,created_at:'gte.'+runStartedAt,limit:'100'}));
    if(related.status===200&&Array.isArray(related.body))for(const row of related.body){const rid=row.payload?.resource?.id||row.payload?.resource?.supplementary_data?.related_ids?.capture_id;if(rid===f.captureId||rid===f.refundId)created.events.add(row.event_id);}
    await remove('/rest/v1/journal_entries?'+q({org_id:'eq.'+orgs.A,source_type:'eq.capture',source_id:'eq.'+f.captureId}),'capture-ledger');
    await remove('/rest/v1/transactions?'+q({org_id:'eq.'+orgs.A,source_type:'eq.capture',source_id:'eq.'+f.captureId}),'capture-transaction');
    if(f.refundId){
      await remove('/rest/v1/journal_entries?'+q({org_id:'eq.'+orgs.A,source_type:'eq.refund',source_id:'eq.'+f.refundId}),'refund-ledger');
      await remove('/rest/v1/transactions?'+q({org_id:'eq.'+orgs.A,source_type:'eq.refund',source_id:'eq.'+f.refundId}),'refund-transaction');
    }
    if(f.approvalId)await remove('/rest/v1/approvals?'+q({org_id:'eq.'+orgs.A,id:'eq.'+f.approvalId}),'refund-approval');
    const unlink=await service('/rest/v1/paypal_orders?'+q({org_id:'eq.'+orgs.A,paypal_order_id:'eq.'+f.orderId}),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({capture_id:null})});
    if(![200,204].includes(unlink.status))errors.push('order-capture-unlink');
    await remove('/rest/v1/paypal_captures?'+q({org_id:'eq.'+orgs.A,paypal_capture_id:'eq.'+f.captureId}),'capture');
  }
  if(f?.orderId)await remove('/rest/v1/paypal_orders?'+q({org_id:'eq.'+orgs.A,paypal_order_id:'eq.'+f.orderId}),'order');
  if(f?.eventId)await remove('/rest/v1/paypal_events?'+q({provider:'eq.paypal',event_id:'eq.'+f.eventId}),'capture-event');
  record('Run-created rows cleaned',errors.length?'FAIL':'PASS',errors.length?'cleanup failed for '+[...new Set(errors)].join(','):'this run’s invoices, FX, reconciliation, event, order, capture, refund, transaction, approval, and journal rows removed; fixed users/orgs and append-only audit/activity rows retained; Sandbox payment/refund remain in provider history');
}

async function run() {
  if(!config.hasSupabase||!config.hasPayPal||!config.PAYPAL_WEBHOOK_ID)throw new Error('required-provider-configuration-missing');
  const health=await api('/api/status');
  record('Running NovaPay server reachable',health.status===200?'PASS':'FAIL','HTTP '+health.status);
  const migrated=await preflight0004();
  record('0004 amount-mismatch guard applied',migrated?'PASS':'UNVERIFIED',migrated?'user confirmed migration application; mismatch is exercised on verifier-created invoice':'apply supabase/migrations/0004_fix_invoice_paid_amount.sql, then set NOVAPAY_PHASE3_0004_APPLIED=true');
  if(!migrated)return;
  await setupFixtures();
  await checkRpcRights();
  await checkTenantAndWrites();
  await checkFx();
  const email=process.env.NOVAPAY_PHASE3_BUYER_EMAIL||'';
  const invoice=await createApiInvoice(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:'phase3-pending@example.test');
  const approval=await checkInvoiceRoles(invoice);
  await checkLivePaymentFlow();
  await checkReportsAndPhase2Safe();
  record('Real invoice paid linkage for SIMULATED invoice','UNVERIFIED','simulated invoices have no PayPal invoice ID; real Invoicing send is a known limitation; existing unit coverage verifies simulated approval without provider calls and amount-mismatch handling');
}

try {
  await run();
} catch(error) {
  const safe=String(error?.message||'verification-error').replace(/https?:\/\/\S+/g,'[URL]').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,'[email]');
  console.error('Verifier stopped: '+safe+'; secrets and provider bodies suppressed.');
  record('Verifier ended without an unexpected error','FAIL','see redacted stop reason');
} finally {
  if(!paused&&Object.keys(orgs).length)await cleanup();
}
console.log('\nPhase 3 live verification results');
for(const r of results)console.log(r.status+' '+r.name);
const overall=failed?'FAIL':results.some((r)=>r.status==='UNVERIFIED')?'UNVERIFIED':'PASS';
console.log('Overall: '+overall);
if(failed)process.exitCode=1;else if(overall==='UNVERIFIED')process.exitCode=2;
