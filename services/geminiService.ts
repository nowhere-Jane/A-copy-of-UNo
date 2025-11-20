
import { GoogleGenAI } from "@google/genai";
import { Player, Card } from "../types";

// Safely initialize Gemini. If no key, we just won't get chats.
const apiKey = process.env.API_KEY || '';
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

export const generateBotReaction = async (
  bot: Player,
  event: string,
  playedCard?: Card
): Promise<string | null> => {
  if (!ai) return null;

  try {
    const model = ai.models;
    
    const prompt = `
      Character Persona: ${bot.persona}
      Context: We are playing a game of UNO.
      Event: ${event}
      ${playedCard ? `Card involved: ${playedCard.color} ${playedCard.value}` : ''}
      
      Task: Write a one-sentence reaction (max 10 words) to this event as your character. 
      IMPORTANT: You MUST reply in CHINESE (Simplified).
    `;

    const response = await model.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text.trim();
  } catch (error) {
    console.warn("Gemini API Error:", error);
    return null;
  }
};
