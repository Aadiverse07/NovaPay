// NovaPay backend — zero dependencies (Node 18+). Run: node server.js
// PayPal Sandbox (OAuth2, Orders v2, Payments v2 refunds, Webhooks) + Claude (Anthropic Messages API).
const http=require('http'),fs=require('fs'),path=require('path');
try{fs.readFileSync(path.join(__dirname,'.env'),'utf8').split('\n').forEach(l=>{const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,'')})}catch(e){}
const E=process.env,PP='https://api-m.sandbox.paypal.com',PORT=E.PORT||3000;
const hasPP=!!(E.PAYPAL_CLIENT_ID&&E.PAYPAL_CLIENT_SECRET),hasAI=!!E.ANTHROPIC_API_KEY;
const MODEL=E.ANTHROPIC_MODEL||'claude-sonnet-5-5';
const calls=[],events=[],captures=[];let tok={v:null,exp:0};
const log=(m,ok=true)=>{calls.unshift({t:new Date().toISOString(),m,ok});calls.length=Math.min(calls.length,30)};
async function ppToken(){
  if(tok.v&&Date.now()<tok.exp)return tok.v;
  const r=await fetch(PP+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(E.PAYPAL_CLIENT_ID+':'+E.PAYPAL_CLIENT_SECRET).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
  const d=await r.json();if(!r.ok)throw new Error('PayPal auth failed: '+(d.error_description||r.status));
  tok={v:d.access_token,exp:Date.now()+(d.expires_in-60)*1000};log('POST /v1/oauth2/token');return tok.v;
}
async function pp(method,url,body){
  const r=await fetch(PP+url,{method,headers:{Authorization:'Bearer '+await ppToken(),'Content-Type':'application/json','PayPal-Request-Id':'np-'+Date.now()+Math.random().toString(36).slice(2)},body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({}));log(method+' '+url+' → '+r.status,r.ok);
  if(!r.ok)throw new Error(d.details&&d.details[0]?d.details[0].description:d.message||('PayPal '+r.status));return d;
}
const SYS=`You are NovaPay AI, a bookkeeping assistant for PayPal merchants. Use ONLY the transaction context provided; never invent numbers. Reply with JSON only (no markdown): {"reply":"short answer","proposal":null or {"type":"refund"|"dispute-evidence"|"hold-payout","txId":"id from context","usd":number,"title":"short title","reason":"one sentence"}}. Propose an action only when the data clearly supports it (duplicate payment, refund burst, open dispute). A human must approve every action; you never execute anything.`;
async function claude(message,context){
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':E.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:MODEL,max_tokens:600,system:SYS,messages:[{role:'user',content:'Context:\n'+JSON.stringify(context)+'\n\nQuestion: '+message}]})});
  const d=await r.json();log('POST anthropic /v1/messages ('+MODEL+') → '+r.status,r.ok);
  if(!r.ok)throw new Error(d.error&&d.error.message||'AI error');
  const t=(d.content||[]).map(c=>c.text||'').join('').replace(/```json|```/g,'').trim();
  try{return JSON.parse(t)}catch(e){return{reply:t,proposal:null}}
}
async function verifyWebhook(h,body){
  if(!E.PAYPAL_WEBHOOK_ID)return 'unverified (set PAYPAL_WEBHOOK_ID)';
  try{const d=await pp('POST','/v1/notifications/verify-webhook-signature',{auth_algo:h['paypal-auth-algo'],cert_url:h['paypal-cert-url'],transmission_id:h['paypal-transmission-id'],transmission_sig:h['paypal-transmission-sig'],transmission_time:h['paypal-transmission-time'],webhook_id:E.PAYPAL_WEBHOOK_ID,webhook_event:body});return d.verification_status==='SUCCESS'?'verified':'FAILED'}catch(e){return 'error'}
}
const read=q=>new Promise(r=>{let b='';q.on('data',c=>b+=c);q.on('end',()=>{try{r(JSON.parse(b||'{}'))}catch(e){r({})}})});
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
http.createServer(async(q,s)=>{
  const send=(c,o)=>{s.writeHead(c,{'Content-Type':'application/json'});s.end(JSON.stringify(o))};
  const u=new URL(q.url,'http://x').pathname;
  try{
    if(u==='/api/status')return send(200,{paypal:hasPP,ai:hasAI,model:hasAI?MODEL:null,captures:captures.length});
    if(u==='/api/events')return send(200,{events,calls});
    if(u==='/api/webhook'&&q.method==='POST'){const b=await read(q);const v=await verifyWebhook(q.headers,b);events.unshift({t:new Date().toISOString(),type:b.event_type||'unknown',id:b.id,v,summary:b.summary||''});events.length=Math.min(events.length,30);return send(200,{ok:true})}
    if(!u.startsWith('/api/')){ // static
      let f=path.join(__dirname,u==='/'?'preview.html':decodeURIComponent(u));if(!f.startsWith(__dirname)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){s.writeHead(404);return s.end('Not found')}
      s.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});return fs.createReadStream(f).pipe(s);
    }
    const b=q.method==='POST'?await read(q):{};
    if(u==='/api/ai/chat'){if(!hasAI)return send(503,{error:'ANTHROPIC_API_KEY not set'});return send(200,await claude(String(b.message||'').slice(0,500),b.context||{}))}
    if(!hasPP)return send(503,{error:'PayPal sandbox credentials not set'});
    if(u==='/api/paypal/create-order'){const amt=Math.max(0.01,Number(b.amount)||10).toFixed(2);
      const d=await pp('POST','/v2/checkout/orders',{intent:'CAPTURE',purchase_units:[{amount:{currency_code:'USD',value:amt},description:'NovaPay sandbox test payment'}],payment_source:{paypal:{experience_context:{return_url:'http://localhost:'+PORT+'/dashboard.html#sandbox',cancel_url:'http://localhost:'+PORT+'/dashboard.html#sandbox',user_action:'PAY_NOW'}}}});
      const link=(d.links||[]).find(l=>l.rel==='payer-action'||l.rel==='approve');return send(200,{id:d.id,status:d.status,approveUrl:link&&link.href,amount:amt})}
    if(u==='/api/paypal/capture'){const d=await pp('POST','/v2/checkout/orders/'+encodeURIComponent(b.orderId)+'/capture');
      const c=d.purchase_units[0].payments.captures[0];captures.unshift({id:c.id,value:c.amount.value,currency:c.amount.currency_code});return send(200,{captureId:c.id,status:c.status,amount:c.amount.value,fee:c.seller_receivable_breakdown&&c.seller_receivable_breakdown.paypal_fee&&c.seller_receivable_breakdown.paypal_fee.value})}
    if(u==='/api/paypal/refund'){const cap=b.captureId||(captures[0]&&captures[0].id);
      if(!cap)return send(409,{error:'No captured sandbox payment yet. Create and capture a test order in the PayPal Sandbox page first.'});
      const val=Math.max(0.01,Number(b.usd)||1).toFixed(2);
      const d=await pp('POST','/v2/payments/captures/'+cap+'/refund',{amount:{value:val,currency_code:'USD'},note_to_payer:String(b.note||'Refund approved in NovaPay').slice(0,255)});
      return send(200,{refundId:d.id,status:d.status,captureId:cap,usd:val})}
    send(404,{error:'unknown route'});
  }catch(e){log(u+' failed: '+e.message,false);send(500,{error:e.message})}
}).listen(PORT,()=>console.log('NovaPay → http://localhost:'+PORT+'/dashboard.html  | PayPal sandbox:',hasPP?'on':'off','| AI:',hasAI?MODEL:'off'));
