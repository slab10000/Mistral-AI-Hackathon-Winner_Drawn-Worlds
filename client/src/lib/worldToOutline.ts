import { callText, extractJSON } from './mistral';
import { OutlineSchema, type WorldModel, type Outline } from './schemas';
import { buildWorldToOutlinePrompt, buildRepairPrompt } from './prompts';

/**
 * Step 4 — Story planning pass.
 * Converts the WorldModel into a structured 4-act story Outline.
 *
 * @param worldModel  The validated world model from Step 3
 * @param apiKey      Mistral API key
 * @param onRetry     Optional callback fired when a repair attempt is made
 */
export async function worldToOutline(
  worldModel: WorldModel,
  apiKey: string,
  onRetry?: () => void,
): Promise<Outline> {
  const prompt = buildWorldToOutlinePrompt(worldModel);
  const raw = await callText(prompt, apiKey);

  try {
    return OutlineSchema.parse(JSON.parse(extractJSON(raw)));
  } catch (firstErr) {
    onRetry?.();
    const repairPrompt = buildRepairPrompt(
      raw,
      firstErr instanceof Error ? firstErr.message : String(firstErr),
    );
    const repaired = await callText(repairPrompt, apiKey);
    try {
      return OutlineSchema.parse(JSON.parse(extractJSON(repaired)));
    } catch (secondErr) {
      throw new Error(
        `Outline parse failed after repair attempt. ${secondErr instanceof Error ? secondErr.message : secondErr}`,
      );
    }
  }
}
