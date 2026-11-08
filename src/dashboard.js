(function(){
  "use strict";
  var $=function(id){return document.getElementById(id);};
  var toast=$("dashboard-toast"), toastTimer;
  var speechOutput=window.NovaPaySpeechOutput&&window.NovaPaySpeechOutput.create({synthesis:window.speechSynthesis,Utterance:window.SpeechSynthesisUtterance,document:document,storage:window.localStorage,onStatus:function(value){var status=$("ai-speech-status");if(status)status.textContent=value}});
  window.NovaPaySpeechOutputInstance=speechOutput;
  function voiceDebug(step,detail){try{if(localStorage.getItem("novapay:voiceDebug")==="1")console.debug("[NovaPay voice]",step,detail||"")}catch(e){}}
  function showToast(msg){toast.textContent=msg;toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(function(){toast.classList.remove("show");},3000);}
  function getUser(){
    try{
      var raw=localStorage.getItem("novapay-demo-user");
      if(raw)return JSON.parse(raw);
    }catch(e){}
    return {name:"NovaPay User",email:"user@novapay.app"};
  }
  var user=getUser();
  /* Auth gating lives in dashboard.html (waits for NovaPayAuth.ready, works in supabase AND demo mode).
     Never redirect here from the demo-only localStorage flag: it is never set in supabase mode and caused a
     dashboard <-> preview.html#login redirect loop right after OTP sign-in. */
  function endSession(){var a=window.NovaPayAuth;if(!a||typeof a.signOut!=="function")return Promise.resolve();return Promise.race([Promise.resolve(a.ready).then(function(){return a.signOut()}),new Promise(function(r){setTimeout(r,1500)})]).catch(function(){});}
  $("user-name").textContent=user.name||"NovaPay User";
  $("user-email").textContent=user.email||"user@novapay.app";
  $("user-avatar").textContent=(user.name||"F").trim().charAt(0).toUpperCase();
  if(window.NovaPayAuth){Promise.resolve(NovaPayAuth.ready).then(function(){if(NovaPayAuth.mode!=="supabase")return;return NovaPayAuth.currentSession().then(function(s){if(!s||!s.user)return;var m=s.user.user_metadata||{},n=m.full_name||m.name||(s.user.email||"").split("@")[0]||"NovaPay User";$("user-name").textContent=n;$("user-email").textContent=s.user.email||"";$("user-avatar").textContent=n.trim().charAt(0).toUpperCase();if($("set-name"))$("set-name").value=n;if($("set-email"))$("set-email").value=s.user.email||"";return window.NovaPayApi?window.NovaPayApi.request("/api/onboarding",{requiresOrg:false}).then(function(data){var org=NovaPayAuth.currentOrgId(s.user.id),membership=(data.organizations||[]).find(function(row){return row.organizationId===org}),labels={owner:"Owner",admin:"Admin",accountant:"Accountant",approver:"Approver",viewer:"Viewer",donor:"Donor",resident:"Resident"},role=membership&&labels[membership.role]||"Role unavailable";if($("set-role"))$("set-role").value=role;if($("pm-role"))$("pm-role").textContent=role;var modalRole=$("pm-role-value");if(modalRole)modalRole.textContent=role;}):null;});}).catch(function(error){if(window.console)console.error("Could not load current workspace role",error);if($("set-role"))$("set-role").value="Role unavailable";});}

  var sessionMemoryStorage=null;try{sessionMemoryStorage=window.sessionStorage}catch(e){}
  var assistantConversation=window.NovaPayAssistantConversation&&window.NovaPayAssistantConversation.create(sessionMemoryStorage),conversationScope="";
  function renderStoredTurns(turns){var box=$("ai-conversation");if(!box)return;box.querySelectorAll("[data-conversation-turn]").forEach(function(node){node.remove()});(turns||[]).forEach(function(turn){var bubble=document.createElement("div"),inner=document.createElement("div"),name=document.createElement("b"),copy=document.createElement("p");bubble.className="ai-bubble "+(turn.role==="user"?"ai-bubble--user":"ai-bubble--assistant");bubble.dataset.conversationTurn="1";name.textContent=turn.role==="user"?"You":"NovaPay";copy.textContent=turn.text;inner.append(name,copy);bubble.appendChild(inner);box.appendChild(bubble)});box.scrollTop=box.scrollHeight}
  function syncConversationScope(){var auth=window.NovaPayAuth;if(!assistantConversation||!auth)return Promise.resolve([]);return Promise.resolve(auth.ready).then(function(){return auth.currentSession()}).then(function(session){var scope=session&&session.user?(auth.currentOrgId(session.user.id)||"no-org")+":"+session.user.id:auth.mode==="demo"&&auth.isAuthenticated()?"demo:"+(user.email||"user"):"";if(scope!==conversationScope){conversationScope=scope;var turns=assistantConversation.load(scope);renderStoredTurns(turns);return turns}return assistantConversation.turns()}).catch(function(){return[]})}
  if(window.NovaPayAuth)document.addEventListener("novapay:auth",function(event){if(event.detail&&!event.detail.signedIn){if(assistantConversation)assistantConversation.clear();conversationScope="";renderStoredTurns([])}else syncConversationScope()});
  Promise.resolve(window.NovaPayAuth&&NovaPayAuth.ready).then(syncConversationScope).catch(function(){});
  var newChatButton=$("ai-new-chat");if(newChatButton)newChatButton.addEventListener("click",function(){if(assistantConversation)assistantConversation.clear();conversationScope="";syncConversationScope().then(function(){renderStoredTurns([]);var box=$("ai-conversation"),intro=document.createElement("div"),inner=document.createElement("div"),name=document.createElement("b"),copy=document.createElement("p");intro.className="ai-bubble ai-bubble--assistant";intro.dataset.conversationTurn="1";name.textContent="NovaPay";copy.textContent="New conversation started. Ask about this organization.";inner.append(name,copy);intro.appendChild(inner);box.appendChild(intro)});previousAssistantReply="";lastAssistantReply="";$("ai-live-status").textContent="New conversation started."});
  var THEME_KEY="novapay-theme", root=document.documentElement;
  function savedTheme(){try{var t=localStorage.getItem(THEME_KEY);return t==="light"||t==="dark"?t:null}catch(e){return null}}
  function currentTheme(){return savedTheme()||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}
  function applyTheme(t){root.setAttribute("data-theme",t);var dark=t==="dark";($("dashboard-theme").querySelector(".fx-sun")||$("dashboard-theme")).textContent=dark?"☾":"☼";$("dashboard-theme").setAttribute("aria-pressed",String(dark));$("dashboard-theme").setAttribute("aria-label",dark?"Switch to light theme":"Switch to dark theme")}
  $("dashboard-theme").addEventListener("click",function(){var t=currentTheme()==="dark"?"light":"dark";try{localStorage.setItem(THEME_KEY,t)}catch(e){}applyTheme(t)});
  applyTheme(currentTheme());

  var panels=document.querySelectorAll("[data-view-panel]"), nav=document.querySelectorAll("#dashboard-nav a[data-view]"), title=$("page-title");
  var titles={dashboard:"Dashboard",transactions:"Transactions","ai-assistant":"AI Assistant",approvals:"Approvals",sandbox:"PayPal Sandbox",ledger:"Ledger",invoices:"Invoices",reports:"Reports",documents:"Documents","community-funds":"Community Funds",maintenance:"Maintenance",settings:"Settings"};
  function canonicalView(view){return view==="fundraising"||view==="transparency"?"community-funds":view;}
  function cleanupViewTransition(){panels.forEach(function(p){p.classList.remove("module-transition-active")});}
  function handleViewTransitionError(error){if(error&&error.name!=="AbortError"&&window.console)console.error("Could not finish dashboard view transition",error);}
  function applyView(view,writeHash,preserveScroll){
    view=canonicalView(view);
    if(!titles[view])view="dashboard";
    panels.forEach(function(p){p.hidden=p.id!=="view-"+view});
    nav.forEach(function(a){a.setAttribute("aria-current",a.dataset.view===view?"page":"false")});
    title.textContent=titles[view];
    if(writeHash&&location.hash!=="#"+view)history.pushState(null,"","#"+view);
    if(view==="transactions"&&window.NovaPayTransactionsGrid)requestAnimationFrame(function(){var panel=$("view-transactions");if(panel&&!panel.hidden)window.NovaPayTransactionsGrid.init()});
    if(!preserveScroll)window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  }
  function activate(view,writeHash,preserveScroll){
    view=canonicalView(view);
    if(!titles[view])view="dashboard";
    var current=document.querySelector("[data-view-panel]:not([hidden])");
    var next=$("view-"+view), reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(!next||next===current){applyView(view,writeHash,preserveScroll);return;}
    /* Keep the outgoing panel in the snapshot while swapping to the incoming panel. */
    if(!reduced&&document.startViewTransition){
      if(current)current.classList.add("module-transition-active");
      var transition=document.startViewTransition(function(){
        if(current)current.classList.remove("module-transition-active");
        next.classList.add("module-transition-active");
        applyView(view,writeHash,preserveScroll);
      });
      transition.ready.catch(handleViewTransitionError);
      transition.updateCallbackDone.catch(handleViewTransitionError);
      transition.finished.then(cleanupViewTransition,function(error){cleanupViewTransition();handleViewTransitionError(error);});
    }else applyView(view,writeHash,preserveScroll);
  }
  window.NovaPayActivateView=activate;
  function startView(){var v="dashboard";try{var st=JSON.parse(localStorage.getItem("novapay-settings")||"{}");if(st&&titles[st.landing])v=st.landing}catch(e){}return v}
  function route(initial){var h=location.hash.slice(1);if(!h&&initial===true){var v=startView();if(v!=="dashboard")history.replaceState(null,"","#"+v);activate(v,false);return}activate(h||"dashboard",false)}
  nav.forEach(function(a){a.addEventListener("click",function(){activate(a.dataset.view,true)})});
  window.addEventListener("hashchange",function(){route()}); window.addEventListener("popstate",function(){route()}); route(true);

  $("logout").addEventListener("click",function(){
    try{localStorage.removeItem("novapay-demo-auth")}catch(e){}
    endSession().then(function(){window.location.href="preview.html";});
  });

  document.querySelectorAll(".table-action,.report-card .table-action").forEach(function(b){
    b.addEventListener("click",function(){showToast("Sample action selected — no live transaction is changed.");});
  });

  function assistantRecords(){return [].slice.call(document.querySelectorAll("#transactions-table-body tr")).map(function(r){var source=r.dataset.source==="paypal-sandbox"?"PayPal Sandbox":"Illustrative sample data";return{id:r.dataset.txId||"Unavailable",type:r.dataset.type||"Unavailable",status:r.dataset.status||"Unavailable",date:r.dataset.date||"Unavailable",buyer:r.dataset.buyer||"Unavailable",gross:r.cells[3]?r.cells[3].textContent:"Unavailable",fee:r.cells[4]?r.cells[4].textContent:"Unavailable",net:r.cells[5]?r.cells[5].textContent:"Unavailable",currency:r.dataset.currency||"Unavailable",source:source}})}
  function updateAiDataStatus(){var el=$("ai-data-status"),auth=window.NovaPayAuth;if(!el)return;if(!auth||auth.mode==="loading"){el.textContent="Checking assistant mode…";return}if(auth.mode==="supabase"){el.textContent="Secure mode · questions use organization-scoped API evidence.";return}if(auth.mode==="demo"&&auth.isAuthenticated()){el.textContent="DEMO MODE · illustrative sample data only; no live PayPal activity.";return}el.textContent="Assistant unavailable. Sign in again to continue."}
  window.NovaPayAssistant={refreshStatus:updateAiDataStatus};
  var aiTypeSeq=0;
  function currencyMinorToMajor(value,currency){var exponent=2;try{exponent=new Intl.NumberFormat("en",{style:"currency",currency:currency}).resolvedOptions().maximumFractionDigits}catch(e){}return (Number(value)/Math.pow(10,exponent)).toFixed(exponent)}
  async function executeAssistantAction(action){
    var args=action.args||{},id=action.id;
    if(id==="transactions.applyView"){activate("transactions",true);window.NovaPayTransactionsGrid.applyAssistantView(args);return}
    if(id==="nav.open"||id==="report.open"){activate(id==="report.open"?"reports":args.view,true);return}
    if(id==="assistant.stopSpeaking"){if(window.NovaPayVoiceAssistantController)window.NovaPayVoiceAssistantController.stopSpeaking();else if(speechOutput)speechOutput.cancel();return}
    if(id==="assistant.repeat"){var repeatText=previousAssistantReply||"There is no answer to repeat yet.";if(speechOutput)speechOutput.speak(repeatText);return}
    if(id==="assistant.help"){var list=(window.NovaPayAssistantActions.registry||[]).map(function(item){return item.speakableName}).filter(Boolean);showToast("I can " + [...new Set(list)].slice(0,8).join(", ") + ".");return}
    if(id==="documents.promptUpload"){activate("documents",true);var file=$("document-upload"),label=document.querySelector('label[for="document-upload"]');if(label){label.tabIndex=-1;label.focus();label.scrollIntoView({block:"center"})}else if(file){file.focus();file.scrollIntoView({block:"center"})}return}
    if(id==="documents.readReview"||id==="documents.proposeConfirm"){activate("documents",true);$("ai-live-status").textContent=id==="documents.proposeConfirm"?"Review the extracted fields and confirm or reject in Documents. Voice cannot confirm records into the books.":"Open the document row in Documents to read its stored review.";var row=document.querySelector('[data-document-id="'+CSS.escape(String(args.documentId||""))+'"]');if(row)row.scrollIntoView({block:"center"});return}
    if(id==="maintenance.openNew"){activate("maintenance",true);var maintenanceButton=document.querySelector('[data-ui-action="maintenance-new-live"]');if(maintenanceButton&&!maintenanceButton.disabled)maintenanceButton.click();return}
    if(id==="funds.openCampaign"){activate("community-funds",true);var campaignButton=document.querySelector('[data-ui-action="campaign-view"]');if(campaignButton&&!campaignButton.disabled)campaignButton.click();return}
    if(id==="invoice.requestSendApproval"){activate("invoices",true);$("ai-live-status").textContent="Voice did not send the invoice. Open Invoices and request send approval there.";return}
    if(id==="ui.click"||id==="ledger.export"||id==="report.export"){
      var actionName=id==="ui.click"?args.uiAction:id==="ledger.export"?"ledger-export":"reports-export";
      if(!window.NovaPayAssistantActions.uiActions.includes(actionName))throw new Error("This app action is not available.");
      var button=document.querySelector('[data-ui-action="'+CSS.escape(actionName)+'"]');
      if(!button||button.disabled||button.hidden)throw new Error("That control is not currently available for your role or view.");
      button.click();return;
    }
    if(id==="invoice.downloadPdf"){
      var api=window.NovaPayApi,invoiceId=args.invoiceId||lastCreatedInvoiceId;if(!invoiceId){var listed=await api.request("/api/invoices?limit=100"),latest=(listed.invoices||[])[0];if(!latest)throw new Error("There are no invoices to download yet.");invoiceId=latest.id}
      var detail=await api.request("/api/invoices/"+encodeURIComponent(invoiceId));
      var blob=await api.request("/api/invoices/"+encodeURIComponent(invoiceId)+"/download",{responseType:"blob"});
      var invoice=detail.invoice||detail,number=String(invoice.invoiceNumber||invoiceId).replace(/[^A-Za-z0-9._-]/g,"-");
      var url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download="invoice-"+number+".pdf";anchor.click();setTimeout(function(){URL.revokeObjectURL(url)},1000);showToast("Invoice PDF downloaded.");return;
    }
    if(id==="invoice.createDraft"){
      var key=invoiceDraftIdempotencyKey||crypto.randomUUID(),now=new Date(),number="INV-VOICE-"+now.getTime().toString(36).toUpperCase();
      var lines=args.lines.map(function(line){return{description:line.description,quantity:String(line.quantity),unitPrice:currencyMinorToMajor(line.unitPriceMinor,args.currency),taxRate:line.taxRate==null?0:line.taxRate}});
      var created=await window.NovaPayApi.request("/api/invoices",{method:"POST",headers:{"Idempotency-Key":key},body:{invoiceNumber:number,customerName:args.customerName,customerEmail:args.customerEmail,currency:args.currency,issueDate:args.issueDate,dueDate:args.dueDate,notes:args.notes||"",lines:lines}});
      if(window.NovaPayInvoices&&window.NovaPayInvoices.refresh)await window.NovaPayInvoices.refresh();
      activate("invoices",true);showToast("Draft invoice created after your confirmation.");$("ai-live-status").textContent="Draft invoice created. Sending still requires review and approval.";return created;
    }
    if(id==="funds.createCampaignDraft"){
      var campaign=await window.NovaPayApi.request("/api/funds/campaigns",{method:"POST",headers:{"Idempotency-Key":crypto.randomUUID()},body:{title:args.title,purpose:args.purpose,targetMinor:args.targetMinor,currency:args.currency,deadline:args.deadline,organiser:args.organiser}});
      document.dispatchEvent(new CustomEvent("novapay:funds-campaign-created"));activate("community-funds",true);showToast("Campaign created after your confirmation.");return campaign;
    }
    throw new Error("This assistant action is not available yet.");
  }
  async function auditAssistantAction(action,outcome){
    if(!window.NovaPayApi)throw new Error("Action audit is unavailable; no action was taken.");
    await window.NovaPayApi.request("/api/ai/actions/audit",{method:"POST",body:{actionId:action.id,tier:action.tier,outcome:outcome}});
  }
  function summarizeAssistantAction(action){var a=action.args||{};if(action.id==="invoice.createDraft")return"Create a draft invoice for "+a.customerName+" with "+a.lines.length+" line item(s), due "+a.dueDate+". Confirm?";if(action.id==="invoice.downloadPdf")return"Download the latest invoice PDF from this organization. Confirm?";if(action.id==="funds.createCampaignDraft")return"Create the campaign “"+a.title+"” with target "+currencyMinorToMajor(a.targetMinor,a.currency)+" "+a.currency+". Confirm?";return"This action needs your confirmation before NovaPay proceeds."}
  function renderAssistantActions(actions){
    var slot=$("ai-proposal-slot"),catalog=window.NovaPayAssistantActions&&window.NovaPayAssistantActions.registry||[];
    (Array.isArray(actions)?actions:[]).slice(0,5).forEach(function(action){
      if(action.id==="data.query")return;
      var definition=catalog.find(function(item){return item.id===action.id});if(!definition)return;
      var card=document.createElement("article"),heading=document.createElement("h4"),copy=document.createElement("p"),buttons=document.createElement("div");
      card.className="ai-proposal-card assistant-action-card";heading.textContent=definition.title;copy.textContent=definition.tier===1?summarizeAssistantAction(action):definition.tier===2?"This request needs a human decision. Voice will only open the relevant screen; it will not complete it.":"NovaPay can do this now.";buttons.className="agent-actions";card.append(heading,copy);
      if(definition.tier===1){
        var confirm=document.createElement("button"),cancel=document.createElement("button"),completed=false;confirm.type=cancel.type="button";confirm.className="btn btn--primary assistant-action-confirm";confirm.textContent="Confirm";cancel.className="btn btn--ghost";cancel.textContent="Cancel";
        var confirmationTimer=window.setTimeout(function(){completed=true;confirm.disabled=true;cancel.disabled=true;copy.textContent="Confirmation expired. Ask NovaPay again if you still want this draft or export."},15000);
        var run=function(){if(completed)return;completed=true;window.clearTimeout(confirmationTimer);confirm.disabled=true;cancel.disabled=true;var voice=window.NovaPayVoiceAssistantController;if(voice)voice.cancelPendingConfirmation();auditAssistantAction(action,"confirmed").then(function(){return executeAssistantAction(action)}).then(function(){return auditAssistantAction(action,"completed")}).catch(function(error){auditAssistantAction(action,"failed").catch(function(){});showToast("Assistant action: "+(error.message||"could not be completed."));confirm.textContent="Could not complete"})};
        confirm.addEventListener("click",run);cancel.addEventListener("click",function(){if(completed)return;completed=true;window.clearTimeout(confirmationTimer);auditAssistantAction(action,"cancelled").catch(function(){});confirm.disabled=true;cancel.disabled=true;if(window.NovaPayVoiceAssistantController)window.NovaPayVoiceAssistantController.cancelPendingConfirmation();cancel.textContent="Cancelled"});
        buttons.append(confirm,cancel);var voice=window.NovaPayVoiceAssistantController;if(voice)voice.requestConfirmation(run,15000);
      }else if(definition.tier===2){
        var go=document.createElement("button");go.type="button";go.className="btn btn--ghost";go.textContent="Open for human review";go.addEventListener("click",function(){auditAssistantAction(action,"proposed").then(function(){return executeAssistantAction(action)}).catch(function(error){showToast("Assistant action: "+(error.message||"could not be completed."))})});buttons.appendChild(go);
      }else{
        executeAssistantAction(action).then(function(){card.remove()}).catch(function(error){copy.textContent=error.message||"This action could not be completed."});
      }
      card.appendChild(buttons);slot.appendChild(card);
    });
  }
  function appendAiMessage(q,response,records){
    var box=$("ai-conversation");if(!box)return;
    var user=document.createElement("div"),ud=document.createElement("div"),up=document.createElement("p");user.className="ai-bubble ai-bubble--user";user.dataset.conversationTurn="1";ud.appendChild(up);up.textContent=q;user.appendChild(ud);
    var bot=document.createElement("div"),bd=document.createElement("div"),name=document.createElement("b"),p=document.createElement("p");bot.className="ai-bubble ai-bubble--assistant";bot.dataset.conversationTurn="1";name.textContent="NovaPay";p.textContent=response.reply;bd.append(name,p);bot.appendChild(bd);
    [].forEach.call(box.querySelectorAll(".text-type"),function(n){if(n.__textType)n.__textType.finish()});box.append(user,bot);box.scrollTop=box.scrollHeight;
    function reveal(){
      if(response.route){var badge=document.createElement("small"),labels=window.NovaPayAssistantClient.routeLabels;badge.className="ai-answer-mode status info";badge.textContent=labels[response.route]||"LLM";badge.title=response.reason||"Assistant route";badge.setAttribute("aria-label",badge.textContent+" route; reason: "+(response.reason||"not provided"));bd.appendChild(badge)}
      var citations=Array.isArray(response.evidence)?response.evidence:[];
      if(response.route&&citations.length){var chips=document.createElement("div");chips.className="module-inline";citations.forEach(function(citation){var id=typeof citation==="string"?citation:String(citation&& (citation.id||citation.sourceId)||"");if(!id)return;var chip=document.createElement("button");chip.type="button";chip.className="table-action";chip.textContent=id;chip.title="Cited record ID: "+id;chip.addEventListener("click",function(){if(response.route==="ocr"){activate("documents",true);$("ai-live-status").textContent="Cited document "+id+". Open Documents to review it.";return}activate("transactions",true);var row=document.querySelector('#transactions-table-body tr[data-tx-id="'+CSS.escape(id)+'"]');if(row&&row.dataset.source!=="Illustrative sample data")openTx(id);else $("ai-live-status").textContent="Cited record "+id+" is not currently loaded in Transactions."});chips.appendChild(chip)});bd.appendChild(chips)}
      if(response.mode){var mode=document.createElement("small");mode.className="ai-answer-mode";mode.textContent=response.mode;bd.appendChild(mode)}
      if(response.proposal)renderAssistantProposal(response.proposal,records||[]);renderAssistantActions(response.actions);box.scrollTop=box.scrollHeight;
    }
    if(window.NovaTextType&&prefs.aiTyping)NovaTextType(p,{text:response.reply,typingSpeed:14,typeEffect:"fade",mistakes:0,cursorStyle:"bar",cursorGlide:true,showCursor:true,loop:false,hideCursorOnComplete:true,onUpdate:function(){box.scrollTop=box.scrollHeight},onTypingComplete:reveal});else reveal();
  }
  function localAnswer(q,records){var usable=records.filter(function(r){return r.id!=="Unavailable"}),k=q.toLowerCase();if(!usable.length)return{reply:"No sample records are loaded in this demo session. Sign in to ask about live organization records.",evidence:[],mode:"DEMO MODE · local sample data only"};var selected;if(/fee/.test(k))selected=usable.filter(function(r){return r.fee!=="Unavailable"&&r.fee.indexOf("not returned")<0});else if(/refund/.test(k))selected=usable.filter(function(r){return /refund/i.test(r.type)});else if(/attention|unusual|explain/.test(k))selected=usable.filter(function(r){return /review|duplicate|refund/i.test(r.status+" "+r.type)});else selected=usable.slice(0,6);if(!selected.length)return{reply:"These demo samples do not contain enough evidence. Sign in to ask about live organization records.",evidence:[],mode:"DEMO MODE · local sample data only"};return{reply:"DEMO MODE: I can summarize illustrative sample rows, but cannot determine whether activity is fraudulent or unusual. "+selected.length+" sample record(s) are available; review them in Transactions.",evidence:[],mode:"DEMO MODE · illustrative values, not live PayPal activity"}}
  function appendAiError(message){var box=$("ai-conversation"),bot=document.createElement("div"),bd=document.createElement("div"),name=document.createElement("b"),copy=document.createElement("p");bot.className="ai-bubble ai-bubble--assistant";bot.dataset.conversationTurn="1";name.textContent="NovaPay";copy.className="status warn";copy.textContent=message;bd.append(name,copy);bot.appendChild(bd);box.appendChild(bot);box.scrollTop=box.scrollHeight}
  function renderAssistantProposal(proposal,records){var slot=$("ai-proposal-slot");slot.textContent="";var auth=window.NovaPayAuth;if(auth&&auth.mode==="supabase"){if(!proposal.approvalId)return;var created=document.createElement("article"),message=document.createElement("p"),open=document.createElement("button");created.className="ai-proposal-card";message.textContent="Proposal created and waiting for review.";open.type="button";open.className="btn btn--primary";open.textContent="Open Approvals";open.addEventListener("click",function(){location.hash="#approvals";if(window.NovaLive&&window.NovaLive.refreshApprovals)window.NovaLive.refreshApprovals()});created.appendChild(message);created.appendChild(open);slot.appendChild(created);return}var ref=String(proposal.txId||""),sourceRow=document.querySelector('#transactions-table-body tr[data-tx-id="'+CSS.escape(ref)+'"],#transactions-table-body tr[data-source-id="'+CSS.escape(ref)+'"],#transactions-table-body tr[data-capture-id="'+CSS.escape(ref)+'"]'),row=records.find(function(r){return String(r.id||"")===ref||String(r.sourceId||r.source_id||r.captureId||r.capture_id||"")===ref})||records.find(function(r){return sourceRow&&(String(r.id||"")===sourceRow.dataset.txId||String(r.sourceId||r.source_id||r.captureId||r.capture_id||"")===String(sourceRow.dataset.sourceId||sourceRow.dataset.captureId||""))}),knownType=["refund","dispute-evidence","hold-payout"].indexOf(proposal.type)>-1,sourceRow=sourceRow||(row&&document.querySelector('#transactions-table-body tr[data-tx-id="'+CSS.escape(String(row.sourceId||row.source_id||row.captureId||row.capture_id||row.id))+'"],#transactions-table-body tr[data-source-id="'+CSS.escape(String(row.sourceId||row.source_id||row.captureId||row.capture_id||row.id))+'"],#transactions-table-body tr[data-capture-id="'+CSS.escape(String(row.sourceId||row.source_id||row.captureId||row.capture_id||row.id))+'"]')),sandboxRefund=!!(row&&row.source==="PayPal Sandbox"&&proposal.type==="refund"&&row.currency==="USD"&&Number(sourceRow&&sourceRow.dataset.amount)>0),card=document.createElement("article"),title=document.createElement("h4"),copy=document.createElement("p"),dl=document.createElement("dl"),button=document.createElement("button"),reason=String(proposal.reason||"No reason supplied."),canSend=!!row&&knownType&&(proposal.type!=="refund"||row.source!=="PayPal Sandbox"||sandboxRefund);card.className="ai-proposal-card";card.tabIndex=-1;title.textContent=knownType?({refund:"Refund suggestion","dispute-evidence":"Dispute evidence suggestion","hold-payout":"Payout review suggestion"}[proposal.type]):"Informational finding · simulated only";copy.textContent=reason;card.appendChild(document.createTextNode("AI suggestion for review"));var mode=document.createElement("span");mode.className="status info";mode.textContent=sandboxRefund?"PayPal Sandbox · approval required":"Simulated only";card.appendChild(mode);card.appendChild(title);card.appendChild(copy);[["Reference",ref||"Unavailable"],["Amount",row?row.gross:"Unavailable"],["Currency",row?row.currency:"Unavailable"],["Source",row?row.source:"NovaPay AI"]].forEach(function(pair){var wrap=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=pair[0];dd.textContent=pair[1];wrap.appendChild(dt);wrap.appendChild(dd);dl.appendChild(wrap)});card.appendChild(dl);button.type="button";button.className="btn btn--primary";button.textContent="Send to Approvals";button.disabled=!canSend;button.addEventListener("click",function(){if(!canSend||button.disabled)return;var captureRef=String(row.sourceId||row.source_id||row.captureId||row.capture_id||(sourceRow&&(sourceRow.dataset.captureId||sourceRow.dataset.sourceId||sourceRow.dataset.txId))||row.id),amount=Number(sourceRow&&sourceRow.dataset.amount),item={type:proposal.type,txId:captureRef,title:String(proposal.title||title.textContent),reason:reason,display:row.gross,source:"NovaPay AI",simulatedOnly:true,requiresSandbox:sandboxRefund,evidence:captureRef+" · "+row.type+" · "+row.gross+" · "+row.status};if(sandboxRefund){item.captureId=captureRef;item.currency="USD";item.usd=amount;item.simulatedOnly=false}var auth=window.NovaPayAuth;if(sandboxRefund&&auth&&auth.mode==="supabase"){button.disabled=true;button.textContent="Sending to Approvals…";window.NovaPayApi.request("/api/approvals/register",{method:"POST",body:{approvalId:String(proposal.approvalId||""),proposalType:"refund",captureId:captureRef,amount:amount.toFixed(2),currency:"USD"}}).then(function(result){if(!result||!result.registered)throw new Error("The refund proposal was not registered.");if(window.NovaLive&&window.NovaLive.refreshApprovals)return window.NovaLive.refreshApprovals()}).then(function(){button.textContent="Sent to Approvals";$("ai-live-status").textContent="Proposal sent to Approvals. Review it there before any action.";location.hash="#approvals"}).catch(function(error){button.disabled=false;button.textContent="Send to Approvals";showToast(error&&error.message||"Could not register the refund proposal.");$("ai-live-status").textContent="The refund proposal could not be registered; no refund was sent."});return}NovaLive.addProposal(item);button.disabled=true;button.textContent="Sent to Approvals";$("ai-live-status").textContent="Proposal sent to Approvals. Review it there before any action."});card.appendChild(button);if(!row){var note=document.createElement("p");note.className="ai-proposal-warning";note.textContent="This proposal has no matching transaction reference in the available data, so it cannot be sent as an actionable item.";card.appendChild(note)}else if(!knownType){var note2=document.createElement("p");note2.className="ai-proposal-warning";note2.textContent="This action type is not supported and will remain informational; no action can be attempted.";card.appendChild(note2)}else if(proposal.type==="refund"&&row.source==="PayPal Sandbox"&&!sandboxRefund){var note3=document.createElement("p");note3.className="ai-proposal-warning";note3.textContent="This capture is missing a supported USD amount, so the refund suggestion cannot be sent as an actionable item.";card.appendChild(note3)}slot.appendChild(card);card.focus()}
  var aiBusy=false;
  var lastAssistantReply = "";
  var previousAssistantReply = "";
  var pendingInvoiceDraft=null,pendingInvoiceTimer=null,lastCreatedInvoiceId="",invoiceDraftIdempotencyKey="";
  function resetPendingInvoice(message){if(pendingInvoiceTimer)clearTimeout(pendingInvoiceTimer);pendingInvoiceTimer=null;pendingInvoiceDraft=null;invoiceDraftIdempotencyKey="";var slot=$("ai-proposal-slot");if(slot)slot.textContent="";return message}
  function invoiceDateLabel(value){var date=new Date(value+"T00:00:00");return Number.isNaN(date.getTime())?value:date.toLocaleDateString(undefined,{day:"numeric",month:"long"})}
  function invoicePrompt(field){return({customerName:"Who is the invoice for?",customerEmail:"What email address should appear on the invoice?",amountMinor:"What's the amount?",description:"What should I list as the invoice line item?",dueDate:"What's the due date?"})[field]||"Please provide the next invoice detail."}
  function invoiceReadback(){var data=pendingInvoiceDraft;if(!data)return"I have the invoice details ready. Confirm?";var amount=currencyMinorToMajor(data.amountMinor,data.currency),formatted;try{formatted=new Intl.NumberFormat("en-IN",{style:"currency",currency:data.currency}).format(Number(amount))}catch(e){formatted=amount+" "+data.currency}return"Create a draft invoice for "+data.customerName+", "+formatted+", due "+invoiceDateLabel(data.dueDate)+", for "+data.description+". Confirm?"}
  function invoiceResponse(query,reply,confirmReady){if(confirmReady)reply=invoiceReadback();var response={reply:reply,speak:reply,route:"code",reason:"invoice_create_draft_slot_filling",evidence:[],actions:[]};$("ai-proposal-slot").textContent="";appendAiMessage(query,response,[]);$("ai-live-status").textContent=confirmReady?"Invoice draft is waiting for your confirmation.":reply;if(confirmReady)renderInvoiceDraftConfirmation();return response}
  function renewInvoiceExpiry(){if(pendingInvoiceTimer)clearTimeout(pendingInvoiceTimer);pendingInvoiceTimer=setTimeout(function(){if(pendingInvoiceDraft){resetPendingInvoice();var message="Invoice draft details expired after two minutes. Ask me to create the invoice again.";appendAiError(message);$("ai-live-status").textContent=message;if(speechOutput)speechOutput.speak(message)}},120000)}
  function renderInvoiceDraftConfirmation(){var data=pendingInvoiceDraft,slot=$("ai-proposal-slot");if(!data||!slot)return;slot.textContent="";var card=document.createElement("article"),title=document.createElement("h4"),copy=document.createElement("p"),confirm=document.createElement("button"),cancel=document.createElement("button");card.className="ai-proposal-card assistant-action-card";title.textContent="Confirm draft invoice";var amount=currencyMinorToMajor(data.amountMinor,data.currency),formatted;try{formatted=new Intl.NumberFormat(undefined,{style:"currency",currency:data.currency}).format(Number(amount))}catch(e){formatted=amount+" "+data.currency}copy.textContent="Create a draft invoice for "+data.customerName+", "+formatted+", due "+invoiceDateLabel(data.dueDate)+", for "+data.description+". Confirm? Customer email: "+data.customerEmail;confirm.type=cancel.type="button";confirm.className="btn btn--primary";confirm.textContent="Confirm draft";cancel.className="btn btn--ghost";cancel.textContent="Cancel";confirm.addEventListener("click",function(){confirm.disabled=true;cancel.disabled=true;confirmInvoiceDraft().then(function(result){invoiceResponse("Confirm draft invoice",result.reply,false);if(speechOutput)speechOutput.speak(result.speak||result.reply)})});cancel.addEventListener("click",function(){resetPendingInvoice();invoiceResponse("Cancel","I cancelled the invoice draft. No invoice was created.",false)});card.append(title,copy,confirm,cancel);slot.appendChild(card)}
  async function startInvoiceDraft(query){var api=window.NovaPayApi;if(!api)throw new Error("Sign in to create an invoice draft.");var roleResult=await api.request("/api/invoices?limit=1"),role=roleResult&&roleResult.role;if(["owner","admin","accountant"].indexOf(role)<0)return invoiceResponse(query,"Your role can't create invoices. Ask an owner or admin, or create it manually in Invoices.",false);var parsed=window.NovaPayAssistantActions.parseInvoiceCreateText(query);pendingInvoiceDraft=Object.assign({customerName:"",customerEmail:"",amountMinor:null,currency:"INR",description:"",dueDate:"",issueDate:new Date().toISOString().slice(0,10)},parsed||{});invoiceDraftIdempotencyKey=crypto.randomUUID();renewInvoiceExpiry();var missing=window.NovaPayAssistantActions.nextInvoiceSlot(pendingInvoiceDraft);if(missing)return invoiceResponse(query,invoicePrompt(missing),false);pendingInvoiceDraft.awaitingConfirmation=true;return invoiceResponse(query,"I have the invoice details ready.",true)}
  async function confirmInvoiceDraft(){var data=pendingInvoiceDraft;if(!data)return{reply:"No invoice draft is waiting for confirmation.",speak:"No invoice draft is waiting for confirmation.",route:"code",reason:"invoice_no_pending_draft",evidence:[],actions:[]};if(data.submitting)return{reply:"I am already creating that draft.",speak:"I am already creating that draft.",route:"code",reason:"invoice_create_in_progress",evidence:[],actions:[]};data.submitting=true;var action={id:"invoice.createDraft",tier:1,title:"Create invoice draft",args:{customerName:data.customerName,customerEmail:data.customerEmail,currency:data.currency,issueDate:data.issueDate,dueDate:data.dueDate,lines:[{description:data.description,quantity:1,unitPriceMinor:data.amountMinor,taxRate:0}]}};try{await auditAssistantAction(action,"confirmed");var created=await executeAssistantAction(action);await auditAssistantAction(action,"completed");var invoice=created&&created.invoice||created||{};lastCreatedInvoiceId=invoice.id||"";var number=invoice.invoiceNumber?" "+invoice.invoiceNumber:"";resetPendingInvoice();var row=lastCreatedInvoiceId&&document.querySelector('#invoice-table tbody tr[data-invoice-id="'+CSS.escape(lastCreatedInvoiceId)+'"]');if(row){row.classList.add("invoice-row-highlight");row.scrollIntoView({block:"center",behavior:"smooth"});setTimeout(function(){row.classList.remove("invoice-row-highlight")},4000)}var success="Draft invoice created"+number+". I opened Invoices. It has not been sent.";return{reply:success,speak:success,route:"code",reason:"invoice_draft_created",evidence:[],actions:[]}}catch(error){if(pendingInvoiceDraft)pendingInvoiceDraft.submitting=false;auditAssistantAction(action,"failed").catch(function(){});var message="I couldn't create the draft invoice: "+(error.message||"the invoice request failed.");return{reply:message,speak:message,error:true,route:"code",reason:"invoice_draft_create_failed",evidence:[],actions:[]}}}
  async function handleInvoiceAssistant(q){var actions=window.NovaPayAssistantActions,text=String(q||"").trim();if(!pendingInvoiceDraft&&!actions.isInvoiceCreateIntent(text)){if(lastCreatedInvoiceId&&/^(?:open it|open that|show it)[.! ]*$/i.test(text)){activate("invoices",true);setTimeout(function(){var row=document.querySelector('#invoice-table tbody tr[data-invoice-id="'+CSS.escape(lastCreatedInvoiceId)+'"]'),button=row&&row.querySelector('[data-invoice-action="view"]');if(button)button.click()},100);return{reply:"Opening the draft invoice.",speak:"Opening the draft invoice.",route:"code",reason:"open_created_invoice",evidence:[],actions:[]}}return null}if(pendingInvoiceDraft){renewInvoiceExpiry();if(/^(?:cancel|no|never mind|nevermind|forget it)[.! ]*$/i.test(text)){resetPendingInvoice();return invoiceResponse(q,"I cancelled the invoice draft. No invoice was created.",false)}if(/^(?:confirm|yes|confirmed|yes please)[.! ]*$/i.test(text)){if(actions.nextInvoiceSlot(pendingInvoiceDraft))return invoiceResponse(q,invoicePrompt(actions.nextInvoiceSlot(pendingInvoiceDraft)),false);var completed=await confirmInvoiceDraft();invoiceResponse(q,completed.reply,false);return completed}if(pendingInvoiceDraft.awaitingConfirmation&&/\bchange\s+the\s+amount\s+to\s+/i.test(text)){var edited=actions.parseInvoiceSlot("amountMinor",text.replace(/^.*?\bto\s+/i,""),pendingInvoiceDraft);if(!edited.error){pendingInvoiceDraft.amountMinor=edited.value;renewInvoiceExpiry();return invoiceResponse(q,"Updated the amount. Please review the draft.",true)}return invoiceResponse(q,edited.error+" Please say change the amount to a new value.",true)}if(pendingInvoiceDraft.awaitingConfirmation)return invoiceResponse(q,"Please say confirm or yes to create this draft, say cancel or no to stop, or say change the amount to a new value.",true);var field=actions.nextInvoiceSlot(pendingInvoiceDraft),parsed=actions.parseInvoiceSlot(field,text,pendingInvoiceDraft);if(parsed.error)return invoiceResponse(q,parsed.error+" "+invoicePrompt(field),false);pendingInvoiceDraft[field]=parsed.value;if(parsed.currency)pendingInvoiceDraft.currency=parsed.currency;field=actions.nextInvoiceSlot(pendingInvoiceDraft);if(field)return invoiceResponse(q,invoicePrompt(field),false);pendingInvoiceDraft.awaitingConfirmation=true;return invoiceResponse(q,"I have the invoice details ready.",true)}if(!window.NovaPayApi)return invoiceResponse(q,"Sign in to create an invoice draft. No invoice was created.",false);try{return await startInvoiceDraft(q)}catch(error){return invoiceResponse(q,"I couldn't start an invoice draft: "+(error.message||"sign in and try again."),false)}}
  function ask(q, voiceMetadata){
    voiceMetadata=Object.assign({},voiceMetadata||{});var activePanel=document.querySelector("[data-view-panel]:not([hidden])"),selectedId=window.NovaPayAssistantSelectionId||(selectedTransaction&&selectedTransaction.ref)||"";voiceMetadata.context=Object.assign({},voiceMetadata.context||{},{view:activePanel?activePanel.id.replace(/^view-/ ,""):"ai-assistant"},selectedId?{selection:selectedId}:{});
    q=(q||"").trim();if(!q)return Promise.resolve(null);if(aiBusy){var busyReply="I’m finishing the current question. Please try again in a moment.";appendAiError(busyReply);return Promise.resolve({reply:busyReply,speak:busyReply,error:true})}aiBusy=true;
    var records=[],box=$("ai-conversation"),status=$("ai-live-status"),send=$("ai-send"),auth=window.NovaPayAuth;
    $("ai-proposal-slot").textContent="";status.textContent="Sending to the organization assistant…";send.disabled=true;
    var thoughts=(window.NovaThoughts&&prefs.aiThoughts)?NovaThoughts.create(box):null,pending=thoughts?thoughts.el:document.createElement("p");
    if(!thoughts){pending.className="ai-loading";pending.setAttribute("role","status");pending.textContent="Waiting for the organization assistant…";box.appendChild(pending)}box.scrollTop=box.scrollHeight;
    var finish=function(response){var go=function(){pending.remove();if(response.insufficientEvidence&&!(response.evidence||[]).length)response.reply="No live records yet. There is no matching evidence in this organization for that question.";previousAssistantReply=lastAssistantReply;lastAssistantReply=response.reply||"";appendAiMessage(q,response,records);status.textContent="Answer ready.";send.disabled=false;aiBusy=false};if(thoughts)thoughts.complete(go);else go();return response};
    var fail=function(error){var category=window.NovaPayAssistantClient.errorMessage(error),message="My AI service is busy right now. I can still open modules and run quick commands. "+category;voiceDebug("response status",{status:error&&error.status||0,code:error&&error.code||"unknown"});var go=function(){pending.remove();status.textContent=message;appendAiError(message);send.disabled=false;aiBusy=false};if(thoughts)thoughts.complete(go);else go();return{reply:message,speak:message,error:true}};
    var quick=window.NovaPayAssistantClient.parseQuickCommand(q);
    if(quick){
      voiceDebug("actions parsed",[quick.action.id]);
      Promise.race([Promise.resolve(auth&&auth.ready).then(function(){return auth?auth.currentSession():null}),new Promise(function(_,reject){window.setTimeout(function(){reject(Object.assign(new Error("Session check timed out"),{code:"AUTH_TIMEOUT"}))},10000)})]).then(function(session){
        if(!session||!window.NovaLive||!NovaLive.assistantChat)return null;
        return NovaLive.assistantChat(q,voiceMetadata).then(function(response){voiceDebug("response status",{status:200,route:response&&response.route||"unknown",fastPath:true})})
      }).catch(function(error){voiceDebug("response status",{status:error&&error.status||0,code:error&&error.code||"offline",fastPath:true})});
      return Promise.resolve(executeAssistantAction(quick.action)).then(function(){return finish({reply:quick.reply,speak:quick.speak?quick.reply:"",route:"code",reason:"client_deterministic_fast_path",evidence:[],actions:[],suppressSpeech:!quick.speak})}).catch(fail)
    }
    var signedIn=false;
    return Promise.race([Promise.resolve(auth&&auth.ready).then(function(){return auth?auth.currentSession():null}),new Promise(function(_,reject){window.setTimeout(function(){reject(Object.assign(new Error("The session check timed out."),{code:"AUTH_TIMEOUT"}))},10000)})]).then(function(session){
      signedIn=Boolean(session);voiceDebug("query sent",{source:voiceMetadata&&voiceMetadata.source||"assistant",signedIn:signedIn,apiEnabled:window.NovaLive&&window.NovaLive.live&&window.NovaLive.live.ai});
      if(session)return Promise.race([NovaLive.assistantChat(q,voiceMetadata),new Promise(function(_,reject){window.setTimeout(function(){reject(Object.assign(new Error("The assistant took too long to respond."),{code:"AI_TIMEOUT",status:504}))},45000)})]);
      if(window.NovaPayAssistantClient.canUseDemoFallback(auth,session)&&auth.isAuthenticated()){records=assistantRecords();var service=$("ai-service-status");if(service){service.textContent="AI service · DEMO MODE · Local fallback";service.className="status warn"}return localAnswer(q,records)}
      throw Object.assign(new Error("Sign in to continue."),{status:401,code:"AUTH_REQUIRED"});
    }).then(function(response){
      if(signedIn&&response&&/demo mode|local fallback|illustrative sample/i.test(String(response.mode||""))){voiceDebug("response status",{status:200,reason:"unexpected_local_fallback"});throw Object.assign(new Error("The signed-in request returned demo data."),{status:503,code:"AI_LOCAL_FALLBACK_BLOCKED"})}
      voiceDebug("response status",{status:200,route:response&&response.route||"unknown"});if(response&&response.actions&&response.actions.length)voiceDebug("actions parsed",response.actions.map(function(action){return action.id}));return finish(response);
    }).catch(fail);
  }
  function handleQuery(q,options){options=options||{};var metadata=Object.assign({},options.metadata||{});if(options.source)metadata.source=options.source;voiceDebug("query sent",{source:options.source||"typed"});return syncConversationScope().then(function(turns){metadata.history=turns.slice(-10);metadata.context=Object.assign({},metadata.context||{});var grid=window.NovaPayTransactionsGrid;if(grid){metadata.context.selectedTransactionIds=grid.getSelectedIds?grid.getSelectedIds():[];metadata.context.filteredTransactionIds=grid.getFilteredIds?grid.getFilteredIds():[]}var active=document.querySelector("[data-view-panel]:not([hidden])");if(active)metadata.context.view=active.id.replace(/^view-/ ,"");return Promise.resolve().then(function(){return handleInvoiceAssistant(q)}).then(function(invoiceResponseValue){return invoiceResponseValue||ask(q,metadata)})}).then(function(response){if(assistantConversation&&response&&response.reply){assistantConversation.append("user",q);assistantConversation.append("assistant",response.reply)}if(options.speak!==false&&response&&response.reply&&!response.suppressSpeech&&!(response.actions||[]).some(function(action){return action.id==="assistant.stopSpeaking"||action.id==="assistant.repeat"})){if(window.NovaPayVoiceAssistantController&&window.NovaPayVoiceAssistantController.isEnabled())window.NovaPayVoiceAssistantController.speak(response.speak||response.reply);else if(speechOutput)speechOutput.speak(response.speak||response.reply).then(function(result){if(!result.ok){var status=$("ai-live-status");if(status)status.textContent="Answer is in chat, but speech playback failed ("+(result.error||"unavailable")+"). Tap or hold the mic button to try again."}})}return response})}
  window.NovaPayAssistant.ask=handleQuery;window.NovaPayAssistant.handleQuery=handleQuery;
  window.NovaPayAssistant.getLastReply=function(){return lastAssistantReply};
  function askFromComposer(){var input=$("ai-input"),q=input.value.trim();if(q&&!aiBusy){if(speechOutput)speechOutput.markGesture();handleQuery(q,{source:"typed",speak:true});input.value=""}}
  $("ai-send").addEventListener("click",askFromComposer);
  $("ai-test-voice")?.addEventListener("click",function(){if(!speechOutput)return;speechOutput.markGesture();speechOutput.speak("Hello. NovaPay voice is working.")});
  $("ai-input").addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.isComposing){e.preventDefault();askFromComposer()}});
  (function setupAssistantTools(){
    var upload=$("ai-upload"),mic=$("ai-mic"),loading=false,skipFallbackClick=false;
    var pttRecorder=null,pttStream=null,pttParts=[],pttTimer=null,pttStarting=false,pttHeld=false,pttFailed=false;
    if(upload)upload.addEventListener("click",function(){activate("documents",true);$("ai-live-status").textContent="Upload or review organization documents in Documents."});
    function releasePTT(){if(pttStream){pttStream.getTracks().forEach(function(track){track.stop()});pttStream=null}}
    function stopPTT(){pttHeld=false;if(pttTimer){clearTimeout(pttTimer);pttTimer=null}if(pttRecorder&&pttRecorder.state!=="inactive")pttRecorder.stop()}
    function startPTT(event){
      if(event){event.preventDefault();if(event.pointerId!=null&&mic.setPointerCapture)try{mic.setPointerCapture(event.pointerId)}catch(e){}}
      if(pttRecorder||pttStarting)return;
      pttHeld=true;skipFallbackClick=true;window.setTimeout(function(){skipFallbackClick=false},1000);
      if(speechOutput)speechOutput.markGesture();
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder){pttHeld=false;$("ai-live-status").textContent="Audio transcription is unavailable here. Type your question instead.";return}
      pttStarting=true;$("ai-live-status").textContent="Hold the mic to record your question…";
      navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}).then(function(stream){
        if(!pttHeld){stream.getTracks().forEach(function(track){track.stop()});pttStarting=false;return}
        pttStream=stream;pttParts=[];pttFailed=false;
        var supports=window.MediaRecorder.isTypeSupported?window.MediaRecorder.isTypeSupported.bind(window.MediaRecorder):function(){return false};
        var chosen=supports("audio/webm;codecs=opus")?"audio/webm;codecs=opus":supports("audio/ogg;codecs=opus")?"audio/ogg;codecs=opus":supports("audio/mp4")?"audio/mp4":"";
        try{pttRecorder=chosen?new window.MediaRecorder(stream,{mimeType:chosen}):new window.MediaRecorder(stream)}catch(error){releasePTT();pttStarting=false;pttHeld=false;$("ai-live-status").textContent="This browser cannot record audio. Type your question instead.";return}
        pttRecorder.ondataavailable=function(e){if(e.data&&e.data.size)pttParts.push(e.data)};
        pttRecorder.onerror=function(){pttFailed=true;$("ai-live-status").textContent="The microphone recording failed. Try again or type your question.";stopPTT()};
        pttRecorder.onstop=function(){
          var recorder=pttRecorder,mime=(recorder&&recorder.mimeType||"audio/webm").split(";")[0],blob=new Blob(pttParts,{type:mime});
          pttRecorder=null;pttParts=[];releasePTT();mic.classList.remove("is-listening");mic.setAttribute("aria-pressed","false");
          if(pttFailed){pttFailed=false;return}
          if(!blob.size){$("ai-live-status").textContent="No speech was recorded. Hold the mic and try again.";return}
          $("ai-live-status").textContent="Transcribing your voice…";voiceDebug("query sent",{source:"push-to-talk-transcription",bytes:blob.size});
          window.NovaPayAssistantClient.transcribeAndHandle(window.NovaPayApi,blob,handleQuery,function(transcript){
            $("ai-input").value=transcript;voiceDebug("transcript",{kind:"transcribed",text:transcript})
          }).catch(function(error){$("ai-live-status").textContent="Voice transcription failed: "+window.NovaPayAssistantClient.errorMessage(error)+" Type your question or try again."})
        };
        pttRecorder.start();pttStarting=false;mic.classList.add("is-listening");mic.setAttribute("aria-pressed","true");
        $("ai-live-status").textContent="Listening to your held recording… Release to send.";pttTimer=window.setTimeout(stopPTT,15000)
      }).catch(function(){pttStarting=false;pttHeld=false;$("ai-live-status").textContent="Microphone permission is blocked. Allow it in browser settings, then hold the mic."})
    }
    if(mic){
      mic.addEventListener("click",function(event){
        if(skipFallbackClick){skipFallbackClick=false;event.stopImmediatePropagation();return}
        if(window.NovaPayVoiceAssistantController||loading)return;
        loading=true;
        import("./voice-assistant.js").then(function(module){
          var controller=module.mountVoiceAssistant({
            onQuery:function(message,metadata){return handleQuery(message,{source:"voice",metadata:metadata,speak:false})},
            onTranscript:function(text){$("ai-input").value=text},
            getContext:function(){return{view:location.hash.slice(1)||"dashboard"}},
            speechOutput:speechOutput,
            getLastReply:function(){return window.NovaPayAssistant.getLastReply()},
            onConfirmationCancelled:function(){document.querySelectorAll(".assistant-action-confirm").forEach(function(button){button.disabled=true;button.textContent="Confirmation expired"})}
          });
          window.NovaPayVoiceAssistantController=controller;
          if(controller&&controller.enableVoice)controller.enableVoice();
        }).catch(function(){$("ai-live-status").textContent="Voice support could not load. Type your question instead."}).finally(function(){loading=false})
      });
      mic.addEventListener("pointerdown",function(event){if(window.NovaPayVoiceFallbackOnly)startPTT(event)});
      mic.addEventListener("pointerup",function(){if(pttHeld)stopPTT()});
      mic.addEventListener("pointercancel",function(){if(pttHeld)stopPTT()});
      window.addEventListener("pointerup",function(){if(pttHeld)stopPTT()});
      window.addEventListener("blur",function(){if(pttHeld)stopPTT()})
    }
  })();
  document.querySelectorAll("[data-ai-query]").forEach(function(b){b.addEventListener("click",function(){if(speechOutput)speechOutput.markGesture();handleQuery(b.dataset.aiQuery,{source:"suggestion",speak:true})})});
  updateAiDataStatus();
  if(window.NovaPayAuth){Promise.resolve(NovaPayAuth.ready).then(updateAiDataStatus);document.addEventListener("novapay:auth",updateAiDataStatus)}

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
    if(!window.NovaPayAuth||window.NovaPayAuth.mode!=="demo")return;
    var tb=$("transactions-table-body");
    if(tb&&!tb.querySelector('[data-tx-id="REF-28491"]')){
      var r=document.createElement("tr");r.className="transaction-row";r.tabIndex=0;r.dataset.txId="REF-28491";r.dataset.type="Refund";r.dataset.status="Refunded (Simulated)";r.dataset.amount="2000";r.dataset.currency="INR";r.dataset.source="demo";r.dataset.buyer="Unavailable";
      ["Unavailable","↩ Refund","Unavailable","INR 2,000.00","Unavailable","-INR 2,000.00","Refunded (Simulated)","REF-28491"].forEach(function(v){var td=document.createElement("td");if(v==="↩ Refund"){td.innerHTML='<span class="tx-badge refund"></span> Refund'}else{td.textContent=v}r.appendChild(td)});
      tb.insertBefore(r,tb.firstChild);
      if(typeof txRows!=="undefined")txRows=document.querySelectorAll("#view-transactions tbody tr");
    }
  }
  confirm.addEventListener("click",function(){
    if(window.NovaPayAuth&&window.NovaPayAuth.mode==="supabase"){closeAction();showToast("This local refund simulation is available only in demo mode. Use the PayPal Sandbox and Approvals flow for a real sandbox refund.");return;}
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
    if(window.NovaPayTransactionsGrid&&window.NovaPayTransactionsGrid.getApi()){window.NovaPayTransactionsGrid.filtersChanged();return}
    var q=txSearch.value.trim().toLowerCase(), t=txType.value, st=$("tx-status").value, from=$("tx-from").value, to=$("tx-to").value, min=$("tx-min").value, max=$("tx-max").value, shown=0;
    txRows.forEach(function(r){var day=(r.dataset.date||"").slice(0,10),n=Number(r.dataset.amount),ok=(!t||r.dataset.type===t)&&(!st||r.dataset.status===st)&&(!q||r.textContent.toLowerCase().indexOf(q)>-1||r.dataset.txId.toLowerCase().indexOf(q)>-1)&&(!from||!!day&&day>=from)&&(!to||!!day&&day<=to)&&(!min||n>=Number(min))&&(!max||n<=Number(max));r.hidden=!ok;if(ok)shown++;});
    $("tx-empty").hidden=shown>0;$("tx-result-count").textContent=shown+" transaction"+(shown===1?"":"s")+" shown";
  }
  [txSearch,txType,$("tx-status"),$("tx-from"),$("tx-to"),$("tx-min"),$("tx-max")].forEach(function(c){c.addEventListener(c.tagName==="INPUT"&&c.type==="search"?"input":"change",filterTx)});

  /* Settings module — preferences persist in localStorage ("novapay-settings"). */
  var SET_KEY="novapay-settings",ACCT_KEY="novapay-demo-accounts",DEMO_EMAIL="user@novapay.app",DEMO_PASSWORD="novapay123",ACTIVITY_KEY="novapay-last-activity",qa=document.querySelector(".ai-quick-actions");
  var defaults={reduceMotion:matchMedia("(prefers-reduced-motion: reduce)").matches,compact:false,notif:true,approvalAlerts:true,aiAlerts:true,aiSuggestions:true,aiThoughts:true,aiTyping:true,landing:"dashboard",autoLogout:0};
  function cleanPrefs(o){
    o.landing=titles[o.landing]?o.landing:"dashboard";
    o.autoLogout=[0,15,30,60].indexOf(Number(o.autoLogout))>-1?Number(o.autoLogout):0;
    return o;
  }
  function loadSet(){var o={};try{o=JSON.parse(localStorage.getItem(SET_KEY)||"{}")||{}}catch(e){}return cleanPrefs(Object.assign({},defaults,o));}
  function saveSet(o){try{localStorage.setItem(SET_KEY,JSON.stringify(o))}catch(e){showToast("Could not save settings in this browser.")}}
  var prefs=loadSet();

  /* Inactivity sign-out */
  var idleTimer=0,lastActive=Date.now(),lastWrite=0;
  function bumpActivity(){var n=Date.now();lastActive=n;if(n-lastWrite>10000){lastWrite=n;try{localStorage.setItem(ACTIVITY_KEY,String(n))}catch(e){}}}
  ["mousemove","mousedown","keydown","scroll","touchstart"].forEach(function(ev){document.addEventListener(ev,bumpActivity,{passive:true,capture:true});});
  function signOutInactive(){try{localStorage.setItem("novapay-signout-reason","inactive");localStorage.removeItem("novapay-demo-auth")}catch(e){}endSession().then(function(){location.replace("preview.html#login");});}
  function checkIdle(){
    var mins=Number(prefs.autoLogout)||0;if(!mins)return;
    var last=lastActive;try{last=Math.max(last,parseInt(localStorage.getItem(ACTIVITY_KEY)||"0",10)||0)}catch(e){}
    if(Date.now()-last>=mins*60000)signOutInactive();
  }
  function scheduleIdle(){clearInterval(idleTimer);idleTimer=0;if(Number(prefs.autoLogout)>0){bumpActivity();idleTimer=setInterval(checkIdle,15000);}}
  document.addEventListener("visibilitychange",function(){if(!document.hidden)checkIdle();});

  function applyPrefs(){
    root.classList.toggle("reduce-motion",!!prefs.reduceMotion);
    root.classList.toggle("density-compact",!!prefs.compact);
    var nb=$("notifications");if(nb){nb.hidden=!prefs.notif;if(!prefs.notif&&$("notification-popover")){$("notification-popover").hidden=true;nb.setAttribute("aria-expanded","false");}}
    var navCount=$("nav-approvals-count");if(navCount)navCount.classList.toggle("is-muted",!prefs.notif||!prefs.approvalAlerts);
    if(qa)qa.hidden=!prefs.aiSuggestions;
    var visible=0;
    document.querySelectorAll(".notification-item").forEach(function(it){var kind=it.dataset.notifKind,show=kind==="approvals"?!!prefs.approvalAlerts:kind==="ai"?!!prefs.aiAlerts:!!prefs.notif;it.hidden=!show;if(show&&((it.dataset.notificationStatus||"unread")==="unread"))visible++;});
    var badge=$("notif-count");if(badge&&window.NovaPayAuth&&window.NovaPayAuth.mode!=="supabase")badge.textContent=visible?visible+" new":"All clear";
    var dot=document.querySelector(".notification-dot");if(dot&&(!window.NovaPayAuth||window.NovaPayAuth.mode!=="supabase"))dot.hidden=!visible;
    var empty=$("notif-empty");if(empty)empty.hidden=document.querySelectorAll(".notification-item:not([hidden])").length>0;
    ["set-approval-alerts","set-ai-alerts"].forEach(function(id){var el=$(id);if(el)el.disabled=!prefs.notif;});
    scheduleIdle();
  }
  var bindings={"reduce-motion-toggle":"reduceMotion","set-compact":"compact","set-notif":"notif","set-approval-alerts":"approvalAlerts","set-ai-alerts":"aiAlerts","set-ai-suggestions":"aiSuggestions","set-ai-thoughts":"aiThoughts","set-ai-typing":"aiTyping"};
  var setTheme=$("set-theme"),setLanding=$("set-landing"),setIdle=$("set-autologout");
  function syncControls(){
    Object.keys(bindings).forEach(function(id){var el=$(id);if(el)el.checked=!!prefs[bindings[id]];});
    if(setTheme)setTheme.value=savedTheme()||"system";
    if(setLanding)setLanding.value=prefs.landing;
    if(setIdle)setIdle.value=String(prefs.autoLogout);
  }
  Object.keys(bindings).forEach(function(id){var el=$(id),key=bindings[id];if(!el)return;el.addEventListener("change",function(){prefs[key]=el.checked;saveSet(prefs);applyPrefs();showToast("Setting saved.");});});
  if(setLanding)setLanding.addEventListener("change",function(){prefs.landing=setLanding.value;prefs=cleanPrefs(prefs);saveSet(prefs);showToast("Start page set to "+titles[prefs.landing]+".");});
  if(setIdle)setIdle.addEventListener("change",function(){prefs.autoLogout=Number(setIdle.value);prefs=cleanPrefs(prefs);saveSet(prefs);applyPrefs();showToast(prefs.autoLogout?"You will be signed out after "+(prefs.autoLogout===60?"1 hour":prefs.autoLogout+" minutes")+" of inactivity.":"Auto sign-out is off.");});
  if(setTheme){
    setTheme.addEventListener("change",function(){
      try{if(setTheme.value==="system")localStorage.removeItem(THEME_KEY);else localStorage.setItem(THEME_KEY,setTheme.value)}catch(e){}
      applyTheme(currentTheme());showToast(setTheme.value==="system"?"Theme now follows your device.":"Theme updated.");
    });
    $("dashboard-theme").addEventListener("click",function(){setTheme.value=savedTheme()||"system";});
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change",function(){if(!savedTheme()){applyTheme(currentTheme());}});
  syncControls();applyPrefs();

  /* Section menu: one settings section is shown at a time; the last one opened is remembered for this session. */
  var SET_SECTION_KEY="novapay-settings-section",setNavButtons=[].slice.call(document.querySelectorAll("[data-set-section]")),setPanels=[].slice.call(document.querySelectorAll(".set-panel"));
  function showSection(key){
    if(!$("setpanel-"+key))key="profile";
    setPanels.forEach(function(pn){pn.hidden=pn.id!=="setpanel-"+key;});
    setNavButtons.forEach(function(b){if(b.dataset.setSection===key)b.setAttribute("aria-current","true");else b.removeAttribute("aria-current");});
    try{sessionStorage.setItem(SET_SECTION_KEY,key)}catch(e){}
    centerActiveSection();
  }
  function centerActiveSection(){
    var cur=document.querySelector('[data-set-section][aria-current="true"]'),strip=cur&&cur.parentNode;
    if(strip&&strip.scrollWidth>strip.clientWidth)strip.scrollLeft=cur.offsetLeft-(strip.clientWidth-cur.offsetWidth)/2;
  }
  setNavButtons.forEach(function(b,i){
    b.addEventListener("click",function(){showSection(b.dataset.setSection);});
    b.addEventListener("keydown",function(e){
      var next=e.key==="ArrowDown"||e.key==="ArrowRight"?i+1:e.key==="ArrowUp"||e.key==="ArrowLeft"?i-1:e.key==="Home"?0:e.key==="End"?setNavButtons.length-1:null;
      if(next===null)return;e.preventDefault();var t=setNavButtons[(next+setNavButtons.length)%setNavButtons.length];t.focus();showSection(t.dataset.setSection);
    });
  });
  var firstSection="profile";try{firstSection=sessionStorage.getItem(SET_SECTION_KEY)||"profile"}catch(e){}
  showSection(firstSection);
  var settingsStrip=document.querySelector(".settings-nav");if(settingsStrip&&window.ResizeObserver)new ResizeObserver(centerActiveSection).observe(settingsStrip);

  /* Profile */
  var setName=$("set-name"),setEmail=$("set-email"),acctEmail=String(user.email||"").toLowerCase();
  function getAccts(){try{return JSON.parse(localStorage.getItem(ACCT_KEY)||"{}")||{}}catch(e){return {}}}
  function putAccts(a){try{localStorage.setItem(ACCT_KEY,JSON.stringify(a));return true}catch(e){return false}}
  if(setName)setName.value=user.name&&!/^novapay (demo )?user$/i.test(user.name)?user.name:"";
  if(setEmail)setEmail.value=user.email||"user@novapay.app";
  if($("set-tz"))$("set-tz").value=(Intl.DateTimeFormat().resolvedOptions().timeZone)||"Local";
  async function saveProfile(){
    var n=setName.value.trim().replace(/\s+/g," ");
    if(!n){showToast("Please enter a display name.");setName.focus();return;}
    var auth=window.NovaPayAuth;
    if(auth&&auth.mode==="supabase"){
      var client=auth.client,button=$("set-save-profile");
      if(!client||!client.auth||typeof client.auth.updateUser!=="function"){showToast("Supabase profile updates are unavailable in this session.");return;}
      if(button){button.disabled=true;button.textContent="Saving…";}
      try{var updated=await client.auth.updateUser({data:{full_name:n}});if(updated.error)throw updated.error;user.name=n;if(setName)setName.value=n;$("user-name").textContent=n;$("user-avatar").textContent=n.charAt(0).toUpperCase();var greeting=$("greeting-name");if(greeting)greeting.textContent=n.split(/\s+/)[0];if($("pm-title")){$("pm-title").textContent=n;$("pm-name").textContent=n;$("pm-avatar").textContent=n.charAt(0).toUpperCase();}showToast("Supabase profile updated.");}
      catch(error){showToast("Profile update failed. Check your session and try again.");if(window.console)console.error("Could not update Supabase profile metadata",error);}
      finally{if(button){button.disabled=false;button.textContent="Save profile";}}
      return;
    }
    user.name=n;try{localStorage.setItem("novapay-demo-user",JSON.stringify(user))}catch(e){}
    var accts=getAccts();if(accts[acctEmail]||acctEmail===DEMO_EMAIL){accts[acctEmail]=Object.assign({},accts[acctEmail],{name:n});putAccts(accts);}
    $("user-name").textContent=n;$("user-avatar").textContent=n.charAt(0).toUpperCase();
    var g=$("greeting-name");if(g)g.textContent=n.split(/\s+/)[0];
    if($("pm-title")){$("pm-title").textContent=n;$("pm-name").textContent=n;$("pm-avatar").textContent=n.charAt(0).toUpperCase();}
    showToast("Profile saved in this browser.");
  }
  if($("set-save-profile"))$("set-save-profile").addEventListener("click",saveProfile);
  if(setName)setName.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();saveProfile();}});

  /* Change password (demo accounts are stored in this browser) */
  var pwForm=$("set-password-form"),pwStatus=$("set-pw-status");
  function pwSay(msg,kind){if(!pwStatus)return;pwStatus.textContent=msg;pwStatus.className="set-status"+(kind?" is-"+kind:"");}
  function storedPassword(){var a=getAccts()[acctEmail];if(a&&typeof a.password==="string")return a.password;return acctEmail===DEMO_EMAIL?DEMO_PASSWORD:null;}
  if(pwForm){
    $("set-pw-username").value=user.email||"";
    if(storedPassword()===null){
      pwForm.querySelectorAll("input[type=password],button").forEach(function(el){el.disabled=true;});
      Promise.resolve(window.NovaPayAuth&&NovaPayAuth.ready).then(function(){if(!window.NovaPayAuth||NovaPayAuth.mode!=="supabase"){pwSay("Password changes are not available for this demo sign-in method.","");return;}var current=$("set-pw-current"),currentLabel=current&&current.closest("label");if(currentLabel){currentLabel.hidden=true;currentLabel.style.display="none";}if(current)current.disabled=true;["set-pw-new","set-pw-confirm","set-pw-submit"].forEach(function(id){if($(id))$(id).disabled=false});pwSay("Password updates use Supabase Auth for this signed-in account.","");});
    }
    pwForm.addEventListener("submit",function(e){
      e.preventDefault();
      var cur=$("set-pw-current").value,next=$("set-pw-new").value,again=$("set-pw-confirm").value,real=storedPassword();
      if(window.NovaPayAuth&&NovaPayAuth.mode==="supabase"){
        if(next.length<8){pwSay("Use at least 8 characters for the new password.","error");$("set-pw-new").focus();return;}
        if(!/[A-Za-z]/.test(next)||!/\d/.test(next)){pwSay("Include at least one letter and one number.","error");$("set-pw-new").focus();return;}
        if(next!==again){pwSay("The new passwords do not match.","error");$("set-pw-confirm").focus();return;}
        $("set-pw-submit").disabled=true;NovaPayAuth.updatePassword(next).then(function(){pwForm.reset();$("set-pw-username").value=user.email||"";pwSay("Password updated with Supabase Auth.","ok");showToast("Password updated.");}).catch(function(error){pwSay("Supabase could not update the password. Check your session and try again.","error");if(window.console)console.error("Could not update Supabase password",error);}).finally(function(){$("set-pw-submit").disabled=false;});return;
      }
      if(real===null)return;
      if(!cur){pwSay("Enter your current password.","error");$("set-pw-current").focus();return;}
      if(cur!==real){pwSay("Current password is incorrect.","error");$("set-pw-current").focus();return;}
      if(next.length<8){pwSay("Use at least 8 characters for the new password.","error");$("set-pw-new").focus();return;}
      if(!/[A-Za-z]/.test(next)||!/\d/.test(next)){pwSay("Include at least one letter and one number.","error");$("set-pw-new").focus();return;}
      if(next===cur){pwSay("Choose a password different from the current one.","error");$("set-pw-new").focus();return;}
      if(next!==again){pwSay("The new passwords do not match.","error");$("set-pw-confirm").focus();return;}
      var accts=getAccts();accts[acctEmail]=Object.assign({},accts[acctEmail],{name:(accts[acctEmail]&&accts[acctEmail].name)||user.name||"NovaPay User",password:next});
      if(!putAccts(accts)){pwSay("Could not save the new password in this browser.","error");return;}
      pwForm.reset();$("set-pw-username").value=user.email||"";pwSay("Password updated. Use it the next time you sign in.","ok");showToast("Password updated.");
    });
    ["set-pw-current","set-pw-new","set-pw-confirm"].forEach(function(id){$(id).addEventListener("input",function(){if(pwStatus.classList.contains("is-error"))pwSay("","");});});
  }

  /* Confirmation dialog */
  var cm=$("confirm-modal"),cmOk=$("confirm-ok"),cmCancel=$("confirm-cancel"),cmOpener=null,cmAction=null;
  function closeConfirm(){if(!cm||cm.hidden)return;cm.hidden=true;cm.setAttribute("aria-hidden","true");document.body.classList.remove("modal-open");cmAction=null;if(cmOpener&&cmOpener.isConnected)cmOpener.focus();}
  function confirmDialog(opts,action){
    if(!cm)return;cmOpener=document.activeElement;cmAction=action;
    $("confirm-title").textContent=opts.title;$("confirm-text").textContent=opts.text;cmOk.textContent=opts.confirm||"Confirm";
    cm.hidden=false;cm.setAttribute("aria-hidden","false");document.body.classList.add("modal-open");cmCancel.focus();
  }
  if(cm){
    cmCancel.addEventListener("click",closeConfirm);
    cmOk.addEventListener("click",function(){var run=cmAction;cmOpener=null;closeConfirm();if(run)run();});
    cm.addEventListener("click",function(e){if(e.target===cm)closeConfirm();});
    cm.addEventListener("keydown",function(e){
      if(e.key==="Escape"){e.stopPropagation();closeConfirm();}
      if(e.key==="Tab"){var first=cmCancel,last=cmOk;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    });
  }

  /* Downloads */
  function downloadFile(name,text,type){var blob=new Blob([text],{type:type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000);}
  function csvCell(v){var s=String(v==null?"":v).replace(/\s+/g," ").trim();if(/^[=+@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
  if($("set-export-tx"))$("set-export-tx").addEventListener("click",function(){
    var rows=[["Date & time","Type","Counterparty","Gross amount","PayPal fee","Net amount","Status","Transaction ID","Source"]];
    document.querySelectorAll("#transactions-table-body tr").forEach(function(r){
      if(!r.dataset.txId||r.cells.length<7)return;
      var c=r.cells;rows.push([c[0].textContent,c[1].textContent,c[2].textContent,c[3].textContent,c[4].textContent,c[5].textContent,c[6].textContent,r.dataset.txId,r.dataset.source==="paypal-sandbox"?"PayPal Sandbox":"Illustrative sample"]);
    });
    if(rows.length<2){showToast("There are no transactions to export yet.");return;}
    downloadFile("novapay-transactions-"+new Date().toISOString().slice(0,10)+".csv","\ufeff"+rows.map(function(r){return r.map(csvCell).join(",")}).join("\r\n"),"text/csv;charset=utf-8");
    showToast((rows.length-1)+" transaction"+(rows.length===2?"":"s")+" exported.");
  });
  if($("set-export-data"))$("set-export-data").addEventListener("click",function(){
    var data={exportedAt:new Date().toISOString(),profile:{name:user.name||"",email:user.email||"",role:"Not included in browser export"},preferences:Object.assign({},prefs,{theme:savedTheme()||"system"}),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||"",currencyDisplay:"per-record"};
    downloadFile("novapay-my-data.json",JSON.stringify(data,null,2),"application/json");showToast("Your data was downloaded.");
  });

  /* AI conversation */
  if($("set-ai-clear"))$("set-ai-clear").addEventListener("click",function(){
    if(aiBusy){showToast("Wait for the current answer to finish.");return;}
    var box=$("ai-conversation");if(!box)return;
    [].slice.call(box.children).forEach(function(n,i){if(i>0)n.remove();});
    if($("ai-proposal-slot"))$("ai-proposal-slot").textContent="";if($("ai-live-status"))$("ai-live-status").textContent="";
    showToast("AI conversation cleared.");
  });

  /* Sign out, reset, delete */
  if($("set-logout"))$("set-logout").addEventListener("click",function(){$("logout").click();});
  if($("set-reset"))$("set-reset").addEventListener("click",function(){
    confirmDialog({title:"Reset preferences?",text:"Every setting on this page returns to its default. Your profile and password are not changed.",confirm:"Reset"},function(){
      try{localStorage.removeItem(SET_KEY);localStorage.removeItem(THEME_KEY)}catch(e){}
      prefs=Object.assign({},defaults);applyTheme(currentTheme());syncControls();applyPrefs();showToast("Preferences reset to defaults.");
    });
  });
  if($("set-delete"))$("set-delete").addEventListener("click",function(){
    if(window.NovaPayAuth&&NovaPayAuth.mode==="supabase"){showToast("Account deletion is not available in this preview. Contact support for an account deletion request.");return;}
    var builtIn=acctEmail===DEMO_EMAIL;
    confirmDialog({title:"Delete demo profile?",text:builtIn?"This removes the demo profile and NovaPay data saved in this browser. It does not delete server-side organization data.":"This removes this demo profile and its browser-local data. It does not delete a Supabase account or organization records.",confirm:"Delete demo profile"},function(){
      var accts=getAccts();delete accts[acctEmail];putAccts(accts);
      try{
        var keys=[],i,k;for(i=0;i<localStorage.length;i++){k=localStorage.key(i);if(k&&k.indexOf("novapay-")===0&&k!==ACCT_KEY)keys.push(k);}
        keys.forEach(function(key){localStorage.removeItem(key)});
        keys=[];for(i=0;i<sessionStorage.length;i++){k=sessionStorage.key(i);if(k&&k.indexOf("novapay-")===0)keys.push(k);}
        keys.forEach(function(key){sessionStorage.removeItem(key)});
      }catch(e){}
      endSession().then(function(){window.location.href="preview.html";});
    });
  });
  Promise.resolve(window.NovaPayAuth&&NovaPayAuth.ready).then(function(){var button=$("set-delete"),row=button&&button.closest(".set-row"),demo=!!(window.NovaPayAuth&&NovaPayAuth.mode==="demo");if(!button)return;button.hidden=!demo;if(row){var small=row.querySelector("small");if(small)small.textContent=demo?"Removes this demo profile and browser-local data only.":"Account deletion is not available from this preview; contact support.";}});

  /* Keep other open tabs in step: settings, theme and sign-out. */
  window.addEventListener("storage",function(e){
    if(e.key===SET_KEY){prefs=loadSet();syncControls();applyPrefs();}
    else if(e.key===THEME_KEY){applyTheme(currentTheme());syncControls();}
    else if(e.key==="novapay-demo-auth"&&e.newValue!=="true"&&window.NovaPayAuth&&window.NovaPayAuth.mode==="demo"){location.replace("preview.html");}
  });
  /* Profile details dialog (sidebar user chip) */
  var pm=$("profile-modal"),pmOpener=null;
  function fillProfile(){
    var n=$("user-name").textContent;
    $("pm-title").textContent=n;$("pm-name").textContent=n;$("pm-avatar").textContent=n.charAt(0).toUpperCase();
    $("pm-email").textContent=$("user-email").textContent||user.email||"Signed-in account";
    $("pm-tz").textContent=Intl.DateTimeFormat().resolvedOptions().timeZone||"Local";
    var auth=window.NovaPayAuth,workspace=$("pm-workspace"),account=$("pm-account-type");
    if(auth&&auth.mode==="supabase"){
      if(account)account.textContent="Supabase account";
      Promise.resolve(auth.currentSession()).then(function(session){var org=session&&session.user&&auth.currentOrgId(session.user.id);if(workspace)workspace.textContent=org||"No active organization";}).catch(function(){if(workspace)workspace.textContent="Organization unavailable";});
    }else{if(workspace)workspace.textContent="Demo workspace";if(account)account.textContent=auth&&auth.mode==="demo"?"Demo account":"Account unavailable";}
    var role=$("set-role")&&$("set-role").value||"Role unavailable";if($("pm-role"))$("pm-role").textContent=role;if($("pm-role-value"))$("pm-role-value").textContent=role;
    $("pm-theme").textContent=currentTheme()==="dark"?"Dark":"Light";
    var t=0;try{t=parseInt(localStorage.getItem("novapay-session-start")||"0",10)}catch(e){}
    if(!t){t=Date.now();try{localStorage.setItem("novapay-session-start",String(t))}catch(e){}}
    $("pm-signed").textContent=new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(t));
  }
  function openProfile(trigger){if(!pm)return;pmOpener=trigger;fillProfile();pm.hidden=false;pm.setAttribute("aria-hidden","false");document.body.classList.add("modal-open");$("profile-modal-close").focus();}
  function closeProfile(){if(!pm||pm.hidden)return;pm.hidden=true;pm.setAttribute("aria-hidden","true");document.body.classList.remove("modal-open");if(pmOpener&&pmOpener.isConnected)pmOpener.focus();}
  if($("sidebar-user"))$("sidebar-user").addEventListener("click",function(){openProfile(this);});
  if(pm){pm.addEventListener("click",function(e){if(e.target===pm)closeProfile();});$("profile-modal-close").addEventListener("click",closeProfile);document.addEventListener("keydown",function(e){if(e.key==="Escape")closeProfile();});
    $("pm-settings").addEventListener("click",function(){pmOpener=null;closeProfile();showSection("profile");activate("settings",true);});
    $("pm-logout").addEventListener("click",function(){$("logout").click();});}

  // Phase 5 — dashboard controls and dynamic illustrative cash-flow data.
  var displayName=(user.name||"").trim();if(!displayName||/^novapay (demo )?user$/i.test(displayName))displayName="there";displayName=displayName.replace(/\s*\bdemo\b\s*/i," ").trim()||"there";
  var greetingName=$("greeting-name");if(greetingName)greetingName.textContent=displayName.split(/\s+/)[0];
  var greetingHour=new Date().getHours(),greetingPrefix=greetingHour<12?"Good morning":greetingHour<18?"Good afternoon":"Good evening";
  var greeting=$("dashboard-subtitle");if(greeting&&greeting.firstChild)greeting.firstChild.textContent=greetingPrefix+", ";
  $("user-name").textContent=displayName;
  $("user-email").textContent=user.email||"Demo account";
  $("user-avatar").textContent=displayName.charAt(0).toUpperCase();

  var notifications=$("notifications"), notificationPopover=$("notification-popover"), calendarButton=$("calendar-button"), calendarPopover=$("calendar-popover"), moreButton=$("more-button"), morePopover=$("more-popover");
  function closePopovers(){
    if(notificationPopover){notificationPopover.hidden=true;notifications.setAttribute("aria-expanded","false");}
    if(calendarPopover){calendarPopover.hidden=true;calendarButton.setAttribute("aria-expanded","false");}
    if(morePopover){morePopover.hidden=true;moreButton.setAttribute("aria-expanded","false");}
  }
  if(notifications){notifications.addEventListener("click",function(e){e.stopPropagation();var open=notificationPopover.hidden;closePopovers();notificationPopover.hidden=!open;notifications.setAttribute("aria-expanded",String(open));});}
  function bindPopover(btn,pop,onOpen){if(!btn)return;btn.addEventListener("click",function(e){e.stopPropagation();var open=pop.hidden;closePopovers();pop.hidden=!open;btn.setAttribute("aria-expanded",String(open));if(open&&onOpen)onOpen();});}
  var calView=new Date();calView.setDate(1);
  function renderCalendar(){
    var title=$("cal-title"),days=$("cal-days");if(!title||!days)return;
    var today=new Date(),y=calView.getFullYear(),m=calView.getMonth(),first=new Date(y,m,1).getDay(),count=new Date(y,m+1,0).getDate(),html="";
    title.textContent=new Intl.DateTimeFormat(undefined,{month:"long",year:"numeric"}).format(calView);
    for(var i=0;i<first;i++)html+='<span class="cal-empty"></span>';
    for(var d=1;d<=count;d++){var isToday=d===today.getDate()&&m===today.getMonth()&&y===today.getFullYear();html+='<span class="cal-day'+(isToday?' is-today"  aria-current="date':'')+'">'+d+'</span>';}
    days.innerHTML=html;
  }
  bindPopover(calendarButton,calendarPopover,function(){calView=new Date();calView.setDate(1);renderCalendar();});
  bindPopover(moreButton,morePopover);
  if($("cal-prev"))$("cal-prev").addEventListener("click",function(e){e.stopPropagation();calView.setMonth(calView.getMonth()-1);renderCalendar();});
  if($("cal-next"))$("cal-next").addEventListener("click",function(e){e.stopPropagation();calView.setMonth(calView.getMonth()+1);renderCalendar();});
  document.addEventListener("click",function(e){if(!e.target.closest(".popover")&&!e.target.closest("#notifications")&&!e.target.closest("#calendar-button")&&!e.target.closest("#more-button"))closePopovers();});
  document.addEventListener("keydown",function(e){if(e.key==="Escape")closePopovers();});
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
    if(window.NovaPayAuth&&window.NovaPayAuth.mode==="supabase")return;
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
  if(dateSelect){dateSelect.addEventListener("change",function(){if(window.NovaPayAuth&&window.NovaPayAuth.mode==="supabase"){document.dispatchEvent(new CustomEvent("novapay:dashboard-period"));return;}renderKpis(dateSelect.value, true);});}
  if(!(window.NovaPayAuth&&window.NovaPayAuth.mode==="supabase"))renderKpis("today", false);
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
  function renderCashflow(range, animate){
    if(window.NovaPayAuth&&window.NovaPayAuth.mode==="supabase")return;
    var cfg=ranges[range]||ranges["30D"];cfRange=range;
    var mi=series(cfg,cfg.in,0),mo=series(cfg,cfg.out,5),net=mi.map(function(v,i){return v-mo[i];});
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
  document.querySelectorAll("#cashflow-tabs button").forEach(function(b){b.addEventListener("click",function(){if(window.NovaPayAuth&&window.NovaPayAuth.mode==="supabase"){document.querySelectorAll("#cashflow-tabs button").forEach(function(tab){tab.classList.toggle("active",tab===b)});document.dispatchEvent(new CustomEvent("novapay:dashboard-period",{detail:{period:b.dataset.range}}));return;}renderCashflow(b.dataset.range,true);});});

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
  if(!(window.NovaPayAuth&&window.NovaPayAuth.mode==="supabase"))renderCashflow("30D",false);
  applyChartTheme();
  if(window.NovaPayChartTheme) window.NovaPayChartTheme.onChange(function(){ applyChartTheme(); if(!(window.NovaPayAuth&&window.NovaPayAuth.mode==="supabase")){renderKpis(dateSelect?dateSelect.value:"today",false);renderCashflow(cfRange,false);} });

  function animateHealth(){
    if(window.NovaPayAuth&&window.NovaPayAuth.mode==="supabase")return;
    var ring=document.querySelector(".health-ring"),seg=document.querySelector(".health-segment-main"),value=document.querySelector("[data-health-value]");
    if(!ring||!seg)return;
    var pct=82; seg.style.strokeDasharray=pct+" "+(100-pct); seg.style.strokeDashoffset="100";
    if(motion.reduced()){seg.style.strokeDashoffset="0";if(value)value.textContent="82%";return;}
    var start=performance.now();
    function frame(now){var p=Math.min((now-start)/motion.duration,1),e=1-Math.pow(1-p,3);seg.style.strokeDashoffset=String(100-pct*e);if(value)value.textContent=Math.round(pct*e)+"%";if(p<1)requestAnimationFrame(frame);else if(value)value.textContent="82%";}
    requestAnimationFrame(frame);
  }
  motion.useInView(document.querySelector(".financial-health-card"),animateHealth,{threshold:.2});
  if(!(window.NovaPayAuth&&window.NovaPayAuth.mode==="supabase")){
    motion.useInView(document.querySelector(".kpi-card"),function(){renderKpis(dateSelect?dateSelect.value:"today",true);},{threshold:.12});
    motion.useInView(document.querySelector(".cashflow-card"),function(){renderCashflow(cfRange,true);},{threshold:.12});
  }

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
    var row=document.querySelector('#transactions-table-body tr[data-tx-id="'+CSS.escape(id)+'"]'), d=row?{type:row.dataset.type,ref:row.dataset.txId,amount:row.cells[3].textContent,fee:row.cells[4].textContent,net:row.cells[5].textContent,status:row.dataset.status,time:row.cells[0].textContent,date:row.dataset.date,buyer:row.dataset.buyer,currency:row.dataset.currency,source:row.dataset.source,related:row.dataset.related,ledger:row.dataset.ledger,note:row.dataset.note}:window.NovaPayAuth&&window.NovaPayAuth.mode==="demo"?txData[id]:null; if(!txModal)return;
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
  window.NovaPayOpenTransaction=openTx;
  function closeTx(){
    if(!txModal)return;txModal.hidden=true;txModal.setAttribute("aria-hidden","true");
    document.body.classList.remove("modal-open");
    if(lastFocus&&lastFocus.focus)lastFocus.focus();
  }
  document.addEventListener("click",function(e){var row=e.target.closest(".transaction-row");if(row&&!e.target.closest("button"))openTx(row.dataset.txId);});
  document.addEventListener("keydown",function(e){var row=e.target.closest&&e.target.closest(".transaction-row");if(row&&(e.key==="Enter"||e.key===" ")){e.preventDefault();openTx(row.dataset.txId);}});
  document.querySelectorAll("[data-close-transaction]").forEach(function(b){b.addEventListener("click",closeTx);});
  /* Transaction detail dictation uses the shared authenticated audio-transcription route.
     The AI Assistant remains the only SpeechRecognition instance in the page. */
  (function setupTransactionMic(){
    var mic=$("tx-ai-mic"),row=$("tx-ai-row"),input=$("tx-ai-question"),status=$("tx-voice-status"),wave=$("tx-dict-wave"),okBtn=$("tx-dict-confirm"),noBtn=$("tx-dict-cancel");
    if(!mic||!row||!input)return;
    var recorder=null,stream=null,parts=[],discard=false,pending=false,strands=null;
    function cleanup(){pending=false;if(stream){stream.getTracks().forEach(function(track){track.stop()});stream=null}if(strands){strands.setLevel(0);strands.setListening(false)}row.classList.remove("is-dictating");mic.classList.remove("is-listening");mic.setAttribute("aria-label","Start voice input")}
    function finishRecording(){if(recorder&&recorder.state!=="inactive")recorder.stop()}
    function cancelRecording(){discard=true;finishRecording();cleanup();parts=[];status.textContent=""}
    function startRecording(){
      if(pending||recorder)return;
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder){status.textContent="Audio recording is unavailable here. Type your question instead.";return}
      pending=true;discard=false;parts=[];status.textContent="Listening…";
      navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}).then(function(media){
        if(!pending){media.getTracks().forEach(function(track){track.stop()});return}
        stream=media;var supports=window.MediaRecorder.isTypeSupported?window.MediaRecorder.isTypeSupported.bind(window.MediaRecorder):function(){return false};
        var mime=supports("audio/webm;codecs=opus")?"audio/webm;codecs=opus":supports("audio/ogg;codecs=opus")?"audio/ogg;codecs=opus":supports("audio/mp4")?"audio/mp4":"";
        try{recorder=mime?new window.MediaRecorder(stream,{mimeType:mime}):new window.MediaRecorder(stream)}catch(e){cleanup();status.textContent="Audio recording is unavailable here. Type your question instead.";return}
        if(wave&&window.NovaStrands)strands=window.NovaStrands.create(wave,{listening:true,energy:.12,lightMode:document.documentElement.dataset.theme==="light"});
        recorder.ondataavailable=function(event){if(event.data&&event.data.size)parts.push(event.data)};
        recorder.onerror=function(){discard=true;status.textContent="The microphone recording failed. Try again.";finishRecording()};
        recorder.onstop=function(){
          var blob=new Blob(parts,{type:(recorder&&recorder.mimeType||"audio/webm").split(";")[0]});recorder=null;cleanup();parts=[];
          if(discard){discard=false;return}
          status.textContent="Transcribing…";
          window.NovaPayAssistantClient.transcribe(window.NovaPayApi,blob).then(function(text){input.value=(input.value?input.value.replace(/\s+$/,"")+" ":"")+text;status.textContent="Transcript added. Review it, then choose Ask AI.";input.focus()}).catch(function(error){status.textContent="Voice transcription failed: "+window.NovaPayAssistantClient.errorMessage(error)})
        };
        recorder.start();pending=false;row.classList.add("is-dictating");mic.classList.add("is-listening");mic.setAttribute("aria-label","Stop voice input");status.textContent="Recording. Tap Done to transcribe."
      }).catch(function(){cleanup();status.textContent="Microphone permission is blocked or unavailable."})
    }
    mic.addEventListener("click",function(){if(recorder)finishRecording();else startRecording()});
    if(okBtn)okBtn.addEventListener("click",function(){if(recorder)finishRecording()});
    if(noBtn)noBtn.addEventListener("click",cancelRecording);
    document.addEventListener("keydown",function(event){if(!recorder)return;if(event.key==="Escape"){event.preventDefault();event.stopPropagation();cancelRecording()}else if(event.key==="Enter"&&!event.isComposing){event.preventDefault();event.stopPropagation();finishRecording()}},true);
    if(txModal)new MutationObserver(function(){if(txModal.hidden)cancelRecording()}).observe(txModal,{attributes:true,attributeFilter:["hidden"]});
    window.addEventListener("pagehide",cancelRecording);
  })();
  $("tx-ai-ask").addEventListener("click",function(){var q=$("tx-ai-question").value.trim();if(!q||!selectedTransaction)return;var d=selectedTransaction;$("tx-ai-answer").textContent="Thinking…";$("tx-ai-answer").dataset.proposal="";if(window.NovaLive&&NovaLive.askTransaction)NovaLive.askTransaction(d,q).then(function(result){$("tx-ai-answer").textContent=result.reply||"No answer was returned.";$("tx-ai-answer").dataset.proposal=result.proposal?JSON.stringify(result.proposal):""},function(error){$("tx-ai-answer").textContent="AI service unavailable. Please retry. ("+((error&&error.code)||"API_ERROR")+")"});else $("tx-ai-answer").textContent="AI service unavailable. Please retry.";});
  $("tx-send-approval").addEventListener("click",function(){if(!selectedTransaction)return;var answer=$("tx-ai-answer"),reason=answer.textContent.trim();if(!reason||reason.indexOf("Thinking")===0){showToast("Ask the AI and review its finding first.");return}var p=null;try{p=JSON.parse(answer.dataset.proposal||"null")}catch(e){}if(!p||["refund","dispute-evidence","hold-payout"].indexOf(p.type)<0){showToast("There is no actionable AI finding to send.");return}if(window.NovaLive&&NovaLive.addProposal){p.reason=p.reason||reason;p.txId=selectedTransaction.ref;p.display=selectedTransaction.amount;p.source=p.source||"NovaPay AI";p.simulatedOnly=true;NovaLive.addProposal(p);closeTx();location.hash="#approvals";showToast("Finding sent to Approvals for human review.")}else showToast("Approvals service is unavailable.")});
  document.addEventListener("keydown",function(e){
    if(!txModal||txModal.hidden)return;
    if(e.key==="Escape")closeTx();
    if(e.key==="Tab"){var f=txModal.querySelectorAll("button"),a=f[0],z=f[f.length-1];
      if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus();}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}}
  });
  var txReset=$("tx-reset");if(txReset)txReset.addEventListener("click",function(){txSearch.value="";txType.value="";$("tx-status").value="";$("tx-payment-check").value="";$("tx-from").value="";$("tx-to").value="";$("tx-min").value="";$("tx-max").value="";filterTx();txSearch.focus();});
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
  /* Desktop/tablet sidebar collapse (arrow in the navigation bar) */
  var sbClose=$("sidebar-collapse"), sbOpen=$("sidebar-reopen"), sbKey="novapay-sidebar-collapsed";
  function setSidebar(collapsed,persist){
    document.body.classList.toggle("sidebar-collapsed",!!collapsed);
    if(sbClose) sbClose.setAttribute("aria-expanded",String(!collapsed));
    if(sbOpen){ sbOpen.hidden=!collapsed; sbOpen.setAttribute("aria-expanded",String(!collapsed)); }
    if(persist){ try{ localStorage.setItem(sbKey,collapsed?"1":"0"); }catch(e){} }
  }
  if(sbClose) sbClose.addEventListener("click",function(){ setSidebar(true,true); if(sbOpen) sbOpen.focus(); });
  if(sbOpen) sbOpen.addEventListener("click",function(){ setSidebar(false,true); if(sbClose) sbClose.focus(); });
  try{ if(localStorage.getItem(sbKey)==="1") setSidebar(true,false); }catch(e){}

  /* Mobile AI bottom sheet */
  var aiFab=$("mobile-ai-fab"), aiView=$("view-ai-assistant");
  if(aiFab && aiView){
    function syncAiSheet(){
      var mobile=matchMedia("(max-width: 700px)").matches;
      var active=location.hash==="#ai-assistant";
      aiView.classList.toggle("ai-sheet-open",mobile&&active);
    }
    aiFab.addEventListener("click",function(){activate("ai-assistant",true);syncAiSheet();});
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
  /* Demo feedback for otherwise non-destructive controls. */
  document.addEventListener("click",function(e){
    var b=e.target.closest("button[data-demo-feedback]");
    if(b) showToast(b.getAttribute("data-demo-feedback"));
  });

  document.querySelectorAll(".report-card button").forEach(function(b){
    b.addEventListener("click",function(){activate("reports",true);showToast("Report opened with sample data.");});
  });
})();
