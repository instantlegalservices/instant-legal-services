# ILS Smart Challan Finder — Manual Test Plan

Scope: test only `government/echallan/smart-check.html` on the feature branch. Do not merge, deploy, or alter the existing eChallan page as part of these checks.

## Preconditions
- Open the feature-branch HTML in a local/static preview or an isolated preview deployment.
- Use a test vehicle registration number, not a customer's private data.
- Use a sample challan PDF with personal details redacted where possible.
- Do not enter OTPs, passwords, payment credentials, or other authentication secrets into ILS.

## Browser and responsive checks
- [ ] Open in current Chrome/Edge and Firefox; confirm the page renders without console errors.
- [ ] Test a narrow mobile viewport (320–390 px) and a desktop viewport; no horizontal overflow.
- [ ] Tab through all controls; focus is visible and buttons can be activated by keyboard.
- [ ] Confirm the status messages are announced and readable after actions.
- [ ] Confirm the official portal opens only after the user clicks the button and no vehicle value is auto-submitted.
- [ ] Confirm the page makes no request to an ILS endpoint when a PDF is selected or parsed.

## Vehicle number checks
- [ ] Empty input produces a helpful message and does not open a tab.
- [ ] Spaces/lowercase/hyphens normalize as expected.
- [ ] Copy button works where clipboard permissions allow; fallback message is understandable.
- [ ] Very short, malformed, and maximum-length inputs do not crash the page.

## PDF checks
- [x] Real text-based Uttar Pradesh traffic notice PDF inspected: the current English-only field rules missed Hindi-labelled fields; Hindi/English recognition and date/amount/numbered-violation fallbacks added on the isolated feature branch. The uploaded PDF itself is not committed to the repository.
- [ ] Re-run the browser workflow against a locally provided redacted PDF in an isolated local preview; compare each suggested field against the source PDF before release.
- [ ] Confirm PDF.js parsing keeps `isEvalSupported: false` so uploaded, untrusted PDFs cannot use the vulnerable eval path.
- [ ] PDF with multiple pages: verify reading works; for more than 20 pages, confirm the cap warning appears.
- [ ] Scanned/image-only PDF: confirm the page clearly says text could not be extracted (OCR is not implemented).
- [ ] Empty file, non-PDF file renamed to .pdf, malformed PDF, and zero-byte file: confirm a clear error and no uncaught exception.
- [ ] File larger than 15 MB: confirm it is rejected before parsing.
- [ ] PDF with unusual fonts/columns or Hindi text: check line order and avoid treating incorrectly extracted fields as authoritative.
- [ ] Clear button removes selected file, vehicle number, results, extracted text, and status messages.
- [ ] After a successful PDF parse, select an invalid/empty PDF attempt and verify the previous PDF's extracted fields and raw text are cleared rather than left visible.

## Acceptance criteria
- No uncaught JavaScript errors.
- No data sent to ILS from the PDF parsing flow.
- All extracted values are visibly described as approximate and must be checked against the original.
- No claim of automatic live government lookup.
- Any failure is documented and fixed only on the feature branch before review.

## Known limitations
- Static/synthetic checks do not replace testing against a real official challan PDF.
- Image-only/scanned PDFs need OCR, which is not included.
- Field labels vary across official PDF layouts, so auto-detected fields can be missing or inaccurate.
- This page is marked `noindex,follow` and is not ready for public launch or SEO promotion.
