# Production UPI payment-proof hardening — review proposal

> **NON-DEPLOYABLE DESIGN DOCUMENT. DO NOT RUN THIS FILE OR APPLY SQL TO PRODUCTION.**
>
> This document records the read-only Production findings and the required implementation/test contract. It is intentionally not a Supabase migration. A deployable migration must be authored only after the complete function bodies, grants, policies, Storage metadata contract, and TEST regression suite have been reviewed.

## Scope and safety boundary

- Target: Production UPI payment-proof submission and admin verification.
- This is separate from revenue-first checkout PR #104.
- No Production writes, DDL, function replacement, policy changes, or data changes were performed during this audit.
- Preserve the existing order creation, customer status lookup, private proof viewing, admin UI, and entitlement behavior.
- Never treat a screenshot or client-supplied UTR as proof of bank settlement. Admin review remains a manual verification step unless a trusted payment-provider integration is introduced.

## Read-only Production facts observed (2026-11-16)

### Existing submission RPC

`public.ils_submit_upi_payment_proof(uuid,numeric,text,text,text,text,text,text,integer)` is SECURITY DEFINER with fixed `search_path = public, pg_temp`.

It currently checks authenticated user, order ownership and pending state, amount, expected UPI ID, normalized UTR length, path prefix, allowed MIME, declared file size, SHA-256 syntax, and one pending proof per order.

**Gaps:** it trusts client-supplied file metadata and does not verify the corresponding object in `storage.objects`; it does not reject reuse of a transaction reference on another order.

### Storage schema verified from Production

`storage.objects` contains both `owner` (UUID) and `owner_id` (text). Current payment-proof objects have both populated with the same authenticated user UUID. `metadata` contains `size` and `mimetype`; `name` stores the full user/order/file path.

