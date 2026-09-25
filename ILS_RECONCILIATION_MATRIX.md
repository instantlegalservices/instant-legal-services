# ILS Reconciliation Matrix — Initial

| Area | MAIN | V9 | TEST | PRODUCTION | RELEASE/CURSOR | Status |
|---|---|---|---|---|---|---|
| Customer Action E2E | Test artifacts present | improved test artifacts | real gate GO | no production execution required | cursor invoke branch ahead 2 | VERIFIED |
| Document E2E | no native test runner in main | test branches | real evidence binding + GO | existing client document function | none merged | VERIFIED |
| Notification E2E | no genuine proof in main | test artifacts | function + HOLD | no dedicated notification Edge Function found in production list | none | HOLD |
| Professional Assignment | production architecture source exists | V9 differs materially | test architecture | production tables/functions | none merged | HOLD |
| Security E2E | hardened RLS source | V9 security/test artifacts | hostile/test registries | production RLS active | none merged | HOLD |
| Payment | existing Razorpay client | not to be blindly merged | synthetic UPI test stack | razorpay-payments + webhook active | none merged | HOLD |
| GST DRC-01C | no current-main GST source match | historical design/implementation not yet recovered in repo | native tables/migrations + authenticated intake bridge | no GST migrations/functions | none merged | HOLD |
| Judgment | public research pages + source files | release branch adds one process-summary file | test pipeline artifacts | 16 active functions include full judgment chain | release/g6 ahead 2 | PARTIALLY_VERIFIED |
| SEO | current generator/robots/sitemap | v9-final-test diverges by 146 ahead/101 behind | location test migrations | location registry foundation deployed | cursor/g1 ahead 5 | PARTIALLY_VERIFIED |
| Location/LGD | current location foundation | major V9 implementation | TEST location migrations | production location registry + redirects | multiple branches | HOLD |

## Branch facts
- main = 1dad0952bcddf5f4e5d09786cf688835ccda24c4
- v9-final-test = 3ae72f7574f57de2408fb0081ba5c7f7df09c755; diverged, 146 ahead / 101 behind main.
- release/g6-judgment-source-reconcile-20260925 = a7fb9c9bfd4707beedb3bb238d13762c5ba4b46d; ahead 2, adding only process-judgment-summary/index.ts.
- release/ils-write-test-20260925 = same SHA as main.
- cursor/customer-action-e2e-invoke-cb89 = bb7c593481ce52a81ce288385090a3ef78a71bb3; ahead 2 with customer-action invocation artifacts.
- cursor/g1-seo-indexability-cb89 = 1c57c0b4498f84aa049f5e0b2a24c1ec233ec2e9; ahead 5 with indexability/test artifacts and small private-route metadata changes.
- search-router-v1 = 2a13dcfcd253553896bbd8d9f55c4290233e5857; diverged, 1 ahead / 24 behind.

No branch was merged in Phase 0–3.

## Phase 4 update
| Area | Main | V9 | TEST | Production | Release/Cursor | Status |
|---|---|---|---|---|---|---|
| Judgment | active source/pipeline | release branch adds summary processing | test pipeline artifacts | 170 rows; 23 failed + 38 pending summaries; 13 pending text; 6 stale running fetch logs | release/g6 ahead 2 | DEFECT / UNVERIFIED |
| SEO | generator + robots/sitemap | materially divergent | location/SEO test artifacts | deployed runtime not yet independently swept | cursor/g1 ahead 5 | UNVERIFIED |
| Location/LGD | source architecture | substantial V9 work | registry table exists but 0 rows | registry exists but 0 rows | multiple branches | HOLD |
| Security | hardened RLS source | security/test artifacts | hostile infrastructure | 3 SECURITY DEFINER view errors + function/search_path warnings | none merged | HOLD |


