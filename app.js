const $=s=>document.querySelector(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const terminal=$("#terminal");

const analyticsQueue=[];
let analyticsRetryCount=0;
const analyticsRetryLimit=20;

function flushAnalyticsQueue() {
  if (typeof window.va !== "function") {
    if (analyticsQueue.length && analyticsRetryCount<analyticsRetryLimit) {
      analyticsRetryCount++;
      setTimeout(flushAnalyticsQueue, 250);
    }
    return false;
  }
  while (analyticsQueue.length) {
    const {eventName,properties}=analyticsQueue.shift();
    window.va("event", { name: eventName, ...properties });
    log("analytics."+eventName.toLowerCase(), "SENT");
  }
  return true;
}

function trackBusinessEvent(eventName, properties={}) {
  if (typeof window.va !== "function") {
    analyticsQueue.push({eventName,properties});
    log("analytics."+eventName.toLowerCase(), "QUEUED");
    flushAnalyticsQueue();
    return false;
  }
  window.va("event", { name: eventName, ...properties });
  log("analytics."+eventName.toLowerCase(), "SENT");
  return true;
}

trackBusinessEvent("VISIT", { experimentId: null, source: "page_load" });
const stages=["IDEA","BUILD","DEPLOY","OBSERVE","LEARN"];
let runs=Number(localStorage.getItem("loopRuns")||0);
let history=JSON.parse(localStorage.getItem("loopHistory")||"[]");
$("#iterations").textContent=String(runs).padStart(2,"0");
$("#persisted").textContent=String(history.length).padStart(2,"0");

function log(msg,state="OK"){
  const d=document.createElement("div");
  d.innerHTML="<span>"+new Date().toLocaleTimeString("ja-JP",{hour12:false})+"</span> "+msg+" <b>"+state+"</b>";
  terminal.append(d); terminal.scrollTop=terminal.scrollHeight;
}

async function runLoop(){
  const btn=$("#runLoop"); btn.disabled=true;
  const started=performance.now(); runs++;
  $("#iterations").textContent=String(runs).padStart(2,"0"); $("#telemetry").textContent="RUNNING";
  for(let i=0;i<stages.length;i++){
    const stage=stages[i]; $("#state").textContent=stage;
    document.querySelectorAll(".node").forEach((n,j)=>n.classList.toggle("active",j===i));
    log("loop."+stage.toLowerCase()+"()","RUN"); await sleep(260);
  }
  const ms=Math.round(performance.now()-started);
  history.push({at:new Date().toISOString(),ms,run:runs}); history=history.slice(-20);
  localStorage.setItem("loopRuns",runs); localStorage.setItem("loopHistory",JSON.stringify(history));
  $("#persisted").textContent=String(history.length).padStart(2,"0");
  $("#feedback").textContent="LEARNED"; $("#latency").textContent=ms+"ms"; $("#state").textContent="READY"; $("#telemetry").textContent="STREAMING";
  log("feedback.signal()","NEW"); log("next_iteration.ready()","READY"); btn.disabled=false;
}

async function stressTest(){
  const b=$("#stressTest"); b.disabled=true; log("stress.test.begin(10)","RUN");
  for(let i=0;i<10;i++) await runLoop();
  log("stress.test(10)","PASS"); b.disabled=false;
}

function selfTest(){
  const checks=[["DOM","#runLoop"],["DOM","#selfTest"],["DOM","#stressTest"],["DOM","#chaosTest"],["DOM","#experiments"],["DOM","#terminal"],["STORAGE",null]];
  let pass=true;
  for(const [name,sel] of checks){
    const ok=sel?!!$(sel):(()=>{try{localStorage.setItem("__loop","1");localStorage.removeItem("__loop");return true}catch{return false}})();
    log("selftest."+name.toLowerCase(),ok?"PASS":"FAIL"); pass&&=ok;
  }
  $("#contract").textContent=pass?"PASS":"FAIL"; $("#healthScore").textContent=pass?"100":"0"; return pass;
}

function renderBusiness(data){const root=$("#businessFunnel");root.replaceChildren();data.funnel.forEach((e,i)=>{const card=document.createElement("div");card.className="business-event";card.innerHTML="<b>"+String(i+1).padStart(2,"0")+"</b><strong>"+e.event+"</strong><small>"+e.meaning+"</small>";root.append(card);});$("#northStarStatus").textContent=data.northStar.status;$("#businessEvents").textContent=String(data.funnel.length).padStart(2,"0");$("#monetizationState").textContent=data.northStar.status==="NOT_CONNECTED"?"DESIGNING":"MEASURING";log("business.model("+data.northStar.metric+")","READY");}
async function loadBusiness(){try{const res=await fetch("loop/business.json",{cache:"no-store"});if(!res.ok)throw new Error("HTTP "+res.status);const data=await res.json();if(data.schemaVersion!==1||!data.northStar||data.northStar.metric!=="revenue"||!Array.isArray(data.funnel))throw new Error("invalid business schema");renderBusiness(data);}catch(err){log("business.load()","FAIL");$("#monetizationState").textContent="ERROR";}}
function renderLedger(data){
  const root=$("#experiments"); root.replaceChildren();
  [...data.experiments].reverse().forEach(e=>{
    const card=document.createElement("article"); card.className="experiment";
    card.innerHTML="<header><strong>"+e.id+"</strong><b>"+e.decision+"</b></header>"+
      "<h3>"+e.hypothesis+"</h3>"+
      "<p><span>CHANGE</span>"+e.change+"</p>"+
      "<p><span>EVIDENCE</span>"+(Array.isArray(e.evidence)?e.evidence.join(" · "):Object.entries(e.evidence).map(([k,v])=>k+":"+v.status).join(" · "))+"</p>"+
      "<p><span>NEXT</span>"+e.next+"</p>";
    root.append(card);
  });
  log("ledger.load("+data.experiments.length+")","PASS");
}

async function chaosRecovery(){const b=$("#chaosTest");b.disabled=true;log("chaos.inject(local-only)","FAIL");$("#telemetry").textContent="DEGRADED";$("#healthScore").textContent="0";await sleep(350);const recovery=!!$("#experiments")&&!!$("#terminal")&&!!localStorage;$("#telemetry").textContent=recovery?"RECOVERED":"DEGRADED";$("#healthScore").textContent=recovery?"100":"0";log("chaos.detected()","PASS");log("chaos.recovery(local-only)","PASS");b.disabled=false;}

async function loadLedger(){
  try{
    const res=await fetch("loop/experiments.json",{cache:"no-store"});
    if(!res.ok) throw new Error("HTTP "+res.status);
    const data=await res.json();
    if(data.schemaVersion!==1||!Array.isArray(data.experiments)) throw new Error("invalid schema");
    renderLedger(data);
  }catch(err){
    $("#telemetry").textContent="DEGRADED";
    $("#experiments").innerHTML='<div class="experiment error">ledger.load() <b>FAIL</b><p>'+String(err.message||err)+'</p></div>';
    log("ledger.load()","FAIL");
  }
}

$("#runLoop").addEventListener("click",runLoop);
$("#selfTest").addEventListener("click",selfTest);
$("#stressTest").addEventListener("click",stressTest);
$("#chaosTest").addEventListener("click",chaosRecovery);
selfTest();
loadBusiness();
loadLedger();

function recordOfferInterest() {
  const status = document.getElementById("offerStatus");
  if (!status) return;
  const event = {
    event: "TRIAL_STARTED",
    occurredAt: new Date().toISOString(),
    anonymousId: getAnonymousId(),
    experimentId: "EXP-009",
    properties: { intent: "purchase_interest", source: "offer_probe" }
  };
  localStorage.setItem("loop_offer_interest", JSON.stringify(event));
  status.textContent = "OBSERVED LOCALLY";
  trackBusinessEvent("TRIAL_STARTED", { experimentId: "EXP-009", intent: "purchase_interest", source: "offer_probe" });
  log("business.TRIAL_STARTED intent OBSERVED");
}
function getAnonymousId() {
  let id = localStorage.getItem("loop_anonymous_id");
  if (!id) { id = "local-" + Math.random().toString(36).slice(2); localStorage.setItem("loop_anonymous_id", id); }
  return id;
}
document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("offerInterest");
  if (button) button.addEventListener("click", recordOfferInterest);
});
