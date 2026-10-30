(function(){
  "use strict";
  var $=function(id){return document.getElementById(id);};
  var toast=$("dashboard-toast"), toastTimer;
  function showToast(msg){toast.textContent=msg;toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(function(){toast.classList.remove("show");},3000);}
  function getUser(){
    try{
      var raw=localStorage.getItem("novapay-demo-user");
      if(raw)return JSON.parse(raw);
    }catch(e){}
    return {name:"NovaPay User",email:"user@novapay.app"};
  }
  var user=getUser();
  try{if(localStorage.getItem("novapay-demo-auth")!=="true"){location.replace("preview.html#login");return;}}catch(e){location.replace("preview.html#login");return;}
  $("user-name").textContent=user.name||"NovaPay User";
  $("user-email").textContent=user.email||"user@novapay.app";
  $("user-avatar").textContent=(user.name||"F").trim().charAt(0).toUpperCase();

  var THEME_KEY="novapay-theme", root=document.documentElement;
  function savedTheme(){try{var t=localStorage.getItem(THEME_KEY);return t==="light"||t==="dark"?t:null}catch(e){return null}}
  function currentTheme(){return savedTheme()||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}
  function applyTheme(t){root.setAttribute("data-theme",t);var dark=t==="dark";($("dashboard-theme").querySelector(".fx-sun")||$("dashboard-theme")).textContent=dark?"☾":"☼";$("dashboard-theme").setAttribute("aria-pressed",String(dark));$("dashboard-theme").setAttribute("aria-label",dark?"Switch to light theme":"Switch to dark theme")}
  $("dashboard-theme").addEventListener("click",function(){var t=currentTheme()==="dark"?"light":"dark";try{localStorage.setItem(THEME_KEY,t)}catch(e){}applyTheme(t)});
  applyTheme(currentTheme());

  var panels=document.querySelectorAll("[data-view-panel]"), nav=document.querySelectorAll("#dashboard-nav a[data-view]"), title=$("page-title");
  var titles={dashboard:"Dashboard",transactions:"Transactions","ai-assistant":"AI Assistant",approvals:"Approvals",sandbox:"PayPal Sandbox",ledger:"Ledger",invoices:"Invoices",reports:"Reports",documents:"Documents","community-funds":"Community Funds",maintenance:"Maintenance",settings:"Settings"};
  function canonicalView(view){return view==="fundraising"||view==="transparency"?"community-funds":view;}
  function applyView(view,writeHash,preserveScroll){
    view=canonicalView(view);
    if(!titles[view])view="dashboard";
    panels.forEach(function(p){p.hidden=p.id!=="view-"+view});
    nav.forEach(function(a){a.setAttribute("aria-current",a.dataset.view===view?"page":"false")});
    title.textContent=titles[view];
    var subs={transactions:"TRANSACTIONS","ai-assistant":"NOVAPAY AI \u00b7 MERCHANT ASSISTANT",approvals:"HUMAN-IN-THE-LOOP",sandbox:"PAYPAL DEVELOPER PLATFORM",ledger:"FINANCIAL CORE",invoices:"FINANCE UTILITIES",reports:"FINANCE UTILITIES",documents:"DOCUMENTS & OCR","community-funds":"COMMUNITY FUNDS",maintenance:"COMMUNITY OPERATIONS",settings:"PREFERENCES"},aiKick=$("ai-top-kicker"); if(aiKick){aiKick.textContent=subs[view]||"";aiKick.hidden=!subs[view]}
    if(writeHash&&location.hash!=="#"+view)history.pushState(null,"","#"+view);
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
      document.startViewTransition(function(){
        if(current)current.classList.remove("module-transition-active");
        next.classList.add("module-transition-active");
        applyView(view,writeHash,preserveScroll);
      }).finished.finally(function(){panels.forEach(function(p){p.classList.remove("module-transition-active")})});
    }else applyView(view,writeHash,preserveScroll);
  }
  window.NovaPayActivateView=activate;
  function startView(){var v="dashboard";try{var st=JSON.parse(localStorage.getItem("novapay-settings")||"{}");if(st&&titles[st.landing])v=st.landing}catch(e){}return v}
  function route(initial){var h=location.hash.slice(1);if(!h&&initial===true){var v=startView();if(v!=="dashboard")history.replaceState(null,"","#"+v);activate(v,false);return}activate(h||"dashboard",false)}
  nav.forEach(function(a){a.addEventListener("click",function(){activate(a.dataset.view,true)})});
  window.addEventListener("hashchange",function(){route()}); window.addEventListener("popstate",function(){route()}); route(true);

  $("logout").addEventListener("click",function(){
    try{localStorage.removeItem("novapay-demo-auth")}catch(e){}
    window.location.href="preview.html#home";
  });

  document.querySelectorAll(".table-action,.report-card .table-action").forEach(function(b){
    b.addEventListener("click",function(){showToast("Sample action selected — no live transaction is changed.");});
  });

  function assistantRecords(){return [].slice.call(document.querySelectorAll("#transactions-table-body tr")).map(function(r){var source=r.dataset.source==="paypal-sandbox"?"PayPal Sandbox":"Illustrative sample data";return{id:r.dataset.txId||"Unavailable",type:r.dataset.type||"Unavailable",status:r.dataset.status||"Unavailable",date:r.dataset.date||"Unavailable",buyer:r.dataset.buyer||"Unavailable",gross:r.cells[3]?r.cells[3].textContent:"Unavailable",fee:r.cells[4]?r.cells[4].textContent:"Unavailable",net:r.cells[5]?r.cells[5].textContent:"Unavailable",currency:r.dataset.currency||"Unavailable",source:source}})}
  function updateAiDataStatus(){var rows=assistantRecords(),hasSandbox=rows.some(function(r){return r.source==="PayPal Sandbox"}),hasDemo=rows.some(function(r){return r.source==="Illustrative sample data"}),el=$("ai-data-status");if(el)el.textContent=hasSandbox&&hasDemo?"Data available: PayPal Sandbox captures and illustrative sample examples.":hasSandbox?"Data available: PayPal Sandbox captures made in this workspace.":hasDemo?"Data available: illustrative sample data only; no live transaction records are loaded.":"No transaction data is available. Connect the backend and capture a sandbox payment to add records."}
  window.NovaPayAssistant={refreshStatus:updateAiDataStatus};
  var aiTypeSeq=0;
  function appendAiMessage(q,response){
    var box=$("ai-conversation");if(!box)return;
    var user=document.createElement("div"),ud=document.createElement("div"),up=document.createElement("p");user.className="ai-bubble ai-bubble--user";ud.appendChild(up);up.textContent=q;user.appendChild(ud);
    var bot=document.createElement("div"),bd=document.createElement("div"),name=document.createElement("b"),p=document.createElement("p");bot.className="ai-bubble ai-bubble--assistant";name.textContent="NovaPay";p.textContent=response.reply;bd.appendChild(name);bd.appendChild(p);bot.appendChild(bd);
    /* Finish any earlier typing so only the newest answer animates. */
    [].forEach.call(box.querySelectorAll(".text-type"),function(n){if(n.__textType)n.__textType.finish()});
    box.appendChild(user);box.appendChild(bot);box.scrollTop=box.scrollHeight;
    var seq=++aiTypeSeq;
    /* Evidence, mode label and proposal appear once the reply has finished typing. */
    function reveal(){
      if(bd.querySelector(".ai-evidence,.ai-answer-mode"))return;
      if(response.evidence&&response.evidence.length){var ev=document.createElement("p");ev.className="ai-evidence";ev.textContent="Evidence: "+response.evidence.join(" · ");bd.appendChild(ev)}
      if(response.mode){var mode=document.createElement("small");mode.className="ai-answer-mode";mode.textContent=response.mode;bd.appendChild(mode)}
      box.scrollTop=box.scrollHeight;
      if(response.proposal&&seq===aiTypeSeq)renderAssistantProposal(response.proposal,assistantRecords());
    }
    if(window.NovaTextType&&prefs.aiTyping){
      NovaTextType(p,{text:response.reply,typingSpeed:14,typeEffect:"fade",mistakes:0,cursorStyle:"bar",cursorGlide:true,showCursor:true,loop:false,hideCursorOnComplete:true,onUpdate:function(){box.scrollTop=box.scrollHeight},onTypingComplete:reveal});
    }else reveal();
  }
  function localAnswer(q,records){var usable=records.filter(function(r){return r.id!=="Unavailable"}),evidence=usable.map(function(r){return r.id+" ("+r.type+", "+r.gross+", "+r.status+")"}),k=q.toLowerCase();if(!usable.length)return{reply:"I can’t answer from transaction records because none are available. Start the backend and capture a PayPal Sandbox payment, or review the illustrative examples when they are loaded.",evidence:[],mode:"Local fallback · no transaction data"};var selected;if(/fee/.test(k))selected=usable.filter(function(r){return r.fee!=="Unavailable"&&r.fee.indexOf("not returned")<0});else if(/refund/.test(k))selected=usable.filter(function(r){return /refund/i.test(r.type)});else if(/attention|unusual|explain/.test(k))selected=usable.filter(function(r){return /review|duplicate|refund/i.test(r.status+" "+r.type)});else selected=usable.slice(0,6);if(!selected.length)return{reply:"The available rows do not contain enough evidence to answer that. Try asking about a transaction ID, its displayed status, amount, or fee.",evidence:[],mode:"Local fallback · based on available workspace data"};return{reply:"I can summarize the records currently shown, but this local fallback does not determine whether activity is fraudulent or unusual. "+selected.length+" matching record(s) are available; review their details in Transactions.",evidence:selected.map(function(r){return r.id+" · "+r.gross+" · fee "+r.fee+" · "+r.status+" · "+r.source}),mode:"Local fallback · illustrative values are not live PayPal activity"}}
  function renderAssistantProposal(proposal,records){var slot=$("ai-proposal-slot");slot.textContent="";var ref=String(proposal.txId||""),row=records.find(function(r){return r.id===ref}),knownType=["refund","dispute-evidence","hold-payout"].indexOf(proposal.type)>-1,sourceRow=row&&document.querySelector('#transactions-table-body tr[data-tx-id="'+CSS.escape(row.id)+'"]'),sandboxRefund=!!(row&&row.source==="PayPal Sandbox"&&proposal.type==="refund"&&row.currency==="USD"&&Number(sourceRow&&sourceRow.dataset.amount)>0),card=document.createElement("article"),title=document.createElement("h4"),copy=document.createElement("p"),dl=document.createElement("dl"),button=document.createElement("button"),reason=String(proposal.reason||"No reason supplied."),canSend=!!row&&knownType&&(proposal.type!=="refund"||row.source!=="PayPal Sandbox"||sandboxRefund);card.className="ai-proposal-card";card.tabIndex=-1;title.textContent=knownType?({refund:"Refund suggestion","dispute-evidence":"Dispute evidence suggestion","hold-payout":"Payout review suggestion"}[proposal.type]):"Informational finding · simulated only";copy.textContent=reason;card.appendChild(document.createTextNode("AI suggestion for review"));var mode=document.createElement("span");mode.className="status info";mode.textContent=sandboxRefund?"PayPal Sandbox · approval required":"Simulated only";card.appendChild(mode);card.appendChild(title);card.appendChild(copy);[["Reference",ref||"Unavailable"],["Amount",row?row.gross:"Unavailable"],["Currency",row?row.currency:"Unavailable"],["Source",row?row.source:"NovaPay AI"]].forEach(function(pair){var wrap=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=pair[0];dd.textContent=pair[1];wrap.appendChild(dt);wrap.appendChild(dd);dl.appendChild(wrap)});card.appendChild(dl);button.type="button";button.className="btn btn--primary";button.textContent="Send to Approvals";button.disabled=!canSend;button.addEventListener("click",function(){if(!canSend)return;var item={type:proposal.type,txId:row.id,title:String(proposal.title||title.textContent),reason:reason,display:row.gross,source:"NovaPay AI",simulatedOnly:true,requiresSandbox:sandboxRefund,evidence:row.id+" · "+row.type+" · "+row.gross+" · "+row.status};if(sandboxRefund){item.captureId=row.id;item.currency="USD";item.usd=Number(sourceRow.dataset.amount);item.simulatedOnly=false}NovaLive.addProposal(item);button.disabled=true;button.textContent="Sent to Approvals";$("ai-live-status").textContent="Proposal sent to Approvals. Review it there before any action."});card.appendChild(button);if(!row){var note=document.createElement("p");note.className="ai-proposal-warning";note.textContent="This proposal has no matching transaction reference in the available data, so it cannot be sent as an actionable item.";card.appendChild(note)}else if(!knownType){var note2=document.createElement("p");note2.className="ai-proposal-warning";note2.textContent="This action type is not supported and will remain informational; no action can be attempted.";card.appendChild(note2)}else if(proposal.type==="refund"&&row.source==="PayPal Sandbox"&&!sandboxRefund){var note3=document.createElement("p");note3.className="ai-proposal-warning";note3.textContent="This capture is missing a supported USD amount, so the refund suggestion cannot be sent as an actionable item.";card.appendChild(note3)}slot.appendChild(card);card.focus()}
  var aiBusy=false;
  function ask(q){q=(q||"").trim();if(!q||aiBusy)return;aiBusy=true;var records=assistantRecords(),box=$("ai-conversation"),status=$("ai-live-status"),send=$("ai-send");$("ai-proposal-slot").textContent="";status.textContent="Preparing an answer…";send.disabled=true;var thoughts=(window.NovaThoughts&&prefs.aiThoughts)?NovaThoughts.create(box):null,pending=thoughts?thoughts.el:document.createElement("p");if(!thoughts){pending.className="ai-loading";pending.setAttribute("role","status");pending.textContent="NovaPay is reviewing the available records…";box.appendChild(pending)}box.scrollTop=box.scrollHeight;var finish=function(response){var go=function(){pending.remove();appendAiMessage(q,response);status.textContent="Answer ready.";send.disabled=false;aiBusy=false};if(thoughts)thoughts.complete(go);else go()};if(window.NovaLive&&NovaLive.live.ai){NovaLive.assistantChat(q,records).then(finish,function(){var svc=$("ai-service-status");if(svc){svc.textContent="AI service unavailable · Local fallback";svc.className="status warn";}finish(localAnswer(q,records))})}else{setTimeout(function(){finish(localAnswer(q,records))},250)}}
  var aiAttachmentText="";
  function askFromComposer(){var input=$("ai-input"),q=input.value.trim();if(aiAttachmentText)q=(q||"Please review the attached file.")+"\n\nAttached file content:\n"+aiAttachmentText;if(q&&!aiBusy){ask(q);input.value="";aiAttachmentText="";$("ai-attachment").hidden=true;$("ai-file-input").value=""}}
  $("ai-send").addEventListener("click",askFromComposer);
  $("ai-input").addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.isComposing){e.preventDefault();askFromComposer()}});
  (function setupAssistantTools(){
    var fileInput=$("ai-file-input"),upload=$("ai-upload"),attachment=$("ai-attachment"),attachmentName=$("ai-attachment-name"),removeFile=$("ai-attachment-remove"),mic=$("ai-mic"),visualizer=$("ai-voice-visualizer"),voiceLabel=$("ai-voice-label"),stopMic=$("ai-mic-stop"),bars=visualizer&&visualizer.querySelector(".ai-voice-bars"),recognition=null,stream=null,audioContext=null,raf=0;

    function clearFile(){aiAttachmentText="";if(fileInput)fileInput.value="";if(attachment)attachment.hidden=true}
    if(upload&&fileInput){upload.addEventListener("click",function(){fileInput.click()});fileInput.addEventListener("change",function(){var file=fileInput.files&&fileInput.files[0];if(!file)return;if(file.size>1024*1024){clearFile();$("ai-live-status").textContent="Choose a text file smaller than 1 MB.";return}var reader=new FileReader();reader.onload=function(){aiAttachmentText=String(reader.result||"");attachmentName.textContent=file.name;attachment.hidden=false;$("ai-live-status").textContent="Attached “"+file.name+"”. Its text will be included with your next question."};reader.onerror=function(){clearFile();$("ai-live-status").textContent="Could not read that file. Please try another text file."};reader.readAsText(file)})}
    if(removeFile)removeFile.addEventListener("click",clearFile);
    var row=mic&&mic.closest(".ai-chat-row"),wave=$("ai-dict-wave"),timeEl=$("ai-dict-time"),okBtn=$("ai-dict-confirm"),noBtn=$("ai-dict-cancel"),
        active=false,pending=false,buffer="",interim="",startedAt=0,timerId=0,peak=0,lastPush=0,
        strands=window.NovaStrands&&window.NovaStrands.create(wave,{listening:true,energy:.12,lightMode:document.documentElement.dataset.theme==="light"});
    function cleanup(){
      active=false;pending=false;cancelAnimationFrame(raf);raf=0;clearInterval(timerId);timerId=0;
      if(recognition){var r=recognition;recognition=null;r.onend=null;r.onerror=null;r.onresult=null;try{r.abort()}catch(e){}}
      if(stream){stream.getTracks().forEach(function(t){t.stop()});stream=null}
      if(audioContext){try{audioContext.close()}catch(e){}audioContext=null}
      if(strands){strands.setLevel(0);strands.setListening(false)}
      if(row)row.classList.remove("is-dictating");
      if(mic){mic.classList.remove("is-listening");mic.setAttribute("aria-label","Start voice input")}
    }
    function cancelDictation(){cleanup();buffer="";interim=""}
    function confirmDictation(){
      var text=(buffer+" "+interim).replace(/\s+/g," ").trim();cleanup();buffer="";interim="";
      var input=$("ai-input");
      if(text){input.value=(input.value?input.value.replace(/\s+$/,"")+" ":"")+text;$("ai-live-status").textContent=""}
      else $("ai-live-status").textContent="No speech was detected. Try again.";
      input.focus()
    }
    function stopListening(){if(active||pending)confirmDictation()}
    function monitor(analyser){
      var td=new Uint8Array(analyser.fftSize);peak=0;lastPush=performance.now();if(strands)strands.setListening(true);
      function frame(now){
        analyser.getByteTimeDomainData(td);var sum=0;
        for(var q=0;q<td.length;q++){var d=(td[q]-128)/128;sum+=d*d}
        var lvl=Math.min(1,Math.sqrt(sum/td.length)*5);peak=Math.max(lvl,peak*.82);
        if(strands)strands.setLevel(peak);
        if(now-lastPush>=60){peak*=.25;lastPush=now}
        raf=requestAnimationFrame(frame)
      }
      raf=requestAnimationFrame(frame)
    }
    function startListening(){
      var Speech=window.SpeechRecognition||window.webkitSpeechRecognition,status=$("ai-live-status");
      if(!Speech){status.textContent="Voice input is not supported by this browser. Use Chrome or Edge, or type your question.";return}
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){status.textContent="Microphone access requires a supported browser on HTTPS or localhost.";return}
      if(active||pending)return;pending=true;status.textContent="";mic.classList.add("is-listening");buffer="";interim="";
      navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}).then(function(media){
        if(!pending){media.getTracks().forEach(function(t){t.stop()});return}
        pending=false;active=true;stream=media;
        var Ctx=window.AudioContext||window.webkitAudioContext;
        if(Ctx){audioContext=new Ctx();var analyser=audioContext.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.4;audioContext.createMediaStreamSource(stream).connect(analyser);monitor(analyser)}
        row.classList.add("is-dictating");mic.setAttribute("aria-label","Stop voice input");
        startedAt=Date.now();timeEl.textContent="0:00";timerId=setInterval(function(){var sec=Math.floor((Date.now()-startedAt)/1000);timeEl.textContent=Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0")},250);
        recognition=new Speech();recognition.lang=navigator.language||"en-US";recognition.interimResults=true;recognition.continuous=true;
        recognition.onresult=function(e){var fin="",tmp="";for(var i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)fin+=e.results[i][0].transcript;else tmp+=e.results[i][0].transcript}if(fin)buffer=(buffer?buffer+" ":"")+fin.trim();interim=tmp};
        recognition.onerror=function(e){if(e.error==="not-allowed"||e.error==="service-not-allowed"){cancelDictation();status.textContent="Microphone permission denied."}else if(e.error==="network"||e.error==="audio-capture"){cancelDictation();status.textContent=e.error==="network"?"Speech service is unreachable. Check your connection.":"No microphone was found."}};
        recognition.onend=function(){if(!active||!recognition)return;if(interim){buffer=(buffer?buffer+" ":"")+interim.trim();interim=""}try{recognition.start()}catch(err){}};
        try{recognition.start()}catch(err){}
      }).catch(function(){cancelDictation();status.textContent="Microphone access was denied or is unavailable."})
    }
    if(mic)mic.addEventListener("click",function(){if(active||pending)confirmDictation();else startListening()});
    if(okBtn)okBtn.addEventListener("click",confirmDictation);if(noBtn)noBtn.addEventListener("click",cancelDictation);
    document.addEventListener("keydown",function(e){if(!active)return;if(e.key==="Escape"){e.preventDefault();cancelDictation()}else if(e.key==="Enter"&&!e.isComposing){e.preventDefault();e.stopPropagation();confirmDictation()}},true);
    window.addEventListener("pagehide",stopListening);
  })();
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
      ["Unavailable","↩ Refund","Unavailable","INR 2,000.00","Unavailable","-INR 2,000.00","Refunded (Simulated)","REF-28491"].forEach(function(v){var td=document.createElement("td");if(v==="↩ Refund"){td.innerHTML='<span class="tx-badge refund"></span> Refund'}else{td.textContent=v}r.appendChild(td)});
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
  function signOutInactive(){try{localStorage.setItem("novapay-signout-reason","inactive");localStorage.removeItem("novapay-demo-auth")}catch(e){}location.replace("preview.html#login");}
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
    document.querySelectorAll(".notification-item").forEach(function(it){var kind=it.dataset.notifKind,show=kind==="approvals"?!!prefs.approvalAlerts:kind==="ai"?!!prefs.aiAlerts:true;it.hidden=!show;if(show)visible++;});
    var badge=$("notif-count");if(badge)badge.textContent=visible?visible+" new":"All clear";
    var dot=document.querySelector(".notification-dot");if(dot)dot.hidden=!visible;
    var empty=$("notif-empty");if(empty)empty.hidden=visible>0;
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
  function saveProfile(){
    var n=setName.value.trim().replace(/\s+/g," ");
    if(!n){showToast("Please enter a display name.");setName.focus();return;}
    user.name=n;try{localStorage.setItem("novapay-demo-user",JSON.stringify(user))}catch(e){}
    /* Keep the name after the next sign-in: the sign-in page rebuilds the user from the saved account. */
    var accts=getAccts();if(accts[acctEmail]||acctEmail===DEMO_EMAIL){accts[acctEmail]=Object.assign({},accts[acctEmail],{name:n});putAccts(accts);}
    $("user-name").textContent=n;$("user-avatar").textContent=n.charAt(0).toUpperCase();
    var g=$("greeting-name");if(g)g.textContent=n.split(/\s+/)[0];
    if($("pm-title")){$("pm-title").textContent=n;$("pm-name").textContent=n;$("pm-avatar").textContent=n.charAt(0).toUpperCase();}
    showToast("Profile saved.");
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
      pwSay("This account signs in with Google, so there is no NovaPay password to change.","");
    }
    pwForm.addEventListener("submit",function(e){
      e.preventDefault();
      var cur=$("set-pw-current").value,next=$("set-pw-new").value,again=$("set-pw-confirm").value,real=storedPassword();
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
    var data={exportedAt:new Date().toISOString(),profile:{name:user.name||"",email:user.email||"",role:"Business Owner"},preferences:Object.assign({},prefs,{theme:savedTheme()||"system"}),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||"",currency:"INR"};
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
    var builtIn=acctEmail===DEMO_EMAIL;
    confirmDialog({title:"Delete your account?",text:builtIn?"This signs you out and erases all NovaPay data saved in this browser, including your preferences and any password you set. The built-in demo login will still work with its default password.":"This permanently removes your account and all NovaPay data saved in this browser, then signs you out. You will need to sign up again.",confirm:"Delete account"},function(){
      var accts=getAccts();delete accts[acctEmail];putAccts(accts);
      try{
        var keys=[],i,k;for(i=0;i<localStorage.length;i++){k=localStorage.key(i);if(k&&k.indexOf("novapay-")===0&&k!==ACCT_KEY)keys.push(k);}
        keys.forEach(function(key){localStorage.removeItem(key)});
        keys=[];for(i=0;i<sessionStorage.length;i++){k=sessionStorage.key(i);if(k&&k.indexOf("novapay-")===0)keys.push(k);}
        keys.forEach(function(key){sessionStorage.removeItem(key)});
      }catch(e){}
      window.location.href="preview.html#home";
    });
  });

  /* Keep other open tabs in step: settings, theme and sign-out. */
  window.addEventListener("storage",function(e){
    if(e.key===SET_KEY){prefs=loadSet();syncControls();applyPrefs();}
    else if(e.key===THEME_KEY){applyTheme(currentTheme());syncControls();}
    else if(e.key==="novapay-demo-auth"&&e.newValue!=="true"){location.replace("preview.html#home");}
  });
  /* Profile details dialog (sidebar user chip) */
  var pm=$("profile-modal"),pmOpener=null;
  function fillProfile(){
    var n=$("user-name").textContent;
    $("pm-title").textContent=n;$("pm-name").textContent=n;$("pm-avatar").textContent=n.charAt(0).toUpperCase();
    $("pm-email").textContent=user.email||"user@novapay.app";
    $("pm-tz").textContent=Intl.DateTimeFormat().resolvedOptions().timeZone||"Local";
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
  $("user-email").textContent="Business Owner";
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
  if(dateSelect){dateSelect.addEventListener("change",function(){renderKpis(dateSelect.value, true);showToast("Dashboard date set to "+dateSelect.options[dateSelect.selectedIndex].text+". Sample data remains illustrative.");});}
  renderKpis("today", false);
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
  document.querySelectorAll("#cashflow-tabs button").forEach(function(b){b.addEventListener("click",function(){renderCashflow(b.dataset.range,true);});});

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
  applyChartTheme();
  if(window.NovaPayChartTheme) window.NovaPayChartTheme.onChange(function(){ applyChartTheme(); renderKpis(dateSelect?dateSelect.value:"today",false); renderCashflow(cfRange,false); });

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
  /* Transaction detail voice input: same dictation behaviour as the AI assistant mic. */
  (function setupTransactionMic(){
    var mic=$("tx-ai-mic"),row=$("tx-ai-row"),input=$("tx-ai-question"),status=$("tx-voice-status"),wave=$("tx-dict-wave"),timeEl=$("tx-dict-time"),okBtn=$("tx-dict-confirm"),noBtn=$("tx-dict-cancel");
    if(!mic||!row||!input)return;
    var recognition=null,stream=null,audioContext=null,raf=0,active=false,pending=false,buffer="",interim="",startedAt=0,timerId=0,peak=0,lastPush=0,strands=null;
    function ensureStrands(){if(!strands&&window.NovaStrands&&wave)strands=window.NovaStrands.create(wave,{listening:true,energy:.12,lightMode:document.documentElement.dataset.theme==="light"});return strands}
    function cleanup(){
      active=false;pending=false;cancelAnimationFrame(raf);raf=0;clearInterval(timerId);timerId=0;
      if(recognition){var r=recognition;recognition=null;r.onend=null;r.onerror=null;r.onresult=null;try{r.abort()}catch(e){}}
      if(stream){stream.getTracks().forEach(function(t){t.stop()});stream=null}
      if(audioContext){try{audioContext.close()}catch(e){}audioContext=null}
      if(strands){strands.setLevel(0);strands.setListening(false)}
      row.classList.remove("is-dictating");mic.classList.remove("is-listening");mic.setAttribute("aria-label","Start voice input")
    }
    function cancelDictation(){cleanup();buffer="";interim=""}
    function confirmDictation(){
      var text=(buffer+" "+interim).replace(/\s+/g," ").trim();cleanup();buffer="";interim="";
      if(text){input.value=(input.value?input.value.replace(/\s+$/,"")+" ":"")+text;status.textContent=""}
      else status.textContent="No speech was detected. Try again.";
      input.focus()
    }
    function monitor(analyser){
      var td=new Uint8Array(analyser.fftSize);peak=0;lastPush=performance.now();if(strands)strands.setListening(true);
      function frame(now){
        analyser.getByteTimeDomainData(td);var sum=0;
        for(var q=0;q<td.length;q++){var d=(td[q]-128)/128;sum+=d*d}
        var lvl=Math.min(1,Math.sqrt(sum/td.length)*5);peak=Math.max(lvl,peak*.82);
        if(strands)strands.setLevel(peak);
        if(now-lastPush>=60){peak*=.25;lastPush=now}
        raf=requestAnimationFrame(frame)
      }
      raf=requestAnimationFrame(frame)
    }
    function startListening(){
      var Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(!Speech){status.textContent="Voice input is not supported by this browser. Use Chrome or Edge, or type your question.";return}
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){status.textContent="Microphone access requires a supported browser on HTTPS or localhost.";return}
      if(active||pending)return;pending=true;status.textContent="";mic.classList.add("is-listening");buffer="";interim="";
      navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}).then(function(media){
        if(!pending){media.getTracks().forEach(function(t){t.stop()});return}
        pending=false;active=true;stream=media;
        row.classList.add("is-dictating");ensureStrands();
        var Ctx=window.AudioContext||window.webkitAudioContext;
        if(Ctx){audioContext=new Ctx();var analyser=audioContext.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.4;audioContext.createMediaStreamSource(stream).connect(analyser);monitor(analyser)}
        mic.setAttribute("aria-label","Stop voice input");
        startedAt=Date.now();timeEl.textContent="0:00";timerId=setInterval(function(){var sec=Math.floor((Date.now()-startedAt)/1000);timeEl.textContent=Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0")},250);
        recognition=new Speech();recognition.lang=navigator.language||"en-US";recognition.interimResults=true;recognition.continuous=true;
        recognition.onresult=function(e){var fin="",tmp="";for(var i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)fin+=e.results[i][0].transcript;else tmp+=e.results[i][0].transcript}if(fin)buffer=(buffer?buffer+" ":"")+fin.trim();interim=tmp};
        recognition.onerror=function(e){if(e.error==="not-allowed"||e.error==="service-not-allowed"){cancelDictation();status.textContent="Microphone permission denied."}else if(e.error==="network"||e.error==="audio-capture"){cancelDictation();status.textContent=e.error==="network"?"Speech service is unreachable. Check your connection.":"No microphone was found."}};
        recognition.onend=function(){if(!active||!recognition)return;if(interim){buffer=(buffer?buffer+" ":"")+interim.trim();interim=""}try{recognition.start()}catch(err){}};
        try{recognition.start()}catch(err){}
      }).catch(function(){cancelDictation();status.textContent="Microphone access was denied or is unavailable."})
    }
    mic.addEventListener("click",function(){if(active||pending)confirmDictation();else startListening()});
    okBtn.addEventListener("click",confirmDictation);noBtn.addEventListener("click",cancelDictation);
    document.addEventListener("keydown",function(e){if(!active)return;if(e.key==="Escape"){e.preventDefault();e.stopPropagation();cancelDictation()}else if(e.key==="Enter"&&!e.isComposing){e.preventDefault();e.stopPropagation();confirmDictation()}},true);
    /* Stop the mic whenever the popup closes, and start clean when it opens. */
    if(txModal)new MutationObserver(function(){if(txModal.hidden){cancelDictation();status.textContent=""}}).observe(txModal,{attributes:true,attributeFilter:["hidden"]});
    window.addEventListener("pagehide",cancelDictation);
  })();
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
