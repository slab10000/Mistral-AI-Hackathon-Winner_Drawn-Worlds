import type { WorldModel, Outline } from './schemas';

// ---------------------------------------------------------------------------
// Step 3 — Vision → World Model
// ---------------------------------------------------------------------------

export const VISION_TO_WORLD_PROMPT = `You are a creative children's storytelling assistant. Carefully analyze this child's drawing.

Identify:
- All characters (people, animals, creatures, imaginary beings)
- The setting (environment, location, time of day or season)
- Important objects visible in the scene
- The overall mood and atmosphere
- Implied relationships between characters
- 3 exciting story hooks that could emerge from this drawing

SAFETY RULES: Keep EVERYTHING child-friendly and positive.
- If you see anything potentially scary (weapons, monsters, dark imagery), reinterpret it playfully.
  Examples: a sword → a magic wand or toy sword; a monster → a shy friendly creature; fire → magical glowing lights.
- Record any such reinterpretations in safetyNotes.

Return ONLY raw valid JSON — no markdown fences, no extra text, no explanation. Start your response with { and end with }.

{
  "title": "A short whimsical title for this drawing world",
  "characters": [
    {
      "name": "Character name or descriptive label",
      "description": "What they look like in the drawing",
      "role": "hero / sidekick / friend / guide / creature / villain-turned-friend",
      "emotion": "The character's apparent emotion",
      "relationships": ["Their relationship to other characters"]
    }
  ],
  "setting": {
    "place": "Where the story takes place",
    "time": "Time of day or season",
    "weather": "Weather or atmospheric conditions",
    "vibe": "cozy / magical / adventurous / peaceful / exciting"
  },
  "objects": ["Important object 1", "Important object 2"],
  "themes": ["friendship", "courage", "kindness", "imagination"],
  "storyHooks": [
    "An exciting story hook based on the drawing",
    "Another compelling story possibility",
    "A third magical story direction"
  ],
  "safetyNotes": ["Any content reinterpretations made for child safety, or empty array"]
}`;

// ---------------------------------------------------------------------------
// Step 4 — World Model → Outline
// ---------------------------------------------------------------------------

export function buildWorldToOutlinePrompt(worldModel: WorldModel): string {
  return `You are a beloved children's book author. Create a gentle bedtime story outline from this world.

World Model:
${JSON.stringify(worldModel, null, 2)}

Outline requirements:
- Beginning: Establish the warm world and introduce characters naturally
- Conflict: A GENTLE challenge — something lost, a small misunderstanding, a tiny puzzle to solve. Nothing scary or violent.
- Climax: The exciting but safe moment where everything comes together through kindness or cleverness
- Resolution: A warm, heartwarming ending that leaves the child feeling cozy and ready to sleep
- Motifs: Exactly 3 recurring symbols or images to weave throughout

Return ONLY raw valid JSON — no markdown fences, no extra text. Start with { and end with }.

{
  "beginning": "How the story begins...",
  "conflict": "The gentle challenge our characters face...",
  "climax": "The magical moment of resolution...",
  "resolution": "The warm, sleepy happy ending...",
  "motifs": ["Motif 1", "Motif 2", "Motif 3"]
}`;
}

// ---------------------------------------------------------------------------
// Step 5 — Outline → Story
// ---------------------------------------------------------------------------

export function buildOutlineToStoryPrompt(
  worldModel: WorldModel,
  outline: Outline,
  ageGroup: string,
): string {
  return `You are a beloved children's book author writing a magical bedtime story for ${ageGroup}.

World Model:
${JSON.stringify(worldModel, null, 2)}

Story Outline:
${JSON.stringify(outline, null, 2)}

Writing requirements:
- Total length: 400–700 words
- Language: Simple, warm, lyrical — perfect for ${ageGroup}
- Weave in these motifs: ${outline.motifs.join(', ')}
- End peacefully — the child should feel safe, cozy, and drowsy after hearing it
- Include a positive one-sentence moral
- COMPLETELY child-friendly: no fear, no violence, no adult themes whatsoever

Return ONLY raw valid JSON — no markdown fences, no extra text. Start with { and end with }.

{
  "storyTitle": "The Magical Title of the Story",
  "storyText": "Once upon a time... [full story text, 400–700 words]",
  "moral": "A single warm sentence moral of the story"
}`;
}

// ---------------------------------------------------------------------------
// Step 7 — Continue Story
// ---------------------------------------------------------------------------

export function buildContinueStoryPrompt(
  worldModel: WorldModel,
  motifs: string[],
  previousStoryText: string,
): string {
  return `You are continuing a magical bedtime story. Stay completely consistent with the established world and characters.

World Model (DO NOT change characters, setting, or established facts):
${JSON.stringify(worldModel, null, 2)}

Motifs to weave in: ${motifs.join(', ')}

Where the previous story left off (last ~400 words):
"...${previousStoryText.slice(-800)}..."

Continuation requirements:
- Length: 250–400 words
- Continue naturally and seamlessly from where the story ended
- Keep the same warm, gentle, lyrical tone
- End on a peaceful, sleepy note — the child drifts off happily
- Same child-friendly rules apply

Return ONLY raw valid JSON — no markdown fences, no extra text. Start with { and end with }.

{
  "storyTitle": "A continuation chapter title",
  "storyText": "The continuation text...",
  "moral": "A reinforcing or new warm moral"
}`;
}

// ---------------------------------------------------------------------------
// Repair prompt — used when Zod validation fails on first attempt
// ---------------------------------------------------------------------------

export function buildRepairPrompt(rawResponse: string, validationError: string): string {
  return `The previous response was not valid JSON or failed schema validation.

Original response:
${rawResponse}

Validation error:
${validationError}

Please return ONLY the corrected, complete, valid JSON. No markdown fences. No explanation. Just raw JSON starting with { and ending with }.`;
}
