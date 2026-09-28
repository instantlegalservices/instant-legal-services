import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Method not allowed. Use POST.",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    )
  }

  try {
    const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY")

    if (!openRouterApiKey) {
      throw new Error("OPENROUTER_API_KEY secret is not configured")
    }

    const { case_title, case_number, judgment_date } = await req.json()

    if (!case_title) {
      throw new Error("case_title is required")
    }

    const prompt = `
You are an expert Indian legal research assistant.

Generate a concise and legally useful judgment summary.

Case Title: ${case_title}
Case Number: ${case_number || "Not available"}
Judgment Date: ${judgment_date || "Not available"}

IMPORTANT:
The actual full judgment text has NOT been provided.
Do NOT invent facts, holdings, reasoning, citations, or legal principles.

Based only on the metadata, return valid JSON in exactly this format:

{
  "primary_category": "Uncategorized",
  "short_summary": "This judgment has been identified from official Supreme Court metadata. A detailed legal summary requires the full judgment text or order.",
  "key_legal_issues": [],
  "legal_principle": "Not determinable without reviewing the judgment text."
}
`

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openRouterApiKey}`,
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
                "You are a careful Indian legal research assistant. Never invent legal facts.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.2,
        }),
      }
    )

    const responseText = await response.text()

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${responseText}`)
    }

    const data = JSON.parse(responseText)

    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error("No summary returned from OpenRouter")
    }

    let summary

    try {
      const cleanedContent = content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim()

      summary = JSON.parse(cleanedContent)
    } catch {
      summary = {
        primary_category: "Uncategorized",
        short_summary: content,
        key_legal_issues: [],
        legal_principle: "Not determinable without reviewing the full judgment text.",
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        case_title,
        case_number: case_number || null,
        judgment_date: judgment_date || null,
        ...summary,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    )
  }
})