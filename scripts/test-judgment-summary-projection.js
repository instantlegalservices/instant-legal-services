"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("assets/ils-core.js", "utf8");
const selections = [];
const query = {
  select(columns) { selections.push(String(columns).replace(/\s+/g, " ").trim()); return this; },
  eq() { return this; },
  or() { return this; },
  ilike() { return this; },
  order() { return this; },
  limit() { return this; },
  then(resolve) { resolve({ data: [], error: null }); }
};
const document = {
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return { dataset: {} }; },
  head: { appendChild() {} }
};
const window = {
  supabase: {
    createClient() {
      return { from(table) { assert.equal(table, "judgments"); return query; } };
    }
  }
};

(async () => {
  vm.runInNewContext(source, { window, document, console });
  await window.ILS.init();

  await window.ILS.judgments({ limit: 12, summaryOnly: true });
  const listProjection = selections[0];
  const requiredListFields = [
    "id", "case_title", "case_number", "court_type", "court_name",
    "judgment_date", "primary_category", "short_summary", "legal_principle",
    "statutes_and_sections", "official_source_url", "source_pdf_url"
  ];
  for (const field of requiredListFields) {
    assert.match(listProjection, new RegExp("\\b" + field + "\\b"), "listing projection missing " + field);
  }
  for (const field of [
    "detailed_summary", "key_legal_issues", "important_precedents",
    "final_decision", "practical_significance", "keywords", "search_text"
  ]) {
    assert.doesNotMatch(listProjection, new RegExp("\\b" + field + "\\b"), "heavy field leaked into listing: " + field);
  }

  await window.ILS.judgments({ id: "42", summaryOnly: true });
  const idProjection = selections[1];
  assert.match(idProjection, /detailed_summary/);
  assert.match(idProjection, /important_precedents/);
  assert.match(idProjection, /search_text/);

  await window.ILS.judgments({ limit: 50 });
  const defaultProjection = selections[2];
  assert.match(defaultProjection, /detailed_summary/);
  assert.match(defaultProjection, /search_text/);

  const homepage = fs.readFileSync("assets/pwa.js", "utf8");
  const listing = fs.readFileSync("judgments.html", "utf8");
  const detail = fs.readFileSync("judgment.html", "utf8");
  const legalSearch = fs.readFileSync("legal-search.html", "utf8");
  assert.match(homepage, /originalJudgments\([\s\S]*?summaryOnly:\s*true/);
  assert.match(listing, /ILS\.judgments\([\s\S]*?summaryOnly:\s*true/);
  assert.doesNotMatch(detail, /summaryOnly:\s*true/);
  assert.doesNotMatch(legalSearch, /summaryOnly:\s*true/);

  console.log("JUDGMENT_LIST_PROJECTION=PASS");
  console.log("JUDGMENT_DETAIL_FULL_PROJECTION=PASS");
  console.log("HOMEPAGE_AND_DIRECTORY_CALL_SITES=PASS");
  console.log("LEGAL_SEARCH_FULL_PROJECTION_DEFAULT=PASS");
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
