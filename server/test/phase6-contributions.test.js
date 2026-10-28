import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepositories } from '../src/repos/memory.js';
import { processPayPalEvent } from '../src/services/webhookProcessor.js';
import { createApp } from '../src/app.js';

async function setup({ amountMinor=1000 }={}) {
  const repos=createRepositories();
  const orgId='org-phase6-test';
  const campaign=await repos.funds.createCampaign({orgId,actorId:'user-phase6-test',title:'Roof repair',purpose:'Repair the shared roof.',targetMinor:5000,organiser:'Test Org',status:'active'});
  const contribution=await repos.funds.createPledge({orgId,actorId:'user-phase6-test',campaignId:campaign.id,amountMinor,requestId:'pledge-1'});
  const order=await repos.orders.save({id:'ORDER-PHASE6-TEST',requestKey:'a'.repeat(32),amount:(amountMinor/100).toFixed(2),currency:'USD',status:'CREATED',state:'Created',approveUrl:'https://www.paypal.com/checkoutnow?token=ORDER-PHASE6-TEST'},orgId);
  await repos.funds.linkContributionOrder({orgId,actorId:'user-phase6-test',contributionId:contribution.id,requestKey:order.requestKey,orderId:order.id,approveUrl:order.approveUrl,requestId:'order-link-1'});
  return {repos,orgId,campaign,contribution,order};
}

function capturePayload(eventId,{captureId='CAPTURE-PHASE6-TEST',amount='10.00'}={}) {
  return { id:eventId,event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{ id:captureId,status:'COMPLETED',amount:{value:amount,currency_code:'USD'},supplementary_data:{related_ids:{order_id:'ORDER-PHASE6-TEST'}},seller_receivable_breakdown:{gross_amount:{value:amount,currency_code:'USD'},paypal_fee:{value:'0.50',currency_code:'USD'},net_amount:{value:'9.50',currency_code:'USD'}} } };
}

async function deliver(repos,payload,verification='VERIFIED') {
  const eventId=await repos.events.receive({id:payload.id,type:payload.event_type,rawBody:JSON.stringify(payload),payload,headers:{}});
  return processPayPalEvent({eventId,repos,paypal:{async verifyWebhook(){return verification;}}});
}

test('pledges do not count as received funds and only a verified completed capture creates one receipt',async()=>{
  const {repos,orgId,campaign,contribution}=await setup();
  let summary=await repos.funds.campaignSummary(orgId,campaign.id);
  assert.equal(summary.pledgedMinor,1000);
  assert.equal(summary.receivedMinor,0);
  assert.equal(summary.remainingMinor,5000);
  assert.equal(contribution.status,'pledged');
  assert.equal(contribution.receipt,undefined);

  await deliver(repos,capturePayload('EVENT-PHASE6-UNVERIFIED'),'UNVERIFIED');
  assert.equal(contribution.status,'pledged');
  assert.equal(contribution.receipt,undefined);

  for(let i=0;i<5;i++) await deliver(repos,capturePayload(`EVENT-PHASE6-REPLAY-${i}`));
  assert.equal(contribution.status,'received');
  assert.equal(contribution.paypalCaptureId,'CAPTURE-PHASE6-TEST');
  assert.equal(repos.captures.all(orgId).length,1);
  assert.ok(contribution.receipt?.receiptNumber);
  summary=await repos.funds.campaignSummary(orgId,campaign.id);
  assert.equal(summary.pledgedMinor,0);
  assert.equal(summary.receivedMinor,1000);
  assert.equal(summary.remainingMinor,4000);
});

test('verified capture amount mismatch is flagged and never marks the pledge received',async()=>{
  const {repos,orgId,contribution}=await setup();
  const result=await deliver(repos,capturePayload('EVENT-PHASE6-MISMATCH',{captureId:'CAPTURE-PHASE6-MISMATCH',amount:'9.99'}));
  assert.equal(result.verification,'verified');
  assert.equal(result.posted,false);
  assert.equal(contribution.status,'pledged');
  assert.equal(contribution.captureMismatch,true);
  assert.match(contribution.captureMismatchReason,/does not match/i);
  assert.equal(contribution.receipt,undefined);
  assert.equal(repos.captures.all(orgId).length,0);
});

test('campaign and pledge API labels intent only and creates an idempotent linked PayPal order',async()=>{
  const repos=createRepositories();
  const orgId='a0000000-0000-4000-8000-000000000001';
  let providerOrderCalls=0;
  const config={PORT:3000,STATIC_DIR:process.cwd(),hasSupabase:true,hasPayPal:true,hasAI:false,SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-key',SUPABASE_SERVICE_ROLE_KEY:'server-key'};
  const identity={async verifyToken(){return{id:'user-phase6'}} ,async membership(){return{role:'owner'}}};
  const paypal={async pp(_method,url,body){
    if(url!=='/v2/checkout/orders') throw new Error('unexpected provider request');
    providerOrderCalls++;
    assert.equal(body.purchase_units[0].custom_id,body.purchase_units[0].reference_id);
    return{id:'ORDER-PHASE6-API',status:'CREATED',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-PHASE6-API'}]};
  }};
  const app=createApp({config,repos,paypal,identity});
  const server=app.listen(0,'127.0.0.1');
  await new Promise((resolve)=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const request=(url,init={})=>fetch(`${base}${url}`,{...init,headers:{authorization:'Bearer user-token','x-org-id':orgId,'content-type':'application/json',...(init.headers||{})}});
  try{
    const created=await request('/funds/campaigns',{method:'POST',body:JSON.stringify({title:'Roof',purpose:'Repair roof',targetMinor:5000,organiser:'Community',status:'active'})});
    assert.equal(created.status,201);
    const campaign=(await created.json()).campaign;
    const pledged=await request(`/funds/campaigns/${campaign.id}/pledges`,{method:'POST',body:JSON.stringify({amountMinor:1000})});
    assert.equal(pledged.status,201);
    const contribution=(await pledged.json()).contribution;
    assert.equal(contribution.status,'pledged');
    assert.equal(contribution.countsAsFunds,false);
    const summary=await request(`/funds/campaigns/${campaign.id}/summary`);
    assert.equal((await summary.json()).pledgedMinor,1000);
    const orderResponse=await request(`/funds/contributions/${contribution.id}/paypal-order`,{method:'POST',body:JSON.stringify({})});
    assert.equal(orderResponse.status,201);
    const order=await orderResponse.json();
    assert.equal(order.contributionId,contribution.id);
    assert.equal(order.amount,'10.00');
    const repeated=await request(`/funds/contributions/${contribution.id}/paypal-order`,{method:'POST',body:JSON.stringify({})});
    assert.equal(repeated.status,201);
    assert.equal((await repeated.json()).orderId,order.orderId);
    assert.equal(providerOrderCalls,1);
  } finally { await new Promise((resolve,reject)=>server.close((error)=>error?reject(error):resolve())); }
});
