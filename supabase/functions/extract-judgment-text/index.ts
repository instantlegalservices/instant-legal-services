import { createClient } from "jsr:@supabase/supabase-js@2";

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
    const url = new URL(officialSourceUrl);

    return `https://www.sci.gov.in/sci-get-pdf/?${url.searchParams.toString()}`;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  let judgmentId: string | null = null;

  try {
    if (req.method !== "POST") {
      throw new Error("Use POST method");
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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment variables are missing");
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
    );

    const { data: judgment, error: judgmentError } = await supabase
      .from("judgments")
      .select(`
        id,
        case_title,
        case_number,
        judgment_date,
        official_source_url,
        source_pdf_url,
        judgment_text,
        summary_status
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

    const pdfUrl = getPdfUrl(
      judgment.source_pdf_url,
      judgment.official_source_url,
    );

    if (!pdfUrl) {
      throw new Error(
        "No official judgment PDF URL found",
      );
    }

    /*
      IMPORTANT:
      Do not load the entire PDF into pdfjs-dist here.

      This Edge Function only verifies the official PDF and
      saves the verified PDF URL.

      Actual text extraction should be performed by a separate
      lightweight document-processing service/function.
    */

    const response = await fetch(pdfUrl, {
      method: "HEAD",
      headers: SCI_HEADERS,
    });

    let pdfVerified = response.ok &&
      (response.headers.get("content-type") || "")
        .includes("application/pdf");

    let sizeBytes: number | null = null;

    if (pdfVerified) {
      const contentLength = response.headers.get("content-length");

      if (contentLength) {
        sizeBytes = Number(contentLength);
      }
    }

    // Some SCI servers do not properly support HEAD requests.
    // Verify using GET without downloading the complete document.
    if (!pdfVerified) {
      const verifyResponse = await fetch(pdfUrl, {
        method: "GET",
        headers: {
          ...SCI_HEADERS,
          "Range": "bytes=0-1023",
        },
      });

      if (!verifyResponse.ok) {
        throw new Error(
          `Official PDF returned HTTP ${verifyResponse.status}`,
        );
      }

      const contentType =
        verifyResponse.headers.get("content-type") || "";

      const partialData =
        new Uint8Array(await verifyResponse.arrayBuffer());

      const header = new TextDecoder()
        .decode(partialData.slice(0, 20));

      pdfVerified =
        contentType.includes("application/pdf") ||
        header.includes("%PDF");

      if (!pdfVerified) {
        throw new Error(
          `Official source did not return a valid PDF. Content-Type: ${contentType}`,
        );
      }

      const contentLength =
        verifyResponse.headers.get("content-range") ||
        verifyResponse.headers.get("content-length");

      if (contentLength) {
        const totalMatch = contentLength.match(/\/(\d+)$/);

        if (totalMatch) {
          sizeBytes = Number(totalMatch[1]);
        } else if (/^\d+$/.test(contentLength)) {
          sizeBytes = Number(contentLength);
        }
      }
    }

    const { error: updateError } = await supabase
      .from("judgments")
      .update({
        source_pdf_url: pdfUrl,
        judgment_text_status: "pending",
        summary_status: "document_verified",
      })
      .eq("id", judgmentId);

    if (updateError) {
      throw new Error(
        `Database update failed: ${updateError.message}`,
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        judgment_id: judgmentId,
        case_title: judgment.case_title,
        case_number: judgment.case_number,
        judgment_date: judgment.judgment_date,
        pdf_verified: true,
        pdf_url: pdfUrl,
        pdf_size_bytes: sizeBytes,
        judgment_text_status: "pending",
        message:
          "Official judgment PDF verified successfully. The PDF is ready for the next text-extraction step without consuming heavy Edge Function resources.",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("extract-judgment-text error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: getErrorMessage(error),
        judgment_id: judgmentId,
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