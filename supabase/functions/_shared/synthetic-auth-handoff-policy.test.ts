import {
  HANDOFF_REISSUE_GRACE_MS,
  HANDOFF_TTL_MS,
  isUniqueViolation,
  isMatchingIssuedHandoff,
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
    "4c5dc9b7708905f77f5e5d16316b5dfb425e68cb326dcd55a860e90a7707031e",
  );
  assertEquals(await sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assertEquals(await sha256Hex("test-token") === await sha256Hex("other-token"), false);
});

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("a token for handoff A cannot be substituted with handoff B", () => {
  const now = Date.parse("2026-11-23T06:00:00.000Z");
  const handoffB = {
    synthetic_user_id: "synthetic-user",
    status: "ISSUED",
    expires_at: new Date(now + 60_000).toISOString(),
    token_hash_sha256: "b".repeat(64),
  };
  assertEquals(
    isMatchingIssuedHandoff(handoffB, "synthetic-user", "a".repeat(64), now),
    false,
  );
  assertEquals(
    isMatchingIssuedHandoff(handoffB, "synthetic-user", "b".repeat(64), now),
    true,
  );
});

Deno.test("superseded, consumed, expired, or wrong-user handoffs cannot be confirmed", () => {
  const now = Date.parse("2026-11-23T06:00:00.000Z");
  const base = {
    synthetic_user_id: "synthetic-user",
    status: "ISSUED",
    expires_at: new Date(now + 60_000).toISOString(),
    token_hash_sha256: "a".repeat(64),
  };
  for (const status of ["SUPERSEDED", "CONSUMED", "EXPIRED"]) {
    assertEquals(
      isMatchingIssuedHandoff({ ...base, status }, "synthetic-user", "a".repeat(64), now),
      false,
    );
  }
  assertEquals(
    isMatchingIssuedHandoff({ ...base, expires_at: new Date(now).toISOString() }, "synthetic-user", "a".repeat(64), now),
    false,
  );
  assertEquals(
    isMatchingIssuedHandoff(base, "different-user", "a".repeat(64), now),
    false,
  );
});
