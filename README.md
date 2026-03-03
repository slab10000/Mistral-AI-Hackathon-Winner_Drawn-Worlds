# ✨ Drawn Worlds

**Draw it. Speak it. Live inside it.**

Drawn Worlds is a magical, voice-first storybook where a child’s drawing becomes an interactive adventure.
The app reads the drawing, builds a world model, writes the story in episodes, asks the child to participate, and turns each moment into narrated audio with cinematic sound.

It is designed for playful co-creation between kids and adults, with an interface that feels like opening a living book.

## Why it feels special

- Your sketch is not just a prompt. It becomes the **actual world state**.
- The story is not one-shot text. It runs as an **agentic loop** with turns and memory.
- The child is not passive. They **draw and speak during the story** to change what happens next.
- The experience is multimodal: **vision + language + voice + music + illustration**.

## Product Experience

1. The child opens the magic book and draws their age.
2. Vision recognizes age (3-12) to tune storytelling difficulty.
3. The child draws a scene.
4. AI converts that drawing into a structured world model.
5. A story agent generates the next narrative segment.
6. Paragraph narration, sound effects, background music, and page illustrations are generated.
7. The story pauses at key moments and asks the child to:
   - Draw something that changes the plot, or
   - Say one magic word that influences the next segment.
8. The loop repeats until a satisfying ending.

## Agentic Capabilities

Drawn Worlds is built around an event-driven story agent.

The agent can emit these event types:

- `music`: set long-running background mood
- `paragraph`: narrate the next part of the story
- `sound_effect`: punctuate moments with generated SFX
- `ask_user_to_draw`: request a drawing and incorporate visual interpretation
- `ask_user_to_speak`: request one spoken word and weave it into plot
- `finish`: close the arc

### What makes it agentic

- **Segmented planning**: the model generates only the next segment, not the full story upfront.
- **Tool-like actions**: each event triggers concrete generation steps (audio, image, speech capture, vision analysis).
- **Stateful memory**: previous events and child inputs are fed back every turn.
- **Adaptive pacing**: story advances through interaction checkpoints.
- **Structured outputs**: JSON-only responses with strict event vocabulary reduce drift.

## Demo Videos

- [Clip 1](./demo-videos/clip1.mp4)
- [Clip 2](./demo-videos/clip2.mp4)
- [Clip 3](./demo-videos/clip3.mp4)

## Technical Overview

### Stack

- React 18 + TypeScript + Vite
- Tailwind CSS
- Zod runtime schemas
- Mistral (vision + text + large orchestrator)
- ElevenLabs (TTS, sound effects, music)
- Gemini image generation endpoint for per-page illustrations

### Core Architecture

- `client/src/pages/Home.tsx`
  - Main runtime orchestrator
  - UI state machine (`world`, `agent`, `audio_gen`, `playing`, `draw_prompt`, `speak_prompt`, `done`, `error`)
- `client/src/lib/storyAgent.ts`
  - Agent system prompt + context construction
  - Produces next event segment as structured JSON
- `client/src/lib/visionToWorld.ts`
  - First-pass image-to-world extraction
  - Includes repair pass when JSON parsing fails
- `client/src/lib/storyPlayer.ts`
  - Parallel audio/image generation per segment
  - Sequential narration playback
- `client/src/lib/visionToDrawing.ts`
  - Interprets child follow-up drawings in story context
- `client/src/lib/voxtral.ts`
  - Mic capture + silence detection + one-word transcription
- `client/src/lib/elevenlabs.ts`
  - TTS streaming/blob generation + SFX/music generation + in-memory cache
- `client/src/lib/imagen.ts`
  - Story-paragraph to illustration prompting + image generation calls
- `client/src/lib/schemas.ts`
  - World model and story schema contracts

### Runtime Flow

1. **Age Gate** (`visionToAge`): recognize child age from a number drawing.
2. **World Build** (`visionToWorld`): parse initial drawing into world JSON.
3. **Agent Turn** (`runStoryAgent`): generate next segment of events.
4. **Media Generation** (`storyPlayer`):
   - TTS for paragraphs
   - SFX for sound events
   - Music for ambiance
   - Illustration image per paragraph
5. **Playback + UI Sync**:
   - Page turns and narration advance together
   - Music loops in background
6. **Interaction Capture**:
   - Draw event -> vision description injected back into context
   - Speak event -> transcribed word injected back into context
7. **Repeat** until `finish`.

### Reliability Mechanisms

- JSON extraction from model outputs (`extractJSON`)
- Schema validation with Zod for structured objects
- Repair retry for malformed world-model JSON
- `Promise.allSettled` for parallel media generation (partial failures do not kill the story)
- Defensive fallbacks for microphone/audio/network errors

## Getting Started

### 1. Install

```bash
cd client
npm install
```

### 2. Configure environment

Create `client/.env` and set:

```env
VITE_MISTRAL_API_KEY=your_mistral_key
VITE_ELEVENLABS_API_KEY=your_elevenlabs_key
VITE_ELEVENLABS_VOICE_ID=your_elevenlabs_voice_id
VITE_GOOGLE_API_KEY=your_google_ai_key   # optional, enables illustrations
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 4. Build

```bash
npm run build
npm run preview
```

## API Keys and Public Repo Safety

This app currently calls model APIs from the frontend for hackathon speed.
For production, move all provider calls behind a secure backend/proxy and keep keys server-side.

## Current Scope

- Single-page magical storybook experience
- Live multimodal story loop with child interaction
- In-memory caching for generated audio assets per session

---

Drawn Worlds is a small but real example of an interactive multimodal agent: not just generating a story, but **running** one with the child in the loop.
