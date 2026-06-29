import { GoogleGenAI } from "@google/genai";

export class GeminiProvider {
  private keyPool: string[];
  private currentKeyIndex: number = 0;

  constructor() {
    this.keyPool = (process.env.GEMINI_KEY_POOL || process.env.GEMINI_API_KEY || "")
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
  }

  private getClient(apiKey: string): GoogleGenAI {
    return new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
  }

  async generateContentStream(contents: any, model: string = "gemini-2.0-flash") {
    let retries = this.keyPool.length;
    
    while (retries > 0) {
      const apiKey = this.keyPool[this.currentKeyIndex];
      if (!apiKey) {
        throw new Error("No API keys configured");
      }

      const ai = this.getClient(apiKey);
      try {
        return await ai.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: `You are an Expert Academic Dean and Strategic Onboarding Assistant for AXOM OS. Conduct a 5-step research baseline interview. Output only the final JSON baseline block after collecting: Title, Faculty, Design, Setting, Citation.`
          }
        });
      } catch (err: any) {
        retries--;
        // Handle 429: Rotate key and retry
        if (err.status === 429 && this.keyPool.length > 1) {
          this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keyPool.length;
          console.warn(`[ONBOARDING_KEY_ROTATION] Gemini 429, switching to key index ${this.currentKeyIndex}. Retries left: ${retries}`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        throw err;
      }
    }
    
    throw new Error("Academic compilation engines are experiencing heavy traffic limits. Please check back shortly.");
  }
}

export const geminiProvider = new GeminiProvider();
