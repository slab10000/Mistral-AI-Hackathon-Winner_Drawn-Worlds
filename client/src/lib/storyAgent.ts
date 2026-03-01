import { callLarge, extractJSON } from './mistral';
import type { WorldModel } from './schemas';
import type { StoryEvent, AgentSegmentResponse } from './agentTypes';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(ageGroup: string, demoMode = false): string {
  if (demoMode) {
    return `You are an interactive bedtime story agent for ${ageGroup}.
You are in DEMO MODE — produce the shortest possible story to showcase all features.

AVAILABLE EVENT TYPES (output as JSON array "events"):
1. { "type": "music", "description": "..." } — Background music. Use ONCE on the first call.
2. { "type": "paragraph", "text": "..." } — One short narrative paragraph (max 40 words).
3. { "type": "sound_effect", "description": "..." } — A sound effect after a paragraph.
4. { "type": "ask_user_to_draw", "prompt": "...", "context": "..." } — Ask the child to draw something. Use EXACTLY ONCE across the whole story.
5. { "type": "ask_user_to_speak", "prompt": "..." } — Ask the child to say ONE word. Use EXACTLY ONCE across the whole story.
6. { "type": "finish" } — End the story.

DEMO RULES:
- The ENTIRE story must have EXACTLY 1 paragraph, 1 drawing interaction, 1 speaking interaction, then finish.
- Each call outputs events up to the next user interaction or finish.
- Segment 1: music + paragraph + sound_effect + ask_user_to_draw
- Segment 2: ask_user_to_speak (incorporate the drawing)
- Segment 3: finish (wrap up in zero paragraphs, just end)
- Keep the paragraph very short (under 40 words). Be warm and magical.
- Safety: no scary, violent, or inappropriate content.

OUTPUT FORMAT — respond with ONLY valid JSON:
{ "events": [ ...event objects... ] }`;
  }

  return `You are an interactive bedtime story agent for ${ageGroup}.
You craft a magical, age-appropriate story in segments. Each time you are called, you output the NEXT segment of events.

AVAILABLE EVENT TYPES (output as JSON array "events"):
1. { "type": "music", "description": "..." }
   — Background music description. Use AT MOST ONCE, on the very first call only.
2. { "type": "paragraph", "text": "..." }
   — A narrative paragraph. Keep each under 80 words. Warm, vivid, child-friendly language.
3. { "type": "sound_effect", "description": "..." }
   — A sound effect to play immediately after the preceding paragraph. Be specific (e.g. "crackling campfire", "owl hooting in a dark forest").
4. { "type": "ask_user_to_draw", "prompt": "...", "context": "..." }
   — Ask the child to draw something that will influence the story. "prompt" is shown to the child. "context" is for the vision model (more technical description of what to look for). Use 2-3 times total across the whole story.
5. { "type": "ask_user_to_speak", "prompt": "..." }
   — Ask the child to say ONE word out loud. "prompt" is the question (e.g. "What magic word should the wizard use?"). Use 2-3 times total across the whole story.
6. { "type": "finish" }
   — End the story. Add this as the last event when the story is complete (after a satisfying resolution).

RULES:
- Each call outputs events up to and including the NEXT user interaction ("ask_user_to_draw" / "ask_user_to_speak") OR "finish".
- Sound effects must follow the paragraph they relate to.
- Make user interactions feel natural — they should influence the story meaningfully.
- Keep total interactions (draw + speak combined) between 2 and 3 across the whole story.
- The story should have a clear arc: beginning → conflict → climax → resolution.
- Always incorporate previous user inputs (drawings, words) into the narrative.
- Safety: no scary, violent, or inappropriate content.

OUTPUT FORMAT — respond with ONLY valid JSON:
{ "events": [ ...event objects... ] }`;
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

function buildContextMessage(
  worldModel: WorldModel,
  ageGroup: string,
  previousEvents: StoryEvent[],
  demoMode = false,
): string {
  const worldJson = JSON.stringify(worldModel, null, 2);

  // Count existing user interactions
  const interactionCount = previousEvents.filter(
    e => e.type === 'ask_user_to_draw' || e.type === 'ask_user_to_speak',
  ).length;

  // Summarise previous story for context
  const storyLines: string[] = [];
  for (const ev of previousEvents) {
    if (ev.type === 'paragraph') {
      storyLines.push(`[paragraph] ${ev.text}`);
    } else if (ev.type === 'sound_effect') {
      storyLines.push(`[sound_effect] ${ev.description}`);
    } else if (ev.type === 'music') {
      storyLines.push(`[music set] ${ev.description}`);
    } else if (ev.type === 'ask_user_to_draw') {
      storyLines.push(`[user drew] prompt="${ev.prompt}" → description="${ev.visionDescription ?? 'pending'}"`);
    } else if (ev.type === 'ask_user_to_speak') {
      storyLines.push(`[user said] prompt="${ev.prompt}" → word="${ev.word ?? 'pending'}"`);
    } else if (ev.type === 'finish') {
      storyLines.push(`[story finished]`);
    }
  }

  const isFirst = previousEvents.length === 0;

  if (demoMode) {
    const segmentNum = interactionCount + 1;
    let segmentInstruction = '';
    if (segmentNum === 1) {
      segmentInstruction = 'This is segment 1. Output: music + one short paragraph (under 40 words) + sound_effect + ask_user_to_draw. Stop after ask_user_to_draw.';
    } else if (segmentNum === 2) {
      segmentInstruction = 'This is segment 2. Output: ask_user_to_speak only. Stop after ask_user_to_speak.';
    } else {
      segmentInstruction = 'This is the final segment. Output ONLY: { "type": "finish" }. Nothing else.';
    }

    return `
WORLD MODEL (from child's drawing):
${worldJson}

AGE GROUP: ${ageGroup}
DEMO MODE — segment ${segmentNum} of 3.
${segmentInstruction}

STORY SO FAR:
${storyLines.length > 0 ? storyLines.join('\n') : '(none yet)'}
`.trim();
  }

  return `
WORLD MODEL (from child's drawing):
${worldJson}

AGE GROUP: ${ageGroup}
USER INTERACTIONS SO FAR: ${interactionCount} / max 3
${isFirst ? 'STORY STATUS: Not yet started — this is the first segment. You may include a "music" event.' : ''}

STORY SO FAR:
${storyLines.length > 0 ? storyLines.join('\n') : '(none yet)'}

Generate the next segment of the story now. Remember: stop after the next "ask_user_to_draw", "ask_user_to_speak", or "finish" event.
${interactionCount >= 3 ? 'NOTE: You have reached the maximum interactions. Do NOT add more ask_user_to_draw or ask_user_to_speak events. Move toward the story ending and add "finish".' : ''}
`.trim();
}

// ---------------------------------------------------------------------------
// Main agent call
// ---------------------------------------------------------------------------

/**
 * Call the Mistral Large story agent and return the next segment of events.
 * The agent decides what to do next — paragraphs, sound effects, user interactions, or finish.
 */
export async function runStoryAgent(
  worldModel: WorldModel,
  ageGroup: string,
  previousEvents: StoryEvent[],
  apiKey: string,
  demoMode = false,
): Promise<AgentSegmentResponse> {
  const systemPrompt = buildSystemPrompt(ageGroup, demoMode);
  const userMessage  = buildContextMessage(worldModel, ageGroup, previousEvents, demoMode);

  const raw = await callLarge(systemPrompt, userMessage, apiKey);

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJSON(raw));
  } catch {
    throw new Error(`Agent returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { events?: unknown }).events)
  ) {
    throw new Error(`Agent response missing "events" array: ${JSON.stringify(parsed).slice(0, 200)}`);
  }

  const response = parsed as AgentSegmentResponse;

  // Validate each event has a known type
  const validTypes = new Set(['paragraph', 'sound_effect', 'music', 'ask_user_to_draw', 'ask_user_to_speak', 'finish']);
  for (const ev of response.events) {
    if (!validTypes.has(ev.type)) {
      throw new Error(`Agent returned unknown event type: "${ev.type}"`);
    }
  }

  return response;
}
