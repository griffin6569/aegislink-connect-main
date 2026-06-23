import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { incident, analysis_type, evidence } = await req.json();

    if (!incident || !analysis_type) {
      return new Response(
        JSON.stringify({ error: "Missing incident or analysis_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const model = "gemini-2.5-flash";

    let systemPrompt = "";
    let userPrompt = "";

    switch (analysis_type) {
      case "threat_assessment":
        systemPrompt = "You are a security intelligence analyst. Analyze incident reports and provide structured threat assessments. Be concise and actionable.";
        userPrompt = `Analyze this incident and provide a threat assessment:
Category: ${incident.category}
Subcategory: ${incident.subcategory}
Severity: ${incident.severity}
Description: ${incident.description}
Location: ${incident.location_address || 'Unknown'}
Time: ${incident.created_at}

Provide:
1. Threat level (1-10)
2. Risk classification
3. Recommended immediate actions (2-3 bullet points)
4. Pattern indicators
5. Escalation recommendation

If image evidence is attached, inspect it carefully and extract only visible, defensible observations.
Respond using this exact structure:
DESCRIPTION_ADDENDUM:
<1-3 sentences that can be appended to the volunteer description. Mention only visible evidence and clear uncertainty when needed. If no useful visual evidence exists, say "No additional visual evidence observed.">

THREAT_ASSESSMENT:
<the structured threat assessment>`;
        break;

      case "pattern_analysis":
        systemPrompt = "You are a crime pattern analyst. Identify patterns and trends from incident data.";
        userPrompt = `Analyze these incidents for patterns:
${JSON.stringify(incident, null, 2)}

Provide:
1. Identified patterns
2. Hotspot indicators
3. Time-based trends
4. Risk predictions
5. Recommended preventive measures`;
        break;

      case "summary":
        systemPrompt = "You are a public safety report writer. Create clear, concise incident summaries.";
        userPrompt = `Create a brief intelligence summary for this incident:
Category: ${incident.category}
Subcategory: ${incident.subcategory}  
Severity: ${incident.severity}
Description: ${incident.description}
Location: ${incident.location_address || 'Unknown'}
Status: ${incident.status}

Write a 2-3 sentence professional summary suitable for authority briefings.`;
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Invalid analysis_type. Use: threat_assessment, pattern_analysis, or summary" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const evidenceParts = Array.isArray(evidence)
      ? evidence
          .filter((item: { mimeType?: string; data?: string }) => Boolean(item?.mimeType && item?.data))
          .slice(0, 3)
          .map((item: { mimeType: string; data: string }) => ({
            inlineData: {
              mimeType: item.mimeType,
              data: item.data,
            },
          }))
      : [];

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${systemPrompt}\n\n${userPrompt}`,
              },
              ...evidenceParts,
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      let message = "AI analysis failed";
      try {
        const parsed = JSON.parse(errorText);
        message =
          parsed?.error?.message ||
          parsed?.message ||
          message;
      } catch {
        if (errorText.trim()) {
          message = errorText.trim();
        }
      }
      return new Response(
        JSON.stringify({ error: message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    const content =
      aiResult?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .join("")
        .trim() || "No analysis generated";
    const addendumMatch = content.match(/DESCRIPTION_ADDENDUM:\s*([\s\S]*?)\n\s*THREAT_ASSESSMENT:/i);
    const assessmentMatch = content.match(/THREAT_ASSESSMENT:\s*([\s\S]*)$/i);
    const descriptionAddendum = addendumMatch?.[1]?.trim() || "";
    const normalizedAnalysis = assessmentMatch?.[1]?.trim() || content;

    return new Response(
      JSON.stringify({
        analysis: normalizedAnalysis,
        analysis_type,
        description_addendum: descriptionAddendum,
        model,
        incident_id: incident.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Analysis error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
