import { z } from 'zod';

// ---------------------------------------------------------------------------
// Character & Setting
// ---------------------------------------------------------------------------

export const CharacterSchema = z.object({
  name: z.string(),
  description: z.string(),
  role: z.string(),
  emotion: z.string(),
  relationships: z.array(z.string()),
});

export const SettingSchema = z.object({
  place: z.string(),
  time: z.string(),
  weather: z.string(),
  vibe: z.string(),
});

// ---------------------------------------------------------------------------
// World Model — output of the vision pass (Step 3)
// ---------------------------------------------------------------------------

export const WorldModelSchema = z.object({
  title: z.string(),
  characters: z.array(CharacterSchema),
  setting: SettingSchema,
  objects: z.array(z.string()),
  themes: z.array(z.string()),
  storyHooks: z.array(z.string()),
  safetyNotes: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Outline — output of the story planning pass (Step 4)
// ---------------------------------------------------------------------------

export const OutlineSchema = z.object({
  beginning: z.string(),
  conflict: z.string(),
  climax: z.string(),
  resolution: z.string(),
  motifs: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Story — output of story generation and continuation (Steps 5 & 7)
// ---------------------------------------------------------------------------

export const StorySchema = z.object({
  storyTitle: z.string(),
  storyText: z.string(),
  moral: z.string(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Character = z.infer<typeof CharacterSchema>;
export type Setting = z.infer<typeof SettingSchema>;
export type WorldModel = z.infer<typeof WorldModelSchema>;
export type Outline = z.infer<typeof OutlineSchema>;
export type Story = z.infer<typeof StorySchema>;
