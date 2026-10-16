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
    return {name:"NovaPay Demo User",email:"demo@novapay.app"};
  }
  var user=getUser();
  try{if(localStorage.getItem("novapay-demo-auth")!=="true"){location.replace("preview.html#login");return;}}catch(e){location.replace("preview.html#login");return;}
  $("user-name").textContent=user.name||"NovaPay Demo User";
  $("user-email").textContent=user.email||"demo@novapay.app";
  $("user-avatar").textContent=(user.name||"F").trim().charAt(0).toUpperCase();

  var THEME_KEY="novapay-theme", root=document.documentElement;
  function savedTheme(){try{var t=localStorage.getItem(THEME_KEY);return t==="light"||t==="dark"?t:null}catch(e){return null}}
  function currentTheme(){return savedTheme()||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}
  function applyTheme(t){root.setAttribute("data-theme",t);var dark=t==="dark";$("dashboard-theme").textContent=dark?"☾":"☼";$("dashboard-theme").setAttribute("aria-pressed",String(dark));$("dashboard-theme").setAttribute("aria-label",dark?"Switch to light theme":"Switch to dark theme")}
  $("dashboard-theme").addEventListener("click",function(){var t=currentTheme()==="dark"?"light":"dark";try{localStorage.setItem(THEME_KEY,t)}catch(e){}applyTheme(t)});
  applyTheme(currentTheme());

  var panels=document.querySelectorAll("[data-view-panel]"), nav=document.querySelectorAll("#dashboard-nav a[data-view]"), title=$("page-title");
  var titles={dashboard:"Dashboard",transactions:"Transactions",ledger:"Ledger","ai-assistant":"AI Assistant",approvals:"Approvals",anomalies:"Anomalies",sandbox:"PayPal Sandbox"};
  function activate(view,writeHash){
    if(!titles[view])view="dashboard";
    panels.forEach(function(p){p.hidden=p.id!=="view-"+view});
    nav.forEach(function(a){a.setAttribute("aria-current",a.dataset.view===view?"page":"false")});
    title.textContent=titles[view];
    if(writeHash&&location.hash!=="#"+view)history.pushState(null,"","#"+view);
    window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  }
  function route(){activate(location.hash.slice(1)||"dashboard",false)}
  nav.forEach(function(a){a.addEventListener("click",function(){activate(a.dataset.view,true)})});
  window.addEventListener("hashchange",route); window.addEventListener("popstate",route); route();

  $("logout").addEventListener("click",function(){
    try{localStorage.removeItem("novapay-demo-auth")}catch(e){}
    window.location.href="preview.html#home";
  });

  document.querySelectorAll(".table-action,.report-card .table-action,.anomaly-card .btn").forEach(function(b){
    b.addEventListener("click",function(){showToast("Demo action selected — no live transaction is changed.");});
  });

  var answers={
    "how much did i pay paypal in fees this month?":"Your PayPal fees for October are ₹23,500 across 1,284 transactions. Demo response — this workspace contains illustrative data only.",
    "show my fees":"Your PayPal fees for October are ₹23,500 across 1,284 transactions. Demo response — this workspace contains illustrative data only.",
    "find refunds":"I found 3 unusually large refunds in the illustrative October dataset. Review the Anomalies section before taking any action.",
    "monthly report":"October demo summary: Revenue ₹8,45,000 · PayPal Fees ₹23,500 · Refunds ₹12,000 · Disputes ₹4,500 · Net Money ₹8,05,000.",
    "detect unusual activity":"I found 3 unusually large refunds within 20 minutes in the illustrative dataset. This is a demo signal, not a live fraud determination.",
    "why did fees increase?":"Illustrative answer: the demo dataset shows PayPal fees attached to payment activity. Review the Transactions and Ledger views for the example entries.",
    "show unusual refunds":"I found 3 unusually large refunds in the illustrative October dataset. Review the Anomalies section before taking any action.",
    "summarize this month":"October demo summary: Revenue ₹8,45,000 · PayPal Fees ₹23,500 · Refunds ₹12,000 · Disputes ₹4,500 · Net Money ₹8,05,000."
  };
  function appendAiMessage(q,answer){
    var box=$("ai-conversation"); if(!box)return;
    var user=document.createElement("div"); user.className="ai-bubble ai-bubble--user"; user.innerHTML="<span class='ai-user-mark'>You</span><div><p></p></div>"; user.querySelector("p").textContent=q;
    var bot=document.createElement("div"); bot.className="ai-bubble ai-bubble--assistant"; bot.innerHTML="<span class='ai-avatar'><novapay-logo size='20' variant='mark'></novapay-logo></span><div><b>NovaPay</b><p></p></div>"; bot.querySelector("p").textContent=answer;
    box.appendChild(user);box.appendChild(bot);box.scrollTop=box.scrollHeight;
  }
  function matchAnswer(q){
    var k=q.trim().toLowerCase();
    if(answers[k])return answers[k];
    if(/suspicious|unusual|anomal|fraud|strange|odd/.test(k))return answers["detect unusual activity"];
    if(/refund/.test(k))return answers["find refunds"];
    if(/fee|charge/.test(k))return answers["show my fees"];
    if(/report|summar|month|overview/.test(k))return answers["monthly report"];
    return "Demo answer: I can explain fees, refunds, monthly activity, reports, or unusual transactions in this illustrative workspace. Try one of the quick actions.";
  }
  var aiBusy=false;
  function ask(q){
    q=(q||"").trim(); if(!q||aiBusy)return;
    aiBusy=true;
    var box=$("ai-conversation");
    appendAiMessage(q,"Thinking…");
    var bots=box.querySelectorAll(".ai-bubble--assistant p"), last=bots[bots.length-1];
    var done=function(t){last.textContent=t;box.scrollTop=box.scrollHeight;aiBusy=false;};if(window.NovaLive&&NovaLive.live.ai){NovaLive.chat(q).then(done,function(){done(matchAnswer(q))});}else{setTimeout(function(){done(matchAnswer(q))},500);}
  }
  $("ai-send").addEventListener("click",function(){ask($("ai-input").value);$("ai-input").value=""});
  $("ai-input").addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.isComposing){ask(e.target.value);e.target.value=""}});
  document.querySelectorAll("[data-ai-query]").forEach(function(b){b.addEventListener("click",function(){ask(b.dataset.aiQuery)})});

  /* Phase 7 — agentic action with explicit human approval and demo-only execution. */
  var actionModal=$("action-modal"), agentStatus=$("agent-status"), approve=$("agent-approve"), cancel=$("agent-cancel"), confirm=$("confirm-refund"), processing=false, lastFocus=null;
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
      var r=document.createElement("tr");r.className="transaction-row";r.tabIndex=0;r.dataset.txId="REF-28491";r.dataset.type="Refund";
      r.innerHTML='<td><span class="tx-badge refund">↩</span> Refund</td><td>₹2,000</td><td>—</td><td>-₹2,000</td><td><span class="status danger">Refunded (Demo)</span></td><td>Just now</td>';
      tb.insertBefore(r,tb.firstChild);
      if(typeof txRows!=="undefined")txRows=document.querySelectorAll("#view-transactions tbody tr");
    }
    var jb=document.querySelector("#view-ledger tbody");
    if(jb){
      var j=document.createElement("tr");
      j.innerHTML='<td>07 Oct 2026</td><td>Refund PAY-28491 (Demo Mode)</td><td>₹2,000</td><td>₹2,000</td><td><span class="status ok">Balanced</span></td>';
      jb.insertBefore(j,jb.firstChild);
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
      setStatus("agent-status--success","<b>Refund completed in Demo Mode.</b><span>Ledger updated in the demo workspace. No PayPal request was sent.</span>");
      approve.disabled=true;cancel.disabled=true;
      showToast("Demo refund completed. Ledger updated.");
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

  var txSearch=$("tx-search"), txType=$("tx-type"), txRows=document.querySelectorAll("#view-transactions tbody tr");
  function filterTx(){
    var q=txSearch.value.trim().toLowerCase(), t=txType.value, shown=0;
    txRows.forEach(function(r){var ok=(!t||r.dataset.type===t)&&(!q||r.textContent.toLowerCase().indexOf(q)>-1);r.hidden=!ok;if(ok)shown++;});
    $("tx-empty").hidden=shown>0;
  }
  txSearch.addEventListener("input",filterTx);txType.addEventListener("change",filterTx);

  var sugToggle=document.querySelectorAll("#view-sandbox .settings-card input[type=checkbox]")[1], qa=document.querySelector(".ai-quick-actions");
  if(sugToggle&&qa)sugToggle.addEventListener("change",function(){qa.hidden=!sugToggle.checked;});
  var reduce=$("reduce-motion-toggle");
  if(reduce){
    reduce.checked=matchMedia("(prefers-reduced-motion: reduce)").matches;
    reduce.addEventListener("change",function(){showToast(reduce.checked?"Demo preference saved visually.":"Browser motion preference remains respected.")});
  }

  // Phase 5 — dashboard controls and dynamic illustrative cash-flow data.
  var displayName=(user.name||"").trim();if(!displayName||/^novapay demo user$/i.test(displayName))displayName="Shikhar";
  $("greeting-name").textContent=displayName.split(/\s+/)[0];
  $("user-name").textContent=displayName;
  $("user-email").textContent="Business Owner";
  $("profile-name").textContent=displayName;
  $("user-avatar").textContent=displayName.charAt(0).toUpperCase();

  var notifications=$("notifications"), notificationPopover=$("notification-popover"), profileButton=$("profile-button"), profilePopover=$("profile-popover");
  function closePopovers(){
    if(notificationPopover){notificationPopover.hidden=true;notifications.setAttribute("aria-expanded","false");}
    if(profilePopover){profilePopover.hidden=true;profileButton.setAttribute("aria-expanded","false");}
  }
  if(notifications){notifications.addEventListener("click",function(e){e.stopPropagation();var open=notificationPopover.hidden;closePopovers();notificationPopover.hidden=!open;notifications.setAttribute("aria-expanded",String(open));});}
  if(profileButton){profileButton.addEventListener("click",function(e){e.stopPropagation();var open=profilePopover.hidden;closePopovers();profilePopover.hidden=!open;profileButton.setAttribute("aria-expanded",String(open));});}
  document.addEventListener("click",function(e){if(!e.target.closest(".popover")&&!e.target.closest("#notifications")&&!e.target.closest("#profile-button"))closePopovers();});
  document.querySelectorAll("[data-profile-action]").forEach(function(b){b.addEventListener("click",function(){var action=b.dataset.profileAction;if(action==="settings"){closePopovers();activate("settings",true);}else if(action==="logout")$("logout").click();});});
  document.querySelectorAll(".notification-item").forEach(function(b,i){b.addEventListener("click",function(){closePopovers();if(i===0)activate("anomalies",true);else if(i===2)activate("ai-assistant",true);else showToast("Ledger is balanced in the illustrative demo.");});});

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
  if(dateSelect){dateSelect.addEventListener("change",function(){renderKpis(dateSelect.value, true);showToast("Dashboard date set to "+dateSelect.options[dateSelect.selectedIndex].text+". Demo data remains illustrative.");});}
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
    $("cf-sub").textContent=cfg.sub+" · illustrative demo data · amounts in INR";
    $("cf-tip").hidden=true;$("cf-cursor").hidden=true;
    document.querySelectorAll("#cashflow-tabs button").forEach(function(b){var on=b.dataset.range===range;b.classList.toggle("active",on);b.setAttribute("aria-selected",String(on));b.setAttribute("role","tab");});
  }
  document.querySelectorAll("#cashflow-tabs button").forEach(function(b){b.addEventListener("click",function(){renderCashflow(b.dataset.range,true);});});

  var plot=$("cf-plot"),tip=$("cf-tip"),cursor=$("cf-cursor");
  function hover(e){
    if(!cf)return;var r=plot.getBoundingClientRect(),n=cf.cfg.n,fx=Math.min(Math.max((e.clientX-r.left)/r.width,0),1);
    var i=Math.round((fx*W-PAD)/((W-PAD*2)/(n-1)));i=Math.min(Math.max(i,0),n-1);
    var px=xAt(i,n)/W*r.width;
    cursor.style.left=px+"px";cursor.hidden=false;
    tip.innerHTML="<b>"+cf.cfg.labels(i)+"</b><span class='t-in'>Money In <em>"+inr(cf.mi[i])+"</em></span><span class='t-out'>Money Out <em>"+inr(cf.mo[i])+"</em></span><span class='t-net'>Net <em>"+inr(cf.net[i])+"</em></span>";
    tip.hidden=false;var tw=tip.offsetWidth;tip.style.left=Math.min(Math.max(px-tw/2,0),r.width-tw)+"px";
  }
  plot.addEventListener("mousemove",hover);plot.addEventListener("touchstart",function(e){hover(e.touches[0]);},{passive:true});plot.addEventListener("touchmove",function(e){hover(e.touches[0]);},{passive:true});
  plot.addEventListener("mouseleave",function(){tip.hidden=true;cursor.hidden=true;});
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
    "PAY-1001":{type:"Payment",ref:"PAY-1001",amount:"₹10,000",fee:"₹300",net:"₹9,700",status:"Completed",time:"2 mins ago",note:"Illustrative payment received and ready for ledger posting."},
    "PAY-1002":{type:"Payment",ref:"PAY-1002",amount:"₹7,500",fee:"₹225",net:"₹7,275",status:"Completed",time:"12 mins ago",note:"Illustrative payment with a sample PayPal fee."},
    "REF-1003":{type:"Refund",ref:"REF-1003",amount:"₹2,000",fee:"—",net:"-₹2,000",status:"Refunded",time:"28 mins ago",note:"Illustrative refund event. Review the linked ledger entry before any action."},
    "DSP-1004":{type:"Dispute",ref:"DSP-1004",amount:"₹5,000",fee:"—",net:"-₹5,000",status:"Under Review",time:"1 hr ago",note:"Illustrative dispute requiring merchant review."},
    "PAY-28491":{type:"Payment",ref:"PAY-28491",amount:"₹2,000",fee:"₹60",net:"₹1,940",status:"Possible duplicate",time:"45 mins ago",note:"Flagged by the demo AI as a possible duplicate payment."},
    "REF-28491":{type:"Refund",ref:"REF-28491",amount:"₹2,000",fee:"—",net:"-₹2,000",status:"Refunded (Demo)",time:"Just now",note:"Simulated refund created through the demo approval flow."},
    "PAY-1005":{type:"Payout",ref:"PAY-1005",amount:"₹50,000",fee:"—",net:"₹50,000",status:"Completed",time:"3 hrs ago",note:"Illustrative payout event."}
  };
  var txModal=$("transaction-modal"),lastFocus=null;
  function openTx(id){
    var d=txData[id]; if(!txModal)return;
    if(!d){showToast("Couldn't load that transaction. Please try again.");return;}
    lastFocus=document.activeElement;
    $("transaction-detail-title").textContent=d.type;
    $("transaction-detail-subtitle").textContent=d.time+" · Illustrative PayPal event";
    $("detail-type").textContent=d.type;$("detail-reference").textContent=d.ref;
    $("detail-amount").textContent=d.amount;$("detail-fee").textContent=d.fee;
    $("detail-net").textContent=d.net;$("detail-status").textContent=d.status;
    $("detail-note").textContent=d.note+" No live PayPal transaction is accessed or changed.";
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
  document.addEventListener("keydown",function(e){
    if(!txModal||txModal.hidden)return;
    if(e.key==="Escape")closeTx();
    if(e.key==="Tab"){var f=txModal.querySelectorAll("button"),a=f[0],z=f[f.length-1];
      if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus();}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}}
  });
  var txReset=$("tx-reset");if(txReset)txReset.addEventListener("click",function(){txSearch.value="";txType.value="";filterTx();txSearch.focus();});
  var sub=$("dashboard-subtitle");
  function syncSubtitle(){if(sub)sub.hidden=!($("view-dashboard")&&!$("view-dashboard").hidden);}
  window.addEventListener("hashchange",syncSubtitle);window.addEventListener("popstate",syncSubtitle);nav.forEach(function(a){a.addEventListener("click",syncSubtitle);});
  document.querySelectorAll("[data-go-anomalies]").forEach(function(b){b.addEventListener("click",syncSubtitle);});
  syncSubtitle();

  document.querySelectorAll("[data-go-anomalies]").forEach(function(b){
    b.addEventListener("click",function(){activate("anomalies",true);showToast("Opening the 3 illustrative anomalies for review.");});
  });

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
  /* Demo feedback for otherwise non-destructive controls. */
  document.addEventListener("click",function(e){
    var b=e.target.closest("button[data-demo-feedback]");
    if(b) showToast(b.getAttribute("data-demo-feedback"));
  });

  document.querySelectorAll(".notification-item").forEach(function(b){
    b.addEventListener("click",function(){
      var t=b.textContent||"";
      if(t.indexOf("anomal")>=0) activate("anomalies",true);
      else if(t.indexOf("AI")>=0) activate("ai-assistant",true);
      else showToast("Ledger is balanced in Demo Mode.");
      var pop=$("notification-popover"); if(pop) pop.hidden=true;
    });
  });
  document.querySelectorAll(".report-card button").forEach(function(b){
    b.addEventListener("click",function(){activate("reports",true);showToast("Report opened in Demo Mode.");});
  });
  document.querySelectorAll(".anomaly-card button").forEach(function(b){
    b.addEventListener("click",function(){showToast("Reviewing illustrative anomaly in Demo Mode.");});
  });
})();
