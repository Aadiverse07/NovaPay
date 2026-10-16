/* NovaPay live layer: Approvals queue, PayPal Sandbox page, AI proposals. Falls back to demo mode without the backend. */
(function(){
  var $=function(id){return document.getElementById(id)};
  var live={paypal:false,ai:false}, nextId=1, audit=[];
  var toast=function(m){var t=$("dashboard-toast");if(t){t.textContent=m;t.classList.add("show");setTimeout(function(){t.classList.remove("show")},2600);}};
  var esc=function(s){var d=document.createElement("div");d.textContent=String(s==null?"":s);return d.innerHTML};
  function api(path,body){
    return fetch(path,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:undefined).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||r.status);return d})});
  }
  var queue=[
    {type:"refund",txId:"PAY-28491",display:"₹2,000",usd:2,title:"Refund duplicate payment",reason:"Two identical payments from the same buyer within 90 seconds.",source:"Rule engine"},
    {type:"dispute-evidence",txId:"DSP-1004",display:"₹5,000",usd:5,title:"Submit evidence for open dispute",reason:"Delivery proof matches the disputed order; response window is closing.",source:"Rule engine"},
    {type:"hold-payout",txId:"PAY-1005",display:"₹50,000",usd:50,title:"Hold next payout for review",reason:"3 large refunds in 20 minutes before a payout.",source:"Anomaly detector"}
  ].map(function(p){p.id=nextId++;return p});
  var LABEL={"refund":"Refund","dispute-evidence":"Dispute evidence","hold-payout":"Payout hold"};
  function liveCapable(p){return p.type==="refund"&&live.paypal}
  function renderQueue(){
    var box=$("approval-queue");if(!box)return;
    box.innerHTML=queue.length?queue.map(function(p){return '<article class="dash-card approval-card" data-id="'+p.id+'"><div class="approval-top"><span class="status '+(p.type==="refund"?"warn":"info")+'">'+LABEL[p.type]+'</span><small>Proposed by '+esc(p.source)+'</small></div><h3>'+esc(p.title)+'</h3><p>'+esc(p.reason)+'</p><dl><div><dt>Reference</dt><dd>'+esc(p.txId)+'</dd></div><div><dt>Amount</dt><dd>'+esc(p.display)+(p.type==="refund"?' <small>(sandbox: $'+Number(p.usd).toFixed(2)+')</small>':'')+'</dd></div><div><dt>Executes</dt><dd>'+(liveCapable(p)?"PayPal sandbox refund":"Simulated only")+'</dd></div></dl><div class="agent-actions"><button class="btn btn--primary" data-approve="'+p.id+'">Approve</button><button class="btn btn--ghost" data-reject="'+p.id+'">Reject</button></div></article>'}).join(""):'<div class="empty-state"><h3>Queue is clear</h3><p>Ask the AI Assistant or review an anomaly to create new proposals.</p></div>';
    var n=$("nav-approvals-count");if(n){n.textContent=queue.length;n.hidden=!queue.length}
  }
  function renderAudit(){var ul=$("audit-log");if(ul)ul.innerHTML=audit.length?audit.map(function(a){return "<li>"+a+"</li>"}).join(""):'<li class="np-empty">No decisions yet.</li>'}
  function addRecords(p,ref){
    var tb=$("transactions-table-body");
    if(tb&&p.type==="refund"){var r=document.createElement("tr");r.className="transaction-row";r.tabIndex=0;r.dataset.txId=ref;r.dataset.type="Refund";r.innerHTML='<td><span class="tx-badge refund">↩</span> Refund</td><td>'+esc(p.display)+'</td><td>—</td><td>-'+esc(p.display)+'</td><td><span class="status danger">Refunded</span></td><td>Just now</td>';tb.insertBefore(r,tb.firstChild)}
    var jb=document.querySelector("#view-ledger tbody");
    if(jb&&p.type==="refund"){var j=document.createElement("tr");j.innerHTML='<td>'+new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})+'</td><td>Refund '+esc(p.txId)+' ('+esc(ref)+')</td><td>'+esc(p.display)+'</td><td>'+esc(p.display)+'</td><td><span class="status ok">Balanced</span></td>';jb.insertBefore(j,jb.firstChild)}
  }
  function decide(id,ok){
    var i=queue.findIndex(function(p){return p.id===id});if(i<0)return;var p=queue[i];
    var done=function(note,ref){queue.splice(i,1);audit.unshift("<b>"+(ok?"Approved":"Rejected")+"</b> · "+esc(p.title)+" · "+esc(note)+" · "+new Date().toLocaleTimeString());renderQueue();renderAudit();if(ok)addRecords(p,ref||"demo");toast(ok?"Approved: "+note:"Proposal rejected. Nothing was sent.");poll()};
    if(!ok)return done("no action taken");
    if(liveCapable(p)){
      api("/api/paypal/refund",{usd:p.usd,note:p.title}).then(function(r){done("PayPal sandbox refund "+r.refundId+" ("+r.status+")",r.refundId)}).catch(function(e){toast(e.message);audit.unshift("Live refund not sent: "+esc(e.message));renderAudit()});
    }else done("simulated (no live PayPal connection for this action)");
  }
  document.addEventListener("click",function(e){
    var a=e.target.closest("[data-approve]"),r=e.target.closest("[data-reject]");
    if(a)decide(+a.dataset.approve,true);if(r)decide(+r.dataset.reject,false);
    var an=e.target.closest(".anomaly-card .btn");
    if(an){e.stopPropagation();var t=an.closest(".anomaly-card").querySelector("h3").textContent;addProposal({type:"hold-payout",txId:"ANOM-"+nextId,display:"—",usd:0,title:"Review: "+t,reason:"Raised from the Anomalies view for human decision.",source:"Anomaly detector"});location.hash="#approvals";toast("Added to the approval queue.")}
  },true);
  function addProposal(p){p.id=nextId++;p.usd=Number(p.usd)||0;p.display=p.display||(p.usd?"$"+p.usd.toFixed(2):"—");p.source=p.source||"NovaPay AI";if(!LABEL[p.type])p.type="hold-payout";queue.unshift(p);renderQueue()}
  function context(){
    var rows=[].slice.call(document.querySelectorAll("#transactions-table-body tr")).slice(0,12).map(function(tr){return tr.textContent.replace(/\s+/g," ").trim()});
    return {currency:"INR (illustrative) — refund proposals use USD sandbox amounts",ledger:"Revenue ₹8,45,000; PayPal fees ₹23,500; Refunds ₹12,000; Disputes ₹4,500; Payouts ₹7,70,000",transactions:rows,pendingProposals:queue.map(function(p){return p.title})};
  }
  function chat(q){return api("/api/ai/chat",{message:q,context:context()}).then(function(d){var extra="";if(d.proposal&&d.proposal.title){addProposal(d.proposal);extra="\n→ Added to the Approvals queue for your decision."}return (d.reply||"")+extra})}
  /* Sandbox page */
  function status(){return api("/api/status").then(function(s){live.paypal=!!s.paypal;live.ai=!!s.ai;
    var set=function(id,on,txt){var el=$(id);if(el){el.textContent=on?"Connected":"Demo mode";el.className="status "+(on?"ok":"warn")}};
    set("st-paypal",live.paypal);set("st-ai",live.ai);var m=$("st-ai-model");if(m&&s.model)m.textContent="Model: "+s.model+" — proposes actions, never executes them";renderQueue()}).catch(function(){live.paypal=live.ai=false;["st-paypal","st-ai"].forEach(function(id){var el=$(id);if(el){el.textContent="Demo mode (backend not running)";el.className="status warn"}})})}
  function poll(){if(!live.paypal&&!live.ai)return;api("/api/events").then(function(d){
    var w=$("webhook-log"),c=$("api-log");
    if(w)w.innerHTML=d.events.length?d.events.map(function(e){return "<li><b>"+esc(e.type)+"</b> · "+esc(e.v)+"<small>"+new Date(e.t).toLocaleTimeString()+"</small></li>"}).join(""):'<li class="np-empty">No events yet. Add a webhook pointing at /api/webhook.</li>';
    if(c)c.innerHTML=d.calls.length?d.calls.map(function(e){return "<li class='"+(e.ok?"":"bad")+"'>"+esc(e.m)+"<small>"+new Date(e.t).toLocaleTimeString()+"</small></li>"}).join(""):'<li class="np-empty">No calls yet.</li>'}).catch(function(){})}
  var cr=$("sb-create"),res=$("sb-result");
  if(cr)cr.addEventListener("click",function(){
    if(!live.paypal){toast("Start the backend with PayPal sandbox keys to use this.");return}
    cr.disabled=true;api("/api/paypal/create-order",{amount:$("sb-amount").value}).then(function(d){
      res.hidden=false;res.innerHTML="Order <b>"+esc(d.id)+"</b> ("+esc(d.status)+") for $"+esc(d.amount)+'. <a href="'+esc(d.approveUrl)+'" target="_blank" rel="noopener">Approve as sandbox buyer ↗</a> then <button class="btn btn--ghost" id="sb-capture" type="button">Capture payment</button>';
      $("sb-capture").onclick=function(){api("/api/paypal/capture",{orderId:d.id}).then(function(c){res.innerHTML="Captured <b>"+esc(c.captureId)+"</b> · $"+esc(c.amount)+(c.fee?" · PayPal fee $"+esc(c.fee):"")+". Approved refunds will now hit this capture.";poll()}).catch(function(e){toast(e.message)})};poll();
    }).catch(function(e){toast(e.message)}).then(function(){cr.disabled=false});
  });
  window.NovaLive={live:live,chat:chat,addProposal:addProposal};
  renderQueue();renderAudit();status().then(poll);setInterval(poll,8000);
})();
