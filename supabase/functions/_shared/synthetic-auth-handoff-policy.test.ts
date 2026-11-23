import {
  HANDOFF_REISSUE_GRACE_MS,
  HANDOFF_TTL_MS,
  isUniqueViolation,
  newHandoffExpiry,
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

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}
