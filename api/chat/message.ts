import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: "edge", // Bypasses the 10-second serverless execution cap completely
};

/**
 * High-Performance, Non-Blocking Serverless Chat Handler
 * Runs on the Vercel Edge Runtime using modern @google/genai SDK.
 */
export default async function handler(req: any) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages array is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
      console.warn("Vercel Edge Chat: GEMINI_API_KEY is not configured.");
      return new Response(JSON.stringify({ success: false, error: "AI_PROVISIONING_TIMEOUT" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Initialize modern Gemini SDK client inside the function execution lifecycle
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    // Format messages mapping role to parts according to Gemini structural specification
    const contents = messages.map((m: any) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }]
    }));

    if (contents.length === 0) {
      contents.push({
        role: "user",
        parts: [{ text: "Hello! Begin the onboarding sequence." }]
      });
    }

    // 2. Wrap client call in protective try-catch for external network drops and timeouts
    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents,
        config: {
          systemInstruction: `You are an Expert Academic Dean, Elite Research Consultant, and Senior Conversational AI Architect specializing in research methodology validation. Your task is to act as the "AXOM OS Strategic Onboarding Assistant"—a conversational AI chatbot that interviews students to gather, refine, and lock down every variable required to initialize a flawless, publication-grade research baseline.

You must strictly execute this interview following the programmatic logic, validation rules, and discipline-specific matrices.

- Ask exactly ONE clear question at a time.
- Keep responses concise and academic.
- Do NOT output any markdown bolding/italic asterisks (* or **) under any circumstance.
- Once all five variables (Topic, Faculty, Study Design, Setting, Citation) are successfully collected, freeze the conversation and output a JSON block matching this exact schema:
{
  "project_baseline": {
    "title": "STRICTLY UPPERCASE CLEAN TITLE",
    "faculty": "Validated Faculty Node",
    "study_design": "Quantitative | Qualitative | Mixed",
    "setting": "Specific Institution/Location Setting",
    "citation_format": "APA | IEEE | MLA | Harvard",
    "academic_tier": "Undergraduate | Postgraduate"
  }
}`
        }
      });
    } catch (apiError: any) {
      console.error("Vercel Edge Chat API call failed:", apiError);
      return new Response(JSON.stringify({ success: false, error: "AI_PROVISIONING_TIMEOUT" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rawResponseText = response.text || "";
    
    let projectBaseline: any = null;
    if (rawResponseText.includes("project_baseline")) {
      const jsonMatch = rawResponseText.match(/\{[\s\S]*"project_baseline"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.project_baseline) {
            projectBaseline = parsed.project_baseline;
          }
        } catch (err) {
          console.warn("Could not parse onboarding JSON outcome on Edge:", err);
        }
      }
    }

    // Enforce sanitation filter over markdown bold/italic asterisks
    const cleanText = rawResponseText.replace(/\*\*?/g, "");

    return new Response(JSON.stringify({
      text: cleanText,
      isComplete: !!projectBaseline,
      projectBaseline
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Vercel Catalog/Chat General Error on Edge handler:", error);
    return new Response(JSON.stringify({ success: false, error: "AI_PROVISIONING_TIMEOUT" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
