const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"}});

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return json({ok:true});
  try{
    const body=await req.json().catch(()=>({}));
    const question=String(body?.question||"Explain the difference between a legal fact and a legal inference in an Indian-law case. Use authoritative sources.");
    const base=Deno.env.get("SUPABASE_URL")||"";
    if(!base)return json({ok:false,stage:"configuration",message:"TEST Supabase URL is unavailable."},503);
    const target=(base.endsWith("/")?base.slice(0,-1):base)+"/functions/v1/ils-ai-assistant";
    const r=await fetch(target,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question,context:"TEST SYNTHETIC E2E ONLY. Do not use or retain personal data."})});
    const raw=await r.text();
    let parsed:any=null;try{parsed=JSON.parse(raw)}catch{}
    return json({
      ok:r.ok && parsed?.ok===true,
      stage:"runtime-invocation",
      http_status:r.status,
      ai_ok:parsed?.ok===true,
      verified:parsed?.verified===true,
      has_sources:Array.isArray(parsed?.sources)&&parsed.sources.length>0,
      failure_message:parsed?.ok===false?String(parsed?.message||"AI invocation failed.").slice(0,300):undefined
    },200);
  }catch(e){
    return json({ok:false,stage:"runtime-invocation",message:String(e?.message||"TEST invocation failed.").slice(0,300)},500);
  }
});