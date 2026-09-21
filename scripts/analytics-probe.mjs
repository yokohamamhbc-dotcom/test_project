const projectId="prj_x0gAer0C1n7V9QdK5EEQb3eNqzZ1";
const teamId="team_JNijgrk3DUHl8UhbNzFbswyp";
const token=process.env.VERCEL_TOKEN;
const base="https://api.vercel.com/v1/query/web-analytics";

async function query(resource){
  const url=new URL(base+"/"+resource+"/count");
  url.searchParams.set("teamId",teamId);
  url.searchParams.set("projectId",projectId);
  const res=await fetch(url,{headers:{Authorization:"Bearer "+token}});
  const text=await res.text();
  let body; try{body=JSON.parse(text);}catch{body={raw:text.slice(0,200)};}
  if(!res.ok) throw new Error(resource+" HTTP "+res.status+" "+JSON.stringify(body));
  return body;
}

if(!token){
  console.log(JSON.stringify({status:"NOT_CONNECTED",reason:"VERCEL_TOKEN secret is not configured; no analytics claim made."}));
  process.exit(0);
}
try{
  const visits=await query("visits");
  const events=await query("events");
  console.log(JSON.stringify({status:"OBSERVED",visits,events},null,2));
}catch(error){
  console.error("Analytics API probe failed:",error.message);
  process.exit(1);
}
