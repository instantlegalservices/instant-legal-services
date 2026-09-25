# ILS Working Chain Freeze

Freeze rule: preserve existing working behavior; no replacement without dependency and rollback analysis.

| Chain | Current source | Environment | Freeze status |
|---|---|---|---|
| Public website | index.html + shared assets | Production | FROZEN |
| Client portal | portal.html + existing Supabase client/matter chain | Production | FROZEN |
| Admin | admin.html + ils_admin_users / ils_is_admin | Production | FROZEN |
| Advocate registration/directory | advocate-register.html, advocates.html + register-advocate/create-advocate-user | Production | FROZEN |
| Assistance/service request | assistance.html + service request architecture | Production | FROZEN |
| Judgment | judgments.html/judgment.html + fetch/process/summary/document functions | Production | FROZEN |
| AI assistant | ai-assistant.html + ai-assistant / ils-ai-assistant | Production | FROZEN |
| Payment | assets/ils-payments.js + assets/ils-tools.js + razorpay-payments + razorpay-webhook | Production | FROZEN — no replacement/migration |
| Government navigation | government/* + official-route links | Production | FROZEN |
| Native GST DRC-01C | TEST-only native architecture | TEST | HOLD — not to be promoted blindly |
| SEO | scripts/generate-seo-pages.js + sitemap.xml + robots.txt | Production | FROZEN — no wholesale generator replacement |
| Location/LGD | main location registry + divergent v9-final-test improvements | Mixed | FROZEN pending reconciliation |
| Security/RLS | supabase/hardened_rls.sql + deployed DB policies | Production | FROZEN |

## Explicit preservation constraints
- Existing Razorpay/UPI/QR payment behavior is not to be replaced.
- Existing judgment data is not to be deleted merely for cleanup.
- Existing portal/admin architecture is not to be rewritten.
- TEST architecture is not to be merged into Production without verified release evidence.
