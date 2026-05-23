// src/geminiService.ts
import dotenv from 'dotenv';
dotenv.config();

let ai: any;

async function getClient() {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY ot defined in this thread's environment variables.");
    }

    const { GoogleGenAI } = await import("@google/genai");
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

// Turn text lines into mathematical vector dimensions
export async function generateLogEmbedding(logContent: string): Promise<number[]> {
  try {
    const client = await getClient();

    const response = await client.models.embedContent({
      model: 'gemini-embedding-2', 
      contents: logContent,
    });
    if (response.embedding?.values) {
      return response.embedding.values;
    }
    if (response.embeddings && response.embeddings[0]?.values) {
      return response.embeddings[0].values;
    }

    throw new Error('Malformed coordinate payload returned from Gemini endpoint.');
  } catch (error) {
    console.error('Gemini Embedding Layer Failure:', error);
    throw error;
  }
}

//Analyze a dense structural cluster and extract consumer business impacts
export async function queryPMInsight(logSamples: string[]): Promise<{ label: string; pm_insight: string }> {
  try {
    const client = await getClient();

    const prompt = `
      You are analyzing a dense cluster group of identical system log failures.
      Here are raw contextual samples of the error pattern:
      ${logSamples.join('\n')}

      Examine the operational data and extract a non-technical summary.
    `;

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Brief human-readable identifier for the anomaly. Max 5 words.' },
            pm_insight: { type: 'string', description: 'High-level business-impact sentence explicitly showing which user feature is broken.' }
          },
          required: ['label', 'pm_insight']
        },
        temperature: 0.1
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error('Gemini Reporting Layer Failure:', error);
    return { label: 'Unknown Failure', pm_insight: 'Failed generating diagnostic data breakdown.' };
  }
}