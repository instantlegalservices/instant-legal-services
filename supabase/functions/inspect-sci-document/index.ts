import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const documentUrl =
      "https://www.sci.gov.in/view-pdf/?diary_no=90992001&type=j&order_date=2026-08-20&from=latest_judgements_order";

    const response = await fetch(documentUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.sci.gov.in/",
      },
    });

    const html = await response.text();

    const scriptSources: string[] = [];
    const inlineScripts: string[] = [];
    const interestingLines: string[] = [];

    // External JavaScript files
    const srcRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;

    while ((match = srcRegex.exec(html)) !== null) {
      scriptSources.push(
        new URL(match[1], response.url).href
      );
    }

    // Inline scripts
    const inlineRegex =
      /<script[^>]*>([\s\S]*?)<\/script>/gi;

    while ((match = inlineRegex.exec(html)) !== null) {
      const script = match[1].trim();

      if (script.length > 0) {
        inlineScripts.push(script.slice(0, 5000));

        const lines = script.split("\n");

        for (const line of lines) {
          if (
            /pdf|diary|judgment|ajax|fetch|api|document|download|iframe/i.test(
              line
            )
          ) {
            interestingLines.push(line.trim().slice(0, 1000));
          }
        }
      }
    }

    // पूरे HTML में relevant URL patterns
    const urlMatches =
      html.match(
        /https?:\/\/[^"'<>\\\s]+|\/[^"'<>\\\s]*(?:pdf|judgment|diary|download)[^"'<>\\\s]*/gi
      ) || [];

    const uniqueUrls = [...new Set(urlMatches)].slice(0, 100);

    return new Response(
      JSON.stringify(
        {
          success: true,
          status: response.status,
          final_url: response.url,
          html_length: html.length,
          script_sources: [...new Set(scriptSources)],
          inline_script_count: inlineScripts.length,
          interesting_lines: interestingLines.slice(0, 100),
          possible_urls: uniqueUrls,
          html_preview: html.slice(0, 15000),
        },
        null,
        2
      ),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error",
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