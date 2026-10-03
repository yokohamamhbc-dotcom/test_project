export default function handler(req,res) {
  const requestUrl=new URL(req.url||"/","https://loop-engineering.local");
  const offer=requestUrl.searchParams.get("offer")||"audit";
  const mode=requestUrl.searchParams.get("mode")||"checkout";
  const checkoutUrl=process.env.CHECKOUT_URL;
  if(mode==="status"){
    res.status(200).json({configured:Boolean(checkoutUrl),offer});
    return;
  }
  if(!checkoutUrl){
    res.status(503).json({
      ok:false,
      code:"PAYMENT_NOT_CONNECTED",
      offer,
      message:"Checkout is not connected. Configure CHECKOUT_URL as a server-side secret/config before accepting payments."
    });
    return;
  }
  try{
    const target=new URL(checkoutUrl);
    target.searchParams.set("offer",offer);
    res.writeHead(302,{Location:target.toString(),CacheControl:"no-store"});
    res.end();
  }catch{
    res.status(500).json({ok:false,code:"INVALID_CHECKOUT_URL"});
  }
}