## Phase 5 — Judgment + Security
| Area | Finding | Classification | Status |
|---|---|---|---|
| Judgment source | Summary processor exists on release/g6 branch, not main; Production runtime source could not be retrieved through current function-bundle interface | Source/runtime reconciliation gap | HOLD |
| Judgment retry | Retryable waiting exists, but no lease/stale recovery or concurrency lock in recovered processor | Design-level gap; Production runtime defect not proven | HOLD |
| Judgment production state | 170 rows; 13 pending text; 23 failed summaries; 38 pending summaries; 59 processing errors; 59 waiting jobs; 6 stale running fetch logs | Operationally unverified | HOLD |
| Advocate-directory views | Updatable/insertable Production views with broad anon/authenticated DML grants; underlying table has RLS | Configuration-gap candidate; exploit not reproduced | HOLD |
| SECURITY DEFINER functions | 3 anon-executable + 13 authenticated-executable Production functions; TEST lacks equivalent portal schema | TEST parity gap | HOLD |
| search_path | 4 Production advisor warnings; no faithful TEST equivalents | Configuration warning; impact unproven | HOLD |
| Leaked passwords | Production Auth protection disabled | Security configuration gap / human decision | HOLD |


## Phase 6C-6 — Fresh Judgment Baseline
| Area | TEST execution | Evidence | Status |
|---|---|---|---|
| Judgment reproduction harness | Fresh deterministic SUCCESS baseline completed after isolated alias repair | run `972efe78-5701-4cf4-abd9-95a8e11ea61a`; fixture `ffb64934-7a26-41bf-9062-62896258f687`; job `91ee7e18-7475-43bb-8e73-b1d8cab69bd5`; invocation `7b53dce0-b9c9-4b5f-ae9c-4d7d64c6e1c4` | PASS |
| Chunk processing | 3/3 chunks processed once | chunk IDs 0, 1, 2; 3 analyses; 3 SUCCESS provider calls | PASS |
| Summary completion | Final synthesis persisted | `DETERMINISTIC_FINAL_SYNTHESIS`; job next_chunk=3; status COMPLETED | PASS |
| Retry/failure path | Not exercised in 6C-6 | Reserved for subsequent controlled phase | NOT RUN |
| Concurrency/stale/idempotency | Not exercised in 6C-6 | Reserved for subsequent controlled phase | NOT RUN |


## Phase 6C-7 — Completed Job Repeat
| Area | Before | After | Result |
|---|---|---|---|
| Job status | COMPLETED | COMPLETED | No mutation |
| next_chunk | 3 | 3 | No mutation |
| Chunk analyses | 3 | 3 | No duplicate processing |
| Provider calls | 3 | 3 | No additional calls |
| Invocation count | 1 | 2 | Second invocation recorded |
| Retry count | 0 | 0 | No retry mutation |
| Final synthesis | DETERMINISTIC_FINAL_SYNTHESIS | unchanged | No duplicate synthesis |
| Classification | — | IDEMPOTENT / SAFE REPEAT | PASS for this scenario |

## Phase 6C-8 — Concurrency Reproduction
| Field | Observation | Classification |
|---|---|---|
| Fresh TEST run | `d054d451-290a-41ef-9168-064c8e7aa5d9` | Created once |
| Fixture | `a0d302f9-4e92-4da3-a531-3175ba8c48a9` | Created once |
| Job | `de6a1c93-4f1d-4803-ad7b-754a94862a1c` | Fresh |
| Invocation A | Completed all 3 chunks | No overlap proven |
| Invocation B | `ALREADY_COMPLETED` | Started after A completion |
| Analyses | 3 | No duplicate observed, but overlap not tested |
| Provider calls | 3 | All from A |
| Final status | COMPLETED | Normal completion |
| Concurrency classification | Genuine overlap not established | **HARNESS LIMITATION** |

The existing harness can delay provider work, but the available execution orchestration did not produce a transactionally overlapping invocation. Using `interrupt_after_chunk` would return the first invocation rather than keep it active, so it cannot by itself create the required overlap window. No function modification or locking/idempotency mechanism was added.


## Phase 6C-8R — Overlap Capability

| Capability | Finding |
|---|---|
| Provider delay | Existing provider_delay_ms calls pg_sleep inside the processor invocation/transaction |
| Persistent PROCESSING | Yes; processor sets job PROCESSING before chunk loop |
| Live invocation during delay | Yes, if the database call remains active in an independent session |
| Interrupt control | Returns the invocation; cannot itself create overlap |
| Background/asynchronous worker | None inside the harness |
| Invocation lifecycle | Persisted start/observation/end fields |
| Lock/lease/token | None by design |
| Current execution orchestrator | Did not provide reliable independent-session concurrency |
| Minimum safe mechanism | Two independent TEST DB sessions/connections, orchestration-only |
| Processor semantics change required? | No |

