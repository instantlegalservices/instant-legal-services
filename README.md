# Instant Legal Services — V9 FINAL HARDENED BUILD

## Included
- Existing V9 public pages and preserved working `portal.html` CRM/portals
- Fixed V9 hash router
- Verified/completed-only public judgment queries
- OpenRouter-only AI Edge Function
- Separate Public/Client AI and Advocate Research AI
- Server-side approved-advocate authorization for Advocate AI
- Official-source-only web research configuration
- PWA manifest, service worker, install prompt and Android-ready icons
- `supabase/hardened_rls.sql` for database security hardening

## REQUIRED SUPABASE STEPS BEFORE GO-LIVE
1. Run `supabase/hardened_rls.sql` in Supabase SQL Editor.
2. Confirm the existing admin auth account is present; the migration seeds the existing admin email used by the supplied working portal.
3. Deploy `supabase/functions/ils-ai-assistant/index.ts`.
4. Keep `OPENROUTER_API_KEY` as the provider secret. Do not put the key in browser code.
5. Optional: set `ILS_AI_MODEL` to a tool-capable OpenRouter model. Default is `openai/gpt-4.1`.
6. Test public client submission, admin login, advocate login, client private access, documents, chat, progress and judgment ingestion before production replacement.

## Security model
- Public client form: INSERT only.
- Admin CRM: explicit `ils_admin_users` allow-list.
- Advocate/client private workflows: existing SECURITY DEFINER RPCs remain the controlled path.
- Public judgments: only `is_verified=true` and `summary_status=completed`.
- Advocate Research AI: requires authenticated user + approved/verified advocate record.
- AI refuses to provide a definitive answer when authoritative source citations are absent.

## Important
This build is designed to be production-ready after the required Supabase migration/function deployment and live end-to-end regression tests. Do not overwrite production until those tests pass.

## SEO / Legal Utility Layer

This build adds a source-first legal search hub and indexable utility-topic pages:
- legal-search.html
- legal-topic-case-status.html
- legal-topic-supreme-court-judgments.html
- legal-topic-indian-laws.html
- legal-topic-bail.html
- legal-topic-cheque-bounce.html
- legal-topic-ndps.html

The pages intentionally avoid presenting generated legal propositions as authoritative law. They route users to verified ILS records and official court/statutory sources. robots.txt excludes private CRM pages from crawling and sitemap.xml includes public research pages.


## Judgment ↔ Section / SEO Layer
- Added `judgment.html?id=...` verified judgment research template with Article + BreadcrumbList JSON-LD.
- Verified judgment cards now link to detailed research pages.
- Section pages automatically search and display related verified ILS judgments.
- Section references in judgment metadata are linked to available ILS section pages.
- Added bilingual English/Hindi search-intent cues without creating duplicate language pages.
- Added CollectionPage/WebPage/Breadcrumb structured data where appropriate.
- FAQ rich-result markup is intentionally not added because Google removed FAQ rich results from general search in 2026.
- Canonical URLs remain self-referencing; query-specific judgment pages set their canonical to the exact research URL.


## Indian Acts Library
Added `/acts/` with Act-level research/navigation pages. These pages intentionally point to official statutory sources rather than treating ILS summaries as authoritative statutory text. Initial library includes BNS, BNSS, BSA, NDPS Act, NI Act, Hindu Marriage Act, Domestic Violence Act, Consumer Protection Act, CPC and Constitution.
