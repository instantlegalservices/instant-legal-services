#!/usr/bin/env node
'use strict';

// Dependency-free static regression checks for the isolated Smart Challan Finder page.
// Run from the repository root: node scripts/test-smart-challan-static.js
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'government', 'echallan', 'smart-check.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const start = html.lastIndexOf('<script>');
const end = html.lastIndexOf('</script>');
const checks = [];

function check(name, condition) {
  checks.push({ name, passed: Boolean(condition) });
}

check('page has a parseable inline JavaScript block', start >= 0 && end > start);
let script = '';
if (start >= 0 && end > start) {
  script = html.slice(start + '<script>'.length, end);
  try {
    new Function(script);
    check('inline JavaScript syntax', true);
  } catch (error) {
    check('inline JavaScript syntax', false);
    console.error('JavaScript parse error:', error.message);
  }
} else {
  check('inline JavaScript syntax', false);
}

check('page is marked noindex,follow', /<meta\s+name=["']robots["']\s+content=["']noindex,follow["']\s*>/i.test(html));
check('official eChallan portal is the target', script.includes('https://echallan.parivahan.gov.in/index/accused-challan'));
check('PDF bytes are read locally in the browser', /file\.arrayBuffer\s*\(/.test(script));
check('15 MB PDF size guard remains present', /file\.size\s*>\s*15\s*\*\s*1024\s*\*\s*1024/.test(script));
check('PDF page count is capped at 20', /Math\.min\(pdf\.numPages,\s*20\)/.test(script));
check('old extracted data is cleared before each PDF attempt', /extracted\s*=\s*'';\s*fields\.replaceChildren\(\);\s*rawText\.textContent\s*=\s*'';\s*results\.classList\.remove\('show'\);/.test(script));
check('extracted text is rendered with textContent', /rawText\.textContent\s*=\s*extracted/.test(script));
check('PDF.js eval support is disabled for untrusted PDFs', /getDocument\(\{\s*data:\s*bytes,\s*isEvalSupported:\s*false\s*\}\)/.test(script));
check('PDF parsing code contains no fetch/XHR/beacon upload path', !/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/i.test(script));
check('clear button resets vehicle, file, results, text, and extracted state', /getElementById\('clear'\)\.addEventListener\('click',[\s\S]*?vehicle\.value\s*=\s*''[\s\S]*?fileInput\.value\s*=\s*''[\s\S]*?fields\.replaceChildren\(\)[\s\S]*?rawText\.textContent\s*=\s*''[\s\S]*?results\.classList\.remove\('show'\)[\s\S]*?extracted\s*=\s*''/.test(script));
check('vehicle number is not auto-submitted to the government portal', !/fetch\s*\(\s*portal|form\.submit\s*\(|\.submit\s*\(/i.test(script));

check('Hindi challan number and vehicle labels are recognized', /चालान संख्या/.test(script) && /वाहन संख्या/.test(script));
check('Hindi fine label and date fallback are supported', /शमन शुल्क/.test(script) && /dateMatch/.test(script));
check('multiple numbered violation lines are collected', /extracted\.matchAll/.test(script));
check('location parsing uses labels rather than hardcoded test-city names', /const place=findValue\(extracted,\['चालान स्थान','घटना स्थल','स्थान','Challan Place','Place of Violation','Location','Place'\]\);/.test(script) && !/Delapeer|Izatnagar/.test(script));

for (const result of checks) {
  console.log((result.passed ? 'PASS' : 'FAIL') + ' — ' + result.name);
}
const failures = checks.filter(result => !result.passed);
console.log('\n' + (checks.length - failures.length) + '/' + checks.length + ' checks passed.');
if (failures.length) process.exitCode = 1;