**6C-8R classification: EXISTING HARNESS CAN ESTABLISH GENUINE OVERLAP** in principle, using its existing provider-delay behavior and two independent DB sessions. The prior 6C-8 experiment remains classified **HARNESS LIMITATION** because that independent-session overlap was not actually established.



## Phase 6C-8O — Two-Session Execution Result

| Item | Result |
|---|---|
| Orchestrator artifact | Created on controlled branch |
| Orchestrator design | Two separately initiated TEST HTTP requests to existing processor |
| Fresh TEST fixture | Created once |
| Run | 4dc48cbe-eb14-43a7-b2a3-c64ab10e0e4a |
| Job | ca7cf286-3d95-48c6-b99b-57e2f456805d |
| Provider delay | 8000 ms |
| Pre-state | PENDING / 0 / 3 / 0 analyses / 0 provider calls / 0 invocations |
| Invocation A | Not executed |
| Invocation B | Not executed |
| Genuine overlap | Not demonstrated |
| Cause | External orchestration runtime could not resolve TEST Supabase hostname |
| Classification | HARNESS LIMITATION |

The experiment is fail-closed: no result about concurrency safety, duplication, or race behavior is claimed.



## Phase 6C-8F — Final Concurrency Blocker Freeze

| Evidence | Status |
|---|---|
| 6C-6 normal single execution | PASS |
| 6C-7 completed-job repeat/idempotency | PASS |
| Genuine active-job concurrency | **UNVERIFIED** |
| Overlap capability in processor semantics | EXISTING / possible via provider_delay_ms |
| Two independent live sessions | Not established |
| 6C-8 | HARNESS LIMITATION |
| 6C-8R | EXISTING |
| 6C-8O | HARNESS LIMITATION |
| Production concurrency remediation | Not authorized / not performed |
| Release blocker | **JUDGMENT CONCURRENCY EVIDENCE = OPEN / UNVERIFIED** |

The evidence must not be interpreted as proof of concurrency safety or concurrency failure.


## PHASE 7A — NOTIFICATION E2E AUTHORITATIVE SOURCE + EVIDENCE RECONCILIATION (2026-09-25)

### 7A.1 Authoritative environment finding
This phase was source/evidence reconciliation only. No notification was sent and no Production mutation/deployment was performed.

**Production (`odqebkdzkjfxzyzbrndt`)**
- No public tables matching the authoritative notification architecture were found.
- No public functions matching the notification architecture were found.
- No active Edge Function with a notification delivery implementation was present in the current Production Edge Function inventory.
- No Production notification queue/dispatch/delivery-attempt/dead-letter/audit chain was evidenced.
- No Production notification provider implementation could therefore be mapped or executed.
- No Production notification migration entries were found.

**TEST (`bgsbuepolooybdqrzmoa`)**
- A substantial notification schema exists, including customer notifications, trigger events/rules, orchestration runs/steps, dispatch queue, delivery attempts, dead letters, failover, consent, preferences, rendered messages, security events/rules, health/KPI snapshots and E2E evidence/control tables.
- `ils_notification_central_ingress_v1` exists as a SECURITY DEFINER service-role-only ingress boundary. It validates source/recipient binding, enabled trigger rules and idempotency, then records a trigger event; it does not itself perform external delivery.
- `ils_notification_e2e_preflight_check()` is READY for the intentionally synthetic-only preflight, with external provider invocation and real recipient/message/customer data explicitly disallowed.
- `ils_notification_e2e_release_gate_evaluate()` requires at least one canonical verified evidence item and zero hostile/destructive failures.
- `ils_run_notification_e2e_synthetic_chain()` deliberately ends with REAL_NOTIFICATION_E2E = HOLD_UNTIL_GENUINE_PROOF; synthetic execution cannot close the gate.
- TEST active notification-related Edge Functions are the TEST-only `ils-notification-e2e-real` v1 and its auth handoff/confirm helpers. The real-test function requires `RESEND_API_KEY`, authenticates the fixed TEST synthetic user, calls Resend's API, polls provider status, and writes an `ils_e2e_evidence` record.
- Critically, the TEST `ils-notification-e2e-real` implementation hard-codes the persisted `evidence_class` to `UNVERIFIED` and returns `gate=HOLD` even when the provider reports `delivered`. Therefore its current return/evidence contract cannot legitimately establish `NOTIFICATION_E2E=VERIFIED`.
- The TEST auth-confirm helper calls the TEST `ils-notification-e2e-real` function only; it is not a Production delivery path.

