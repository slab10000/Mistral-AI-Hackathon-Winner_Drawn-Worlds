// ---------------------------------------------------------------------------
// Google Gemini — Nano Banana 2 (gemini-3.1-flash-image-preview)
// Native image generation via the generateContent API
// ---------------------------------------------------------------------------

const MODEL = 'gemini-3.1-flash-image-preview';
const ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * Build an illustration-style prompt from a paragraph of story text.
 */
export function buildIllustrationPrompt(
  paragraphText: string,
  worldContext?: string,
): string {
  const style =
    "Children's picture book illustration, warm watercolor painting, " +
    "whimsical magical atmosphere, golden soft light, vivid cheerful colors, " +
    "Beatrix Potter style, no text, no words, no letters.";

  const scene = worldContext
    ? `World: ${worldContext}. Scene: ${paragraphText}`
    : `Scene: ${paragraphText}`;

  return `${style} ${scene}`;
}

/**
 * Call Gemini Nano Banana 2 to generate one illustration.
 * Returns a `data:image/png;base64,...` string, or `null` on failure.
 * Never throws — callers can safely fire-and-forget.
 *
 * @param prompt       Text prompt (use buildIllustrationPrompt for best results)
 * @param googleApiKey VITE_GOOGLE_API_KEY
 */
export async function generateImagenImage(
  prompt: string,
  googleApiKey: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${ENDPOINT}?key=${googleApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio: '3:4',   // portrait — matches the book page shape
            imageSize: '1K',      // good balance of quality & speed
          },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      console.warn(`[imagen] HTTP ${res.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    // Response: { candidates: [{ content: { parts: [{ inline_data: { mimeType, data } }] } }] }
    const json = await res.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inline_data?: { mimeType?: string; data?: string };
            inlineData?: { mimeType?: string; data?: string };
            text?: string;
          }>;
        };
      }>;
    };

    const parts = json.candidates?.[0]?.content?.parts;
    if (!parts) {
      console.warn('[imagen] No parts in response');
      return null;
    }

    // Find the image part (skip any text parts)
    const imagePart = parts.find(p => p.inlineData?.data || p.inline_data?.data);
    const data = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;
    if (!data) {
      console.warn('[imagen] No image data in response parts');
      return null;
    }

    const mime =
      imagePart?.inlineData?.mimeType ??
      imagePart?.inline_data?.mimeType ??
      'image/png';
    return `data:${mime};base64,${data}`;
  } catch (err) {
    console.warn('[imagen] Network error:', err);
    return null;
  }
}
