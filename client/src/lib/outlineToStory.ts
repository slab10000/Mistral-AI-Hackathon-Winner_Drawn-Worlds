import { callText, extractJSON } from './mistral';
import { StorySchema, type WorldModel, type Outline, type Story } from './schemas';
import {
  buildOutlineToStoryPrompt,
  buildContinueStoryPrompt,
  buildRepairPrompt,
} from './prompts';

// ---------------------------------------------------------------------------
// Shared repair helper
// ---------------------------------------------------------------------------

async function parseWithRepair(
  raw: string,
  apiKey: string,
  onRetry?: () => void,
): Promise<Story> {
  try {
    return StorySchema.parse(JSON.parse(extractJSON(raw)));
  } catch (firstErr) {
    onRetry?.();
    const repairPrompt = buildRepairPrompt(
      raw,
      firstErr instanceof Error ? firstErr.message : String(firstErr),
    );
    const repaired = await callText(repairPrompt, apiKey);
    try {
      return StorySchema.parse(JSON.parse(extractJSON(repaired)));
    } catch (secondErr) {
      throw new Error(
        `Story parse failed after repair attempt. ${secondErr instanceof Error ? secondErr.message : secondErr}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Step 5 — Story generation pass
// ---------------------------------------------------------------------------

/**
 * Expands the outline + world model into a full bedtime story.
 *
 * @param worldModel  Validated world from Step 3
 * @param outline     Validated outline from Step 4
 * @param ageGroup    Human-readable age group string (e.g. "children (ages 6-8)")
 * @param apiKey      Mistral API key
 * @param onRetry     Optional callback fired on repair attempt
 */
export async function outlineToStory(
  worldModel: WorldModel,
  outline: Outline,
  ageGroup: string,
  apiKey: string,
  onRetry?: () => void,
): Promise<Story> {
  const prompt = buildOutlineToStoryPrompt(worldModel, outline, ageGroup);
  const raw = await callText(prompt, apiKey);
  return parseWithRepair(raw, apiKey, onRetry);
}

// ---------------------------------------------------------------------------
// Step 7 — Continue Story (session memory)
// ---------------------------------------------------------------------------

/**
 * Generates a continuation using the stored WorldModel and motifs.
 * The previousStoryText provides context for a seamless join.
 *
 * @param worldModel        The original world model (session memory constraint)
 * @param motifs            Recurring motifs from the original outline
 * @param previousStoryText Full text of the previous story
 * @param apiKey            Mistral API key
 * @param onRetry           Optional callback fired on repair attempt
 */
export async function continueStory(
  worldModel: WorldModel,
  motifs: string[],
  previousStoryText: string,
  apiKey: string,
  onRetry?: () => void,
): Promise<Story> {
  const prompt = buildContinueStoryPrompt(worldModel, motifs, previousStoryText);
  const raw = await callText(prompt, apiKey);
  return parseWithRepair(raw, apiKey, onRetry);
}
