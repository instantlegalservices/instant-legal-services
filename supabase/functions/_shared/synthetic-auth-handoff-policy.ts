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
