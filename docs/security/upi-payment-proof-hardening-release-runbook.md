# UPI payment-proof hardening — Production release runbook

**Status: PREPARED, NOT AUTHORIZED FOR DEPLOYMENT.**  
Target: Production Supabase project `odqebkdzkjfxzyzbrndt`  
Candidate: `supabase/migrations/20261116210000_harden_upi_payment_proof_security.sql`  
PR: [#113](https://github.com/instantlegalservices/instant-legal-services/pull/113)

## Hard safety boundaries

- TEST validation is complete; it does not authorize Production deployment.
- Do not merge, apply the migration, change Production secrets, or alter payment configuration without explicit release approval.
- Do not change UPI QR checkout or claim bank settlement. Admin verification remains a manual payment decision.
- Use a short low-traffic deployment window. Stop if any preflight differs from the recorded expected state.
- Preserve checkout resume, customer portal, Admin UI, proof viewing, and entitlement behavior.

## Pre-deployment snapshot

Run read-only against Production immediately before deployment and save the output in the release record:

1. Capture `pg_get_functiondef` for both current RPCs:
   - `ils_submit_upi_payment_proof(uuid,numeric,text,text,text,text,text,text,integer)`
   - `ils_admin_verify_upi_payment_proof(uuid,text,text)`
2. Capture `pg_get_userbyid(proowner)`, `prosecdef`, `proconfig`, and `proacl` for both RPCs.
3. Capture the exact `payment_proofs_insert_own` policy definition and table ACL for `anon`, `authenticated`, and `service_role`.
4. Record current indexes and RLS state for `payment_proofs` and `entitlements`.
5. Re-run data checks:
   - Duplicate normalized UTRs among pending/verified proofs.
   - Duplicate `(user_id, service_id, order_id)` entitlements for non-null order IDs.
   - Verified proof ↔ order owner, amount, currency, paid status.
   - Verified proof ↔ service-request owner and paid status.
   - Each pending order's linked request exists, belongs to the same user, and is pending.
   - Each order has exactly one order item and that item's service matches the linked request.
   - Storage proof objects have matching `owner` and `owner_id`, `archived_at IS NULL`, `is_delete_marker = false`, valid metadata size/MIME, and the exact user/order path.
6. Confirm Production payment bucket remains private, maximum size 5 MiB, allowed MIME types JPEG/PNG/WebP.
7. Confirm no active payment or admin review is in progress that could be disrupted.

Expected state from the 2026-11-16 read-only inspection (must be rechecked, not assumed): 8 orders; 2 verified proofs; 2 entitlements; no UTR collision; no entitlement duplicate; no proof/order/request anomalies; 2 private Storage objects with valid ownership metadata.

## Deployment sequence

1. Confirm the PR is reviewed by an independent SQL reviewer and approved by the release owner.
2. Confirm the target Production project ID before running anything.
3. Merge PR #113 only after approval.
4. Apply the single migration through the repository's normal Supabase migration deployment path. Do not paste it into an ad-hoc SQL editor.
5. If migration execution errors, stop. Confirm the migration transaction rolled back and inspect schema state before retrying.
6. Run the post-deployment verification below before reopening normal operations.

## Post-deployment verification

- Confirm both RPCs remain SECURITY DEFINER, owned by the expected migration owner, with fixed `search_path = public, pg_temp`.
- Confirm `anon` and `authenticated` cannot directly INSERT/UPDATE/DELETE `payment_proofs`; authenticated SELECT remains available under RLS; service-role access remains intact.
- Confirm `payment_proofs_insert_own` is absent and customer proof submission EXECUTE is granted only to authenticated/service_role, not anon/PUBLIC.
- Confirm admin verification EXECUTE is granted only to authenticated/service_role, not anon/PUBLIC.
- Confirm the normalized active-UTR unique index and entitlement uniqueness index exist and are valid.
- Confirm the private bucket settings and Storage policies are unchanged.
- Re-run read-only counts and relationship checks. Production orders, existing proof rows, and existing entitlements must not change merely because the migration was applied.
- Run a controlled synthetic TEST E2E separately; never create synthetic Production payments or claim settlement.
- Verify the live customer checkout resume, proof submission, Admin proof list/rejection/verification UI, private proof viewing, and customer entitlement status.
- If any regression appears, stop further release activity and use the incident procedure below.

## Rollback / incident procedure

**Prefer a forward corrective migration.** The candidate hardening intentionally closes direct authenticated table writes; reverting that protection reopens a security weakness.

- If the migration fails before commit, verify transaction rollback and confirm no partial DDL remains. Do not blindly retry.
- If it commits but a regression appears, pause payment-proof submission/admin verification and preserve logs and database evidence. Do not modify existing proof/order/entitlement rows.
- Prefer a forward fix that preserves the new table-write restrictions and indexes.
- If a full rollback is explicitly authorized as an emergency, use only the deployment-time snapshots captured above to restore the exact prior RPC definitions, function ACLs, table ACLs, and INSERT policy, then drop only the two indexes introduced by this migration:
  - `payment_proofs_active_transaction_ref_normalized_uidx`
  - `entitlements_user_service_order_uidx`
- Never use stale function text from this document or an earlier environment as rollback source. Verify every restored object against the captured Production snapshot.
- Record the incident, the exact statements executed, resulting schema state, and customer impact. Re-run the complete TEST suite before attempting another release.

## Current gate

- [x] TEST candidate migration applied and re-applied after schema fixes.
- [x] Positive/negative SQL tests, concurrency checks, actual TEST Storage upload, Admin UI, and customer unlock E2E passed.
- [x] Production read-only schema/data preflight performed.
- [x] Archived-object and delete-marker rejection verified on TEST.
- [ ] Independent human SQL review.
- [ ] Deployment-time Production snapshot and fresh preflight.
- [ ] Explicit release approval.
- [ ] Production deployment and post-deployment verification.
