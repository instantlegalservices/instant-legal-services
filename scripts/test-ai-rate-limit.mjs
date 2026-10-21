import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/20261021110000_ai_endpoint_rate_limit.sql", "utf8");
const edge = await readFile("supabase/functions/ai-assistant/index.ts", "utf8");

assert.match(migration, /create table if not exists public\.ils_ai_rate_limits/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on public\.ils_ai_rate_limits from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.ils_ai_rate_limit_check\(text, integer, integer\) to service_role/i);
assert.match(migration, /primary key \(key_hash, window_seconds\)/i);
assert.match(migration, /on conflict \(key_hash, window_seconds\) do update/i);
assert.match(migration, /'\^\[0-9a-f\]\{64\}\$'/i);

assert.match(edge, /crypto\.subtle\.digest\("SHA-256"/);
assert.match(edge, /rpc\/ils_ai_rate_limit_check/);
assert.match(edge, /checkAiRateLimit\(rateKey,isAdv\?20:10,60\)/);
assert.match(edge, /checkAiRateLimit\(rateKey,isAdv\?200:60,3600\)/);
assert.match(edge, /status:429/);
assert.match(edge, /"Retry-After"/);
assert.match(edge, /AI_RATE_LIMIT_UNAVAILABLE/);
assert.match(edge, /AI_RATE_LIMIT_IDENTITY_UNAVAILABLE/);
assert.match(edge, /function clientIp\(req:Request\)[\s\S]*cf-connecting-ip/);
assert.doesNotMatch(edge.slice(edge.indexOf("function clientIp"), edge.indexOf("async function call")), /x-forwarded-for/);

const authCheck = edge.indexOf('adv=await approved(u.id)');
const limiter = edge.indexOf('const minute=await checkAiRateLimit');
const providerLoop = edge.indexOf('for(const m of models)');
assert.ok(authCheck >= 0 && limiter > authCheck, "advocate approval must precede rate limiting");
assert.ok(providerLoop > limiter, "rate limiting must precede all AI-provider calls");

console.log("AI rate-limit static contract checks passed.");
