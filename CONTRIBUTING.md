# Contributing to Agora Arena

Thanks for taking a look. Agora Arena is a browser fighting game where the
finishing move is whatever the player says out loud: speech is transcribed live,
Reactor FastH3 Omni renders the attack from the current fight frame, and the hit
lands in a deterministic game engine. Online matches run over Agora RTC and
Signaling (RTM).

Changes should keep the ultimate path intact:

```text
hold F → clean frame + FastH3 session → live transcription → release F
       → player's words + structured prompt → FastH3 clip → pause, play, land the hit
```

## Setup

```bash
git clone <your-fork-url>
cd agora-arena
npm ci                        # .npmrc sets legacy-peer-deps for the Agora SDKs
cp .env.example .env.local    # your own Agora / Reactor / OpenAI keys
npm run dev
```

Never commit `.env*` files, provider keys, recordings or generated clips.

## Guidelines

- **Keep the engine deterministic.** `src/engine/` must not use `Math.random()`,
  wall-clock time or React. Online lockstep and the tests depend on it.
- **Keep provider keys on the server.** The browser only receives short-lived
  tokens and SDP answers. New routes go in `server/index.js`, check the request
  origin and bound body sizes and provider timeouts.
- **Preserve the player's words.** The video prompt uses the confirmed
  description verbatim; the short move name is only a label. Do not add an LLM
  rewrite to the critical path without measuring the latency it adds.
- **Both languages.** Every new string goes into `src/i18n/en.ts` and
  `src/i18n/zh.ts`. If you add Chinese text, run `node scripts/subset-font.mjs`
  (needs Python `fonttools`) so the canvas font covers it.
- **Mind the cost.** FastH3 sessions are billed while connected. Anything that
  opens a session needs a clear release path (cancel, round end, leaving the
  fight, page close).
- Add or update tests when changing the engine, gauge or damage, the voice
  endpoints, the transcription or FastH3 session lifecycle, the prompt, lockstep,
  or the password gate.

## Checks

Run before opening a pull request:

```bash
npm run verify        # full test suite, type-check and production build
```

CI runs the same command. Tests stub every provider, so no keys are needed.
`npm run test:e2e` plays a real online match against a deployed site and calls
paid APIs; it is optional and documented in `scripts/qa-online.mjs`.
