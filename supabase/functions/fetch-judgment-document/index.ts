import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function extractSciParams(urlString: string) {
  try {
    const url = new URL(urlString);

    const diaryNo = url.searchParams.get("diary_no");
    const type = url.searchParams.get("type") || "j";
    const orderDate = url.searchParams.get("order_date");

    if (!diaryNo || !orderDate) {
      return null;
    }

    return {
      diary_no: diaryNo,
      type,
      order_date: orderDate,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Supabase environment variables are missing"
      );
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    const body = await req.json();

    const judgmentId = body.judgment_id;

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
        }
      );
    }

    // Get judgment from database
    const { data: judgment, error: judgmentError } =
      await supabase
        .from("judgments")
        .select(
          "id, case_title, case_number, judgment_date, official_source_url, source_pdf_url"
        )
        .eq("id", judgmentId)
        .single();

    if (judgmentError) {
      throw judgmentError;
    }

    if (!judgment) {
      throw new Error("Judgment not found");
    }

    // If official PDF URL is already stored
    let pdfUrl = judgment.source_pdf_url;

    let diaryNo: string | null = null;
    let judgmentType = "j";
    let orderDate: string | null = null;

    // Extract SCI parameters from official URL
    if (judgment.official_source_url) {
      const params = extractSciParams(
        judgment.official_source_url
      );

      if (params) {
        diaryNo = params.diary_no;
        judgmentType = params.type;
        orderDate = params.order_date;
      }
    }

    // If no parameters found, return useful error
    if (!diaryNo || !orderDate) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Could not extract diary number or judgment date from official_source_url",
          judgment_id: judgmentId,
          official_source_url:
            judgment.official_source_url,
          source_pdf_url: judgment.source_pdf_url,
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

    // Generate official SCI PDF endpoint
    if (!pdfUrl) {
      const params = new URLSearchParams({
        diary_no: diaryNo,
        type: judgmentType,
        order_date: orderDate,
        from: "latest_judgements_order",
      });

      pdfUrl =
        `https://www.sci.gov.in/sci-get-pdf/?${params.toString()}`;
    }

    // Fetch PDF from Supreme Court
    const response = await fetch(pdfUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept":
          "application/pdf,application/octet-stream,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.sci.gov.in/",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Supreme Court PDF endpoint returned ${response.status}`
      );
    }

    const contentType =
      response.headers.get("content-type") || "";

    const pdfBuffer = await response.arrayBuffer();

    // Verify actual PDF content
    const firstBytes = new TextDecoder()
      .decode(pdfBuffer.slice(0, 5));

    const isPdf =
      contentType.includes("application/pdf") ||
      firstBytes === "%PDF-";

    if (!isPdf) {
      throw new Error(
        "Supreme Court endpoint did not return a valid PDF"
      );
    }

    // Update database with confirmed PDF URL
    const { error: updateError } = await supabase
      .from("judgments")
      .update({
        source_pdf_url: pdfUrl,
        official_source_url:
          judgment.official_source_url,
        summary_status: "document_retrieved",
      })
      .eq("id", judgmentId);

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        document_found: true,
        judgment_id: judgment.id,
        case_title: judgment.case_title,
        case_number: judgment.case_number,
        judgment_date: judgment.judgment_date,
        document_type: "pdf",
        diary_no: diaryNo,
        judgment_type: judgmentType,
        order_date: orderDate,
        source_url:
          judgment.official_source_url,
        pdf_url: pdfUrl,
        content_type: contentType,
        size_bytes: pdfBuffer.byteLength,
        message:
          "Official Supreme Court judgment PDF retrieved successfully and saved to the judgment record.",
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