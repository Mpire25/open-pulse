# OpenPulse

A macOS companion app for the **Google Fitbit Air**. OpenPulse reads your health data
from the **Google Health API v4**, presents it as a day-anchored dashboard with
interactive charts and goal gauges, and includes an AI assistant that analyzes
your data — powered by your own **ChatGPT account** through Sign in with ChatGPT plan authorization.

Built with Electron + React 19, Radix primitives, Tailwind v4, and Framer Motion.

## Features

- **Date traversal** — each health dashboard is anchored to a selected day.
  Step back and forward, jump anywhere with the title-bar calendar, or use
  trackpad history gestures to retrace pages and drill-downs.
- **Home** — how the day is going: goal gauges for steps, calories burned, and
  calories eaten; hourly movement; last night's hypnogram; night signals (HRV,
  SpO₂, breathing, skin temperature) compared with your recent baseline; and
  the day's workouts.
- **Customizable dashboards** — swap goal rings, summaries, and charts within
  the existing Home and macOS menu bar layouts. Each surface has independent
  saved choices, draft previews, cancel, and restore defaults. Trends can show
  any supported daily metric over 7 or 30 days; rings use your configured goals.
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
  from the returned data, plus web research when current external guidance
  is needed. Available as a full page and as a slide-over panel on every view,
  with account-scoped conversation history, pinning, and deletion.

## Running

```bash
bun install
bun run dev        # launch in development with HMR
bun run typecheck  # check renderer and main/preload TypeScript
bun test           # run the test suite
bun run build      # create a production build in out/
bun run build:mac  # package a .dmg (needs the electron-builder toolchain)
```

Connect Google Health in **Settings** before opening health dashboards. The app
never substitutes generated values when an account is disconnected or a sync
cannot complete.

### Customize your dashboards

Click **Customize** on Home, then the pencil beside a position to choose its widget
from a native macOS menu. Editing preserves the original card sizes and spacing.
Use **Save layout** to keep your choices, **Cancel** to discard the draft, or
**Restore defaults** followed by Save to return that surface to its original layout.

For the menu bar, open **Settings → macOS menu bar → Layout → Customize menu bar**, or
click the pencil in the popup. The main window shows a compact draft preview;
saving also updates an already-open popup. Preferences survive restart and do
not change goals or health records. Missing readings remain unavailable.

To verify the editor and popup using synthetic data in a disposable profile:

```bash
bun run build
bunx electron scripts/menu-bar-smoke.cjs --dashboard
bunx electron scripts/menu-bar-smoke.cjs --dashboard --geometry
```

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
loopback redirect + PKCE. Your Client Secret
and OAuth tokens require encryption with Electron `safeStorage`.

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

The assistant uses [Sign in with ChatGPT plan authorization](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).
In **Settings → AI Assistant**, click **Sign in with ChatGPT** and authorize
OpenPulse in the browser. The callback uses a temporary port on `127.0.0.1`;
no shared Codex client ID or fixed callback port is required. Account/workspace
eligibility and usage limits are controlled by ChatGPT.

Existing installations need a one-time reconnect. Chats, health data, and saved
assistant settings are preserved. OpenPulse keeps one ChatGPT session; account
selection happens on the ChatGPT site. Signing out revokes the renewable session
when reachable and clears the local connection. The next sign-in registers the
account and workspace you choose on ChatGPT’s site; no account list is kept.
Reauthorization of a saved session reuses its issued client ID.

The model picker loads the connected account's catalog from `/v1/models`, refreshes
on launch and when opening settings after six hours, and offers **Refresh models**.
Saved catalogs are scoped to the account registration. Network failures retain
cached choices, and refreshed lists never silently change your selected model.
**Automatic** reasoning uses the model's default when capability metadata is
missing; **Custom…** remains available for manual model IDs and effort overrides.

If secure credential storage is unavailable or fails, OpenPulse stops using it
for the session and does not fall back to plaintext. Handle any Keychain prompts
manually. No credential, ID token, or authorization URL should be logged.

## How data flows

