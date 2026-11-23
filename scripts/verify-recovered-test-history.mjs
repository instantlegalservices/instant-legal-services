import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, sep } from "node:path";

const repoRoot = process.cwd();
const archiveRoot = resolve(repoRoot, "supabase/recovered-test-history/professional-assignment");
const manifestPath = resolve(archiveRoot, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

assert.equal(manifest.source_project, "TEST");
assert.equal(manifest.source_table, "supabase_migrations.schema_migrations");
assert.equal(manifest.source_column, "statements");
assert.equal(manifest.replayable, false, "Recovered statements must never be marked replayable");
assert.equal(manifest.items.length, 55, "Unexpected recovered migration inventory size");

const versions = manifest.items.map((item) => item.version);
assert.equal(new Set(versions).size, versions.length, "Duplicate migration version in manifest");
assert.deepEqual(versions, [...versions].sort(), "Manifest items must remain in ledger version order");

let coreCount = 0;
let relatedCount = 0;
const expectedFiles = new Set();

for (const item of manifest.items) {
  assert.equal(item.statement_count, 1, `Unexpected statement count for ${item.version}`);
  assert.match(item.version, /^\d{14}$/);
  assert.match(item.archive_path, /^supabase\/recovered-test-history\/professional-assignment\/[\w.-]+\.sql$/);
  assert.ok(!item.archive_path.startsWith("supabase/migrations/"), "Archive must remain outside deployable migrations");
  assert.ok(!item.archive_path.split("/").includes(".."), "Archive path traversal is forbidden");

  const absolutePath = resolve(repoRoot, item.archive_path);
  const rel = relative(repoRoot, absolutePath);
  assert.ok(rel && !rel.startsWith(`..${sep}`) && rel !== "..", "Archive path escaped repository root");
  assert.equal(statSync(absolutePath).isFile(), true);

  const sql = readFileSync(absolutePath, "utf8");
  assert.ok(sql.trim().length > 0, `Empty recovered SQL: ${item.archive_path}`);
  assert.equal(Array.from(sql).length, item.source_length, `Source length mismatch: ${item.version}`);
  assert.match(item.source_sha256, /^[a-f0-9]{64}$/, `Missing TEST-ledger SHA-256: ${item.version}`);
  const archiveSha256 = createHash("sha256").update(sql, "utf8").digest("hex");
  assert.equal(archiveSha256, item.source_sha256, `TEST-ledger SHA-256 mismatch: ${item.version}`);
  expectedFiles.add(item.archive_path);

  const action = Number(item.name.match(/action_(\d+)/)?.[1]);
  if (action === 458 || (action >= 460 && action <= 498)) coreCount += 1;
  else if ([525, 526, 527, 607, 610, 611, 613, 615].includes(action)) relatedCount += 1;
  else assert.fail(`Out-of-scope migration action in archive: ${item.name}`);
}

assert.equal(coreCount, 42);
assert.equal(relatedCount, 13);
const sqlFiles = readdirSync(archiveRoot)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => `supabase/recovered-test-history/professional-assignment/${name}`);
assert.deepEqual([...sqlFiles].sort(), [...expectedFiles].sort(), "Archive SQL files and manifest differ");
const readme = readFileSync(resolve(archiveRoot, "README.md"), "utf8");
assert.match(readme, /auto-applied.*replayed/i);
assert.match(readme, /Action 459 .* intentionally excluded/i);
console.log("Recovered TEST history integrity PASS: 55/55 files match TEST-ledger SHA-256, manifest, scope and non-replayability.");
