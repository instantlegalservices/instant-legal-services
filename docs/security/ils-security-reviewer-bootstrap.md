# ILS Security Reviewer Provisioning and First-Admin Bootstrap

## Scope

This runbook describes the controlled activation path for the Professional Assignment security-review capability. The provisioning RPC can grant, suspend, and revoke the `SECURITY_REVIEWER` role. It cannot create or promote a `SECURITY_ADMIN`.

## First SECURITY_ADMIN

The first `SECURITY_ADMIN` is a separate, owner-controlled bootstrap decision. It must not be inferred from:

- membership in `ils_admin_users`;
- an email address found in the repository or a prior conversation;
- an existing advocate, CA, CS, client, or professional profile;
- a user-provided role claim or user metadata.

Before bootstrap, the project owner must explicitly identify the intended Auth user by immutable Auth user UUID and confirm the identity out of band. The account must have a confirmed email, identity verification, and completed security-review training. The owner must also confirm that the person is not the sole affected professional for any approval they may review.

This PR intentionally contains no seed row, default administrator, secret bootstrap endpoint, or automatic promotion. A separately reviewed one-time TEST-only bootstrap migration and evidence record are required after the owner approves the exact Auth user UUID. Do not use a service-role key in browser code or ask a reviewer to share passwords, OTPs, or session tokens.

## Reviewer lifecycle after bootstrap

Only an active, identity-verified, training-verified `SECURITY_ADMIN` can:

- grant `SECURITY_REVIEWER` to another confirmed Auth identity;
- suspend an existing reviewer;
- revoke an existing reviewer.

The grant operation requires separate identity and training evidence references and a validity period between 1 and 365 days. The audit records the acting administrator, target Auth user, operation, prior/new status, evidence references, reason, and validity period.

The RPC rejects self-administration, unconfirmed Auth identities, active duplicate grants, unverified evidence references, expired/out-of-range validity, and attempts to use this reviewer RPC to grant `SECURITY_ADMIN`.

## Separation of duties

- The administrator provisioning a reviewer is not automatically permitted to approve that reviewer's affected assignment.
- Existing review-decision logic must continue to reject self-approval and revalidate reviewer status/training at decision, bind, and consume.
- Suspension/revocation must take effect immediately for future decisions and approval-binding/consume checks.
- Reviewer-administration audit rows are append-only and inaccessible to direct API-role writes.

## Current gate

A successful PostgreSQL contract test does not provision a live TEST reviewer. No TEST or Production schema change, seed, deployment, or Auth account modification is performed by this PR. Genuine application E2E remains blocked until the first Security Admin is explicitly bootstrapped and a real authenticated application path is connected.
