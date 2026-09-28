import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function isAllowedUrl(value: string): boolean {
  try {
    const url = new URL(value);

    // सुरक्षा: अभी केवल official Supreme Court source
    return (
      url.protocol === "https:" &&
      (url.hostname === "www.sci.gov.in" ||
        url.hostname === "sci.gov.in")
    );
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

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
        }
      );
    }

    const body = await req.json();
    const document_url = body.document_url;

    if (!document_url || typeof document_url !== "string") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "document_url is required",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!isAllowedUrl(document_url)) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Only official Supreme Court of India URLs are currently allowed",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const response = await fetch(document_url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept":
          "application/pdf,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.sci.gov.in/",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Document website returned ${response.status}`,
          source_url: document_url,
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const contentType =
      response.headers.get("content-type") || "";

    const finalUrl = response.url;

    // PDF मिला
    if (
      contentType.toLowerCase().includes("application/pdf") ||
      finalUrl.toLowerCase().includes(".pdf")
    ) {
      const buffer = await response.arrayBuffer();

      return new Response(
        JSON.stringify({
          success: true,
          document_type: "pdf",
          source_url: document_url,
          final_url: finalUrl,
          size_bytes: buffer.byteLength,
          content_type: contentType,
          message:
            "Supreme Court judgment PDF retrieved successfully.",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // अगर SCI ने HTML page return किया
    const html = await response.text();

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#8217;/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    // HTML में PDF link ढूंढने की कोशिश
    const pdfLinks: string[] = [];

    const linkRegex =
      /href=["']([^"']+)["']/gi;

    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];

      if (
        /\.pdf(?:\?|$)/i.test(href) ||
        /download.*pdf/i.test(href)
      ) {
        try {
          const absoluteUrl = new URL(
            href,
            finalUrl
          ).href;

          if (
            !pdfLinks.includes(absoluteUrl) &&
            isAllowedUrl(absoluteUrl)
          ) {
            pdfLinks.push(absoluteUrl);
          }
        } catch {
          // Ignore invalid URLs
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        document_type: "html",
        source_url: document_url,
        final_url: finalUrl,
        content_type: contentType,
        text_length: text.length,
        document_text: text.slice(0, 50000),
        pdf_links_found: pdfLinks,
        message:
          pdfLinks.length > 0
            ? "HTML page retrieved. PDF link(s) found."
            : "HTML page retrieved. No direct PDF link found in the page.",
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