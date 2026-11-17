import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration=await readFile("supabase/migrations/20261117070000_ils_ai_rate_limit_shared.sql","utf8");
const shared=await readFile("supabase/functions/_shared/ai-rate-limit.ts","utf8");
const files=[
  "supabase/functions/ai-assistant/index.ts",
  "supabase/functions/ils-ai-assistant/index.ts"
];
assert.match(migration,/create table if not exists public\.ils_ai_rate_limits/i);
assert.match(migration,/enable row level security/i);
assert.match(migration,/revoke all on table public\.ils_ai_rate_limits from public, anon, authenticated/i);
assert.match(migration,/grant execute on function public\.ils_ai_rate_limit_check\(text, integer, integer\) to service_role/i);
assert.match(migration,/on conflict \(key_hash, window_seconds\) do update/i);
assert.match(migration,/updated_at < v_now - interval '2 hours'/i);
assert.match(shared,/cf-connecting-ip/);
assert.ok(!shared.includes('headers.get("x-forwarded-for")')&&!shared.includes('headers.get("x-real-ip")'),"must not trust caller-supplied forwarding headers");
assert.match(shared,/crypto\.subtle\.digest\("SHA-256"/);
assert.match(shared,/AI_RATE_LIMIT_UNAVAILABLE/);
assert.match(shared,/Retry-After/);
for(const file of files){
  const edge=await readFile(file,"utf8");
  assert.match(edge,/\.\.\/_shared\/ai-rate-limit\.ts/);
  assert.match(edge,/enforceAiRateLimit/);
  const limiter=edge.indexOf("enforceAiRateLimit(");
  const provider=edge.indexOf("https://openrouter.ai/api/v1/chat/completions");
  assert.ok(limiter>=0&&provider>limiter,file+": limiter must precede provider call");
}
const ai=await readFile(files[0],"utf8");
assert.match(ai,/approved\(u\.id\)/);
assert.match(ai,/enforceAiRateLimit\(req,isAdv\?authUserId:undefined\)/);
console.log("Both AI endpoint rate-limit static contract checks passed.");
