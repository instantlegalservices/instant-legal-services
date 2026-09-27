# ILS Publication Phase — Next Gate Evidence Plan

Date: 2026-09-27

## Current authoritative boundary

The isolated public-launch branch is intentionally divergent from current MAIN and must not be merged blindly.

Current comparison at this checkpoint:
- MAIN: fe4782c64fef5bea7f9331264dc6ec339d392dc9
- isolated branch: 13c4ecf7a37260b2648feb8d2f605554b2b7de17
- merge base: 4af167fe691b18e303ce250835bedac1d2db4532
- status: diverged

## Release gates to resolve next

1. DOCUMENT_E2E — genuine evidence required
2. NOTIFICATION_E2E — genuine evidence required
3. PROFESSIONAL_ASSIGNMENT_E2E — genuine evidence required
4. PAYMENT_E2E — existing QR/barcode payment chain only
5. GOV_ROUTE_E2E — authorized official-route evidence
6. SECURITY_EXECUTION_E2E
7. RELEASE_E2E

## Preservation rules

- Reuse existing functions/tables and existing E2E contracts.
- Do not rebuild the professional assignment or payout engines.
- Do not replace or migrate the existing QR/barcode payment chain.
- Do not manufacture Auth users, JWTs, sessions, transactions, government history, or release evidence.
- No production mutation for TEST evidence.
- Fix only proven missing links.