```
Renderer (React)  ──IPC──▶  Main process  ──HTTPS──▶  health.googleapis.com/v4
   rings, charts,            OAuth + PKCE,
   chat UI                   token storage,
        ▲                    tool loop
        └────── ai:event stream ◀── api.openai.com/v1/responses
```

- **`src/main`** — Electron main: OAuth flows (`google-auth.ts`, `codex-auth.ts`),
  the Health API client (`health-api.ts`), the live health service layer
  (`health-service.ts`), the streaming AI agent (`codex-chat.ts`), and account
  storage (`store.ts`, requiring Electron `safeStorage` for credentials).
- **`src/preload`** — the `window.pulse` bridge (context-isolated).
- **`src/renderer`** — the React app: views, ring/chart components, hooks.
- **`src/shared`** — types shared across processes.

## Security notes

- OpenPulse uses Electron `safeStorage` to encrypt account secrets and requires OS
  encryption for credential storage. Synced health data and account-scoped assistant
  history — including structured response cards — are only persisted when that
  encryption is available; otherwise chat history remains in memory for the
  current session.
- The renderer is context-isolated with `nodeIntegration` off; all privileged
  work happens in the main process over a typed IPC surface.
- Production builds run under a strict Content-Security-Policy.
- Google Health access uses read-only scopes; OpenPulse does not write health
  data back to your account.
- When you use the assistant, the health metrics needed to answer your question
  are sent to the public Responses API through your signed-in account.

## Acknowledgements

OpenPulse was originally inspired by [NOOP](https://github.com/ParthJadhav/noop)
for WHOOP and also took ideas from
[FlavioAdamo/openfit](https://github.com/FlavioAdamo/openfit).

> OpenPulse is an independent project and is not affiliated with or endorsed by
> Google or OpenAI. It is not a medical device; do not use it for diagnosis.

## License

OpenPulse is available under the [MIT License](LICENSE). Third-party names,
trademarks, and product imagery are excluded; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

### macOS menu bar

Use **Settings → macOS menu bar → Show in menu bar** to enable or disable the
feature. Changes apply immediately and persist across launches. Disabling it also
releases the retained popup window. It is enabled by default.

Click the OpenPulse heart icon in the macOS menu bar for today's goal rings,
health summary, seven-day steps chart, main-sleep stage breakdown, and device
battery/sync information. Rings and summary tiles open the corresponding app
page; selecting a steps bar opens that day's steps. The week heading opens the
weekly detail view. Weight opens the date of the latest displayed reading.

The panel preloads its local interface at app startup and stays loaded when
hidden, so subsequent clicks reuse the same charts and cached data. Health
requests start only when the panel is shown. It checks stale data on reopening
and every five minutes while visible, using the existing health cache. Refresh requests an update; device sync time is shown
separately from the time OpenPulse checked its data. Missing values remain empty.
Sleep duration is the daily total, while the stage breakdown is for the main sleep.

Click outside the panel or press Escape to dismiss it. Closing the main window
keeps the menu bar available; Quit (in the panel or the icon's right-click menu)
exits OpenPulse. There is no automatic launch-at-login behaviour.

For a native fixture smoke test, run `bun run build` followed by
`bunx electron scripts/menu-bar-smoke.cjs`. This keeps test windows hidden and
simulates visibility without taking desktop focus. It uses a temporary profile
with mock health/account responses and exits when done. It checks chart navigation after closing the main window, account
changes, empty/error states, refresh, dismissal, and panel fit. A fixture preview
is saved to `out/menu-bar-preview.png`. Add `--menu-disabled` to also verify startup
with a saved disabled preference.

Add `--memory` to the smoke-test command to record macOS physical footprint and
resident memory at startup, while the panel is open/hidden, after repeated opens,
and after closing the main window. Results go to `out/menu-bar-memory.json`;
`OPENPULSE_MEMORY_REPORT` overrides that path. `--entry /path/to/out/main/index.js`
can measure a previously built version with the same fixtures. Hidden test windows
do not reproduce all graphics allocations of a visible, signed-in app.
