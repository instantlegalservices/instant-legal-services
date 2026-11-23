export const HANDOFF_TTL_MS = 10 * 60 * 1000;
export const HANDOFF_REISSUE_GRACE_MS = 90 * 1000;

export function staleIssuedHandoffCutoff(nowMs = Date.now()): string {
  return new Date(nowMs - HANDOFF_REISSUE_GRACE_MS).toISOString();
}

export function newHandoffExpiry(nowMs = Date.now()): string {
  return new Date(nowMs + HANDOFF_TTL_MS).toISOString();
}

export function isUniqueViolation(code: string | null | undefined): boolean {
  return code === "23505";
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
