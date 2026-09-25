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
