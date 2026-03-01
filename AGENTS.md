# AGENTS.md

## Cursor Cloud specific instructions

This is a single-page React+Vite+TypeScript app (`client/`) with no backend. All AI/TTS calls go directly to external APIs from the browser.

### Services

| Service | How to run | Notes |
|---------|-----------|-------|
| Vite dev server | `cd client && npm run dev` | Serves at `localhost:5173` |

### Key commands

- **Install**: `cd client && npm install`
- **Dev server**: `cd client && npm run dev` (or `npx vite --host 0.0.0.0 --port 5173`)
- **Typecheck**: `cd client && npm run typecheck`
- **Build**: `cd client && npm run build`
- No linter or test runner is configured in the project.

### Required environment variables

The app needs `VITE_MISTRAL_API_KEY`, `VITE_ELEVENLABS_API_KEY`, and `VITE_ELEVENLABS_VOICE_ID` set either as env vars or in `client/.env`. `VITE_GOOGLE_API_KEY` is optional (for AI illustrations; falls back to showing the child's drawing).

When secrets are injected as environment variables, write them to `client/.env` before starting the dev server so Vite picks them up:

```bash
cd client
cat > .env << EOF
VITE_MISTRAL_API_KEY=${VITE_MISTRAL_API_KEY}
VITE_ELEVENLABS_API_KEY=${VITE_ELEVENLABS_API_KEY}
VITE_ELEVENLABS_VOICE_ID=${VITE_ELEVENLABS_VOICE_ID}
VITE_GOOGLE_API_KEY=${VITE_GOOGLE_API_KEY}
EOF
```

### Gotchas

- There is no ESLint config or test framework. `npm run typecheck` (tsc --noEmit) is the only static analysis available.
- The age-gate step (draw your age) must be completed before the drawing canvas and "Tell My Story!" button appear.
- The Vite dev server hot-reloads on file changes, including `.env` changes (full page reload required for env changes).
