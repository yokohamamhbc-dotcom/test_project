const base = process.env.PRODUCTION_URL;
if (!base) {
  console.log(JSON.stringify({status:"NOT_CONFIGURED", reason:"PRODUCTION_URL secret is not configured."}, null, 2));
  process.exit(0);
}

const paths = ["/", "/api/checkout?offer=audit&mode=status", "/loop/business.json", "/loop/events.json"];
const results = [];
for (const path of paths) {
  const url = new URL(path, base);
  try {
    const res = await fetch(url, {redirect:"manual"});
    results.push({path, status:res.status, ok:res.ok, location:res.headers.get("location")});
  } catch (error) {
    results.push({path, status:null, ok:false, error:String(error.message||error)});
  }
}
const failed = results.some(r => !r.ok);
console.log(JSON.stringify({status:failed?"FAIL":"PASS", base, results}, null, 2));
if (failed) process.exit(1);
