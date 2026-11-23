"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("supabase/functions/ils-ai-assistant/index.ts", "utf8");

assert.match(source, /const mode=String\(body\?\.mode\|\|"public"\)\.trim\(\)\.toLowerCase\(\)/,
  "the function must honor the caller's requested mode");
assert.match(source, /const advocateMode=mode==="advocate"\|\|mode==="research"/,
  "advocate and research modes must share the protected authorization path");
assert.match(source, /if\(mode!=="public"&&!advocateMode\)/,
  "unsupported modes must be rejected instead of silently downgraded to public");
assert.doesNotMatch(source, /const mode="public"/,
  "mode must not be hardcoded to public");
assert.match(source, /if\(advocateMode\)\{[\s\S]*?auth\.getUser\(token\)/,
  "advocate mode must validate the bearer token with Supabase Auth");
assert.match(source, /\.eq\("auth_user_id",userData\.user\.id\)/,
  "advocate authorization must bind to the authenticated user ID, not email");
assert.match(source, /\.eq\("status","Approved"\)[\s\S]*?\.eq\("verification_status","Approved"\)/,
  "both approval and verification states must be approved");
assert.match(source, /if\(advError\)return json\([\s\S]*?503\)/,
  "identity lookup errors must fail closed");
assert.match(source, /if\(!adv\)return json\([\s\S]*?403\)/,
  "missing or unapproved advocate identity must be denied");
assert.doesNotMatch(source, /\.eq\("email",email\)/,
  "advocate access must not rely on email identity matching");


assert.match(source, /auth\.toLowerCase\(\)\.startsWith\("bearer "\)/,
  "advocate mode must require a bearer authorization header");
assert.match(source, /const token=auth\.slice\(7\)\.trim\(\)/,
  "the bearer token must be trimmed before validation");
assert.match(source, /createClient\(supabaseUrl,serviceKey,\{auth:\{persistSession:false,autoRefreshToken:false\}\}\)/,
  "the service-role client must not persist or refresh a caller session");


assert.match(source, /const system=advocateMode[\s\S]*?Advocate Research AI for approved Indian advocates/,
  "authorized advocate mode must receive the advocate research prompt");
assert.match(source, /advocateMode\?"Advocate research question":"Indian-law question"/,
  "the user prompt must identify the selected research mode");

console.log("ILS_AI_ASSISTANT_MODE_AUTHORIZATION=PASS");
