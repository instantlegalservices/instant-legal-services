import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value: string): string | null {
  const match = value.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);

  if (!match) return null;

  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04",
    May: "05", Jun: "06", Jul: "07", Aug: "08",
    Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };

  const day = match[1].padStart(2, "0");
  const month = months[match[2]];
  const year = match[3];

  if (!month) return null;

  return `${year}-${month}-${day}`;
}

function cleanCaseTitle(value: string): string {
  return value
    .replace(/^[*•\s]+/, "")
    .replace(/^\[\s*/, "")
    .trim();
}

function getAbsoluteUrl(href: string): string {
  try {
    return new URL(href, "https://www.sci.gov.in/").href;
  } catch {
    return "https://www.sci.gov.in/";
  }
}

async function createHash(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment variables are missing");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: source, error: sourceError } = await supabase
      .from("judgment_sources")
      .select("*")
      .eq("court_name", "Supreme Court of India")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (sourceError) throw sourceError;

    if (!source) {
      throw new Error("Supreme Court source not found");
    }

    const { data: fetchLog, error: logError } = await supabase
      .from("judgment_fetch_logs")
      .insert({
        source_id: source.id,
        fetch_type: "latest",
        status: "running",
      })
      .select()
      .single();

    if (logError) throw logError;

    const response = await fetch("https://www.sci.gov.in/", {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/",
  },
});

    if (!response.ok) {
      throw new Error(
        `Supreme Court website returned ${response.status}`
      );
    }

    const html = await response.text();

    const linkRegex =
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    const judgments: Array<{
      case_title: string;
      case_number: string | null;
      judgment_date: string | null;
      official_source_url: string;
      source_pdf_url: string | null;
    }> = [];

    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const text = stripHtml(match[2]);

      if (
        !/Diary Number/i.test(text) ||
        !/\bVS\.?\b/i.test(text)
      ) {
        continue;
      }

      if (judgments.length >= 20) break;

      const parts = text.split(" - ");

      const caseTitle = cleanCaseTitle(parts[0] || "");

      if (!caseTitle || caseTitle.length < 5) {
        continue;
      }

      const caseNumberMatch = text.match(
        /(?:C\.A\.|Crl\.A\.|SLP\(C\)|SLP\(Crl\)|W\.P\.\(C\)|T\.P\.\(C\)|M\.A\.)[^-]*?(?=\s*-\s*Diary Number|$)/i
      );

      const dateMatch = text.match(
        /\d{1,2}-[A-Za-z]{3}-\d{4}/
      );

      const absoluteUrl = getAbsoluteUrl(href);

      const isPdf =
        /\.pdf(?:\?|$)/i.test(absoluteUrl);

      judgments.push({
        case_title: caseTitle,
        case_number: caseNumberMatch
          ? caseNumberMatch[0].trim()
          : null,
        judgment_date: dateMatch
          ? parseDate(dateMatch[0])
          : null,
        official_source_url: isPdf
          ? "https://www.sci.gov.in/"
          : absoluteUrl,
        source_pdf_url: isPdf
          ? absoluteUrl
          : null,
      });
    }

    const uniqueJudgments = Array.from(
      new Map(
        judgments.map((item) => [
          `${item.case_title}|${item.case_number}|${item.judgment_date}`,
          item,
        ])
      ).values()
    );

    let inserted = 0;
    let updated = 0;
    let duplicates = 0;

    for (const judgment of uniqueJudgments) {
      const sourceHash = await createHash(
        [
          "Supreme Court of India",
          judgment.case_title,
          judgment.case_number || "",
          judgment.judgment_date || "",
        ].join("|")
      );

      const { data: existing, error: existingError } = await supabase
        .from("judgments")
        .select("id, source_pdf_url, official_source_url")
        .eq("source_hash", sourceHash)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        const updates: Record<string, unknown> = {};

        if (
          judgment.source_pdf_url &&
          existing.source_pdf_url !== judgment.source_pdf_url
        ) {
          updates.source_pdf_url = judgment.source_pdf_url;
        }

        if (
          judgment.official_source_url &&
          existing.official_source_url !== judgment.official_source_url
        ) {
          updates.official_source_url =
            judgment.official_source_url;
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from("judgments")
            .update(updates)
            .eq("id", existing.id);

          if (updateError) throw updateError;

          updated++;
        } else {
          duplicates++;
        }

        continue;
      }

      const { error: insertError } = await supabase
        .from("judgments")
        .insert({
          case_title: judgment.case_title,
          case_number: judgment.case_number,
          court_type: "Supreme Court",
          court_name: "Supreme Court of India",
          judgment_date: judgment.judgment_date,
          primary_category: "Uncategorized",
          short_summary:
            "Latest judgment identified from the official Supreme Court of India source. Detailed legal summary will be generated after the judgment document is retrieved and processed.",
          official_source_url: judgment.official_source_url,
          source_pdf_url: judgment.source_pdf_url,
          source_domain: "sci.gov.in",
          search_text: [
            judgment.case_title,
            judgment.case_number || "",
            "Supreme Court",
          ].join(" "),
          is_latest: true,
          is_verified: true,
          source_hash: sourceHash,
          summary_status: "pending",
        });

      if (insertError) throw insertError;

      inserted++;
    }

    await supabase
      .from("judgment_sources")
      .update({
        last_checked_at: new Date().toISOString(),
        last_successful_fetch_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", source.id);

    await supabase
      .from("judgment_fetch_logs")
      .update({
        status: "success",
        judgments_found: uniqueJudgments.length,
        judgments_inserted: inserted,
        completed_at: new Date().toISOString(),
      })
      .eq("id", fetchLog.id);

    return new Response(
      JSON.stringify({
        success: true,
        source: "Supreme Court of India",
        judgments_found: uniqueJudgments.length,
        judgments_inserted: inserted,
        judgments_updated: updated,
        duplicates_skipped: duplicates,
        processed: uniqueJudgments,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});