### 7A.2 Canonical flow reconstruction
The currently evidenced TEST-only flow is:

`authorized TEST synthetic handoff` -> `ils-notification-e2e-real` -> `RESEND_API_KEY` lookup -> Resend `/emails` request -> provider response/email id -> provider status polling -> `ils_e2e_evidence` insert -> current evidence class remains `UNVERIFIED` -> release gate remains HOLD.

The broader TEST notification architecture is:

`authorized/service-role source event` -> `ils_notification_central_ingress_v1` -> `ils_notification_trigger_events` -> notification orchestration/queue model -> delivery-attempt/dead-letter/audit structures.

A genuine production provider-processing boundary is not currently evidenced in Production, so that broader chain cannot be promoted to an authoritative Production delivery flow.

### 7A.3 Provider prerequisite
`RESEND_API_KEY` status: **UNKNOWN**. The TEST delivery function reads the secret server-side and returns `TEST_PROVIDER_NOT_CONFIGURED` if it is absent; the secret value was not requested, displayed or exposed. No provider invocation was attempted in this phase.

Relevant function executability:
- TEST `ils-notification-e2e-real`: executable only with valid authenticated TEST synthetic context and provider secret; however, its current evidence contract is insufficient for release verification.
- Production: no current notification delivery function was evidenced, so genuine Production notification execution is not available from the identified current architecture.

### 7A.4 Source/provenance reconciliation
**TEST notification implementation = C. PARTIAL.**
Reason: the TEST database contains the notification domain architecture and a TEST-only Resend proof function, but the external-delivery path is not the same as a complete production notification runtime, and its evidence contract deliberately remains UNVERIFIED.

**Production notification implementation = D. MISSING (current runtime evidence).**
No current Production notification tables/functions/Edge Function/migration provenance were found.

**Git provenance = NOT MAPPED.**
Repository search on the current connected GitHub repository returned no matching source for `notification_central_ingress`, `ils-notification-e2e-real`, or `RESEND_API_KEY`. No source was copied between environments and no merge was attempted.

### 7A.5 Minimum genuine evidence required for VERIFIED
The release gate must demonstrate all of the following in one path-bound TEST evidence chain:
1. Authorized source event/trigger record creation.
2. Authenticated/authorized processing-function invocation with correlation id.
3. Actual provider request and provider acceptance, including provider message/reference id.
4. Provider delivery/status evidence sufficient for the declared delivery contract (not merely a local HTTP 2xx).
5. Persisted final delivery state linked to the same notification/correlation/provider reference.
6. Append-only/canonical audit evidence binding the above events and proving TEST-only isolation.
7. Release-gate evaluation showing genuine verified evidence count >= 1, hostile failures = 0, destructive attempts = 0.

A database row alone, a function 200, or synthetic simulation is insufficient.

### 7A.6 Execution decision
**No notification execution was performed.**
Prerequisites are not all verified: the Production notification delivery runtime is currently missing from the observed Production architecture; `RESEND_API_KEY` presence is UNKNOWN; and the current TEST real-delivery function persists UNVERIFIED evidence and explicitly returns HOLD.

Fail-closed result: **NOTIFICATION_E2E = BLOCKED**.

Exact blocker:
**No authoritative Production notification delivery path is currently evidenced/mapped, and the TEST-only provider function cannot produce canonical VERIFIED evidence under its current evidence contract; provider secret presence is UNKNOWN.**

No secrets were exposed. No RLS/auth weakening was performed. No Production notification was sent.

### 7A.7 Judgment freeze preserved
`JUDGMENT_CONCURRENCY = OPEN / UNVERIFIED` remains unchanged. Phase 7A did not reopen or modify any Judgment 6C evidence.

### 7A.8 Safety state
- PRODUCTION = HOLD
- MAIN = UNTOUCHED
- G6 = NOT MERGED
- Existing payment chain = untouched
- No blind merge
- No notification send
- No provider credential exposure


## PHASE 7B — NOTIFICATION PRODUCTION RUNTIME RECONSTRUCTION + GENUINE TEST PREREQUISITE CHECK (2026-09-25)

