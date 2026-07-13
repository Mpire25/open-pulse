export const SLEEP_DATE_INSTRUCTION =
  'Sleep is assigned to the civil date on which the session ends: the morning the user wakes up. Therefore, "last night" means sleep ending today, and "the night before last" means sleep ending yesterday. Do not subtract a day from today when resolving "last night". Interpret a sleep date as the session\'s end or wake date unless the user explicitly describes different start and end dates.'

export const DAILY_METRICS_TOOL_DESCRIPTION =
  'Read only the requested daily health metrics over an explicit range. Sleep metrics use the session end or wake date, so "last night" is today, not yesterday. Use one day for exact-value questions, 7-14 days for short comparisons, about 30 days for trends, and 60-90 days for exploratory relationships. Does not include intraday samples, workouts, or detailed sleep sessions.'

export const SLEEP_TOOL_DESCRIPTION =
  'Read sleep sessions by their end or wake date over an explicit date range. "Last night" means the sleep session ending today; do not subtract a day. "The night before last" means the session ending yesterday. Summary mode returns timing, duration, efficiency and stage totals without raw stage segments. Use detailed mode only when interruption or stage detail is central to the question.'
