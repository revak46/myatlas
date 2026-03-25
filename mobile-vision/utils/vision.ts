// ============================================================
// utils/vision.ts — Helm Vision API
// Sends a screenshot to Claude, returns structured signal
// ============================================================

import { HELM_CONFIG } from '../config';

export type LifePillar =
  | 'Family'
  | 'Travel'
  | 'Photography'
  | 'Growth'
  | 'Finances'
  | 'Work'
  | 'General';

export interface VisionSignal {
  pillar: LifePillar;
  signal: string;          // one-line summary
  details: string;         // 2-3 sentences of relevant detail
  action_needed: boolean;
  tags: string[];
  raw_text: string;        // key text extracted from image
  confidence: 'high' | 'medium' | 'low';
}

const HELM_PROMPT = `You are Helm, Yemi's personal intelligence layer for MyAtlas.

Analyse this screenshot and extract the key signal from it.
It could be a calendar, email, message, link, reminder, or anything else.

Return ONLY a valid JSON object — no explanation, no markdown, just JSON:
{
  "pillar": "Family|Travel|Photography|Growth|Finances|Work|General",
  "signal": "one clear sentence — what is this about",
  "details": "2-3 sentences of useful context Yemi should know",
  "action_needed": true or false,
  "tags": ["tag1", "tag2"],
  "raw_text": "the most important text extracted from the image",
  "confidence": "high|medium|low"
}

Pillar guide:
- Family: people, relationships, health, personal moments
- Travel: flights, hotels, trips, destinations
- Photography: shoots, locations, gear, creative ideas
- Growth: learning, courses, books, skills, conversations
- Finances: money, invoices, payments, budgets
- Work: meetings, deadlines, projects, work comms
- General: anything that doesn't fit the above`;

export async function analyseScreenshot(base64Image: string): Promise<VisionSignal> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': HELM_CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HELM_CONFIG.CLAUDE_MODEL,
      max_tokens: HELM_CONFIG.MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: HELM_PROMPT,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Vision API error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? '';

  // Strip any accidental markdown wrapping
  const clean = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(clean) as VisionSignal;
  } catch {
    throw new Error(`Could not parse Helm response: ${clean}`);
  }
}
