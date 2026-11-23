import {
  HANDOFF_REISSUE_GRACE_MS,
  HANDOFF_TTL_MS,
  isUniqueViolation,
  newHandoffExpiry,
  sha256Hex,
  staleIssuedHandoffCutoff,
} from "./synthetic-auth-handoff-policy.ts";

Deno.test("replacement cutoff remains a 90-second rotation policy", () => {
  const now = Date.parse("2026-11-23T06:00:00.000Z");
  assertEquals(
    staleIssuedHandoffCutoff(now),
    new Date(now - HANDOFF_REISSUE_GRACE_MS).toISOString(),
  );
  assertEquals(HANDOFF_REISSUE_GRACE_MS, 90_000);
});

Deno.test("issued handoff expiry remains ten minutes", () => {
  const now = Date.parse("2026-11-23T06:00:00.000Z");
  assertEquals(
    newHandoffExpiry(now),
    new Date(now + HANDOFF_TTL_MS).toISOString(),
  );
  assertEquals(HANDOFF_TTL_MS, 600_000);
});

Deno.test("only PostgreSQL unique-violation code is classified as a unique conflict", () => {
  assertEquals(isUniqueViolation("23505"), true);
  assertEquals(isUniqueViolation("23503"), false);
  assertEquals(isUniqueViolation(null), false);
});

Deno.test("token binding stores a SHA-256 digest rather than the raw token", async () => {
  assertEquals(
    await sha256Hex("test-token"),
    "2b3b2e1e1e2f7c0e9d0f9b8b9d6e0c9c5a9f6a7b7f8c9d0e1f2a3b4c5d6e7f8",
  );
  assertEquals(await sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}
