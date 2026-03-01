// ---------------------------------------------------------------------------
// Story Event Types — the agent's vocabulary
// ---------------------------------------------------------------------------

export interface ParagraphEvent {
  type: 'paragraph';
  text: string;
  audioUrl?: string;    // set after TTS generation
  imageDataUrl?: string; // set after Imagen 3 generation (data URL)
  imagePrompt?: string;  // prompt sent to Imagen (set before generation)
}

export interface SoundEffectEvent {
  type: 'sound_effect';
  description: string;
  audioUrl?: string; // set after SFX generation
}

export interface MusicEvent {
  type: 'music';
  description: string;
  audioUrl?: string; // set after music generation — plays looped from story start
}

export interface AskUserToDrawEvent {
  type: 'ask_user_to_draw';
  prompt: string;              // what the agent asks the user to draw
  context: string;             // narrative context for the vision model
  imageDataUrl?: string;       // set after user submits drawing
  visionDescription?: string;  // set after vision model describes the drawing
}

export interface AskUserToSpeakEvent {
  type: 'ask_user_to_speak';
  prompt: string;  // what the agent asks the user to say
  word?: string;   // set after Voxtral transcription
}

export interface FinishEvent {
  type: 'finish';
}

export type StoryEvent =
  | ParagraphEvent
  | SoundEffectEvent
  | MusicEvent
  | AskUserToDrawEvent
  | AskUserToSpeakEvent
  | FinishEvent;

// ---------------------------------------------------------------------------
// Agent I/O
// ---------------------------------------------------------------------------

/** What the agent returns from each call */
export interface AgentSegmentResponse {
  events: StoryEvent[];
}

/** Phase of the interactive story loop */
export type StoryPhase =
  | 'idle'           // nothing started yet
  | 'world'          // building world model from initial drawing
  | 'agent'          // agent is generating the next segment
  | 'audio_gen'      // generating TTS + SFX + music in parallel
  | 'playing'        // playing audio events sequentially
  | 'draw_prompt'    // waiting for user to draw
  | 'speak_prompt'   // waiting for user to speak
  | 'done'           // story finished
  | 'error';         // unrecoverable error
