-- TEST-only hardening: reserve each UPI transaction reference while a proof is
-- pending or verified. Rejected proofs intentionally release the reference so
-- a customer can correct/resubmit a rejected proof where appropriate.
--
-- The submission RPC already canonicalizes references to uppercase
-- alphanumeric characters before inserting them. This unique partial index is
-- the database-level concurrency-safe replay guard across all orders/users.

create unique index payment_proofs_active_transaction_ref_uidx
on public.payment_proofs (transaction_ref)
where status in ('pending', 'verified');
