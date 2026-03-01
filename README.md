# ✨ Drawn Worlds

> **Draw it. Dream it. Hear it.**
>
> A parent-and-child collaborative bedtime story generator. Draw on a canvas → AI analyzes the drawing → generates a structured bedtime story → narrates it with ElevenLabs TTS.

---

## Architecture

```
client/src/
├── components/
│   ├── CanvasBoard.tsx      # HTML Canvas with drawing tools (undo, eraser, history)
│   ├── ToolBar.tsx          # Brush colour, size, draw/erase, undo, clear
│   ├── StoryPanel.tsx       # Rendered story with title, text, moral
│   ├── JsonPanel.tsx        # Collapsible JSON viewer for WorldModel & Outline
│   └── AudioPlayer.tsx      # ElevenLabs audio playback with progress bar
├── lib/
│   ├── schemas.ts           # Zod schemas: WorldModelSchema, OutlineSchema, StorySchema
│   ├── prompts.ts           # All LLM prompts in one place
│   ├── cache.ts             # In-memory Map<text, Blob> audio cache
│   ├── mistral.ts           # Mistral API client (vision + text helpers)
│   ├── visionToWorld.ts     # Step 3: image → WorldModel JSON
│   ├── worldToOutline.ts    # Step 4: WorldModel → Outline JSON
│   ├── outlineToStory.ts    # Step 5 + 7: Outline → Story, Continue Story
│   └── elevenlabs.ts        # Step 6: text → Blob TTS via ElevenLabs
└── pages/
    └── Home.tsx             # Single-page orchestrator + layout
```

### Pipeline (multi-step, sequential)

```
Draw on canvas
     │
     ▼
Step 3 ── Mistral Vision ──► WorldModel JSON   (characters, setting, themes, storyHooks)
     │
     ▼
Step 4 ── Mistral Text ───► Outline JSON       (beginning, conflict, climax, resolution, motifs)
     │
     ▼
Step 5 ── Mistral Text ───► Story JSON         (storyTitle, storyText 400-700w, moral)
     │
     ▼
Step 6 ── ElevenLabs TTS ─► Audio Blob         (cached in memory)
     │
     ▼
Step 7 ── "Continue Story" (uses stored WorldModel + motifs as memory constraint)
```

Each step validates output with **Zod** and automatically retries once with a repair prompt if the JSON is invalid.

---

## Setup

### 1. Prerequisites

- Node.js ≥ 18
- A [Mistral AI](https://console.mistral.ai/) account and API key
- An [ElevenLabs](https://elevenlabs.io/) account, API key, and Voice ID

### 2. Install dependencies

```bash
cd client
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_MISTRAL_API_KEY=your_mistral_api_key_here
VITE_ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
VITE_ELEVENLABS_VOICE_ID=your_voice_id_here
```

> **Finding your ElevenLabs Voice ID:** Log in → go to *Voice Library* → click any voice → copy the ID from the URL or the details panel.
>
> Good choices for bedtime stories: Rachel, Elli, or any "Story" voice.

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### 5. Build for production

```bash
npm run build
npm run preview
```

---

## Model Configuration

All model names are in **one place**: `src/lib/mistral.ts` → `MISTRAL_MODELS`.

```ts
export const MISTRAL_MODELS = {
  vision: 'pixtral-12b-2409',    // Vision-capable model
  text:   'mistral-small-latest', // Text generation model
};
```

Swap strings here to upgrade (e.g. `pixtral-large-latest`, `mistral-large-latest`).

---

## Safety & Child-Friendly Rules

- The vision prompt instructs the model to reinterpret any scary content (weapons → toy wands, monsters → friendly creatures, etc.)
- Safety reinterpretations are recorded in `WorldModel.safetyNotes`
- Every story ends with a short positive moral
- Stories are tuned per age group (3–5, 6–8, 9–12)

---

## Session Memory

- After the first story, **Continue Story** becomes available
- The stored **WorldModel** and **motifs** are used as constraints so characters and world stay consistent
- Session is persisted to `localStorage` (worldModel, outline, story) so it survives page refresh
- Audio blobs live in an in-memory `Map` (cleared on page close) — re-click *Narrate* to regenerate

---

## Demo Script (2 minutes)

> Follow this script to present the project in ~2 minutes at the hackathon.

### Step 1 — Intro (15s)
> *"Drawn Worlds turns a child's doodle into a magical bedtime story with voice narration — in under a minute."*

### Step 2 — Draw (30s)
1. Open the app (canvas on the left)
2. Pick a fun colour and draw a simple scene: a house, a sun, a cat — whatever the child wants
3. Point out the toolbar: colours, brush size, eraser, undo

### Step 3 — Generate (45s)
1. Click **🌟 Generate Story**
2. Watch the 4 pipeline indicators light up:
   - 🔍 Analyzing → AI reads the drawing
   - 📝 Planning → builds a story outline
   - 📖 Writing → expands into a full story
   - 🎙️ Narrating → ElevenLabs generates voice
3. The story appears on the right, narration auto-plays

### Step 4 — World Model reveal (15s)
1. Click **🌍 World Model** to expand the JSON panel
2. Show the structured characters, setting, story hooks
3. *"This intermediate step is what makes the story grounded in what the child actually drew."*

### Step 5 — Continue Story (15s)
1. Click **📚 Continue Story**
2. The story continues with the same characters and motifs
3. *"Session memory — the AI remembers the world and stays consistent."*

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS |
| Schema validation | Zod (runtime JSON validation + repair) |
| AI — Vision | Mistral Pixtral (multimodal) |
| AI — Text | Mistral Small |
| TTS | ElevenLabs v1 API |
| Storage | localStorage (text) + in-memory Map (audio) |
| HTTP | Fetch API (no backend) |

---

## Notes & TODOs

- `TODO` comments in `mistral.ts` and `elevenlabs.ts` mark where to bump model versions
- CORS: Mistral and ElevenLabs both allow cross-origin requests from browsers
- For production, move API keys to a backend proxy — never ship real keys in a public frontend
