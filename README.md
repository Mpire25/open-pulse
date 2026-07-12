# OpenPulse

A macOS companion app for the **Google Fitbit Air**. OpenPulse reads your health data
from the **Google Health API v4**, presents it as a day-anchored dashboard with
interactive charts and goal gauges, and includes an AI assistant that analyzes
your data — powered by your own **ChatGPT account** via the Codex OAuth flow.

Built with Electron + React 19, Radix primitives, Tailwind v4, and Framer Motion.

## Features

- **Date traversal** — each health dashboard is anchored to a selected day.
  Step back and forward, jump anywhere with the title-bar calendar, or use
  trackpad history gestures to retrace pages and drill-downs.
- **Home** — how the day is going: goal gauges for steps, calories burned, and
  calories eaten; hourly movement; last night's hypnogram; night signals (HRV,
  SpO₂, breathing, skin temperature) compared with your recent baseline; and
  the day's workouts.
- **Activity** — day totals with baseline deltas and sparklines, hourly steps,
  logged workouts (duration, calories, avg HR, zone minutes), and 7-day trends
  with goal lines.
- **Heart** — intraday heart rate plus 7-day trends for resting HR, HRV, SpO₂,
  respiratory rate, and skin-temperature deviation, with recent-baseline
  comparisons where applicable.
- **Sleep** — stage hypnogram with hover timing, duration vs goal, efficiency,
  7-night duration and efficiency charts, a night-by-night stage-mix history,
  and a dedicated sleep-stage detail view.
- **Body** — 30-day weight and BMI trends plus recent individual scale readings.
- **Nutrition** — calories eaten and macro progress against configurable goals,
  individual food logs, a 7-day calorie trend, and recent day-by-day macro mix.
- **Metric drill-downs** — open dashboard metrics for daily, weekly, monthly,
  three-month, or yearly detail, including period comparisons and intraday
  breakdowns where the API supplies them.
- **Devices** — paired trackers with battery level and state, last sync time,
  and hardware features.
- **Assistant** — a streaming chat agent that uses focused tools to read and
  analyze your real metrics across explicit date ranges, including trends and
  relationships, sleep, workouts, intraday signals, nutrition, body readings,
  and devices. Answers can include trusted, navigable cards and charts derived
  from the returned data, plus cited web research when current external guidance
  is needed. Available as a full page and as a slide-over panel on every view,
  with account-scoped conversation history, pinning, and deletion.
- **Demo mode** — realistic, deterministic sample data for any date, so the
  whole app is explorable before you connect anything.

## Running

```bash
bun install
bun run dev        # launch in development with HMR
bun run typecheck  # check renderer and main/preload TypeScript
bun test           # run the test suite
bun run build      # create a production build in out/
bun run build:mac  # package a .dmg (needs the electron-builder toolchain)
```

The app opens in demo mode. Connect your accounts in **Settings**.

### Opt-in development tools

The card gallery and AI agent trace are disabled during a normal development
run. Start the app with the tool you need:

```bash
bun run dev:cards  # show the assistant response-card gallery
bun run dev:trace  # print a summary of AI agent execution to the terminal
bun run dev:debug  # enable both the card gallery and agent trace
```

The gallery is opened from the grid button in the Assistant header. It previews
every structured response card and lets you render each metric as a value,
period comparison, line chart, and bar chart. Gallery code is excluded from
production builds.

For more detailed tracing, set `OPENPULSE_AI_TRACE` directly when starting the
app. Supported modes are `summary`, `json`, and `verbose`:

```bash
OPENPULSE_AI_TRACE=verbose bun run dev
```

Tracing is also disabled by default in development and production.

## Connecting Google Health (your Fitbit Air data)

The Google Health API uses Google OAuth 2.0. OpenPulse runs the flow locally with a
loopback redirect + PKCE. When OS encryption is available, your Client Secret
and OAuth tokens are encrypted with Electron `safeStorage`.

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
`googlehealth.health_metrics_and_measurements.readonly`,
`googlehealth.location.readonly`, `googlehealth.nutrition.readonly`,
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
  (`health-service.ts`), the streaming AI agent (`codex-chat.ts`), and account
  storage (`store.ts`, using Electron `safeStorage` when available).
- **`src/preload`** — the `window.pulse` bridge (context-isolated).
- **`src/renderer`** — the React app: views, ring/chart components, hooks.
- **`src/shared`** — types shared across processes.

## Security notes

- OpenPulse uses Electron `safeStorage` to encrypt account secrets when OS
  encryption is available. Synced health data and account-scoped assistant
  history — including structured response cards — are only persisted when that
  encryption is available; otherwise chat history remains in memory for the
  current session.
- The renderer is context-isolated with `nodeIntegration` off; all privileged
  work happens in the main process over a typed IPC surface.
- Production builds run under a strict Content-Security-Policy.
- Google Health access uses read-only scopes; OpenPulse does not write health
  data back to your account.
- When you use the assistant, the health metrics needed to answer your question
  are sent to the ChatGPT Codex endpoint through your signed-in account.

## Acknowledgements

OpenPulse was originally inspired by [NOOP](https://github.com/ParthJadhav/noop)
for WHOOP and also took ideas from
[FlavioAdamo/openfit](https://github.com/FlavioAdamo/openfit).

> OpenPulse is an independent project and is not affiliated with or endorsed by
> Google or OpenAI. It is not a medical device; do not use it for diagnosis.
