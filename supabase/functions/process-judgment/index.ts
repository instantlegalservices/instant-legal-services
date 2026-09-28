import { createClient } from "jsr:@supabase/supabase-js@2";
import * as pdfjsLib from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCI_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "application/pdf,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.sci.gov.in/",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getPdfUrl(
  sourcePdfUrl: string | null,
  officialSourceUrl: string | null,
): string | null {
  if (sourcePdfUrl) {
    return sourcePdfUrl;
  }

  if (!officialSourceUrl) {
    return null;
  }

  if (officialSourceUrl.includes("sci-get-pdf")) {
    return officialSourceUrl;
  }

  if (officialSourceUrl.includes("view-pdf")) {
    try {
      const url = new URL(officialSourceUrl);

      return `https://www.sci.gov.in/sci-get-pdf/?${url.searchParams.toString()}`;
    } catch {
      return null;
    }
  }

  return null;
}

async function extractTextFromPdf(
  pdfBytes: Uint8Array,
): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes,
    disableWorker: true,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;

  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);

    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item: any) => {
        return typeof item.str === "string"
          ? item.str
          : "";
      })
      .join(" ");

    pages.push(
      `\n\n--- PAGE ${pageNumber} ---\n\n${pageText}`,
    );
  }

  return pages
    .join("\n")
    .replace(/\s+/g, " ")
    .replace(/--- PAGE (\d+) ---/g, "\n\n--- PAGE $1 ---\n\n")
    .trim();
}

