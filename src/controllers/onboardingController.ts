import { GoogleGenAI } from "@google/genai";

export async function onboardingChatHandler(req: any, res: any) {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "INVALID_REQUEST", details: "Messages array required" });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "API_KEY_OR_REGION_INVALID", details: "GEMINI_API_KEY is not configured" });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3.5-flash",
      contents: messages.map((m: any) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }]
      })),
      config: {
        systemInstruction: `You are an Expert Academic Dean and Strategic Onboarding Assistant for AXOM OS. Conduct a 5-step research baseline interview. Output only the final JSON baseline block after collecting: Title, Faculty, Design, Setting, Citation.`
      }
    });

    for await (const chunk of responseStream) {
      const chunkText = chunk.text || "";
      res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error("[ONBOARDING_STREAM_ERROR]", err);
    res.write(`data: ${JSON.stringify({ error: "STREAM_READ_ERROR", details: err.message || "Streaming failed" })}\n\n`);
    res.end();
  }
}
