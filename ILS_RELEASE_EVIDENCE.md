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

## PHASE 4A — Judgment Deep Closure (2026-09-25)
- Production judgment rows: 170.
- `judgment_text_status`: completed 157, pending 13.
- `summary_status`: completed 109, failed 23, pending 38.
- `processing_error` is non-null on 59 rows.
- `judgment_fetch_logs`: 6 records remain `running`, all created 2026-08-23; this is stale-run evidence, not a current healthy-running state.
- A current 2026-09-25 verified judgment example has official `sci.gov.in` URLs, source hash, retrieved document text and `judgment_text_status=completed`, while summary is still pending.
- Therefore the pipeline exists and official provenance is present, but the current dataset has material failed/pending/stale states.
- No valid production judgment rows were changed.
- No blind merge of `release/g6-judgment-source-reconcile-20260925`.
- **Judgment classification: DEFECT/UNVERIFIED operational closure**, not a missing architecture. A safe fix must first be isolated to retry/stale-job handling or summary processing and tested in TEST.

## PHASE 4B — SEO Deep Closure
- Current main generator was inspected. It generates canonical tags and `index, follow` metadata for generated public pages and filters advocates to Approved + Public.
- The generator also contains a manually verified government-route registry and explicit official-source boundary.
- It is not sufficient evidence of complete route integrity: generator output does not by itself prove deployed sitemap/canonical/redirect/indexability consistency.
- V9 and cursor SEO branches remain materially divergent; no blind merge or wholesale regeneration performed.
- **SEO classification: UNVERIFIED**, with controlled route-manifest/deployed-runtime comparison still required.

## PHASE 4C — Location/LGD Deep Closure
- Production `location_registry` row count = 0.
- TEST `location_registry` row count = 0.
- Thus a populated stable-ID/LGD location registry is not currently evidenced by live database rows in either environment, despite historical/source architecture references.
- No duplicate-ID or duplicate-route rows can be demonstrated because the registries are empty.
- This is an evidence/integration gap, not grounds for replacing the architecture.
- **Location classification: HOLD / UNVERIFIED**.

## PHASE 4D — Production Security Deep Analysis
- The three Production advocate-directory views are owned by `postgres`, are non-RLS views, and use SECURITY DEFINER semantics; `approved_advocates_public` explicitly has `security_invoker=false`.
- The views expose only approved/public advocate profile columns, but database grants currently include broad DML privileges to `anon` and `authenticated` on the views. This is a **configuration-gap candidate** and requires TEST reproduction/updatability testing before any production change.
- Production security advisor reports:
  - 3 SECURITY DEFINER view errors.
  - 4 mutable-search_path warnings: `set_client_work_progress_updated_at`, `update_judgments_updated_at`, `search_judgments`, `update_judgment_sources_updated_at`.
  - 3 anon-executable SECURITY DEFINER functions: `get_client_assigned_advocate`, `get_client_portal`, `send_client_portal_message`.
  - 13 authenticated-executable SECURITY DEFINER functions, several intentionally used as admin/advocate/customer RPC boundaries.
  - leaked-password-protection disabled warning.
- No security changes were made. No privilege or RLS weakening occurred.
- **Security classification: HOLD / REQUIRES TEST**.

## PHASE 4E — Cross-Gate Dependency Reassessment
| Gate | Exact blocker | Type | Can progress without external credential? | Evidence required |
|---|---|---|---|---|
| Notification | genuine provider delivery evidence | external provider/configuration | No for final delivery closure | authenticated TEST send + provider delivery/status/retry evidence |
| Professional | genuine authenticated professional assignment/work | execution/identity | Partly | real TEST professional identity + authorization + assignment/work audit |
| Security | unresolved Production privilege/view/function warnings | security/configuration | Yes for analysis; final hostile E2E requires authenticated test contexts | TEST privilege/RLS hostile tests + exact remediation evidence |
| Payment | genuine provider transaction + webhook/replay evidence | external provider | No for final payment closure | Razorpay test transaction, signed webhook, duplicate/replay/failure evidence |
| GST/Gov | genuine GST DRC-01C E2E provenance | execution/integration | Partly; official submission remains external | authenticated TEST intake → evidence bind → promotion → downstream result/audit |
| Judgment | 23 failed + 38 pending summaries, 13 pending text, 6 stale running fetch logs | operational defect | Yes | TEST retry/stale handling verification + fresh pipeline evidence |
| SEO | deployed route/indexability consistency | verification | Yes | route sweep + sitemap/canonical/robots/redirect evidence |
| Location | empty live location registry | integration/evidence | Yes | source-to-DB/route reconciliation and duplicate/collision tests |
