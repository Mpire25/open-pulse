# Assistant chat names

New chats immediately use a shortened version of the first prompt. Alongside the
first authenticated response, OpenPulse makes a separate GPT-5.6 Luna request
with low reasoning to generate a short title. Only the first prompt (at most
4,000 characters) is sent: no prior turns, health datasets, or tools.

The naming job shares the foreground run's authenticated credentials, checks
the account's model catalog, and has a 20-second total deadline with at most
10 seconds per model. It uses the public Responses API with streaming and
storage disabled. Naming uses the connected ChatGPT plan, with no separate API key.
This route rejects `max_output_tokens`; output is constrained by the title
instructions, local validation/stream limits and request deadlines instead.

If Luna is unavailable, fails, times out, or returns an invalid title, OpenPulse
tries the selected assistant model once, at its lowest advertised reasoning
level (including none when available; low when catalog metadata is absent).
The assistant model is captured from the normal run, so a settings change
mid-response does not change the backup. A model is never attempted twice.
Authentication, permission and usage-limit failures stop without a backup call.
If neither model produces a valid name, the first-prompt title remains. This
single naming job is recorded before inference and never automatically repeated,
including on restart; each new chat uses at most two extra inference requests.
Older chats are not automatically renamed. Naming never delays the answer.

Generated names are stored with encrypted history. Renaming preserves messages,
pin/keep flags and the original activity timestamp. Stale saves cannot restore
the fallback title after a generated title arrives. Deletion, retention cleanup,
account changes, cancellation, window reload/closure and quitting discard late
results. No tokens, prompts or model output are logged by naming.

Automated verification uses synthetic credentials/storage and mocked model
streams. Live Luna access and packaged-app behavior require manual acceptance:
send a new prompt, confirm the fallback appears first and a short name replaces
it without interrupting the answer, then restart and check the name persists.
An older chat should keep its existing title. Handle any authentication or
Keychain/Safe Storage prompt personally; stop on the first failure.
