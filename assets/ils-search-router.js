/*
 * ILS Unified Search Router — V1
 * --------------------------------
 * SAFE / ISOLATED SEARCH LAYER
 *
 * IMPORTANT:
 * - Does NOT replace ILS.judgments()
 * - Does NOT replace ILS.advocates()
 * - Does NOT replace ILS.ai()
 * - Does NOT modify homepage search yet
 * - Step 3 will connect the homepage separately
 */

window.ILS_SEARCH_ROUTER = (() => {

  const clean = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

  const normalize = (value) =>
    clean(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s./-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

  const slug = (value) =>
    normalize(value)
      .replace(/[./]/g, "-")
      .replace(/\s+/g, "-");

  /*
   * ---------------------------------------------------------
   * VERIFIED LOCAL ROUTES
   * ---------------------------------------------------------
   */

  const ACTS = [
    {
      title: "Bharatiya Nyaya Sanhita, 2023",
      keywords: [
        "bns",
        "bharatiya nyaya sanhita",
        "nyaya sanhita",
        "criminal law"
      ],
      url: "acts/bns-2023.html"
    },
    {
      title: "Bharatiya Nagarik Suraksha Sanhita, 2023",
      keywords: [
        "bnss",
        "bharatiya nagarik suraksha sanhita",
        "criminal procedure",
        "procedure law"
      ],
      url: "acts/bnss-2023.html"
    },
    {
      title: "Bharatiya Sakshya Adhiniyam, 2023",
      keywords: [
        "bsa",
        "bharatiya sakshya adhiniyam",
        "evidence law",
        "evidence act"
      ],
      url: "acts/bsa-2023.html"
    },
    {
      title: "Constitution of India",
      keywords: [
        "constitution",
        "constitutional law",
        "fundamental rights",
        "article"
      ],
      url: "acts/constitution-of-india.html"
    },
    {
      title: "Code of Civil Procedure, 1908",
      keywords: [
        "cpc",
        "civil procedure code",
        "civil procedure"
      ],
      url: "acts/code-of-civil-procedure-1908.html"
    },
    {
      title: "Hindu Marriage Act, 1955",
      keywords: [
        "hma",
        "hindu marriage act",
        "divorce",
        "marriage"
      ],
      url: "acts/hindu-marriage-act-1955.html"
    },
    {
      title: "Protection of Women from Domestic Violence Act, 2005",
      keywords: [
        "dv act",
        "domestic violence",
        "domestic violence act",
        "protection of women"
      ],
      url: "acts/domestic-violence-act-2005.html"
    },
    {
      title: "Negotiable Instruments Act, 1881",
      keywords: [
        "ni act",
        "negotiable instruments act",
        "cheque bounce",
        "section 138"
      ],
      url: "acts/negotiable-instruments-act-1881.html"
    },
    {
      title: "Consumer Protection Act, 2019",
      keywords: [
        "consumer protection",
        "consumer act",
        "consumer law",
        "consumer complaint"
      ],
      url: "acts/consumer-protection-act-2019.html"
    },
    {
      title: "Narcotic Drugs and Psychotropic Substances Act, 1985",
      keywords: [
        "ndps",
        "ndps act",
        "narcotic drugs",
        "psychotropic substances",
        "drugs"
      ],
      url: "acts/ndps-act-1985.html"
    }
  ];

  /*
   * ---------------------------------------------------------
   * EXISTING SECTION ROUTES
   * ---------------------------------------------------------
   */

  const SECTIONS = [
    {
      title: "BNS Section 115",
      keywords: ["bns 115", "section 115 bns"],
      url: "sections/bns-115.html"
    },
    {
      title: "BNS Section 318",
      keywords: ["bns 318", "section 318 bns", "cheating"],
      url: "sections/bns-318.html"
    },
    {
      title: "BNSS Section 173",
      keywords: ["bnss 173", "section 173 bnss", "fir"],
      url: "sections/bnss-173.html"
    },
    {
      title: "BNSS Section 187",
      keywords: ["bnss 187", "section 187 bnss", "remand"],
      url: "sections/bnss-187.html"
    },
    {
      title: "BNSS Section 479",
      keywords: ["bnss 479", "section 479 bnss"],
      url: "sections/bnss-479.html"
    },
    {
      title: "BNSS Section 480",
      keywords: ["bnss 480", "section 480 bnss"],
      url: "sections/bnss-480.html"
    },
    {
      title: "BNSS Section 482",
      keywords: [
        "bnss 482",
        "section 482 bnss",
        "anticipatory bail"
      ],
      url: "sections/bnss-482.html"
    },
    {
      title: "BSA Section 63",
      keywords: [
        "bsa 63",
        "section 63 bsa",
        "electronic evidence"
      ],
      url: "sections/bsa-63.html"
    },
    {
      title: "NDPS Section 20",
      keywords: ["ndps 20", "section 20 ndps"],
      url: "sections/ndps-20.html"
    },
    {
      title: "NDPS Section 37",
      keywords: [
        "ndps 37",
        "section 37 ndps",
        "ndps bail"
      ],
      url: "sections/ndps-37.html"
    },
    {
      title: "NI Act Section 138",
      keywords: [
        "ni act 138",
        "section 138",
        "138 ni act",
        "cheque bounce"
      ],
      url: "sections/ni-138.html"
    },
    {
      title: "Hindu Marriage Act Section 13",
      keywords: [
        "hma 13",
        "section 13 hma",
        "divorce"
      ],
      url: "sections/hma-13.html"
    },
    {
      title: "Domestic Violence Act Section 12",
      keywords: [
        "dv act 12",
        "section 12 dv act",
        "domestic violence"
      ],
      url: "sections/dv-12.html"
    },
    {
      title: "CPC Section 115",
      keywords: [
        "cpc 115",
        "section 115 cpc",
        "revision"
      ],
      url: "sections/cpc-115-up.html"
    }
  ];

  /*
   * ---------------------------------------------------------
   * EXISTING LEGAL TOPIC PAGES
   * ---------------------------------------------------------
   */

  const TOPICS = [
    {
      title: "Bail & Anticipatory Bail",
      keywords: [
        "bail",
        "anticipatory bail",
        "regular bail",
        "bail application"
      ],
      url: "legal-topic-bail.html"
    },
    {
      title: "NDPS Act Legal Guide",
      keywords: [
        "ndps",
        "ndps bail",
        "narcotics",
        "drug case"
      ],
      url: "legal-topic-ndps.html"
    },
    {
      title: "Indian Laws & Sections",
      keywords: [
        "indian laws",
        "laws",
        "sections",
        "bare acts"
      ],
      url: "legal-topic-indian-laws.html"
    },
    {
      title: "Case Status Guide",
      keywords: [
        "case status",
        "ecourts",
        "case tracking",
        "case number"
      ],
      url: "legal-topic-case-status.html"
    },
    {
      title: "Cheque Bounce / Section 138 Guide",
      keywords: [
        "cheque bounce",
        "cheque dishonour",
        "section 138",
        "138 case"
      ],
      url: "legal-topic-cheque-bounce.html"
    }
  ];

  /*
   * ---------------------------------------------------------
   * EXISTING TOOL ROUTES
   * ---------------------------------------------------------
   */

  const TOOLS = [
    {
      title: "Legal Deadline Calculator",
      keywords: [
        "deadline",
        "deadline calculator",
        "legal deadline",
        "date calculator"
      ],
      tool: "legal-deadline-calculator"
    },
    {
      title: "Interest Calculator",
      keywords: [
        "interest",
        "interest calculator",
        "simple interest"
      ],
      tool: "interest-calculator"
    },
    {
      title: "Case Timeline",
      keywords: [
        "case timeline",
        "case events",
        "timeline"
      ],
      tool: "case-timeline"
    },
    {
      title: "Case Checklist",
      keywords: [
        "case checklist",
        "documents",
        "case preparation"
      ],
      tool: "case-checklist"
    },
    {
      title: "Cheque Bounce Timeline",
      keywords: [
        "cheque bounce timeline",
        "138 timeline",
        "ni act timeline"
      ],
      tool: "cheque-bounce-timeline"
    },
    {
      title: "Limitation Calculator",
      keywords: [
        "limitation",
        "limitation calculator"
      ],
      tool: "limitation-calculator"
    },
    {
      title: "Court Fee Estimator",
      keywords: [
        "court fee",
        "court fee calculator",
        "court fees"
      ],
      tool: "court-fee-calculator"
    },
    {
      title: "Stamp Duty Estimator",
      keywords: [
        "stamp duty",
        "stamp duty calculator"
      ],
      tool: "stamp-duty-calculator"
    },
    {
      title: "Maintenance Estimator",
      keywords: [
        "maintenance",
        "maintenance calculator",
        "family maintenance"
      ],
      tool: "maintenance-estimator"
    },
    {
      title: "Legal Problem Diagnostic",
      keywords: [
        "legal problem",
        "legal diagnostic",
        "legal issue"
      ],
      tool: "legal-problem-diagnostic"
    },
    {
      title: "Case Preparation Tool",
      keywords: [
        "case preparation",
        "prepare case",
        "case facts"
      ],
      tool: "case-preparation-tool"
    },
    {
      title: "Property Document Checklist",
      keywords: [
        "property documents",
        "property checklist",
        "property due diligence"
      ],
      tool: "property-document-checklist"
    }
  ];

  /*
   * ---------------------------------------------------------
   * MATCH ENGINE
   * ---------------------------------------------------------
   */

  function scoreItem(item, q) {

    const query = normalize(q);

    if (!query) return 0;

    const title = normalize(item.title);

    let score = 0;

    if (title === query) score += 100;
    if (title.includes(query)) score += 60;

    for (const keyword of item.keywords || []) {

      const k = normalize(keyword);

      if (k === query) {
        score += 90;
      } else if (k.includes(query)) {
        score += 45;
      } else if (query.includes(k)) {
        score += 35;
      }
    }

    const tokens = query.split(" ");

    for (const token of tokens) {

      if (token.length < 2) continue;

      if (title.includes(token)) {
        score += 10;
      }

      for (const keyword of item.keywords || []) {
        if (normalize(keyword).includes(token)) {
          score += 5;
        }
      }
    }

    return score;
  }

  function localSearch(collection, q, type) {

    return collection
      .map(item => ({
        ...item,
        type,
        score: scoreItem(item, q)
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }

  /*
   * ---------------------------------------------------------
   * QUERY CLASSIFICATION
   * ---------------------------------------------------------
   */

  function classify(q) {

    const query = normalize(q);

    if (!query) return "empty";

    const sectionPattern =
      /\b(?:section|sec|धारा)\s*\d+[a-z]?\b/i;

    const actPattern =
      /\b(?:act|adhiniyam|sanhita|code|constitution)\b/i;

    const judgmentPattern =
      /\b(?:vs?|versus|judgment|judgement|case law|supreme court|high court|appeal|order)\b/i;

    const advocatePattern =
      /\b(?:advocate|lawyer|vakil|counsel)\b/i;

    const toolPattern =
      /\b(?:calculator|calculate|timeline|checklist|estimator|diagnostic|tool)\b/i;

    if (sectionPattern.test(query)) {
      return "section";
    }

    if (actPattern.test(query)) {
      return "act";
    }

    if (judgmentPattern.test(query)) {
      return "judgment";
    }

    if (advocatePattern.test(query)) {
      return "advocate";
    }

    if (toolPattern.test(query)) {
      return "tool";
    }

    return "topic";
  }

  /*
   * ---------------------------------------------------------
   * ASYNC UNIFIED SEARCH
   * ---------------------------------------------------------
   *
   * Uses existing ILS.judgments() and ILS.advocates()
   * without changing them.
   */

  async function search(q, options = {}) {

    const query = clean(q);

    const result = {
      ok: true,
      query,
      intent: classify(query),
      acts: [],
      sections: [],
      topics: [],
      tools: [],
      judgments: [],
      advocates: [],
      ai: {
        available: typeof window.ILS?.ai === "function",
        recommended: false
      },
      total: 0
    };

    if (!query) {
      return result;
    }

    /*
     * Local knowledge base search
     */

    result.acts = localSearch(ACTS, query, "act");
    result.sections = localSearch(SECTIONS, query, "section");
    result.topics = localSearch(TOPICS, query, "topic");
    result.tools = localSearch(TOOLS, query, "tool");

    /*
     * Existing database functions are called safely.
     *
     * Promise.allSettled prevents one failed source
     * from breaking the entire search.
     */

    const jobs = [];

    if (typeof window.ILS?.judgments === "function") {

      jobs.push(
        Promise.resolve()
          .then(() =>
            window.ILS.judgments({
              limit: options.judgmentLimit || 12,
              q: query
            })
          )
          .then(rows => ({
            type: "judgments",
            rows: Array.isArray(rows) ? rows : []
          }))
      );
    }

    if (typeof window.ILS?.advocates === "function") {

      jobs.push(
        Promise.resolve()
          .then(() =>
            window.ILS.advocates({
              limit: options.advocateLimit || 8,
              q: query
            })
          )
          .then(rows => ({
            type: "advocates",
            rows: Array.isArray(rows) ? rows : []
          }))
      );
    }

    const settled = await Promise.allSettled(jobs);

    for (const item of settled) {

      if (item.status !== "fulfilled") continue;

      if (item.value.type === "judgments") {
        result.judgments = item.value.rows;
      }

      if (item.value.type === "advocates") {
        result.advocates = item.value.rows;
      }
    }

    /*
     * AI is a fallback/recommendation, not automatically invoked.
     * This avoids unnecessary AI calls for every search.
     */

    const localCount =
      result.acts.length +
      result.sections.length +
      result.topics.length +
      result.tools.length;

    result.ai.recommended =
      result.intent === "topic" &&
      localCount === 0 &&
      result.judgments.length === 0 &&
      result.advocates.length === 0;

    result.total =
      result.acts.length +
      result.sections.length +
      result.topics.length +
      result.tools.length +
      result.judgments.length +
      result.advocates.length;

    return result;
  }

  /*
   * ---------------------------------------------------------
   * SIMPLE RESULT HELPERS
   * ---------------------------------------------------------
   */

  function hasResults(result) {

    if (!result) return false;

    return Number(result.total || 0) > 0;
  }

  function primaryDestination(result) {

    if (!result) return null;

    if (result.sections?.length) {
      return result.sections[0].url;
    }

    if (result.acts?.length) {
      return result.acts[0].url;
    }

    if (result.topics?.length) {
      return result.topics[0].url;
    }

    if (result.tools?.length) {
      return "tools.html";
    }

    if (result.judgments?.length) {
      return "judgment.html?id=" +
        encodeURIComponent(result.judgments[0].id);
    }

    if (result.advocates?.length) {
      return "advocates.html";
    }

    if (result.ai?.recommended) {
      return "ai-assistant.html?q=" +
        encodeURIComponent(result.query);
    }

    return null;
  }

  return {
    clean,
    normalize,
    slug,
    classify,
    search,
    hasResults,
    primaryDestination,

    /*
     * Expose registries read-only for Step 3.
     */
    acts: ACTS.slice(),
    sections: SECTIONS.slice(),
    topics: TOPICS.slice(),
    tools: TOOLS.slice()
  };

})();
