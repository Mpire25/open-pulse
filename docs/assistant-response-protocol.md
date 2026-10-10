# Assistant answers and visuals

The assistant returns prose and optional visual instructions in the same model
response. This removes the extra model request previously needed after
`present_health_data`. Health and isolated research tools still run normally;
historical questions can query beyond the initial 180-day cached snapshot.

`assistant-response.ts` owns the response format. A final response may end with
one `<!--openpulse:present JSON-->` comment conforming to the presentation
schema. The app validates its shape, resolves dataset IDs and requested records,
and calculates the visual parts using the existing presentation resolver. It
publishes the answer and parts only after the entire response validates.

Prose can refer to metric-card and comparison values with fact placeholders,
for example `{{openpulse:fact:0.current.formattedValue}}`. These are substituted
from the same app-calculated values used by the card. Formatted values include
units; sleep durations use hours and minutes. Signed changes and positive change
magnitudes are separate. Missing values and unavailable percentages cannot be
substituted, including percentage changes from a zero baseline.

Streaming emits the prefix before the first placeholder or comment, holding
partial opening delimiters across chunks. Completion replaces the streamed
text with the validated prose, then delivers the visual parts. Raw instructions
and placeholders never enter the rendered or saved chat. Citation links are
added after resolution; when substitutions change annotation offsets, the
source list remains without inserting markers at incorrect character positions.

An invalid response clears the rejected attempt and requests one correction.
If that also fails, the next request asks for a plain answer without visuals,
placeholders or further tools. Recovery stays within the run's eight-request
limit. Repeated invalid output ends with a retryable error. Cancellation and
timeouts retain only text already safe to stream. History and title generation
receive the rendered prose, and saved visual parts use their existing format.

## Verification

Focused tests cover arithmetic, missing values, zero baselines, explicit and
automatic aggregations, invalid dataset/date references, chunk boundaries,
citations, correction, bounded fallback, cancellation, older-history retrieval,
and correction after several investigative tool turns. The real renderer hook
tests exercise replacement events, stale-run rejection, saved cards, history
reload and follow-up context.

For live app acceptance, use the same model and reasoning level for both
versions. After refresh finishes, ask a simple question twice, then a comparison,
a question requiring older records, and a follow-up. Check final values against
the cards and inspect the temporary debug log for model-request counts and
context preparation time. Stop a response while it streams, and restart to
confirm saved text/cards. Handle authentication prompts manually and stop on
the first authentication or decryption failure. Fixture and browser tests do
not establish real Google Health cache performance or packaged app acceptance.
