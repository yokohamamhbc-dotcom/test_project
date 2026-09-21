const projectId="prj_x0gAer0C1n7V9QdK5EEQb3eNqzZ1";
const teamId="team_JNijgrk3DUHl8UhbNzFbswyp";
const token=process.env.VERCEL_TOKEN;
const base="https://api.vercel.com/v1/query/web-analytics";

async function query(resource, headers={}){
  const url=new URL(base+"/"+resource+"/count");
  url.searchParams.set("teamId",teamId);
  url.searchParams.set("projectId",projectId);
  const res=await fetch(url,{headers});
  const text=await res.text();
  let body; try{body=JSON.parse(text);}catch{body={raw:text.slice(0,200)};}
  return {statusCode:res.status,body};
}

if(!token){
  const probe=await query("visits");
  if(probe.statusCode===401){
    console.log(JSON.stringify({
      status:"NOT_CONNECTED",
      authBoundary:"CONFIRMED",
      apiReachable:true,
      unauthenticatedStatus:401,
      reason:"VERCEL_TOKEN secret is not configured; the Web Analytics API is reachable but requires bearer authentication. No analytics claim made."
    },null,2));
    process.exit(0);
  }
  console.log(JSON.stringify({
    status:"NOT_CONNECTED",
    authBoundary:"UNKNOWN",
    apiReachable:true,
    unauthenticatedStatus:probe.statusCode,
    reason:"VERCEL_TOKEN secret is not configured; no analytics claim made."
  },null,2));
  process.exit(0);
}

try{
  const headers={Authorization:"Bearer "+token};
  const visits=await query("visits",headers);
  const events=await query("events",headers);
  if(visits.statusCode>=400||events.statusCode>=400){
    throw new Error("Analytics API auth/query failed: visits="+visits.statusCode+" events="+events.statusCode);
  }
  console.log(JSON.stringify({status:"OBSERVED",visits:visits.body,events:events.body},null,2));
}catch(error){
  console.error("Analytics API probe failed:",error.message);
  process.exit(1);
}
