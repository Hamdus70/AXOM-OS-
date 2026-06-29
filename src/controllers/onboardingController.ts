import { geminiProvider } from "../lib/GeminiProvider";

export async function onboardingChatHandler(req: any, res: any) {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "INVALID_REQUEST", details: "Messages array required" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Smart Context Caching: Keep only the most recent N messages to save tokens and avoid context limits
    const validMessages = messages.filter((m: any) => m.text && m.text.trim().length > 0);
    const recentMessages = validMessages.slice(-10); 
    
    const contents = recentMessages.length === 0 
      ? [{ role: "user", parts: [{ text: "Hello! Begin the onboarding sequence." }] }]
      : recentMessages.map((m: any) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.text }]
        }));

    const responseStream = await geminiProvider.generateContentStream(contents);

    for await (const chunk of responseStream) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error("[ONBOARDING_STREAM_ERROR]", err);
    res.write(`data: ${JSON.stringify({ error: "GEMINI_API_FAILURE", details: err.message || "Unknown error" })}\n\n`);
    res.end();
  }
}