### Production discovery
Read-only inspection of Production found no complete notification delivery runtime. Public tables matching notification/email/resend/delivery/queue/dead-letter/message/template/provider/dispatch/mail were not found, except `client_chat_messages`, which is an existing portal messaging table and is not an external notification delivery system. Public functions matching those terms were limited to client-message functions (`admin_send_client_message`, `advocate_send_client_message`, `send_client_portal_message`); these persist portal chat messages and are not provider delivery functions. No notification-related Production database triggers were found. No notification-related scheduled cron job was found. The current Production Edge Function inventory contains no notification/email/Resend delivery function. Production migrations also contain no notification-specific migration entries.

Production therefore has no directly evidenced trigger -> processor -> provider -> persisted delivery -> audit notification chain in the current runtime.

### TEST contrast
TEST contains the notification architecture: `ils_notification_trigger_events`, `ils_notification_orchestration_runs`, `ils_notification_orchestration_steps`, `ils_notification_dispatch_queue`, `ils_notification_delivery_attempts`, `ils_notification_dead_letters`, rendered messages, templates, consent/preferences, health/security/KPI structures and E2E gate structures. `ils_notification_central_ingress_v1` exists and is a service-role-only ingress boundary. Delivery attempts have provider/message-reference/result/retry fields, while the dispatch queue has dedupe/status/attempt fields and dead letters have attempts/resolution fields.

The TEST `ils-notification-e2e-real` v1 is a TEST-only provider proof function. It requires authenticated TEST synthetic identity and `RESEND_API_KEY`, calls Resend and polls provider status, but its current evidence contract remains `UNVERIFIED/HOLD` even when provider delivery is observed.

### Git provenance
Repository searches on the connected GitHub repository found no exact source for `notification_central_ingress`, `ils-notification-e2e-real`, or `RESEND_API_KEY`. No exact Production notification source/version relationship was found. Supabase deployment hashes were not treated as Git provenance.

**GIT_PROVENANCE = NOT_FOUND** for an exact Production notification runtime source.

### Provider prerequisite
`RESEND_API_KEY = UNKNOWN`. No secret value was inspected or exposed. No provider request was made and Resend was not called in Phase 7B.

### Production architecture classification
**C. PRODUCTION NOTIFICATION RUNTIME MISSING.**
This classification is based on direct read-only inspection of Production Edge Functions, public schema, public functions, triggers, cron jobs and migration history. The existing `client_chat_messages`/portal-message functions do not constitute a notification provider runtime.

### Minimum next closure action
Do not implement or promote anything yet. The smallest next action is to recover the authoritative intended notification source/architecture from existing controlled artifacts/Git history (if it exists), then establish an isolated TEST genuine provider prerequisite and execution path whose evidence contract can legitimately produce VERIFIED. If no authoritative source exists, a separate design/implementation phase is required for the missing Production runtime; that phase must define provider adapter, queue/worker, persisted delivery state, retry/dead-letter handling, provider acceptance/reference capture, audit binding, authentication/RLS, and deployment provenance. No such implementation was performed in 7B.

### Execution boundary
No E2E notification was executed. No Resend request was made. No Production data/function/configuration was changed. No main change was made. G6 was not merged. Payment chain was untouched. Judgment 6C evidence was preserved unchanged.

**NOTIFICATION_E2E = BLOCKED**
**PRODUCTION_NOTIFICATION_RUNTIME = MISSING**
**GIT_PROVENANCE = NOT_FOUND**
**RESEND_API_KEY = UNKNOWN**
**JUDGMENT_CONCURRENCY = OPEN / UNVERIFIED**
**PRODUCTION = HOLD**
**MAIN = UNTOUCHED**
**G6 = NOT MERGED**


## PHASE 7C — NOTIFICATION ARCHITECTURE SOURCE RECOVERY (2026-09-25)

### Recovery result
Repository/GitHub searches for the exact notification function names, TEST Edge Function slug, notification table names, Resend secret reference, provider reference terms and notification commit messages returned no matching source objects or commits in the connected repository. Therefore exact Git provenance for the TEST notification implementation was **not recovered**.

