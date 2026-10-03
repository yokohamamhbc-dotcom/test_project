const fs=require("fs");
const experiments=JSON.parse(fs.readFileSync("loop/experiments.json","utf8"));
const business=JSON.parse(fs.readFileSync("loop/business.json","utf8"));
const events=JSON.parse(fs.readFileSync("loop/events.json","utf8"));
const structured=new Set(["EXP-006","EXP-007","EXP-009","EXP-010","EXP-011","EXP-012","EXP-013","EXP-014","EXP-015","EXP-016","EXP-017","EXP-018","EXP-019","EXP-020","EXP-021","EXP-023","EXP-024"]);
const statuses=new Set(["PENDING","PASS","FAIL","READY"]);
const errors=[]; const ids=new Set();
for(const e of experiments.experiments){
 if(ids.has(e.id)) errors.push("duplicate:"+e.id); ids.add(e.id);
 if(!e.hypothesis||!e.change||!e.next) errors.push("incomplete:"+e.id);
 if(structured.has(e.id)) for(const k of ["ci","preview","production","http"]){
   if(!e.evidence?.[k]||!statuses.has(e.evidence[k].status)) errors.push("evidence:"+e.id+":"+k);
 }
}
if(events.status!=="NOT_CONNECTED") errors.push("events-not-disconnected");
if(events.provider!=="NONE") errors.push("provider-not-none");
if(business.northStar?.status!=="NOT_CONNECTED") errors.push("revenue-not-disconnected");
if(business.offer?.status!=="NOT_CONNECTED") errors.push("payment-not-disconnected");
if(errors.length){ console.error("CONTROL_PLANE_AUDIT=FAIL"); console.error(errors.join("\n")); process.exit(1); }
console.log(JSON.stringify({status:"PASS",experiments:experiments.experiments.length,analytics:events.status,revenue:business.northStar.status,payment:business.offer.status},null,2));
