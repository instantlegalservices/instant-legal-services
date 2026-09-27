# ILS Step 3 — Notification E2E Provenance

Date: 2026-09-27

## Audit finding

The prior `ils-notification-e2e-real` implementation required a synthetic user and sent a real external Resend email. That conflicted with the TEST notification preflight, which explicitly forbids real recipient data, real message send, and external provider invocation.

The database also has no trigger on notification trigger events and no notification/dispatch worker routine was found. Therefore external delivery cannot be claimed from the existing path.

## Safe fix

Deployed `ils-notification-e2e-real` version 2:
- normal authenticated JWT user required;
- TEST-owned complaint passport required;
- exercises the existing `ils_notification_central_ingress_v1` path;
- verifies the trigger event is created;
- no external provider;
- no recipient delivery;
- no production access;
- evidence remains UNVERIFIED until the downstream notification path is genuinely proven.

Active deployment SHA:
`2022697dbd1534d74efd6f4dbe4303069e0ae9ef7f61e55b7e76b2e8adb072e5`.

## Release boundary

NOTIFICATION_E2E remains HOLD. The remaining missing link is the downstream producer/consumer path from notification trigger event to customer notification/projection/dispatch delivery.

No fake promotion was performed.