function cleanJsonContent(content: string): string {
  return content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

async function callOpenRouter(
  apiKey: string,
  judgment: {
    case_title: string;
    case_number: string | null;
    court_name: string | null;
    judgment_date: string | null;
  },
  documentText: string,
) {
  /*
    बहुत बड़े judgments को पूरा भेजने से free model
    context limit / timeout हो सकता है।

    अभी सुरक्षित limit रख रहे हैं।
  */
  const maxCharacters = 120000;

  const textForAi =
    documentText.length > maxCharacters
      ? documentText.slice(0, maxCharacters)
      : documentText;

  const prompt = `
You are an expert Indian legal research assistant.

Analyze the following Indian court judgment carefully.

IMPORTANT RULES:
- Base every conclusion ONLY on the judgment text provided.
- Do NOT invent facts, holdings, statutes, sections, precedents, arguments, or legal principles.
- If the available text is incomplete, clearly say so.
- Distinguish between facts, legal issues, reasoning, holdings and final decision.
- Use clear professional legal English.
- This analysis will be displayed to advocates on a legal research website.
- Return ONLY valid JSON.
- Do not use markdown.

CASE DETAILS

Case Title:
${judgment.case_title}

Case Number:
${judgment.case_number || "Not available"}

Court:
${judgment.court_name || "Supreme Court of India"}

Judgment Date:
${judgment.judgment_date || "Not available"}

JUDGMENT TEXT

${textForAi}

Return exactly this JSON structure:

{
  "primary_category": "Criminal Law / Civil Law / Constitutional Law / Service Law / Family Law / Property Law / Tax Law / Arbitration / Consumer Law / Commercial Law / Other",

  "short_summary": "Concise legally useful summary in approximately 100-180 words.",

  "facts_summary": "Brief summary of material facts and background.",

  "legal_issue": "Main legal question or issue before the Court.",

  "key_legal_issues": [
    "Issue 1",
    "Issue 2"
  ],

  "court_held": "What the Court held and why.",

  "legal_principle": "The legal principle or ratio decidendi, only if determinable from the text.",

  "key_principles": "Important legal principles explained concisely.",

  "key_holdings": [
    "Holding 1",
    "Holding 2"
  ],

  "important_laws": [
    "Act / Section actually mentioned in the judgment"
  ],

  "important_precedents": [
    "Case actually relied upon or discussed in the judgment"
  ],

  "practical_impact": "Practical legal significance of this judgment.",

  "keywords": [
    "keyword1",
    "keyword2"
  ],

  "final_decision": "Final operative decision or result of the case."
}
`.trim();

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://instantlegalservices.in",
        "X-Title": "Instant Legal Services",
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [
          {
            role: "system",
            content:
              "You are a careful Indian legal research assistant. Never invent legal facts or holdings.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    },
  );

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `OpenRouter API error: ${responseText}`,
    );
  }

  let result: any;

  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(
      "OpenRouter returned an invalid API response",
    );
  }

  const content =
    result?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      "OpenRouter did not return analysis content",
    );
  }

  const cleanedContent = cleanJsonContent(content);

  try {
    return JSON.parse(cleanedContent);
  } catch {
    throw new Error(
      `AI returned invalid JSON: ${cleanedContent.slice(0, 500)}`,
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  let judgmentId: string | null = null;
  let supabase: any = null;

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Use POST method",
        }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const body = await req.json().catch(() => ({}));

    judgmentId = body.judgment_id || null;

    if (!judgmentId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "judgment_id is required",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    const openRouterApiKey = Deno.env.get(
      "OPENROUTER_API_KEY",
    );

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Supabase environment variables are missing",
      );
    }

    if (!openRouterApiKey) {
      throw new Error(
        "OPENROUTER_API_KEY secret is missing",
      );
    }

    supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
    );

    /*
      STEP 1
      Judgment record fetch karo
    */

    const {
      data: judgment,
      error: judgmentError,
    } = await supabase
      .from("judgments")
      .select(`
        id,
        case_title,
        case_number,
        court_name,
        judgment_date,
        official_source_url,
        source_pdf_url
      `)
      .eq("id", judgmentId)
      .maybeSingle();

    if (judgmentError) {
      throw new Error(
        `Could not fetch judgment: ${judgmentError.message}`,
      );
    }

    if (!judgment) {
      throw new Error("Judgment not found");
    }

    /*
      STEP 2
      Processing status
    */

    await supabase
      .from("judgments")
      .update({
        summary_status: "processing",
        processing_error: null,
      })
      .eq("id", judgmentId);

    /*
      STEP 3
      Official PDF URL
    */

    const pdfUrl = getPdfUrl(
      judgment.source_pdf_url,
      judgment.official_source_url,
    );

    if (!pdfUrl) {
      throw new Error(
        "Could not determine official Supreme Court PDF URL",
      );
    }

    /*
      STEP 4
      Download PDF
    */

    const pdfResponse = await fetch(pdfUrl, {
      headers: SCI_HEADERS,
    });

    if (!pdfResponse.ok) {
      throw new Error(
        `Official judgment PDF returned HTTP ${pdfResponse.status}`,
      );
    }

    const contentType =
      pdfResponse.headers.get("content-type") || "";

    const pdfArrayBuffer =
      await pdfResponse.arrayBuffer();

    const pdfBytes =
      new Uint8Array(pdfArrayBuffer);

    if (pdfBytes.byteLength < 1000) {
      throw new Error(
        "Downloaded PDF appears to be empty",
      );
    }

    const firstBytes = new TextDecoder()
      .decode(pdfBytes.slice(0, 5));

    const isPdf =
      contentType.includes("application/pdf") ||
      firstBytes === "%PDF-";

    if (!isPdf) {
      throw new Error(
        `Official source did not return a valid PDF. Content-Type: ${contentType}`,
      );
    }

    /*
      STEP 5
      PDF se actual text extract karo
    */

    await supabase
      .from("judgments")
      .update({
        source_pdf_url: pdfUrl,
        summary_status: "extracting_text",
        judgment_text_status: "processing",
      })
      .eq("id", judgmentId);

    const documentText =
      await extractTextFromPdf(pdfBytes);

    if (!documentText || documentText.length < 100) {
      throw new Error(
        "Could not extract meaningful text from the PDF. The document may be scanned/image-based.",
      );
    }

    /*
      STEP 6
      Extracted judgment text database me save karo
    */

    await supabase
      .from("judgments")
      .update({
        source_pdf_url: pdfUrl,
        document_text: documentText,
        judgment_text: documentText,
        document_retrieved_at:
          new Date().toISOString(),
        judgment_text_status: "completed",
        judgment_text_extracted_at:
          new Date().toISOString(),
        summary_status: "generating_summary",
      })
      .eq("id", judgmentId);

    /*
      STEP 7
      AI se actual judgment analysis
    */

    const analysis = await callOpenRouter(
      openRouterApiKey,
      {
        case_title: judgment.case_title,
        case_number: judgment.case_number,
        court_name: judgment.court_name,
        judgment_date: judgment.judgment_date,
      },
      documentText,
    );

    /*
      STEP 8
      AI analysis database me save karo
    */

    const {
      error: updateError,
    } = await supabase
      .from("judgments")
      .update({
        primary_category:
          analysis.primary_category || "Other",

        short_summary:
          analysis.short_summary || null,

        facts_summary:
          analysis.facts_summary || null,

        legal_issue:
          analysis.legal_issue || null,

        legal_issues:
          Array.isArray(analysis.key_legal_issues)
            ? analysis.key_legal_issues.join("\n")
            : null,

        key_legal_issues:
          Array.isArray(analysis.key_legal_issues)
            ? analysis.key_legal_issues
            : [],

        court_held:
          analysis.court_held ||
          analysis.final_decision ||
          null,

        legal_principle:
          analysis.legal_principle || null,

        key_principles:
          analysis.key_principles || null,

        key_holdings:
          Array.isArray(analysis.key_holdings)
            ? analysis.key_holdings
            : [],

        important_laws:
          Array.isArray(analysis.important_laws)
            ? analysis.important_laws
            : [],

        practical_impact:
          analysis.practical_impact || null,

        keywords:
          Array.isArray(analysis.keywords)
            ? analysis.keywords
            : [],

        summary_status: "completed",

        summary_generated_at:
          new Date().toISOString(),

        processing_error: null,

        updated_at:
          new Date().toISOString(),
      })
      .eq("id", judgmentId);

    if (updateError) {
      throw new Error(
        `Could not save judgment analysis: ${updateError.message}`,
      );
    }

    /*
      STEP 9
      Final success response
    */

    return new Response(
      JSON.stringify({
        success: true,

        judgment_id: judgmentId,

        case_title:
          judgment.case_title,

        pdf_url:
          pdfUrl,

        pdf_size_bytes:
          pdfBytes.byteLength,

        extracted_text_length:
          documentText.length,

        primary_category:
          analysis.primary_category || "Other",

        summary_status:
          "completed",

        message:
          "Judgment PDF downloaded, text extracted, AI analysis generated and all results saved successfully.",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );

  } catch (error) {
    console.error(
      "process-judgment error:",
      error,
    );

    /*
      Failure database me save karo
    */

    if (judgmentId && supabase) {
      try {
        await supabase
          .from("judgments")
          .update({
            summary_status: "failed",
            processing_error:
              getErrorMessage(error),
            updated_at:
              new Date().toISOString(),
          })
          .eq("id", judgmentId);
      } catch (dbError) {
        console.error(
          "Could not save processing error:",
          dbError,
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: false,

        judgment_id:
          judgmentId,

        error:
          getErrorMessage(error),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});