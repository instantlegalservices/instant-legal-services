# ILS Step 2 — Document E2E Provenance

Date: 2026-09-27

## Audit finding

The previously counted DOCUMENT_E2E evidence was marked VERIFIED/REAL_AUTHENTICATED, but the producing Edge Function version 1 required a synthetic TEST actor in user metadata. That contradicts the genuine authenticated release contract.

Therefore the evidence was not valid genuine-release proof.

## Fix

- Deployed `ils-document-e2e-real` version 2.
- Version 2 removes the synthetic-user requirement and retains the TEST-only document fixture, no customer data, no persistence, no external transmission, and no production access.
- Active deployment registry now points to version 2:
  SHA `b1f47997d9089ba9601ed22d5c229f116e3fe4e7d8ae4d40ef35ca6ccb65a4b0`.
- Version 1 was deactivated.
- Prior invalid evidence and its verification event were quarantined as `PROVENANCE_INVALID_FOR_RELEASE`.

## Current release state

A fresh genuine authenticated execution of version 2 is still required before DOCUMENT_E2E can become GO. No fake promotion was performed.

## Preservation

Production untouched. Payment chain untouched. No blind merge.