However, TEST migration history provides strong database-architecture provenance. The notification subsystem was introduced through a coherent sequence of TEST migrations:
- `20260907160740 action_436_customer_notification_communication_engine`
- `20260907160855 action_437_notification_priority_intelligence`
- `20260907161007 action_438_notification_delivery_reliability`
- `20260907161110 action_439_notification_preference_consent_engine`
- `20260907161207 action_440_notification_personalization_language_engine`
- `20260907161549 action_441_notification_multichannel_failover_engine`
- `20260907161703 action_442_notification_security_abuse_guard`
- `20260907161805 action_443_notification_observability_health_monitor`
- `20260907161910 action_444_notification_analytics_kpi_engine`
- `20260907162002 action_445_notification_automation_trigger_engine`
- `20260907162059 action_446_event_notification_orchestrator`
- `20260907165434 action_454_notification_security_bridge`
- `20260907165553 action_455_notification_e2e_simulation`
- `20260908103007 action_521_notification_e2e_safety_gate_preflight`
- `20260908110233 action_522_notification_e2e_synthetic_hostile_tests`
- `20260908114703 action_523_notification_e2e_release_gate`
- `20260908114754 action_523_notification_e2e_release_gate`
- `20260911161740 action_notification_central_ingress_v1`
- `20260911161755 action_notification_central_ingress_v1_fix_professional_service_context`
- `20260911162427 fix_notification_central_ingress_schema_contract_v2`

The current TEST schema confirms the resulting architecture: trigger events/rules, orchestration runs/steps, rendered messages/templates, dispatch queue, delivery attempts, dead letters, failover, preferences/consent, priority, security, health/KPI and E2E gate structures. The central ingress function is present and SECURITY DEFINER. TEST also exposes notification-center/read functions and E2E gate functions.

### Evidence-backed architecture reconstruction
`authorized source/event` → `ils_notification_central_ingress_v1` → `ils_notification_trigger_events` → orchestration/template/consent/priority/security decisions → `ils_notification_dispatch_queue` → delivery attempt → provider reference/result → retry/dead-letter/failover → notification/audit/health evidence.

The architecture is **EXISTING IN TEST**. The historical structural blueprint explicitly records that the notification infrastructure exists but also identifies a major gap: no verified producer/dispatcher linkage from business workflows and no notification-producing DB triggers were found. It also records that external SMS/WhatsApp/email/push delivery proof was not established. fileciteturn619file0

The blueprint therefore supports the existence and intended structure of the notification subsystem, but it does **not** establish that every component is intended for Production. In particular, Production intent of the external provider adapter remains UNKNOWN. The earlier audit also identifies business-event wiring and external delivery proof as open gaps. fileciteturn619file5

### TEST / Production reconciliation
Production currently lacks the recovered notification schema/runtime. Specifically, no corresponding Production notification tables, provider processor Edge Function, notification DB triggers or notification cron were evidenced in Phase 7B. Existing Production portal chat functions are not equivalent to notification delivery.

The following are therefore classified:
- TEST notification schema/orchestration: **EXISTING IN TEST**
- TEST central ingress: **EXISTING IN TEST**
- TEST E2E simulation/release-gate layer: **EXISTING IN TEST**
- TEST real-provider proof function: **TEST-ONLY**; exact Git source not recovered
- Production notification runtime: **MISSING**
- Production external provider adapter: **UNKNOWN / not evidenced**
- Production business-event producers/dispatcher linkage: **UNKNOWN / not evidenced**
- Production notification migration/provenance: **NOT FOUND**

### Working-chain protection
The recovered notification architecture does not by itself establish a need to modify the existing payment, customer-auth, document, judgment, or Production portal-messaging chains. The historical blueprint instead describes notification integration as a separate communication layer and explicitly identifies missing producer linkage as unfinished work. fileciteturn619file0

No code, migration, function, policy, secret, payment chain, Production object, main branch, or G6 branch was modified in Phase 7C. No provider call was made.

### Decision
**B. SOURCE PARTIALLY RECOVERED — ADDITIONAL SOURCE EVIDENCE REQUIRED**

Reason: the authoritative TEST database architecture and migration sequence are recovered with strong evidence, but exact Git source/commit provenance for the notification implementation and the authoritative Production-intended provider adapter are not recovered. A full A classification would overstate the evidence.

### Final state
**NOTIFICATION_E2E = BLOCKED**
**PRODUCTION_NOTIFICATION_RUNTIME = MISSING**
**GIT_PROVENANCE = PARTIALLY_MAPPED**
**SOURCE_RECOVERY = B**
**JUDGMENT_CONCURRENCY = OPEN / UNVERIFIED**
**PRODUCTION = HOLD**
**MAIN = UNTOUCHED**
**G6 = NOT MERGED**
