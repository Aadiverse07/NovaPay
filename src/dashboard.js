(function(){
  "use strict";
  var $=function(id){return document.getElementById(id);};
  var auth=window.NovaPayAuth;
  if(!auth){location.replace("preview.html#login");return;}
  auth.ready.then(function(){return initialize(auth);}).catch(function(){location.replace("preview.html#login");});

  async function initialize(auth){
  var toast=$("dashboard-toast"), toastTimer;
  function showToast(msg){toast.textContent=msg;toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(function(){toast.classList.remove("show");},3000);}
  document.addEventListener("novapay:api-error",function(event){var detail=event.detail||{};if(detail.status===403)showToast(detail.message||"You do not have permission to do that.");else if(detail.status===401)showToast(detail.message||"Your session expired. Please sign in again.");});
  var user;
  if(auth.mode==="supabase"){
    var session=await auth.currentSession();
    if(!session){location.replace("preview.html#login");return;}
    var metadata=session.user.user_metadata||{};
    user={name:metadata.full_name||metadata.name||(session.user.email||"").split("@")[0]||"NovaPay User",email:session.user.email||""};
    if(!auth.currentOrgId(session.user.id)){
      try{await auth.ensureWorkspace(session,user.name);}catch(error){showToast(error.message||"Workspace setup needs attention.");}
    }
  }else if(auth.mode==="demo"&&auth.isAuthenticated()){
    try{user=JSON.parse(localStorage.getItem("novapay-demo-user")||"{}");}catch(e){user={};}
    user.name=user.name||"NovaPay Demo User";user.email=user.email||"";
  }else{location.replace("preview.html#login");return;}
  $("user-name").textContent=user.name||"NovaPay User";
  $("user-email").textContent=user.email||"Demo account";
  $("user-avatar").textContent=(user.name||"F").trim().charAt(0).toUpperCase();

  var THEME_KEY="novapay-theme", root=document.documentElement;
  function savedTheme(){try{var t=localStorage.getItem(THEME_KEY);return t==="light"||t==="dark"?t:null}catch(e){return null}}
  function currentTheme(){return savedTheme()||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}
  function applyTheme(t){root.setAttribute("data-theme",t);var dark=t==="dark";$("dashboard-theme").textContent=dark?"☾":"☼";$("dashboard-theme").setAttribute("aria-pressed",String(dark));$("dashboard-theme").setAttribute("aria-label",dark?"Switch to light theme":"Switch to dark theme")}
  $("dashboard-theme").addEventListener("click",function(){var t=currentTheme()==="dark"?"light":"dark";try{localStorage.setItem(THEME_KEY,t)}catch(e){}applyTheme(t)});
  applyTheme(currentTheme());

  var panels=document.querySelectorAll("[data-view-panel]"), nav=document.querySelectorAll("#dashboard-nav a[data-view]"), title=$("page-title");
  var titles={dashboard:"Dashboard",transactions:"Transactions","ai-assistant":"AI Assistant",approvals:"Approvals",sandbox:"PayPal Sandbox",ledger:"Ledger",invoices:"Invoices",reports:"Reports",documents:"Documents",fundraising:"Fundraising",maintenance:"Maintenance",transparency:"Transparency"};
  function activate(view,writeHash,preserveScroll){
    if(!titles[view])view="dashboard";
    panels.forEach(function(p){p.hidden=p.id!=="view-"+view});
    nav.forEach(function(a){a.setAttribute("aria-current",a.dataset.view===view?"page":"false")});
    title.textContent=titles[view];
    if(writeHash&&location.hash!=="#"+view)history.pushState(null,"","#"+view);
    if(!preserveScroll)window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  }
  window.NovaPayActivateView=activate;
  function route(){activate(location.hash.slice(1)||"dashboard",false)}
  nav.forEach(function(a){a.addEventListener("click",function(){activate(a.dataset.view,true)})});
  window.addEventListener("hashchange",route); window.addEventListener("popstate",route); route();

  $("logout").addEventListener("click",function(){
    $("logout").disabled=true;
    auth.signOut().then(function(){window.location.href="preview.html#home";},function(error){$("logout").disabled=false;showToast(error.message||"Sign-out failed. Please try again.");});
  });

  document.querySelectorAll(".table-action,.report-card .table-action").forEach(function(b){
    b.addEventListener("click",function(){if(b.dataset.uiAction)return;showToast("Sample action selected — no live transaction is changed.");});
  });

  function moneyApi(value,currency){var n=Number(value);return Number.isFinite(n)?(currency||"")+" "+n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):"Unavailable"}
  function invoiceDate(value){return value?new Date(value).toLocaleDateString():"Unavailable"}
  async function loadInvoices(){if(auth.mode!=="supabase")return;var body=document.querySelector("#invoice-table tbody"),note=$("invoice-source-note");if(!body)return;body.textContent="";try{var data=await window.NovaPayApi.request("/api/invoices?limit=100"),rows=Array.isArray(data.invoices)?data.invoices:[];rows.forEach(function(inv){var tr=document.createElement("tr"),state=String(inv.state||"unknown"),status=document.createElement("span"),action=document.createElement("button");[inv.invoiceNumber||"Unavailable",inv.customerName||"Unavailable",invoiceDate(inv.createdAt),"Unavailable",moneyApi(inv.total,inv.currency),state].forEach(function(v,i){var td=document.createElement("td");if(i===5){status.className="status "+(state==="paid"?"ok":state==="void"?"danger":"warn");status.textContent=state.charAt(0).toUpperCase()+state.slice(1);td.appendChild(status)}else td.textContent=v;tr.appendChild(td)});var td=document.createElement("td");action.type="button";action.className="table-action";action.textContent="View";action.addEventListener("click",function(){showToast("Invoice "+(inv.invoiceNumber||"record")+" · "+state+" · sending is SIMULATED.")});td.appendChild(action);tr.appendChild(td);body.appendChild(tr)});if(!rows.length){var tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=7;td.textContent="No invoices are recorded for this organization.";tr.appendChild(td);body.appendChild(tr)}if(note)note.textContent="Organization invoices · sending is SIMULATED; no PayPal invoice or recipient notification is sent."}catch(error){body.textContent="";if(note)note.textContent="Invoice data unavailable: "+error.message}}
  function reportDates(){var select=$("report-period"),end=new Date(),start=new Date(end);if(select&&select.selectedIndex===1)start=new Date(end.getFullYear(),Math.floor(end.getMonth()/3)*3,1);else if(select&&select.selectedIndex===2)start=new Date(end.getFullYear(),0,1);else start=new Date(end.getFullYear(),end.getMonth(),1);return{from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10)}}
  async function loadReport(){if(auth.mode!=="supabase")return;var d=reportDates(),q="?from="+d.from+"&to="+d.to+"&currency=USD";try{var r=await window.NovaPayApi.request("/api/reports/profit-and-loss"+q),f=await window.NovaPayApi.request("/api/reports/fees"+q),feeRows=Array.isArray(f.rows)?f.rows:[],fee=feeRows.reduce(function(a,x){return a+Number(x.fee_minor||0)},0)/100,t=r.totals||{};$("report-gross").textContent=moneyApi(Number(t.revenueMinor||0)/100,"USD");$("report-fees").textContent="− "+moneyApi(fee,"USD");$("report-refunds").textContent="− "+moneyApi(Number(t.refundsMinor||0)/100,"USD");$("report-net").textContent=moneyApi(Number(t.netIncomeMinor||0)/100,"USD");$("report-period-label").textContent="Period "+r.from+" to "+r.to+" · USD";var bars=$("report-bars"),rows=Array.isArray(r.rows)?r.rows:[],periods={};rows.filter(function(x){return x.account_type==="revenue"}).forEach(function(x){periods[x.period]=(periods[x.period]||0)+Number(x.amount_minor||0)/100});var entries=Object.keys(periods).sort().slice(-4),max=Math.max.apply(null,entries.map(function(k){return periods[k]}).concat([1]));bars.textContent="";entries.forEach(function(k){var item=document.createElement("div"),label=document.createElement("span"),bar=document.createElement("i"),amount=document.createElement("b");label.textContent=new Date(k+"T00:00:00").toLocaleDateString(undefined,{month:"short"});bar.style.setProperty("--bar",Math.max(12,periods[k]/max*100)+"%");amount.textContent=moneyApi(periods[k],"USD");item.appendChild(label);item.appendChild(bar);item.appendChild(amount);bars.appendChild(item)});if(!entries.length){bars.textContent="No revenue rows were returned for this period."}}catch(error){["report-gross","report-fees","report-refunds","report-net"].forEach(function(id){$(id).textContent="Unavailable"});$("report-period-label").textContent="Organization report unavailable: "+error.message}}
  var reportPeriod=$("report-period");if(reportPeriod)reportPeriod.addEventListener("change",loadReport);loadInvoices();loadReport();
  document.querySelectorAll('[data-ui-action="reports-export"]').forEach(function(button){button.addEventListener("click",async function(){if(auth.mode!=="supabase"){showToast("Demo mode: report export unavailable.");return}button.disabled=true;try{var d=reportDates(),csv=await window.NovaPayApi.request("/api/reports/profit-and-loss?from="+d.from+"&to="+d.to+"&currency=USD&format=csv",{responseType:"text"}),url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="profit-and-loss.csv";a.click();URL.revokeObjectURL(url);showToast("Organization report CSV downloaded.")}catch(error){showToast("Report export failed: "+error.message)}finally{button.disabled=false}})});
  document.querySelectorAll('[data-ui-action="invoice-create"]').forEach(function(button){button.addEventListener("click",function(){showToast("Invoice creation is not enabled in this view. Any invoice send remains SIMULATED.")})});

  function assistantRecords(){if(auth.mode!=="demo")return [];return [].slice.call(document.querySelectorAll("#transactions-table-body tr")).map(function(r){return{id:r.dataset.txId||"Unavailable",type:r.dataset.type||"Unavailable",status:r.dataset.status||"Unavailable",gross:r.cells[3]?r.cells[3].textContent:"Unavailable"}})}
  function updateAiDataStatus(){var el=$("ai-data-status");if(el)el.textContent=auth.mode==="demo"?"DEMO MODE · local illustrative examples only; no organization data is sent with your question.":"Organization-scoped answers use verified backend evidence. No browser transaction data is sent."}
  window.NovaPayAssistant={refreshStatus:updateAiDataStatus};
  function appendAiMessage(q,response){var box=$("ai-conversation");if(!box)return;var user=document.createElement("div"),ud=document.createElement("div"),up=document.createElement("p");user.className="ai-bubble ai-bubble--user";ud.appendChild(up);up.textContent=q;user.appendChild(ud);var bot=document.createElement("div"),bd=document.createElement("div"),name=document.createElement("b"),p=document.createElement("p");bot.className="ai-bubble ai-bubble--assistant";name.textContent="NovaPay";p.textContent=response.reply;bd.appendChild(name);bd.appendChild(p);bot.appendChild(bd);if(response.limited){var limit=document.createElement("p");limit.className="ai-evidence";limit.textContent="Usage limit reached · "+response.reply;bd.appendChild(limit)}if(response.insufficientEvidence){var insuff=document.createElement("p");insuff.className="ai-evidence";insuff.textContent="Insufficient evidence to answer from available organization records.";bd.appendChild(insuff)}if(response.citations&&response.citations.length){var ev=document.createElement("div");ev.className="ai-evidence";ev.setAttribute("aria-label","Citations");response.citations.forEach(function(c){var chip=document.createElement("span");chip.className="status info";chip.textContent=String(c);ev.appendChild(chip)});bd.appendChild(ev)}var route=String(response.route||"llm").toLowerCase(),badge=document.createElement("small");badge.className="ai-answer-mode";badge.textContent="Route · "+(["code","sql","llm"].indexOf(route)>=0?route:"llm");bd.appendChild(badge);if(response.mode){var mode=document.createElement("small");mode.className="ai-answer-mode";mode.textContent=response.mode;bd.appendChild(mode)}if(response.usage){var usage=document.createElement("small");usage.className="ai-answer-mode";usage.textContent="Usage · "+Number(response.usage.inputTokens||0)+" input / "+Number(response.usage.outputTokens||0)+" output tokens";bd.appendChild(usage)}box.appendChild(user);box.appendChild(bot);box.scrollTop=box.scrollHeight;if(response.proposal)renderAssistantProposal(response.proposal,assistantRecords())}
  function localAnswer(q,records){var usable=records.filter(function(r){return r.id!=="Unavailable"});if(!usable.length)return{reply:"No illustrative records are available in this demo workspace.",route:"llm",citations:[],mode:"DEMO MODE · no organization data sent"};return{reply:"DEMO MODE · Local illustrative values only. Review the sample records in Transactions; this is not an organization-backed analysis.",route:"llm",citations:[],mode:"DEMO MODE · local illustrative fallback"}}
  function renderAssistantProposal(proposal,records){var slot=$("ai-proposal-slot");slot.textContent="";var ref=String(proposal.txId||""),row=records.find(function(r){return r.id===ref}),knownType=["refund","dispute-evidence","hold-payout"].indexOf(proposal.type)>-1,sourceRow=row&&document.querySelector('#transactions-table-body tr[data-tx-id="'+CSS.escape(row.id)+'"]'),sandboxRefund=!!(row&&row.source==="PayPal Sandbox"&&proposal.type==="refund"&&row.currency==="USD"&&Number(sourceRow&&sourceRow.dataset.amount)>0),card=document.createElement("article"),title=document.createElement("h4"),copy=document.createElement("p"),dl=document.createElement("dl"),button=document.createElement("button"),reason=String(proposal.reason||"No reason supplied."),canSend=!!row&&knownType&&(proposal.type!=="refund"||row.source!=="PayPal Sandbox"||sandboxRefund);card.className="ai-proposal-card";card.tabIndex=-1;title.textContent=knownType?({refund:"Refund suggestion","dispute-evidence":"Dispute evidence suggestion","hold-payout":"Payout review suggestion"}[proposal.type]):"Informational finding · simulated only";copy.textContent=reason;card.appendChild(document.createTextNode("AI suggestion for review"));var mode=document.createElement("span");mode.className="status info";mode.textContent=sandboxRefund?"PayPal Sandbox · approval required":"Simulated only";card.appendChild(mode);card.appendChild(title);card.appendChild(copy);[["Reference",ref||"Unavailable"],["Amount",row?row.gross:"Unavailable"],["Currency",row?row.currency:"Unavailable"],["Source",row?row.source:"NovaPay AI"]].forEach(function(pair){var wrap=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=pair[0];dd.textContent=pair[1];wrap.appendChild(dt);wrap.appendChild(dd);dl.appendChild(wrap)});card.appendChild(dl);button.type="button";button.className="btn btn--primary";button.textContent="Send to Approvals";button.disabled=!canSend;button.addEventListener("click",function(){if(!canSend)return;var item={type:proposal.type,txId:row.id,title:String(proposal.title||title.textContent),reason:reason,display:row.gross,source:"NovaPay AI",simulatedOnly:true,requiresSandbox:sandboxRefund,evidence:row.id+" · "+row.type+" · "+row.gross+" · "+row.status};if(sandboxRefund){item.captureId=row.id;item.currency="USD";item.usd=Number(sourceRow.dataset.amount);item.simulatedOnly=false}NovaLive.addProposal(item);button.disabled=true;button.textContent="Sent to Approvals";$("ai-live-status").textContent="Proposal sent to Approvals. Review it there before any action."});card.appendChild(button);if(!row){var note=document.createElement("p");note.className="ai-proposal-warning";note.textContent="This proposal has no matching transaction reference in the available data, so it cannot be sent as an actionable item.";card.appendChild(note)}else if(!knownType){var note2=document.createElement("p");note2.className="ai-proposal-warning";note2.textContent="This action type is not supported and will remain informational; no action can be attempted.";card.appendChild(note2)}else if(proposal.type==="refund"&&row.source==="PayPal Sandbox"&&!sandboxRefund){var note3=document.createElement("p");note3.className="ai-proposal-warning";note3.textContent="This capture is missing a supported USD amount, so the refund suggestion cannot be sent as an actionable item.";card.appendChild(note3)}slot.appendChild(card);card.focus()}
  var aiBusy=false;
  function ask(q){q=(q||"").trim();if(!q||aiBusy)return;aiBusy=true;var box=$("ai-conversation"),status=$("ai-live-status"),send=$("ai-send");$("ai-proposal-slot").textContent="";status.textContent="Preparing an answer…";send.disabled=true;var pending=document.createElement("p");pending.className="ai-loading";pending.setAttribute("role","status");pending.textContent="NovaPay is checking organization records…";box.appendChild(pending);box.scrollTop=box.scrollHeight;var finish=function(response){pending.remove();appendAiMessage(q,response);status.textContent=response&&response.error?response.error:"Answer ready.";send.disabled=false;aiBusy=false};if(auth.mode==="supabase"&&window.NovaLive){NovaLive.assistantChat(q).then(finish,function(error){var msg=String(error.message||"Assistant request failed.");if(error.code==="AI_DAILY_BUDGET_EXCEEDED"||error.code==="AI_BUDGET_EXCEEDED")msg="AI usage limit reached: "+msg;finish({reply:msg,route:"llm",citations:[],error:msg})})}else if(auth.mode==="demo"){finish(localAnswer(q,assistantRecords()))}else{finish({reply:"Sign in to use the assistant.",route:"llm",citations:[]})}}
  $("ai-send").addEventListener("click",function(){var input=$("ai-input"),q=input.value;ask(q);if(q.trim())input.value=""});
  $("ai-input").addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.isComposing){e.preventDefault();var q=e.target.value;ask(q);if(q.trim())e.target.value=""}});
  document.querySelectorAll("[data-ai-query]").forEach(function(b){b.addEventListener("click",function(){ask(b.dataset.aiQuery)})});
  updateAiDataStatus();

  /* Phase 7 — agentic action with explicit human approval and demo-only execution. */
  var actionModal=$("action-modal"), agentStatus=$("agent-status"), approve=$("agent-approve"), cancel=$("agent-cancel"), confirm=$("confirm-refund"), processing=false, lastFocus=null;
  if(approve&&cancel&&confirm&&actionModal){
  function setStatus(cls,html){agentStatus.hidden=false;agentStatus.className="agent-status "+cls;agentStatus.innerHTML=html;}
  function openAction(){lastFocus=document.activeElement;actionModal.hidden=false;actionModal.setAttribute("aria-hidden","false");confirm.focus();}
  function closeAction(){
    if(processing||!actionModal)return;
    actionModal.hidden=true;actionModal.setAttribute("aria-hidden","true");
    if(lastFocus&&lastFocus.focus)lastFocus.focus();
  }
  document.querySelectorAll("[data-close-action]").forEach(function(b){b.addEventListener("click",closeAction)});
  cancel.addEventListener("click",function(){
    setStatus("agent-status--cancelled","Action cancelled. No financial action was attempted.");
    showToast("Suggested action cancelled.");
  });
  approve.addEventListener("click",function(){agentStatus.hidden=true;openAction();});
  function addDemoRecords(){
    var tb=$("transactions-table-body");
    if(tb&&!tb.querySelector('[data-tx-id="REF-28491"]')){
      var r=document.createElement("tr");r.className="transaction-row";r.tabIndex=0;r.dataset.txId="REF-28491";r.dataset.type="Refund";r.dataset.status="Refunded (Simulated)";r.dataset.amount="2000";r.dataset.currency="INR";r.dataset.source="demo";r.dataset.buyer="Unavailable";
      ["Unavailable","↩ Refund","Unavailable","INR 2,000.00","Unavailable","-INR 2,000.00","Refunded (Simulated)","REF-28491"].forEach(function(v){var td=document.createElement("td");td.textContent=v;r.appendChild(td)});
      tb.insertBefore(r,tb.firstChild);
      if(typeof txRows!=="undefined")txRows=document.querySelectorAll("#view-transactions tbody tr");
    }
  }
  confirm.addEventListener("click",function(){
    if(processing)return;
    processing=true;
    var buttons=document.querySelectorAll("#action-modal .action-modal-buttons button");buttons.forEach(function(b){b.disabled=true});
    confirm.textContent="Processing…";
    setTimeout(function(){
      processing=false;closeAction();buttons.forEach(function(b){b.disabled=false});confirm.textContent="Confirm Refund";
      addDemoRecords();
      setStatus("agent-status--success","<b>Simulated refund completed.</b><span>Transaction record updated in the sample workspace. No PayPal request was sent.</span>");
      approve.disabled=true;cancel.disabled=true;
      showToast("Simulated refund completed. Transaction record updated.");
    },1200);
  });
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape")closeAction();
    if(e.key==="Tab"&&!actionModal.hidden){
      var f=actionModal.querySelectorAll("button:not([disabled])");if(!f.length)return;
      var first=f[0],last=f[f.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  }

  var txSearch=$("tx-search"), txType=$("tx-type"), txRows=document.querySelectorAll("#transactions-table-body tr");
  function filterTx(){
    txRows=document.querySelectorAll("#transactions-table-body tr");
    var q=txSearch.value.trim().toLowerCase(), t=txType.value, st=$("tx-status").value, from=$("tx-from").value, to=$("tx-to").value, min=$("tx-min").value, max=$("tx-max").value, shown=0;
    txRows.forEach(function(r){var day=(r.dataset.date||"").slice(0,10),n=Number(r.dataset.amount),ok=(!t||r.dataset.type===t)&&(!st||r.dataset.status===st)&&(!q||r.textContent.toLowerCase().indexOf(q)>-1||r.dataset.txId.toLowerCase().indexOf(q)>-1)&&(!from||!!day&&day>=from)&&(!to||!!day&&day<=to)&&(!min||n>=Number(min))&&(!max||n<=Number(max));r.hidden=!ok;if(ok)shown++;});
    $("tx-empty").hidden=shown>0;$("tx-result-count").textContent=shown+" transaction"+(shown===1?"":"s")+" shown";
  }
  [txSearch,txType,$("tx-status"),$("tx-from"),$("tx-to"),$("tx-min"),$("tx-max")].forEach(function(c){c.addEventListener(c.tagName==="INPUT"&&c.type==="search"?"input":"change",filterTx)});

  var sugToggle=document.querySelectorAll("#view-sandbox .settings-card input[type=checkbox]")[1], qa=document.querySelector(".ai-quick-actions");
  if(sugToggle&&qa)sugToggle.addEventListener("change",function(){qa.hidden=!sugToggle.checked;});
  var reduce=$("reduce-motion-toggle");
  if(reduce){
    reduce.checked=matchMedia("(prefers-reduced-motion: reduce)").matches;
    reduce.addEventListener("change",function(){showToast(reduce.checked?"Preference saved visually.":"Browser motion preference remains respected.")});
  }

  // Phase 5 — dashboard controls and dynamic illustrative cash-flow data.
  var displayName=(user.name||"").trim();if(!displayName||/^novapay (demo )?user$/i.test(displayName))displayName="there";if(auth.mode==="demo")displayName=displayName.replace(/\s*\bdemo\b\s*/i," ").trim()||"there";
  $("greeting-name").textContent=displayName.split(/\s+/)[0];
  var greetingHour=new Date().getHours(),greetingPrefix=greetingHour<12?"Good morning":greetingHour<18?"Good afternoon":"Good evening";
  var greeting=$("dashboard-subtitle");if(greeting&&greeting.firstChild)greeting.firstChild.textContent=greetingPrefix+", ";
  $("user-name").textContent=displayName;
  $("user-email").textContent=user.email||"Demo account";
  $("profile-name").textContent=displayName;
  var profileEmail=$("profile-popover").querySelector(".profile-popover-head small");if(profileEmail)profileEmail.textContent=user.email||"Demo account";
  $("user-avatar").textContent=displayName.charAt(0).toUpperCase();

  var notifications=$("notifications"), notificationPopover=$("notification-popover"), profileButton=$("profile-button"), profilePopover=$("profile-popover");
  function closePopovers(){
    if(notificationPopover){notificationPopover.hidden=true;notifications.setAttribute("aria-expanded","false");}
    if(profilePopover){profilePopover.hidden=true;profileButton.setAttribute("aria-expanded","false");}
  }
  async function loadNotifications(){if(auth.mode!=="supabase"){var list=$("notification-list");if(list)list.textContent="DEMO MODE · organization notifications are unavailable.";return}var list=$("notification-list"),count=$("notification-count"),dot=document.querySelector(".notification-dot");try{var data=await window.NovaPayApi.request("/api/notifications?limit=50"),items=Array.isArray(data.notifications)?data.notifications:[],unread=items.filter(function(x){return x.status==="unread"}).length;if(count)count.textContent=unread+" unread";if(dot)dot.hidden=!unread;list.textContent="";if(!items.length){var empty=document.createElement("p");empty.className="notification-item";empty.textContent="No organization notifications.";list.appendChild(empty)}items.forEach(function(item){var button=document.createElement("button"),wrap=document.createElement("span"),title=document.createElement("b"),meta=document.createElement("small"),action=document.createElement("span");button.type="button";button.className="notification-item";button.setAttribute("role","listitem");title.textContent=String(item.rule||item.title||"Organization notification").replaceAll("_"," ");meta.textContent=String(item.severity||"info").toUpperCase()+" · "+(item.createdAt?new Date(item.createdAt).toLocaleString():"Date unavailable")+" · "+String(item.status||"unread");action.textContent=item.status==="unread"?"Mark read":"Dismiss";wrap.appendChild(title);wrap.appendChild(meta);button.appendChild(wrap);button.appendChild(action);button.addEventListener("click",async function(){var operation=item.status==="unread"?"read":"dismiss";try{await window.NovaPayApi.request("/api/notifications/"+encodeURIComponent(item.id)+"/"+operation,{method:"POST"});await loadNotifications()}catch(error){showToast("Notification update failed: "+error.message)}});list.appendChild(button)})}catch(error){if(count)count.textContent="Unavailable";if(list)list.textContent="Notifications unavailable: "+error.message}}
  if(notifications){notifications.addEventListener("click",function(e){e.stopPropagation();var open=notificationPopover.hidden;closePopovers();notificationPopover.hidden=!open;notifications.setAttribute("aria-expanded",String(open));if(open)loadNotifications();});}
  if(profileButton){profileButton.addEventListener("click",function(e){e.stopPropagation();var open=profilePopover.hidden;closePopovers();profilePopover.hidden=!open;profileButton.setAttribute("aria-expanded",String(open));});}
  document.addEventListener("click",function(e){if(!e.target.closest(".popover")&&!e.target.closest("#notifications")&&!e.target.closest("#profile-button"))closePopovers();});
  document.querySelectorAll("[data-profile-action]").forEach(function(b){b.addEventListener("click",function(){var action=b.dataset.profileAction;if(action==="settings"){closePopovers();activate("settings",true);}else if(action==="logout")$("logout").click();});});
  document.querySelectorAll(".notification-item").forEach(function(b){b.addEventListener("click",function(){closePopovers();activate(b.dataset.notificationView||"dashboard",true);});});

  var inr=function(n){return "₹"+Number(n).toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:2});};
  var axisInr=function(n){return n>=1e7?"₹"+(n/1e7).toFixed(1).replace(/\.0$/,"")+"Cr":n>=1e5?"₹"+(n/1e5).toFixed(1).replace(/\.0$/,"")+"L":n>=1e3?"₹"+Math.round(n/1e3)+"K":"₹"+Math.round(n);};
  var svgNS="http://www.w3.org/2000/svg";
  var chartTheme=function(){return window.NovaPayChartTheme?window.NovaPayChartTheme.get():null;};
  function applyChartTheme(){
    var t=chartTheme();if(!t)return;
    document.documentElement.style.setProperty("--chart-background",t.background);
    document.documentElement.style.setProperty("--chart-axis",t.axisText);
    document.documentElement.style.setProperty("--chart-grid",t.grid);
    document.documentElement.style.setProperty("--chart-series-in",t.series.in);
    document.documentElement.style.setProperty("--chart-series-out",t.series.out);
    document.documentElement.style.setProperty("--chart-series-net",t.series.net);
    var defs=document.querySelectorAll("#inFill stop,#netFill stop");
    if(defs.length>=4){defs[0].setAttribute("stop-color",t.area.in);defs[1].setAttribute("stop-color",t.area.in);defs[2].setAttribute("stop-color",t.area.net);defs[3].setAttribute("stop-color",t.area.net);}
    var tip=$("cf-tip");if(tip){tip.style.setProperty("--chart-tip-bg",t.tooltip.background);tip.style.setProperty("--chart-tip-text",t.tooltip.text);tip.style.setProperty("--chart-tip-border",t.tooltip.border);tip.style.setProperty("--chart-tip-shadow",t.tooltip.shadow);}
  }

  /* KPI cards: values, trends and sparklines change with the date selector */
  var kpiSets={
    today:{revenue:[845000,12,1],fees:[23500,8,1],refunds:[12000,6,1],disputes:[4500,-18,1],net:[805000,11,1],label:"last month"},
    yesterday:{revenue:[792000,9,1],fees:[21900,5,1],refunds:[9800,-4,1],disputes:[5200,7,1],net:[755100,10,1],label:"prior day"},
    week:{revenue:[3910000,14,1],fees:[108400,10,1],refunds:[61500,3,1],disputes:[22800,-9,1],net:[3717300,13,1],label:"last week"}
  };
  var sparkSeed={revenue:[40,52,46,62,58,74,80],fees:[30,36,34,44,40,52,55],refunds:[50,42,48,40,46,38,44],disputes:[60,54,58,46,50,40,36],net:[38,50,45,60,57,72,78]};
  var lowerIsBetter={fees:true,refunds:true,disputes:true};
  function sparkPath(v){var w=120,h=32,p=3,s=(w-p*2)/(v.length-1),mx=Math.max.apply(null,v),mn=Math.min.apply(null,v),r=(mx-mn)||1;
    return v.map(function(n,i){return (i?"L":"M")+(p+i*s).toFixed(1)+" "+(h-p-(n-mn)/r*(h-p*2)).toFixed(1);}).join(" ");}
  var motion=window.NovaPayMotion||{duration:900,easing:"cubic-bezier(0.22,1,0.36,1)",reduced:function(){return false;},useInView:function(el,cb){cb();},useCountUp:function(el,v,fmt){el.textContent=fmt(v);}};
  function animatePath(path, delay){
    if(!path)return;
    path.style.transition="none";
    if(motion.reduced()){path.style.strokeDasharray="none";path.style.strokeDashoffset="0";return;}
    var len=path.getTotalLength?path.getTotalLength():420;
    path.style.strokeDasharray=len;path.style.strokeDashoffset=len;
    requestAnimationFrame(function(){path.style.transition="stroke-dashoffset "+motion.chart.duration+"ms "+motion.easing+" "+(delay||0)+"ms";path.style.strokeDashoffset="0";});
  }
  function animateSpark(svg){
    if(!svg)return;
    var line=svg.querySelector(".spark-line"),area=svg.querySelector(".spark-area");
    if(area){area.style.transformOrigin="left center";area.style.transform="scaleX(0)";area.style.transition="none";}
    animatePath(line);
    if(area){if(motion.reduced()){area.style.transform="scaleX(1)";}else requestAnimationFrame(function(){area.style.transition="transform "+motion.chart.duration+"ms "+motion.easing;area.style.transform="scaleX(1)";});}
  }
  function renderKpis(key, animate){
    var set=kpiSets[key]||kpiSets.today;
    ["revenue","fees","refunds","disputes","net"].forEach(function(k,idx){
      var d=set[k],val=d[0],pct=d[1],up=pct>=0,good=lowerIsBetter[k]?!up:up;
      var valueEl=$("kpi-"+k);
      if(animate) motion.useCountUp(valueEl,val,inr,motion.duration); else valueEl.textContent=inr(val);
      var t=$("kpi-"+k+"-trend");t.className=good?"":"negative";
      t.innerHTML="<b>"+(up?"↑ ":"↓ ")+Math.abs(pct)+"%</b> vs "+set.label;
      var shift=(key==="yesterday"?2:key==="week"?5:0),pts=sparkSeed[k].map(function(n,i){return n+((i+shift+idx)%3)*(key==="today"?0:4)*(i%2?1:-1);});
      var pathD=sparkPath(pts),svg=$("spark-"+k),ct=chartTheme();
      svg.innerHTML='<path class="spark-area" d="'+pathD+' L117 32 L3 32 Z"/><path class="spark-line" d="'+pathD+'"/>';
      if(ct){var sparkColor=(k==="revenue"?ct.series.in:(k==="refunds"||k==="disputes"?ct.series.out:ct.series.net));svg.style.color=sparkColor;}
      if(animate) animateSpark(svg);
    });
  }
  var dateSelect=$("dashboard-date");
  if(dateSelect){var now=new Date(),yesterday=new Date(now);yesterday.setDate(now.getDate()-1);var week=new Date(now);week.setDate(now.getDate()-6);var dateFormat=new Intl.DateTimeFormat(undefined,{day:"2-digit",month:"short",year:"numeric"}),rangeFormat=new Intl.DateTimeFormat(undefined,{day:"2-digit",month:"short"});dateSelect.options[0].textContent=dateFormat.format(now);dateSelect.options[1].textContent=dateFormat.format(yesterday);dateSelect.options[2].textContent=rangeFormat.format(week)+" – "+dateFormat.format(now);}
  if(dateSelect){dateSelect.addEventListener("change",function(){loadDashboardReports(dateSelect.value,true);});}
  renderKpis("today", false);
  function isoDate(date){return date.toISOString().slice(0,10);}
  function reportRange(key){var end=new Date(),start=new Date(end);if(key==="yesterday"){start.setDate(end.getDate()-1);end.setDate(end.getDate()-1)}else if(key==="week")start.setDate(end.getDate()-6);return{from:isoDate(start),to:isoDate(end)}}
  function minorMoney(value){var n=Number(value);return Number.isFinite(n)?n/100:null}
  async function loadDashboardReports(key,animate){
    if(auth.mode!=="supabase"||!window.NovaPayApi)return;
    var dates=reportRange(key),query="?from="+dates.from+"&to="+dates.to+"&currency=INR";
    try{
      var result=await window.NovaPayApi.request("/api/reports/profit-and-loss"+query);
      var fees=await window.NovaPayApi.request("/api/reports/fees"+query);
      var totals=result.totals||{},feeRows=Array.isArray(fees.rows)?fees.rows:[],feeMinor=feeRows.reduce(function(sum,row){return sum+Number(row.fee_minor||0)},0);
      var values={revenue:minorMoney(totals.revenueMinor),fees:feeMinor/100,refunds:minorMoney(totals.refundsMinor),net:minorMoney(totals.netIncomeMinor)};
      Object.keys(values).forEach(function(name){var value=values[name],el=$("kpi-"+name),trend=$("kpi-"+name+"-trend");if(value!==null){el.textContent=inr(value);trend.textContent="Reported · "+dates.from+" to "+dates.to}else{el.textContent="Unavailable";trend.textContent="Not returned by report"}});
      $("kpi-disputes").textContent="Unavailable";$("kpi-disputes-trend").textContent="Not provided by reports API";
      var status=$("dashboard-report-source");if(status)status.textContent="Source: organization reports · "+result.from+" to "+result.to;
      if(animate)showToast("Dashboard updated from organization reports.");
    }catch(error){["revenue","fees","refunds","disputes","net"].forEach(function(k){$("kpi-"+k).textContent="Unavailable";$("kpi-"+k+"-trend").textContent="Report unavailable"});}
  }
  if(auth.mode==="supabase")loadDashboardReports("today",false);
  applyChartTheme();

  /* Cash flow: deterministic demo series per range; totals always equal the sum of the plotted points */
  var ranges={
    "7D":{n:7,in:68500,out:14200,seed:3,labels:function(i){return dayLabel(6-i);},ticks:[0,2,4,6],sub:"Last 7 days"},
    "30D":{n:30,in:145000,out:36000,seed:7,labels:function(i){return dayLabel(29-i);},ticks:[0,7,14,21,29],sub:"Last 30 days"},
    "3M":{n:13,in:412000,out:119000,seed:11,labels:function(i){return dayLabel((12-i)*7);},ticks:[0,3,6,9,12],sub:"Last 3 months · weekly"},
    "1Y":{n:12,in:1450000,out:385000,seed:19,labels:function(i){var d=new Date(2026,9-(11-i),1);return d.toLocaleString("en-GB",{month:"short"})+" "+String(d.getFullYear()).slice(2);},ticks:[0,3,6,9,11],sub:"Last 12 months · monthly"}
  };
  function dayLabel(back){var d=new Date(2026,9,7-back);return d.toLocaleString("en-GB",{day:"numeric",month:"short"});}
  function series(cfg,total,salt){
    var raw=[],i,sum=0;
    for(i=0;i<cfg.n;i++){var x=Math.sin((i+1)*(cfg.seed+salt)*1.7)*.5+Math.sin(i*.9+salt)*.3;var v=1+x*.55+i/cfg.n*.35;raw.push(v);sum+=v;}
    var out=raw.map(function(v){return Math.round(v/sum*total);});
    out[cfg.n-1]+=total-out.reduce(function(a,b){return a+b;},0);
    return out;
  }
  var cf=null,cfRange="30D",W=900,H=260,PAD=14;
  function xAt(i,n){return PAD+i*(W-PAD*2)/(n-1);}
  function pathFor(vals,max){return vals.map(function(v,i){return (i?"L":"M")+xAt(i,vals.length).toFixed(1)+" "+(PAD+(1-v/max)*(H-PAD*2)).toFixed(1);}).join(" ");}
  function areaFor(vals,max){return pathFor(vals,max)+" L"+xAt(vals.length-1,vals.length).toFixed(1)+" "+(H-PAD)+" L"+PAD+" "+(H-PAD)+" Z";}
  function renderCashflow(range, animate, supplied){
    var cfg=ranges[range]||ranges["30D"];cfRange=range;
    var mi=supplied&&supplied.mi||series(cfg,cfg.in,0),mo=supplied&&supplied.mo||series(cfg,cfg.out,5),net=mi.map(function(v,i){return v-mo[i];});
    var totIn=mi.reduce(function(a,b){return a+b;},0),totOut=mo.reduce(function(a,b){return a+b;},0);
    var peak=Math.max.apply(null,mi),stepV=Math.pow(10,Math.floor(Math.log10(peak))),max=Math.ceil(peak/stepV*1.1/(stepV>=1?1:1))*stepV;
    max=Math.ceil(peak*1.08/(stepV/2))*(stepV/2);
    cf={cfg:cfg,mi:mi,mo:mo,net:net,max:max};
    $("cash-in").textContent=inr(totIn);$("cash-out").textContent=inr(totOut);$("cash-net").textContent=inr(totIn-totOut);
    var grid="",yl="";
    for(var g=0;g<=4;g++){var y=PAD+g*(H-PAD*2)/4;grid+='<line x1="0" y1="'+y+'" x2="'+W+'" y2="'+y+'"></line>';yl+="<span>"+axisInr(max*(1-g/4))+"</span>";}
    $("cf-grid").innerHTML=grid;$("cf-y").innerHTML=yl;
    $("cash-in-line").setAttribute("d",pathFor(mi,max));$("cash-out-line").setAttribute("d",pathFor(mo,max));$("cash-net-line").setAttribute("d",pathFor(net,max));
    $("cash-in-area").setAttribute("d",areaFor(mi,max));$("cash-net-area").setAttribute("d",areaFor(net,max));
    if(animate)[$("cash-in-line"),$("cash-out-line"),$("cash-net-line")].forEach(function(path){animatePath(path);});
    if(animate)[$("cash-in-area"),$("cash-net-area")].forEach(function(area){
      if(!area)return; area.style.transformOrigin="left center"; area.style.transform="scaleX(0)"; area.style.transition="none";
      if(motion.reduced()) area.style.transform="scaleX(1)"; else requestAnimationFrame(function(){area.style.transition="transform "+motion.chart.duration+"ms "+motion.easing;area.style.transform="scaleX(1)";});
    });
    $("cf-x").innerHTML=cfg.ticks.map(function(t){return "<span>"+cfg.labels(t)+"</span>";}).join("");
    $("cf-sub").textContent=cfg.sub+" · illustrative sample data · amounts in INR";
    $("cf-tip").hidden=true;$("cf-cursor").hidden=true;$("cf-crosshair-y").hidden=true;
    document.querySelectorAll("#cashflow-tabs button").forEach(function(b){var on=b.dataset.range===range;b.classList.toggle("active",on);b.setAttribute("aria-selected",String(on));b.setAttribute("role","tab");});
  }
  async function loadCashflow(range,animate){
    if(auth.mode!=="supabase"||!window.NovaPayApi){renderCashflow(range,animate);return}
    var end=new Date(),start=new Date(end),days=range==="7D"?7:range==="30D"?30:range==="3M"?90:365;start.setDate(start.getDate()-days+1);
    try{
      var data=await window.NovaPayApi.request("/api/reports/cash-movement?from="+isoDate(start)+"&to="+isoDate(end)+"&currency=INR");
      var rows=Array.isArray(data.rows)?data.rows:[],periods={},keys=[];
      rows.forEach(function(row){var key=String(row.period||"");if(!key)return;if(!periods[key]){periods[key]=0;keys.push(key)}periods[key]+=Number(row.cash_movement_minor||0)});
      keys.sort();var signed=keys.map(function(k){return periods[k]/100}),positive=signed.map(function(v){return Math.max(0,v)}),negative=signed.map(function(v){return Math.max(0,-v)});
      if(!keys.length){$("cash-in").textContent="₹0";$("cash-out").textContent="₹0";$("cash-net").textContent="₹0";$("cf-sub").textContent="No posted cash movement for this period · INR";return}
      var dynamic=Object.assign({},ranges[range]||ranges["30D"],{n:keys.length,labels:function(i){var d=new Date(keys[i]+"T00:00:00");return d.toLocaleDateString(undefined,{day:"numeric",month:"short"})},ticks:keys.length>5?[0,Math.floor((keys.length-1)/4),Math.floor((keys.length-1)/2),Math.floor(3*(keys.length-1)/4),keys.length-1]:keys.map(function(_,i){return i}),sub:(ranges[range]||ranges["30D"]).sub});
      ranges[range]=dynamic;renderCashflow(range,animate,{mi:positive,mo:negative});$("cf-sub").textContent=dynamic.sub+" · organization cash-movement report · INR";
    }catch(error){$("cf-sub").textContent="Cash movement report unavailable."}
  }
  document.querySelectorAll("#cashflow-tabs button").forEach(function(b){b.addEventListener("click",function(){loadCashflow(b.dataset.range,true);});});

  var plot=$("cf-plot"),tip=$("cf-tip"),cursor=$("cf-cursor"),crosshairY=$("cf-crosshair-y");
  function hover(e){
    if(!cf)return;var r=plot.getBoundingClientRect(),n=cf.cfg.n,fx=Math.min(Math.max((e.clientX-r.left)/r.width,0),1);
    var i=Math.round((fx*W-PAD)/((W-PAD*2)/(n-1)));i=Math.min(Math.max(i,0),n-1);
    var px=xAt(i,n)/W*r.width;
    cursor.style.left=px+"px";cursor.hidden=false;
    crosshairY.style.top=Math.min(Math.max(e.clientY-r.top,0),205)+"px";crosshairY.hidden=false;
    tip.innerHTML="<b>"+cf.cfg.labels(i)+"</b><span class='t-in'>Money In <em>"+inr(cf.mi[i])+"</em></span><span class='t-out'>Money Out <em>"+inr(cf.mo[i])+"</em></span><span class='t-net'>Net <em>"+inr(cf.net[i])+"</em></span>";
    tip.hidden=false;var tw=tip.offsetWidth;tip.style.left=Math.min(Math.max(px-tw/2,0),r.width-tw)+"px";
  }
  plot.addEventListener("mousemove",hover);plot.addEventListener("touchstart",function(e){hover(e.touches[0]);},{passive:true});plot.addEventListener("touchmove",function(e){hover(e.touches[0]);},{passive:true});
  plot.addEventListener("mouseleave",function(){tip.hidden=true;cursor.hidden=true;crosshairY.hidden=true;});
  renderCashflow("30D",false);
  if(auth.mode==="supabase")loadCashflow("30D",false);
  applyChartTheme();
  if(window.NovaPayChartTheme) window.NovaPayChartTheme.onChange(function(){ applyChartTheme(); renderKpis(dateSelect?dateSelect.value:"today",false); loadCashflow(cfRange,false); });

  function animateHealth(){
    var ring=document.querySelector(".health-ring"),seg=document.querySelector(".health-segment-main"),value=document.querySelector("[data-health-value]");
    if(!ring||!seg)return;
    var pct=82; seg.style.strokeDasharray=pct+" "+(100-pct); seg.style.strokeDashoffset="100";
    if(motion.reduced()){seg.style.strokeDashoffset="0";if(value)value.textContent="82%";return;}
    var start=performance.now();
    function frame(now){var p=Math.min((now-start)/motion.duration,1),e=1-Math.pow(1-p,3);seg.style.strokeDashoffset=String(100-pct*e);if(value)value.textContent=Math.round(pct*e)+"%";if(p<1)requestAnimationFrame(frame);else if(value)value.textContent="82%";}
    requestAnimationFrame(frame);
  }
  motion.useInView(document.querySelector(".financial-health-card"),animateHealth,{threshold:.2});
  motion.useInView(document.querySelector(".kpi-card"),function(){renderKpis(dateSelect?dateSelect.value:"today",true);},{threshold:.12});
  motion.useInView(document.querySelector(".cashflow-card"),function(){renderCashflow(cfRange,true);},{threshold:.12});

  /* Phase 6 — interactive transaction details + financial data polish */
  var txData={
    "PAY-1001":{type:"Payment",ref:"PAY-1001",amount:"₹10,000",fee:"₹300",net:"₹9,700",status:"Completed",time:"2 mins ago",note:"Illustrative payment record from the sample data."},
    "PAY-1002":{type:"Payment",ref:"PAY-1002",amount:"₹7,500",fee:"₹225",net:"₹7,275",status:"Completed",time:"12 mins ago",note:"Illustrative payment with a sample PayPal fee."},
    "REF-1003":{type:"Refund",ref:"REF-1003",amount:"₹2,000",fee:"—",net:"-₹2,000",status:"Refunded",time:"28 mins ago",note:"Illustrative refund event. Additional payment-provider details are unavailable."},
    "DSP-1004":{type:"Dispute",ref:"DSP-1004",amount:"₹5,000",fee:"—",net:"-₹5,000",status:"Under Review",time:"1 hr ago",note:"Illustrative dispute requiring merchant review."},
    "PAY-28491":{type:"Payment",ref:"PAY-28491",amount:"₹2,000",fee:"₹60",net:"₹1,940",status:"Possible duplicate",time:"45 mins ago",note:"Flagged by NovaPay AI as a possible duplicate payment."},
    "REF-28491":{type:"Refund",ref:"REF-28491",amount:"₹2,000",fee:"—",net:"-₹2,000",status:"Refunded (Simulated)",time:"Just now",note:"Simulated refund created through the simulated approval flow."},
    "PAY-1005":{type:"Payout",ref:"PAY-1005",amount:"₹50,000",fee:"—",net:"₹50,000",status:"Completed",time:"3 hrs ago",note:"Illustrative payout event."}
  };
  var txModal=$("transaction-modal"),lastFocus=null,selectedTransaction=null;
  function openTx(id){
    var row=document.querySelector('#transactions-table-body tr[data-tx-id="'+CSS.escape(id)+'"]'), d=row?{type:row.dataset.type,ref:row.dataset.txId,amount:row.cells[3].textContent,fee:row.cells[4].textContent,net:row.cells[5].textContent,status:row.dataset.status,time:row.cells[0].textContent,date:row.dataset.date,buyer:row.dataset.buyer,currency:row.dataset.currency,source:row.dataset.source,related:row.dataset.related,ledger:row.dataset.ledger,note:row.dataset.note}:txData[id]; if(!txModal)return;
    if(!d){showToast("Couldn't load that transaction. Please try again.");return;}
    selectedTransaction=d;
    lastFocus=document.activeElement;
    $("transaction-detail-title").textContent=d.type;
    $("transaction-detail-subtitle").textContent=(d.source==="paypal-sandbox"?"PayPal Sandbox":"Illustrative sample data");
    $("detail-type").textContent=d.type;$("detail-reference").textContent=d.ref;
    $("detail-amount").textContent=d.amount;$("detail-fee").textContent=d.fee;
    $("detail-net").textContent=d.net;$("detail-status").textContent=d.status;
    $("detail-date").textContent=d.time||"Unavailable";$("detail-buyer").textContent=d.buyer||"Unavailable";$("detail-currency").textContent=d.currency||"Unavailable";$("detail-source").textContent=d.source==="paypal-sandbox"?"PayPal Sandbox":"Illustrative sample data";$("detail-related").textContent=d.related||"Unavailable";$("detail-ledger").textContent=d.ledger||"Unavailable";
    $("detail-note").textContent=d.note||"Fields marked unavailable were not provided by the available data.";
    $("tx-ai-question").value="";$("tx-ai-answer").textContent="";$("tx-ai-answer").dataset.finding="";
    txModal.hidden=false;txModal.setAttribute("aria-hidden","false");
    document.body.classList.add("modal-open");
    var c=txModal.querySelector(".modal-close");if(c)c.focus();
  }
  function closeTx(){
    if(!txModal)return;txModal.hidden=true;txModal.setAttribute("aria-hidden","true");
    document.body.classList.remove("modal-open");
    if(lastFocus&&lastFocus.focus)lastFocus.focus();
  }
  document.addEventListener("click",function(e){var row=e.target.closest(".transaction-row");if(row&&!e.target.closest("button"))openTx(row.dataset.txId);});
  document.addEventListener("keydown",function(e){var row=e.target.closest&&e.target.closest(".transaction-row");if(row&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openTx(row.dataset.txId);}});
  document.querySelectorAll("[data-close-transaction]").forEach(function(b){b.addEventListener("click",closeTx);});
  $("tx-ai-ask").addEventListener("click",function(){var q=$("tx-ai-question").value.trim();if(!q||!selectedTransaction)return;var d=selectedTransaction,context=["ID: "+d.ref,"type: "+d.type,"status: "+d.status,"gross: "+d.amount,"fee: "+d.fee,"net: "+d.net,"currency: "+(d.currency||"Unavailable"),"buyer: "+(d.buyer||"Unavailable"),"source: "+(d.source==="paypal-sandbox"?"PayPal Sandbox":"Illustrative sample data")].join("; ");$("tx-ai-answer").textContent="Thinking…";$("tx-ai-answer").dataset.proposal="";if(window.NovaLive&&NovaLive.live.ai&&NovaLive.askTransaction)NovaLive.askTransaction(d,q).then(function(result){$("tx-ai-answer").textContent=result.reply;$("tx-ai-answer").dataset.proposal=result.proposal?JSON.stringify(result.proposal):""},function(){$("tx-ai-answer").textContent="AI backend unavailable. Available transaction data: "+context});else $("tx-ai-answer").textContent="AI backend unavailable. Available transaction data: "+context;});
  $("tx-send-approval").addEventListener("click",function(){if(!selectedTransaction)return;var answer=$("tx-ai-answer"),reason=answer.textContent.trim();if(!reason||reason.indexOf("Thinking")===0){showToast("Ask the AI and review its finding first.");return}if(window.NovaLive&&NovaLive.addTransactionFinding){var p=null;try{p=JSON.parse(answer.dataset.proposal||"null")}catch(e){}if(p&&["refund","dispute-evidence","hold-payout"].indexOf(p.type)>-1){p.reason=p.reason||reason;p.txId=selectedTransaction.ref;p.display=selectedTransaction.amount;p.source=p.source||"NovaPay AI";p.simulatedOnly=true;NovaLive.addProposal(p)}else NovaLive.addTransactionFinding(selectedTransaction,reason);closeTx();location.hash="#approvals";showToast("Finding sent to Approvals for human review.")}else showToast("Approvals service is unavailable.")});
  document.addEventListener("keydown",function(e){
    if(!txModal||txModal.hidden)return;
    if(e.key==="Escape")closeTx();
    if(e.key==="Tab"){var f=txModal.querySelectorAll("button"),a=f[0],z=f[f.length-1];
      if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus();}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}}
  });
  var txReset=$("tx-reset");if(txReset)txReset.addEventListener("click",function(){txSearch.value="";txType.value="";$("tx-status").value="";$("tx-from").value="";$("tx-to").value="";$("tx-min").value="";$("tx-max").value="";filterTx();txSearch.focus();});
  var sub=$("dashboard-subtitle");
  function syncSubtitle(){if(sub)sub.hidden=!($("view-dashboard")&&!$("view-dashboard").hidden);}
  window.addEventListener("hashchange",syncSubtitle);window.addEventListener("popstate",syncSubtitle);nav.forEach(function(a){a.addEventListener("click",syncSubtitle);});
  syncSubtitle();

  /* Keep transaction filtering usable after the richer row markup is rendered. */
  if(txSearch&&txType){filterTx();}

  /* Phase 5 — PayPal ↔ NovaPay integration motion: activate only while visible. */
  document.querySelectorAll("[data-integration-visual]").forEach(function(visual){
    var reduced=window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduced || !window.IntersectionObserver){ visual.classList.add("is-in-view"); return; }
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        visual.classList.toggle("is-in-view",entry.isIntersecting);
      });
    },{threshold:.15});
    io.observe(visual);
  });

  /* Phase 8 runtime polish: pause ambient motion when hidden and keep decorative
     parallax pointer-only. */
  document.addEventListener("visibilitychange", function () {
    document.documentElement.classList.toggle("page-paused", document.hidden);
  });

  /* Phase 8 responsive navigation */
  var mobileToggle=$("mobile-menu-toggle"), mobileBackdrop=$("mobile-nav-backdrop");
  function setNav(open){
    if(!mobileToggle) return;
    document.body.classList.toggle("nav-open",!!open);
    mobileToggle.setAttribute("aria-expanded",String(!!open));
    mobileToggle.textContent=open?"×":"☰";
    if(mobileBackdrop) mobileBackdrop.hidden=!open;
    if(open){ var first=document.querySelector(".dashboard-nav a"); if(first) setTimeout(function(){first.focus()},30); }
    else if(mobileToggle) mobileToggle.focus();
  }
  if(mobileToggle){
    mobileToggle.addEventListener("click",function(){setNav(!document.body.classList.contains("nav-open"));});
    if(mobileBackdrop) mobileBackdrop.addEventListener("click",function(){setNav(false);});
    nav.forEach(function(a){a.addEventListener("click",function(){if(matchMedia("(max-width: 700px)").matches)setNav(false);});});
  }
  /* Mobile AI bottom sheet */
  var aiFab=$("mobile-ai-fab"), aiView=$("view-ai-assistant");
  if(aiFab && aiView){
    var closeAi=document.createElement("button"); closeAi.type="button"; closeAi.className="btn btn--ghost ai-sheet-close"; closeAi.textContent="Close AI"; closeAi.hidden=true;
    var intro=aiView.querySelector(".page-intro"); if(intro) intro.appendChild(closeAi);
    function syncAiSheet(){
      var mobile=matchMedia("(max-width: 700px)").matches;
      var active=location.hash==="#ai-assistant";
      aiView.classList.toggle("ai-sheet-open",mobile&&active);
      closeAi.hidden=!(mobile&&active);
    }
    aiFab.addEventListener("click",function(){activate("ai-assistant",true);syncAiSheet();});
    closeAi.addEventListener("click",function(){activate("dashboard",true);syncAiSheet();});
    window.addEventListener("resize",syncAiSheet); window.addEventListener("hashchange",syncAiSheet); window.addEventListener("popstate",syncAiSheet);
    syncAiSheet();
  }
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape" && document.body.classList.contains("nav-open")){setNav(false);return;}
    if(e.key==="Escape" && aiView && aiView.classList.contains("ai-sheet-open")){activate("dashboard",true);return;}
    if(e.key==="Tab" && document.body.classList.contains("nav-open") && matchMedia("(max-width: 700px)").matches){
      var focusables=document.querySelectorAll(".dashboard-sidebar a, .dashboard-sidebar button, .dashboard-sidebar input, .dashboard-sidebar select");
      var first=focusables[0], last=focusables[focusables.length-1];
      if(first && last && e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
      else if(first && last && !e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  /* FX conversion is always supplied by the authenticated API in live mode. */
  var fxTimer=null;
  function fxTimestamp(value){var d=new Date(value);return Number.isNaN(d.getTime())?"Timestamp unavailable":d.toLocaleString()+" ("+d.toISOString()+")"}
  async function convertFx(){var amount=$("fx-amount"),from=$("fx-from"),to=$("fx-to"),value=$("fx-result-value"),note=$("fx-rate-note"),meta=document.querySelector(".fx-result small");if(!amount||!from||!to)return;if(auth.mode!=="supabase"){if(meta)meta.textContent="Demo mode · illustrative rate · not a settlement quote";return}var n=Number(amount.value);if(!Number.isFinite(n)||n<=0||Math.round(n*100)!==n*100){value.textContent="Enter a positive amount";note.textContent="Up to two decimal places";if(meta)meta.textContent="";return}value.textContent="Converting…";try{var r=await window.NovaPayApi.request("/api/fx/convert?amount="+encodeURIComponent(n.toFixed(2))+"&base="+encodeURIComponent(from.value)+"&quote="+encodeURIComponent(to.value));value.textContent=r.quoteCurrency+" "+Number(r.convertedAmount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});note.textContent="1 "+r.baseCurrency+" = "+r.rate+" "+r.quoteCurrency+" · source: "+r.source;if(meta)meta.textContent="Indicative · "+r.label+" · "+fxTimestamp(r.timestamp)}catch(error){value.textContent="Conversion unavailable";note.textContent=error.message;if(meta)meta.textContent="No cached or provider rate was returned."}}
  ["fx-amount","fx-from","fx-to"].forEach(function(id){var el=$(id);if(el)el.addEventListener(el.tagName==="INPUT"?"input":"change",function(){clearTimeout(fxTimer);fxTimer=setTimeout(convertFx,250)})});
  if(auth.mode==="supabase")convertFx();

  /* Demo feedback for otherwise non-destructive controls. */
  document.addEventListener("click",function(e){
    var b=e.target.closest("button[data-demo-feedback]");
    if(b) showToast(b.getAttribute("data-demo-feedback"));
  });

  document.querySelectorAll(".report-card button").forEach(function(b){
    b.addEventListener("click",function(){activate("reports",true);showToast("Report opened with sample data.");});
  });
  }
})();
