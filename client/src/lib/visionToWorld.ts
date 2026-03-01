import { callVision, callText, extractJSON } from './mistral';
import { WorldModelSchema, type WorldModel } from './schemas';

// ---------------------------------------------------------------------------
// Prompts (inlined — prompts.ts removed in agentic refactor)
// ---------------------------------------------------------------------------

const VISION_TO_WORLD_PROMPT = `You are a creative writing assistant analyzing a child's drawing to build a structured world model for an interactive bedtime story.

Analyze the drawing carefully and extract all visual elements. Return a JSON object with this exact structure:
{
  "title": "A short evocative title for the scene (3-6 words)",
  "characters": [
    {
      "name": "Character name (invent a friendly name if not obvious)",
      "description": "Visual appearance",
      "role": "hero | companion | antagonist | neutral",
      "emotion": "Current emotional state",
      "relationships": ["Relationship to other characters"]
    }
  ],
  "setting": {
    "place": "Where the story takes place",
    "time": "Time of day or era",
    "weather": "Weather or atmosphere",
    "vibe": "Overall mood/feeling"
  },
  "objects": ["Important objects or items visible in the drawing"],
  "themes": ["2-4 story themes suggested by the drawing, e.g. friendship, adventure, magic"],
  "storyHooks": ["2-3 interesting story possibilities inspired by the drawing"],
  "safetyNotes": ["Any content to avoid based on the drawing — use empty array if none"]
}

If the drawing is abstract or unclear, use your imagination to fill in child-friendly details.
Respond ONLY with the JSON object — no markdown, no explanation.`;

function buildRepairPrompt(rawResponse: string, errorMessage: string): string {
  return `The following JSON failed to parse correctly. Please fix it and return valid JSON only.

ERROR: ${errorMessage}

ORIGINAL RESPONSE:
${rawResponse}

Return ONLY the corrected JSON object matching the required WorldModel schema. No explanation, no markdown.`;
}

/**
 * Step 3 — Vision pass.
 * Sends the canvas image to the Mistral vision model and parses
 * the structured WorldModel JSON response.
 *
 * @param imageDataUrl  Base64 data URL of the canvas PNG
 * @param apiKey        Mistral API key
 * @param onRetry       Optional callback fired when a repair attempt is made
 */
export async function visionToWorld(
  imageDataUrl: string,
  apiKey: string,
  onRetry?: () => void,
): Promise<WorldModel> {
  const raw = await callVision(imageDataUrl, VISION_TO_WORLD_PROMPT, apiKey);

  try {
    return WorldModelSchema.parse(JSON.parse(extractJSON(raw)));
  } catch (firstErr) {
    onRetry?.();
    const repairPrompt = buildRepairPrompt(
      raw,
      firstErr instanceof Error ? firstErr.message : String(firstErr),
    );
    const repaired = await callText(repairPrompt, apiKey);
    try {
      return WorldModelSchema.parse(JSON.parse(extractJSON(repaired)));
    } catch (secondErr) {
      throw new Error(
        `WorldModel parse failed after repair attempt. ${secondErr instanceof Error ? secondErr.message : secondErr}`,
      );
    }
  }
}
