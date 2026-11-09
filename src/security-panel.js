(function(){
  "use strict";
  var $=function(id){return document.getElementById(id)};
  var status=$("security-panel-status"),loaded=false,loading=false;
  function text(node,value){node.textContent=String(value==null?"":value)}
  function item(label,value){var li=document.createElement("li"),strong=document.createElement("strong"),detail=document.createElement("span");strong.textContent=label;detail.textContent=value;li.appendChild(strong);li.appendChild(detail);return li}
  function api(path,options){return window.NovaPayApi.request(path,options||{})}
  function date(value){var time=Date.parse(value||"");return Number.isFinite(time)?new Date(time).toLocaleString():"Time unavailable"}
  function load(){
    if(loading)return Promise.resolve();
    if(!window.NovaPayAuth||window.NovaPayAuth.mode!=="supabase"){text(status,"Sign-in activity is available for Supabase accounts.");return Promise.resolve()}
    loading=true;text(status,"Loading recent sign-ins and known devices…");
    return api("/api/security/overview").then(function(data){
      var risk=$("security-risk-summary"),locks=$("security-lock-status"),devices=$("security-devices-list"),logins=$("security-logins-list");
      risk.textContent="";locks.textContent="";devices.textContent="";logins.textContent="";
      var heading=document.createElement("p"),reasons=document.createElement("ul");heading.textContent="Current risk: "+data.risk.level+" ("+data.risk.score+"/100)";
      (data.risk.reasons||[]).forEach(function(reason){var li=document.createElement("li");li.textContent=reason;reasons.appendChild(li)});
      if(!reasons.children.length){var li=document.createElement("li");li.textContent="No recent sign-in risk signals.";reasons.appendChild(li)}risk.appendChild(heading);risk.appendChild(reasons);
      var lock=document.createElement("p");lock.textContent=data.lockedUntil?"Sign-in is temporarily locked until "+date(data.lockedUntil)+".":"No active sign-in lock.";locks.appendChild(lock);
      (data.devices||[]).forEach(function(device){var li=item("Device …"+String(device.device_id||"").slice(-6),(device.trusted?"Trusted":"Not marked trusted")+" · Last seen "+date(device.last_seen));var button=document.createElement("button");button.type="button";button.className="btn btn--ghost";button.textContent="This wasn't me · remove device";button.addEventListener("click",function(){button.disabled=true;text(status,"Removing device and its step-up access…");api("/api/security/devices/"+encodeURIComponent(device.device_id),{method:"DELETE"}).then(load).catch(fail).finally(function(){button.disabled=false})});li.appendChild(button);devices.appendChild(li)});
      if(!devices.children.length)devices.appendChild(item("No known devices","This device is added after a successful sign-in."));
      (data.logins||[]).forEach(function(login){logins.appendChild(item((login.success?"Successful sign-in":"Failed sign-in")+" · Device …"+String(login.device_id||"").slice(-6),date(login.occurred_at)+" · "+(login.network_label||"Network unavailable")+" · Risk "+login.risk_level+" ("+login.risk_score+")"))});
      if(!logins.children.length)logins.appendChild(item("No recent sign-ins","Sign-in history will appear here."));
      $("security-members-section").hidden=!(["owner","admin"].indexOf(data.role)>=0);
      if(!$("security-members-section").hidden)loadMembers();
      text(status,"Security activity is up to date.");loaded=true;
    }).catch(fail).finally(function(){loading=false})
  }
  function loadMembers(){var list=$("security-members-list");if(!list)return;list.textContent="";api("/api/security/members").then(function(data){(data.members||[]).forEach(function(member){var li=item(member.role+" · "+member.userId,member.lockedUntil?"Locked until "+date(member.lockedUntil):"No active lock");if(member.lockedUntil){var button=document.createElement("button");button.type="button";button.className="btn btn--ghost";button.textContent="Unlock sign-in";button.addEventListener("click",function(){button.disabled=true;api("/api/security/members/"+encodeURIComponent(member.userId)+"/unlock",{method:"POST"}).then(load).catch(fail)});li.appendChild(button)}list.appendChild(li)});if(!list.children.length)list.appendChild(item("No other workspace members",""))}).catch(fail)}
  function fail(error){text(status,error&&error.message||"Security activity could not be loaded. Try again.");loaded=false}
  document.addEventListener("click",function(event){var button=event.target.closest&&event.target.closest('[data-set-section="security"]');if(button)load()});
  document.addEventListener("novapay:auth",function(){loaded=false;if(!$('setpanel-security').hidden)load()});
  if($('setpanel-security')&&!$('setpanel-security').hidden)load();
})();