Therefore, any final RPC must compare:
- `bucket_id = 'payment-proofs'`
- exact `name = normalized screenshot path`
- owner identity using the Production columns (compare both when populated; do not assume TEST's schema)
- `metadata->>'size'` to the declared size
- normalized `metadata->>'mimetype'` to the declared MIME
- reject absent, archived, or delete-marker objects as appropriate to the live Storage schema

### Existing admin verification RPC

`public.ils_admin_verify_upi_payment_proof(uuid,text,text)` is SECURITY DEFINER with fixed `search_path = public, pg_temp`. It checks admin authorization, locks the proof, requires pending status, and atomically updates proof/order/request. It then creates an entitlement for the first order item if one is not already present.

**Gaps:** before verification it does not explicitly require proof owner = order owner, proof amount/currency = order total/currency, linked request owner = order owner, and linked request status = pending. It also does not validate a missing service request or ambiguous/missing order-item service mapping before committing the paid state.

### Existing Production data and constraints

- `payment_proofs`: 2 rows, both verified; 2 distinct UTRs; no null references.
- Normalized-reference collision preflight: no collisions found across existing rows.
- Existing unique index: one pending proof per order.
- No active-UTR unique index currently exists.
- `entitlements` has only its primary key; no uniqueness constraint for `(user_id, service_id, order_id)`.
- Both existing verified proofs link to paid orders and paid service requests owned by the same user; each has one order item and one entitlement.
- There are currently 2 objects in the private `payment-proofs` bucket. Both observed objects have matching `owner` and `owner_id`, path user/order/file, and JPEG metadata.

These are point-in-time observations, not a guarantee that data remains unchanged at deployment time. Repeat all preflight queries immediately before any future deployment.

## Required implementation contract

### A. Close direct table-write path

1. Revoke `INSERT` on `public.payment_proofs` from `authenticated`.
2. Drop the weak authenticated INSERT policy that checks only `user_id = auth.uid()`.
3. Keep customer proof submission through the validated SECURITY DEFINER RPC.
4. Re-check effective grants, RLS policies, function owner, EXECUTE grants, and service-role behavior after migration. Do not unintentionally remove admin read access or the private Storage flow.

### B. Harden submission RPC

1. Preserve current order-owner lock and all existing validations.
2. Verify the exact uploaded Storage object against Production `storage.objects` metadata and ownership fields.
3. Canonicalize UTR once (uppercase alphanumeric) and serialize submissions for that UTR with a transaction-scoped advisory lock before checking reuse.
4. Reject the same canonical UTR on a different order, including previously rejected proofs if policy requires lifetime cross-order non-reuse. Permit retry on the same order only when no pending proof exists and the business rule explicitly allows it.
5. Add a partial unique expression index for active (`pending`, `verified`) canonical UTRs only after a fresh preflight proves no normalized duplicates. Keep the advisory lock because the index alone does not enforce rejected-history cross-order policy.
6. Retain the one-pending-proof-per-order guarantee and validate all function grants.

### C. Harden admin verification RPC

1. Check admin authorization and valid decision; bound notes length.
2. Lock the proof, then its order, then the linked service request in a consistent order to reduce deadlocks.
3. For a verify decision, require:
   - proof is pending;
   - proof user equals order user;
   - order is pending;
   - proof amount matches order total under the established INR rounding tolerance;
   - proof currency equals order currency;
   - order has a linked service request;
   - request owner equals order owner and request is pending;
   - exactly one eligible service entitlement target is identified from order items (or explicitly define multi-item semantics).
4. Update proof, order, request, and entitlement in one transaction; any failed check must roll back all state changes.
5. Prevent duplicate entitlement creation under concurrent admin actions. Prefer a schema-appropriate unique constraint/index after duplicate preflight, or a locked, demonstrably race-safe upsert. Do not add a uniqueness rule that invalidates legitimate multi-quantity/multi-service orders.
6. Preserve rejection behavior: rejecting a proof must not mark the order/request paid or create an entitlement.
7. Confirm idempotent/repeated decisions are rejected safely and cannot create additional entitlements.

## Mandatory TEST-only negative and concurrency tests

- Authenticated direct INSERT into `payment_proofs` is denied.
- Valid customer upload + RPC submission succeeds.
- Missing object, wrong bucket/path, wrong owner, MIME mismatch, size mismatch, archived/deleted object are rejected.
- Customer cannot submit proof for another customer's order.
- Wrong amount, wrong UPI ID, malformed UTR, malformed hash, oversized file, non-pending order are rejected.
- Same normalized UTR on another order is rejected for pending, verified, and rejected history according to the selected policy.
- Concurrent submissions with same UTR across two orders: at most one can succeed.
- Non-admin cannot list or decide proofs.
- Admin verification rejects proof/order owner mismatch, amount mismatch, currency mismatch, missing request, request-owner mismatch, non-pending request, non-pending order, and invalid service mapping.
- Any verification failure leaves proof/order/request/entitlement unchanged.
- Concurrent verification cannot create duplicate entitlements.
- Rejection leaves order unpaid and creates no entitlement.
- Successful synthetic TEST verification updates exactly the matching proof/order/request and unlocks the correct customer entitlement.
- Re-run checkout-resume, admin proof UI, customer status, and private proof-view E2E tests to detect regressions.

## Deployment gate

**BLOCKED — no Production migration is approved by this document.**

Before deployment:
1. Implement the changes in an isolated TEST migration (not under `supabase/test-only/` if that folder is intentionally excluded from normal deployment).
2. Run all positive, negative, concurrency, and existing checkout regression tests against TEST.
3. Review the final SQL diff and exact grants/policies/function definitions.
4. Repeat Production data preflight (normalized UTR collisions, entitlement duplicates, proof/order/request relationship anomalies, Storage metadata).
5. Prepare a rollback plan and a short maintenance/deployment window.
6. Obtain explicit authorization before applying any Production change.
7. After deployment, verify grants, policies, function definitions, synthetic-only TEST evidence, and Production read-only invariants.

## Related work

- Revenue-first checkout PR #104 remains separate and must not be merged as a substitute for this security work.
- PR #104 synthetic TEST E2E proves application-state transitions only; it does not prove real UPI/bank settlement.
