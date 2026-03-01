import { callVision, callText, extractJSON } from './mistral';
import { WorldModelSchema, type WorldModel } from './schemas';
import { VISION_TO_WORLD_PROMPT, buildRepairPrompt } from './prompts';

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
