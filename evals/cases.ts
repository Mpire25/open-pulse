// The eval questions. Expected values are computed from the fixture, never
// typed in, so a change to the fixture keeps the cases consistent.

import type { ChatMessage } from '../src/shared/types'
import {
  average,
  BATTERY_PCT,
  dateAgo,
  night,
  runsBetween,
  TODAY_STEPS,
  weightKg
} from './fixture'
import {
  atMostModelRequests,
  CLAIMS_NO_DATA,
  completed,
  mentionsDuration,
  mentionsNumber,
  neverSays,
  noResearch,
  numbersIn,
  read,
  says,
  showsVisual,
  type Check
} from './checks'

export type Category = 'simple' | 'trend' | 'analysis' | 'missing-data' | 'research' | 'follow-up'

export interface EvalCase {
  id: string
  category: Category
  history: ChatMessage[]
  checks: Check[]
}

function ask(question: string): ChatMessage[] {
  return [{ role: 'user', text: question }]
}

function spokenDate(daysAgo: number): string {
  const [year, month, day] = dateAgo(daysAgo).split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function within(value: number, share: number): (n: number) => boolean {
  return (n) => Math.abs(n - value) <= Math.abs(value) * share
}

function nearestWeight(daysAgo: number): number {
  for (let offset = 0; offset < 7; offset++) {
    const value = weightKg(daysAgo - offset) ?? weightKg(daysAgo + offset)
    if (value != null) return value
  }
  throw new Error(`No weight near ${daysAgo} days ago.`)
}

function both(name: string, first: RegExp, second: RegExp, options: { critical?: boolean } = {}): Check {
  return {
    name,
    critical: options.critical ?? true,
    run: (record) =>
      record.text.split(/(?<=[.!?])\s+|\n+/).some((sentence) => first.test(sentence) && second.test(sentence))
  }
}

const DECLINE = /\b(?:less|fewer|shorter|down|drop(?:ped)?|declin\w*|reduc\w*|decreas\w*|worse|lower|fell)\b/i
const INCREASE = /\b(?:more|higher|increas\w*|up|ris(?:en|ing|e)|rose|extra|bigger|larger)\b/i

export function buildCases(): EvalCase[] {
  const lastNight = night(0)
  const recentSleep = average('sleepMinutes', 13, 0)!
  const recentRhr = average('restingHeartRate', 6, 0)!
  // "This week" may mean the last seven days or the calendar week so far.
  const sinceMonday = (new Date().getDay() + 6) % 7
  const weekRhr = [recentRhr, average('restingHeartRate', sinceMonday, 0)!]
  const gainSince60 = weightKg(0)! - nearestWeight(60)
  const steps30 = [average('steps', 29, 0)!, average('steps', 30, 1)!]
  const stepsPrior30 = [average('steps', 59, 30)!, average('steps', 60, 31)!]
  const recentRunsPerWeek = runsBetween(90, 1) / (90 / 7)
  const yearAgo = [weightKg(364), weightKg(366), nearestWeight(365)].filter((value): value is number => value != null)

  return [
    // -----------------------------------------------------------------------
    // Simple facts: should be fast and need little more than one lookup.
    {
      id: 'steps-today',
      category: 'simple',
      history: ask('How many steps have I done today?'),
      checks: [
        completed(),
        read({ metric: 'steps' }, 0),
        mentionsNumber(`says ${TODAY_STEPS.toLocaleString('en-GB')} steps`, TODAY_STEPS, 1),
        noResearch(),
        atMostModelRequests(2)
      ]
    },
    {
      id: 'sleep-last-night',
      category: 'simple',
      history: ask('How did I sleep last night?'),
      checks: [
        completed(),
        read({ kind: 'sleep' }, 0),
        mentionsDuration('says how long I slept', lastNight!.minutesAsleep, 5),
        noResearch(),
        atMostModelRequests(3)
      ]
    },
    {
      id: 'resting-hr-this-week',
      category: 'simple',
      history: ask("What's my resting heart rate been like this week?"),
      checks: [
        completed(),
        read({ metric: 'restingHeartRate' }, Math.min(6, sinceMonday)),
        {
          name: 'gives the weekly average',
          critical: false,
          run: (record) => numbersIn(record.text).some((n) => weekRhr.some((value) => Math.abs(n - value) <= 1.5))
        },
        noResearch(),
        atMostModelRequests(3)
      ]
    },
    {
      id: 'lunch-yesterday',
      category: 'simple',
      history: ask('What did I have for lunch yesterday?'),
      checks: [
        completed(),
        read({ kind: 'nutrition' }, 1, 1),
        says('names the chicken burrito', /burrito/i),
        noResearch(),
        atMostModelRequests(2)
      ]
    },
    {
      id: 'tracker-battery',
      category: 'simple',
      history: ask('How much battery does my tracker have left?'),
      checks: [
        completed(),
        read({ kind: 'devices' }, 0),
        mentionsNumber(`says ${BATTERY_PCT}%`, BATTERY_PCT, 0),
        noResearch(),
        atMostModelRequests(2)
      ]
    },

    // -----------------------------------------------------------------------
    // Vague periods and trends. The first is the question that failed in July.
    {
      id: 'weight-gain-couple-months',
      category: 'trend',
      history: ask('Why have I gained weight over the last couple of months?'),
      checks: [
        completed(),
        neverSays('never claims the data is missing', CLAIMS_NO_DATA),
        read({ metric: 'weightKg' }, 56),
        read({ metric: 'caloriesIn' }, 56),
        both('links the gain to eating more', /\b(?:eat\w*|intake|consum\w*|calories in|food|snack\w*)\b/i, INCREASE),
        mentionsNumber('sizes the gain', gainSince60, 0.8, { critical: false }),
        says('spots the evening snack', /\bsnack/i, { critical: false }),
        showsVisual('shows a chart', { critical: false })
      ]
    },
    {
      id: 'sleep-lately',
      category: 'trend',
      history: ask('Has my sleep changed lately?'),
      checks: [
        completed(),
        neverSays('never claims the data is missing', CLAIMS_NO_DATA),
        read({ kind: 'sleep' }, 27),
        both('says it got shorter or worse', /\bsleep\w*|night/i, DECLINE),
        mentionsDuration('gives the recent average', recentSleep, 25, { critical: false })
      ]
    },
    {
      id: 'running-frequency',
      category: 'trend',
      history: ask('How often have I been running over the last three months compared with before that?'),
      checks: [
        completed(),
        read({ kind: 'workouts' }, 170, 0, { share: 0.85 }),
        both('says running dropped', /\brun\w*/i, DECLINE),
        {
          name: 'gives the recent runs per week',
          critical: false,
          run: (record) =>
            /\bonce (?:a|per) week\b/i.test(record.text) ||
            numbersIn(record.text).some((n) => Math.abs(n - recentRunsPerWeek) <= 0.3)
        }
      ]
    },
    {
      id: 'resting-hr-trend',
      category: 'trend',
      history: ask('Is my resting heart rate going up?'),
      checks: [
        completed(),
        read({ metric: 'restingHeartRate' }, 27),
        says('says yes, it has risen', /\b(?:yes|risen|rising|gone up|going up|increas\w*|higher|crept up|trend\w* up)\b/i),
        mentionsNumber('gives the recent level', recentRhr, 1.5, { critical: false })
      ]
    },

    // -----------------------------------------------------------------------
    // Analysis
    {
      id: 'sleep-hrv-link',
      category: 'analysis',
      history: ask('Is there a link between my sleep and my HRV over the last three months?'),
      checks: [
        completed(),
        read({ metric: 'hrvMs' }, 84),
        read({ kind: 'sleep' }, 84),
        says('describes the relationship', /\b(?:link\w*|relationship|correlat\w*|associat\w*|tend\w* to|go(?:es)? together)\b/i),
        says('notes correlation is not causation', /\bcaus\w*/i, { critical: false })
      ]
    },
    {
      id: 'steps-30-vs-30',
      category: 'analysis',
      history: ask('Compare my average daily steps for the last 30 days with the 30 days before that.'),
      checks: [
        completed(),
        read({ metric: 'steps' }, 59, 1),
        {
          name: 'gives both averages within 3%',
          critical: true,
          run: (record) => {
            const numbers = numbersIn(record.text)
            return steps30.some((value) => numbers.some(within(value, 0.03))) &&
              stepsPrior30.some((value) => numbers.some(within(value, 0.03)))
          }
        },
        noResearch()
      ]
    },

    // -----------------------------------------------------------------------
    // Honesty about missing and old data
    {
      id: 'steps-on-gap-day',
      category: 'missing-data',
      history: ask(`How many steps did I do on ${spokenDate(42)}?`),
      checks: [
        completed(),
        read({ metric: 'steps' }, 42, 42),
        {
          name: 'does not report zero steps',
          critical: true,
          // "not that you took zero steps" is the right answer, so only an unnegated claim fails.
          run: (record) => !record.text.split(/(?<=[.!?])\s+|\n+/).some((sentence) =>
            /\b(?:0|zero) steps\b|didn't take any steps|no steps at all/i.test(sentence) &&
            !/\bnot\b|n't\b|\bno (?:step )?(?:data|record|value|count)|missing/i.test(sentence))
        },
        says(
          'says nothing was recorded',
          /\bno (?:step )?(?:data|record\w*|steps? (?:were |was )?(?:recorded|logged|tracked))|not (?:worn|wearing|recorded|synced|tracked|logged)|missing|nothing (?:was )?(?:recorded|logged)|wasn't (?:worn|recording|tracking)|no activity (?:was )?recorded|(?:data|steps) (?:is|are) (?:missing|unavailable|blank|empty)|(?:has|shows) no\b/i
        )
      ]
    },
    {
      id: 'weight-a-year-ago',
      category: 'missing-data',
      history: ask('What did I weigh a year ago?'),
      checks: [
        completed(),
        neverSays('never claims the data is missing', CLAIMS_NO_DATA),
        read({ kind: 'body' }, 368, 362, { share: 0.6 }),
        {
          name: 'gives the weight from a year ago',
          critical: true,
          run: (record) => numbersIn(record.text).some((n) => yearAgo.some((value) => Math.abs(n - value) <= 0.3))
        }
      ]
    },

    // -----------------------------------------------------------------------
    // External guidance
    {
      id: 'resting-hr-normal',
      category: 'research',
      history: ask('Is my resting heart rate normal for a 35-year-old?'),
      checks: [
        completed(),
        read({ metric: 'restingHeartRate' }, 6, 0, { share: 0.3, critical: false }),
        says('gives the usual adult range', /\b60\s*(?:–|-|to)\s*100\b|\bnormal\b|\btypical\b|\bhealthy range\b/i),
        mentionsNumber('quotes my resting heart rate', recentRhr, 3, { critical: false })
      ]
    },

    // -----------------------------------------------------------------------
    // Follow-ups that depend on the conversation
    {
      id: 'sleep-follow-up',
      category: 'follow-up',
      history: [
        { role: 'user', text: 'How did I sleep last night?' },
        {
          role: 'assistant',
          text: `You slept ${Math.floor(lastNight!.minutesAsleep / 60)}h ${lastNight!.minutesAsleep % 60}m last night, which is shorter than usual.`
        },
        { role: 'user', text: 'How does this week compare with the week before?' }
      ],
      checks: [
        completed(),
        read({ kind: 'sleep' }, 13, 0, { share: 0.85 }),
        both('compares the two weeks', /\bweek\b/i, /\b(?:less|fewer|shorter|more|longer|similar|same|down|up|lower|higher|worse|better)\b/i)
      ]
    },
    {
      id: 'food-after-run',
      category: 'analysis',
      history: ask('What did I eat after my run yesterday?'),
      checks: [
        completed(),
        read({ kind: 'workouts' }, 1, 1),
        read({ kind: 'nutrition' }, 1, 1),
        says('names the porridge', /porridge/i),
        noResearch()
      ]
    }
  ]
}

export const CATEGORIES: Category[] = ['simple', 'trend', 'analysis', 'missing-data', 'research', 'follow-up']
