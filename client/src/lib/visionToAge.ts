import { callVision } from './mistral';

const VISION_TO_AGE_PROMPT = `You are recognizing a child's handwritten age from a drawing.

Return EXACTLY one token and nothing else:
- A single integer from 3 to 12 if the age is clearly visible
- UNRECOGNIZED if you are not sure or cannot read a clear age

STRICT OUTPUT RULES:
- Output must be either: 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, or UNRECOGNIZED
- No JSON
- No markdown
- No explanation
- No extra words
- No punctuation`;

/**
 * Recognize kid age from a canvas snapshot.
 * Returns a number in [3, 12] or null when unrecognized.
 */
export async function visionToAge(
  imageDataUrl: string,
  apiKey: string,
): Promise<number | null> {
  const raw = await callVision(imageDataUrl, VISION_TO_AGE_PROMPT, apiKey);
  const token = raw.trim().replace(/^["'`\s]+|["'`\s]+$/g, '').toUpperCase();

  if (token === 'UNRECOGNIZED') return null;
  if (!/^\d{1,2}$/.test(token)) return null;

  const age = Number(token);
  if (!Number.isInteger(age)) return null;
  if (age < 3 || age > 12) return null;
  return age;
}
