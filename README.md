# OpenPulse

A macOS companion app for the **Google Fitbit Air**. OpenPulse reads your health data
from the **Google Health API v4**, presents it as a day-anchored dashboard with
interactive charts and goal gauges, and includes an AI assistant that analyzes
your data — powered by your own **ChatGPT account** via the Codex OAuth flow.

Built with Electron + React 19, Radix primitives, Tailwind v4, and Framer Motion.

## Features

- **Date traversal** — every page is anchored to a selected day. Step back and
  forward, or jump anywhere with the calendar in the title bar; each day loads
  with its own 14-day trend window (cached per date).
- **Home** — how the day is going: goal gauges (steps / calories / zone
  minutes), hourly movement, last night's hypnogram, night signals (HRV, SpO₂,
  breathing, skin temperature) compared against your own recent baseline, and
  the day's workouts.
- **Activity** — day totals with baseline deltas and sparklines, hourly steps,
  logged workouts (duration, calories, avg HR, zone minutes), and 14-day trends
  with goal lines.
- **Health** — intraday heart rate plus dedicated trend charts for resting HR,
  HRV, SpO₂, respiratory rate, skin-temperature deviation, and VO₂ max — each
  drawn against your personal 7-day average.
- **Sleep** — stage hypnogram with hover timing, duration vs goal, efficiency,
  a 14-night duration chart, and a night-by-night stage-mix history.
- **Body** — weight, body fat, logged water, and calories in (with net energy
  balance), shown as trends. Sections hide themselves when nothing is logged.
- **Devices** — paired trackers with battery level and state, last sync time,
  and hardware features.
- **Assistant** — a streaming chat agent that calls tools to read your real
  metrics (any day's full snapshot, sleep history, devices) before answering.
  Available as a full page and as a slide-over panel on every view.
- **Demo mode** — realistic, deterministic sample data for any date, so the
  whole app is explorable before you connect anything.

## Running

```bash
bun install
bun run dev      # launch in development with HMR
bun run build    # type-check-clean production build into out/
bun run build:mac # package a .dmg (needs electron-builder toolchain)
```

The app opens in demo mode. Connect your accounts in **Settings**.

## Connecting Google Health (your Fitbit Air data)

The Google Health API uses Google OAuth 2.0. OpenPulse runs the flow locally with a
loopback redirect + PKCE. Your Client Secret and OAuth tokens are stored by
Electron `safeStorage`.

1. In the [Google Cloud Console](https://console.cloud.google.com), create a
   project and enable the **Google Health API**.
2. Configure the OAuth consent screen. While the app is in **Testing**, open
   **Audience → Test users** and add the exact Google account you will sign in
   with. Otherwise Google will stop the flow with `Error 403: access_denied`
   before OpenPulse receives an authorization code.
3. Create an **OAuth client ID** of type **Web application**.
4. Add this exact **Authorized redirect URI**:
   `http://127.0.0.1:42813/oauth/callback`.
5. Copy the Client ID and Client Secret into **Settings → Google Health**, then
   click **Connect**. A browser window opens for consent; approve the requested
   read scopes.

Scopes requested (read-only):
`googlehealth.activity_and_fitness.readonly`,
`googlehealth.ecg.readonly`,
`googlehealth.health_metrics_and_measurements.readonly`,
`googlehealth.irn.readonly`, `googlehealth.location.readonly`,
`googlehealth.nutrition.readonly`, `googlehealth.profile.readonly`,
`googlehealth.settings.readonly`, `googlehealth.sleep.readonly`.

## Connecting the AI assistant (Sign in with ChatGPT)

The assistant uses the **Codex OAuth flow**
([docs](https://developers.openai.com/codex/auth)) — the same "Sign in with
ChatGPT" mechanism the Codex CLI uses. It runs on your existing ChatGPT plan; no
API key required.

In **Settings → AI Assistant**, click **Sign in with ChatGPT**. A browser window
opens on `auth.openai.com`; after you authorize, the app receives tokens on its
`localhost:1455` callback. Make sure no other Codex sign-in is occupying port
1455 at the time.

## How data flows

```
Renderer (React)  ──IPC──▶  Main process  ──HTTPS──▶  health.googleapis.com/v4
   rings, charts,            OAuth + PKCE,             (or demo generator)
   chat UI                   token storage,
        ▲                    tool loop
        └────── ai:event stream ◀── chatgpt.com/backend-api/codex/responses
```

- **`src/main`** — Electron main: OAuth flows (`google-auth.ts`, `codex-auth.ts`),
  the Health API client (`health-api.ts`), the live/demo service layer
  (`health-service.ts`), the streaming AI agent (`codex-chat.ts`), and encrypted
  token storage (`store.ts`, via Electron `safeStorage`).
- **`src/preload`** — the `window.pulse` bridge (context-isolated).
- **`src/renderer`** — the React app: views, ring/chart components, hooks.
- **`src/shared`** — types shared across processes.

## Security notes

- Tokens are encrypted at rest with the OS keychain via Electron `safeStorage`.
- The renderer is context-isolated with `nodeIntegration` off; all privileged
  work happens in the main process over a typed IPC surface.
- Production builds run under a strict Content-Security-Policy.
- All network access is read-only against your own accounts.

> OpenPulse is an independent project and is not affiliated with or endorsed by
> Google or OpenAI. It is not a medical device; do not use it for diagnosis.
