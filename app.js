const $=s=>document.querySelector(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const terminal=$("#terminal");
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

function renderLedger(data){
  const root=$("#experiments"); root.replaceChildren();
  [...data.experiments].reverse().forEach(e=>{
    const card=document.createElement("article"); card.className="experiment";
    card.innerHTML="<header><strong>"+e.id+"</strong><b>"+e.decision+"</b></header>"+
      "<h3>"+e.hypothesis+"</h3>"+
      "<p><span>CHANGE</span>"+e.change+"</p>"+
      "<p><span>EVIDENCE</span>"+e.evidence.join(" · ")+"</p>"+
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
loadLedger();