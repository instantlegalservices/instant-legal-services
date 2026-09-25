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
