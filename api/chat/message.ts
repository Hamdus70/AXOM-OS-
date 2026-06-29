import { GoogleGenAI } from "@google/genai";

export const runtime = "edge";

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // A. Robust API Key Check
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey === "MY_GEMINI_API_KEY") {
    console.error("Vercel Edge Chat: GEMINI_API_KEY is not configured.");
    return new Response(JSON.stringify({ error: "AI_CONFIG_MISSING" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    let messages: any[];
    try {
      const body = await req.json();
      if (!body.messages || !Array.isArray(body.messages)) {
        return new Response(JSON.stringify({ error: "PARSING_ERROR", details: "Messages array required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      messages = body.messages;
    } catch (e) {
      return new Response(JSON.stringify({ error: "PARSING_ERROR", details: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let ai: GoogleGenAI;
    try {
      ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "axom-os-assistant",
          },
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "CLIENT_INIT_ERROR", details: "Failed to initialize AI client" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

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

    const systemInstruction = `You are an Expert Academic Dean, Elite Research Consultant, and Senior Conversational AI Architect specializing in research methodology validation. Your task is to act as the "AXOM OS Strategic Onboarding Assistant"—a conversational AI chatbot that interviews students to gather, refine, and lock down every variable required to initialize a flawless, publication-grade research baseline.

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
}`;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const responseStream = await ai.models.generateContentStream({
            model: "gemini-3.5-flash",
            contents,
            config: {
              systemInstruction,
            },
          });

          let accumulatedText = "";
          for await (const chunk of responseStream) {
            const chunkText = chunk.text || "";
            accumulatedText += chunkText;
            const cleanChunk = chunkText.replace(/\*\*?/g, "");
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: cleanChunk })}\n\n`));
          }

          let projectBaseline: any = null;
          if (accumulatedText.includes("project_baseline")) {
            const jsonMatch = accumulatedText.match(/\{[\s\S]*"project_baseline"[\s\S]*\}/);
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

          const finalPayload = JSON.stringify({
            done: true,
            isComplete: !!projectBaseline,
            projectBaseline,
          });
          controller.enqueue(encoder.encode(`data: ${finalPayload}\n\n`));
          controller.close();
        } catch (streamError: any) {
          console.error("Vercel Edge Streaming error:", streamError);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "STREAM_READ_ERROR", details: streamError.message || "Streaming failed" })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error: any) {
    console.error("Vercel Edge Handler General Error:", error);
    return new Response(JSON.stringify({ error: "HANDLER_ERROR", details: error.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
