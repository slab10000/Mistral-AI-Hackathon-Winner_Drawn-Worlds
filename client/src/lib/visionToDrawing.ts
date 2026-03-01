import { callVision } from './mistral';

/**
 * Describe what a child drew in response to a story prompt.
 * The description is fed back to the story agent so the narrative can react to it.
 *
 * @param imageDataUrl  Base64 data URL of the canvas snapshot
 * @param drawingPrompt What the child was asked to draw (e.g. "Draw how many coins the prince gave")
 * @param storyContext  Last few paragraphs for narrative context
 * @param apiKey        Mistral API key
 * @returns             1-2 sentence description of the drawing, in story context
 */
export async function visionToDrawingDescription(
  imageDataUrl: string,
  drawingPrompt: string,
  storyContext: string,
  apiKey: string,
): Promise<string> {
  const prompt = `You are analyzing a child's drawing made during an interactive bedtime story.

STORY CONTEXT (last few paragraphs):
${storyContext}

THE CHILD WAS ASKED TO DRAW:
"${drawingPrompt}"

Describe what the child drew in 1-2 sentences, interpreting it within the story context.
Be imaginative and generous — if the drawing is unclear, make a reasonable story-friendly interpretation.
Return ONLY the description text, no JSON, no markdown, no extra words.`;

  const raw = await callVision(imageDataUrl, prompt, apiKey);
  return raw.trim();
}
