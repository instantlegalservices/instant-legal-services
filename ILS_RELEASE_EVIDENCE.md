# ILS Release Evidence

## Phase 0 — Environment Identity
- Repository: instantlegalservices/instant-legal-services
- Default branch: main
- Starting main SHA: 1dad0952bcddf5f4e5d09786cf688835ccda24c4
- Controlled working branch: cursor/ils-master-completion-20260925
- TEST Supabase: bgsbuepolooybdqrzmoa — ACTIVE_HEALTHY — ap-southeast-1
- Production Supabase: odqebkdzkjfxzyzbrndt — ACTIVE_HEALTHY — ap-southeast-1
- Production migrations currently listed: 16
- TEST migrations currently listed: 558
- No production mutation performed during Phase 0–3.

## Gate status at baseline
| Gate | Environment | Status | Evidence basis |
|---|---|---|---|
| CUSTOMER_ACTION_E2E | TEST | VERIFIED | Existing REAL_VERIFIED gate GO on 2026-09-23; authorization/audit evidence verified; production touch false. |
| DOCUMENT_E2E | TEST | VERIFIED | Existing release decision GO on 2026-09-23 with 1 genuine verified evidence item and 8 hostile tests passed; canonical real-evidence binding exists. |
| NOTIFICATION_E2E | TEST | HOLD | Latest release decision requires genuine verified evidence; current record shows 0 genuine verified evidence. |
| PROFESSIONAL_ASSIGNMENT_E2E | TEST | HOLD | Latest release decision requires genuine verified evidence; current record shows 0 genuine verified evidence. |
| SECURITY_EXECUTION_E2E | TEST | HOLD | Latest release decision requires genuine verified proof; current record shows 0 genuine verified evidence. |
| GST/GOV | TEST | HOLD | Native GST DRC-01C schema/functions exist in TEST, but no genuine E2E; latest harness run is synthetic-only BLOCKED. Production has no GST migrations/functions. |
| PAYMENT_E2E | PRODUCTION/TEST | HOLD | Existing payment chain located; genuine provider transaction evidence not yet verified. |
| JUDGMENT_PIPELINE | PRODUCTION | PARTIALLY_VERIFIED | Active fetch/process/summary pipeline exists; independent current E2E closure still required. |
| SEO_ROUTE_INTEGRITY | PRODUCTION | PARTIALLY_VERIFIED | Current main has route/generator/robots/sitemap; V9 branch diverges materially and is not merged. Full route sweep pending. |
| RELEASE_E2E | PRODUCTION | HOLD | Multiple required gates remain HOLD. |

## First executed safe verification action
DOCUMENT_E2E independent evidence reconciliation completed read-only against TEST.
- Canonical release decision: GO.
- Real evidence binding: DOCUMENT_E2E_REAL_V1.
- Function: ils-document-e2e-real v1.
- Authenticated test user bound in evidence: 82de1b27-5939-4f9e-bdce-313ed59ee7b1.
- Hostile results inspected: pass records present; no destructive attempts.
- Result: DOCUMENT_E2E remains VERIFIED under the existing gate contract.
- No schema, data, function, or production changes were made.

## Evidence limitations
A gate is not considered production-ready merely because an implementation exists. Payment, government, notification, professional-assignment, security, judgment, SEO and final release closure still require their own genuine evidence.

## Subsequent safe verification findings

### NOTIFICATION_E2E
- Existing TEST function: `ils-notification-e2e-real` v1, JWT required.
- It depends on external `RESEND_API_KEY` and is hard-bound to a TEST synthetic authenticated user.
- It sends to the provider's test recipient and records evidence as `UNVERIFIED`; therefore the current function cannot by itself close the release gate.
- Latest gate remains HOLD with 0 genuine verified evidence.
- No notification send was executed and no secret was requested/exposed.
- Classification: EXTERNAL DEPENDENCY + IMPLEMENTATION/EVIDENCE CONTRACT GAP; do not rewrite blindly.

### PROFESSIONAL_ASSIGNMENT_E2E
- TEST preflight is READY but explicitly disallows real professional identity, real assignment, real work offer and payout invocation.
- Latest gate remains HOLD with 0 genuine verified evidence.
- Synthetic run passed 9/10 steps but held the real-assignment boundary.
- Classification: genuine authenticated professional E2E dependency; no synthetic result may be promoted to VERIFIED.

### PAYMENT_E2E
- Production `razorpay-payments` v1 and `razorpay-webhook` v1 are active.
- Existing chain is preserved and no payment code was changed.
- Read-only inspection found no unique constraint on `payment_events`; webhook inserts an event before state updates and does not itself deduplicate event rows. This is a candidate replay/idempotency gap requiring TEST-only design/test before any production change.
- Provider secrets are server-side only; genuine Razorpay transaction evidence remains unavailable in the current tool context.
- Gate remains HOLD.

### GST/GOV
- TEST has native DRC-01C tables, migrations and authenticated intake bridge; current main has no corresponding GST source match and Production has no GST migrations.
- TEST migration history contains the GST case/intake, private storage, binding, promotion, lifecycle, audit, retention and authenticated intake work.
- TEST private bucket `ils-gst-drc01c-evidence` is non-public, 50 MiB limited, MIME restricted; authenticated case-scoped SELECT/INSERT policies are present.
- Native functions enforce auth.uid ownership, SHA-256 validation, size/MIME boundaries, duplicate/replay blocking, case/path binding and promotion gates.
- Latest GST harness run is synthetic-only BLOCKED at provenance; TEST case count is 0.
- Classification remains HOLD / existing partial implementation; no TEST→Production promotion.

## Current safe-work boundary
The next work requiring external/authenticated execution is genuine Notification/Professional/Payment/GST E2E. No credentials, secrets, production approval, or synthetic substitution will be invented.
