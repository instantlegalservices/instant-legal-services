// PHASE 6C-8O — TEST-only two-session orchestration
// Orchestration artifact only. Calls the existing processor; does not modify processor semantics.
// Required env: ILS_TEST_SUPABASE_URL, ILS_TEST_SUPABASE_PUBLISHABLE_KEY
const [,,runId,jobId,invA,invB,delayMsRaw="1000"] = process.argv;
if (!runId || !jobId || !invA || !invB) throw new Error("run_id, job_id and two invocation IDs are required");
const base = process.env.ILS_TEST_SUPABASE_URL;
const key = process.env.ILS_TEST_SUPABASE_PUBLISHABLE_KEY;
if (!base || !key) throw new Error("Missing TEST-only environment variables");
const endpoint = base + "/rest/v1/rpc/ils_test_judgment_repro_process";
const headers = {"Content-Type":"application/json","apikey":key,"Authorization":"Bearer "+key};
const body = (invocation_id) => JSON.stringify({p_test_run_id:runId,p_job_id:jobId,p_invocation_id:invocation_id});
const invoke = async (label, invocationId) => {
  const startedAt = new Date().toISOString();
  const response = await fetch(endpoint,{method:"POST",headers,body:body(invocationId),cache:"no-store"});
  const endedAt = new Date().toISOString();
  return {label,invocationId,startedAt,endedAt,httpStatus:response.status,response:await response.text()};
};
const delayMs = Number(delayMsRaw);
const aPromise = invoke("A",invA);
await new Promise(r=>setTimeout(r,delayMs));
const bPromise = invoke("B",invB);
const [a,b] = await Promise.all([aPromise,bPromise]);
console.log(JSON.stringify({test_only:true,runId,jobId,delayBeforeBMs:delayMs,A:a,B:b},null,2));
