# ILS Notification Test Matrix

## Phase 7A — Authoritative Source/Evidence Reconciliation
Date: 2026-09-25

| Control | Production | TEST | Classification |
|---|---|---|---|
| Notification tables | No current matching public notification tables evidenced | Full notification domain schema present | TEST-only architecture |
| Central ingress | No current Production function evidenced | `ils_notification_central_ingress_v1`, service-role-only | Partial |
| Dispatch/queue | No current Production chain evidenced | Dispatch queue + delivery attempts + dead letters exist | Partial |
| Provider delivery function | No current Production notification Edge Function evidenced | `ils-notification-e2e-real` v1 | TEST-only |
| Provider | No Production notification provider path evidenced | Resend call coded | TEST-only |
| Provider secret | Unknown | Presence not verified | BLOCKER |
| Provider acceptance evidence | None | Function records provider id/status, but release evidence is hard-coded UNVERIFIED | BLOCKER |
| Final persisted delivery status | No Production path evidenced | Existing notification tables have status fields, but TEST real function does not bind/update the canonical delivery chain | BLOCKER |
| Audit evidence | No Production notification audit chain evidenced | `ils_e2e_evidence` insert exists | Partial |
| RLS/auth | No Production notification surface to validate | Central ingress service-role-only; real test function requires JWT + fixed synthetic user | Partial |
| Git provenance | Not mapped | Not mapped for notification source | BLOCKER |

## Canonical TEST-only observed path
Authorized TEST synthetic handoff -> `ils-notification-e2e-real` -> Resend request -> provider status polling -> `ils_e2e_evidence` -> `UNVERIFIED/HOLD`.

## Minimum VERIFIED contract
- source/trigger record
- authenticated function invocation
- provider request + acceptance/reference
- provider delivery/status evidence
- persisted final delivery state
- canonical audit binding
- genuine release-gate decision

## Execution
No notification was sent in Phase 7A.

## Final
**NOTIFICATION_E2E = BLOCKED**

Exact blocker: no authoritative Production notification delivery runtime is currently evidenced/mapped; TEST provider secret presence is UNKNOWN; TEST real-delivery function hard-codes release evidence as UNVERIFIED/HOLD.

**JUDGMENT_CONCURRENCY = OPEN / UNVERIFIED**

**PRODUCTION = HOLD**  
**MAIN = UNTOUCHED**  
**G6 = NOT MERGED**
