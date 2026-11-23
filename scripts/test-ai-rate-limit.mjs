import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/20261117063714_ils_ai_rate_limit_shared.sql", "utf8");
const hardening = await readFile("supabase/migrations/20261123193000_harden_ils_ai_rate_limit_security.sql", "utf8");
const shared = await readFile("supabase/functions/_shared/ai-rate-limit.ts", "utf8");
const files = [
  "supabase/functions/ai-assistant/index.ts",
  "supabase/functions/ils-ai-assistant/index.ts"
];
assert.match(migration, /create table if not exists public\.ils_ai_rate_limits/i);
assert.match(migration, /enable row level security/i);
assert.match(hardening, /set search_path = ''/i);
assert.match(hardening, /revoke all on table public\.ils_ai_rate_limits from public, anon, authenticated, service_role/i);
assert.match(hardening, /grant execute on function public\.ils_ai_rate_limit_check\(text, integer, integer\) to service_role/i);
assert.match(shared, /cf-connecting-ip/);
assert.ok(!shared.includes('headers.get("x-forwarded-for")') && !shared.includes('headers.get("x-real-ip")'));
assert.match(shared, /crypto\.subtle\.sign\("HMAC"/);
assert.match(shared, /AI_RATE_LIMIT_UNAVAILABLE/);
assert.match(shared, /Retry-After/);
assert.match(shared, /Access-Control-Expose-Headers.*Retry-After/);

for (const file of files) {
  const edge = await readFile(file, "utf8");
  assert.match(edge, /\.\.\/_shared\/ai-rate-limit\.ts/);
  assert.match(edge, /enforceAiRateLimit/);
  const limiter = edge.indexOf("enforceAiRateLimit(");
  const provider = edge.lastIndexOf("https://openrouter.ai/api/v1/chat/completions");
  assert.ok(limiter >= 0 && provider > limiter, file + ": limiter must precede provider invocation");
}
const ai = await readFile(files[0], "utf8");
assert.match(ai, /enforceAiRateLimit\(req, isAdv \? authUserId : undefined\)/);
const ils = await readFile(files[1], "utf8");
assert.match(ils, /enforceAiRateLimit\(req, advocateMode \? advocateUserId : undefined\)/);
assert.match(ils, /\.eq\("auth_user_id", userData\.user\.id\)/);
console.log("ILS_SHARED_AI_RATE_LIMIT_CONTRACT=PASS");
