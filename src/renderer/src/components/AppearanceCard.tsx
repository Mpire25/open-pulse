import { useLayoutEffect, useRef, useState } from 'react'
import { Desktop, Moon, Sun } from '@phosphor-icons/react'
import { SectionHeader } from './Panel'
import { saveAppearanceMode, useAppearance } from '@/lib/appearance'
import type { AppearanceMode } from '@shared/appearance'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'system', label: 'System', Icon: Desktop }
] as const

export function AppearanceCard(): React.JSX.Element {
  const { mode, resolved } = useAppearance()
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const pending = useRef(false)
  const restoreFocus = useRef<HTMLInputElement | null>(null)

  useLayoutEffect(() => {
    if (saving) return
    const input = restoreFocus.current
    restoreFocus.current = null
    // Disabling the fieldset drops keyboard focus. Restore it after re-enabling,
    // unless the user has already moved to another control while saving.
    if (input?.isConnected && (document.activeElement === document.body || document.activeElement === input)) {
      input.focus({ preventScroll: true })
    }
  }, [saving])

  const change = async (next: AppearanceMode, input: HTMLInputElement): Promise<void> => {
    if (pending.current || next === mode) return
    pending.current = true
    restoreFocus.current = document.activeElement === input ? input : null
    setSaving(true)
    setFailure(null)
    try {
      await saveAppearanceMode(next)
    } catch {
      setFailure('Could not save your appearance. Please try again.')
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  return <>
    <SectionHeader title="Appearance" hint="Choose how OpenPulse looks" icon={<Sun size={18} weight="fill" className="text-ink-dim" />} />
    <fieldset disabled={saving} aria-describedby="appearance-description" aria-busy={saving}>
      <legend className="sr-only">Color mode</legend>
      <div className="flex w-fit gap-0.5 rounded-xl border border-hairline bg-surface-tint/[0.03] p-0.5">
        {OPTIONS.map(({ mode: value, label, Icon }) => <label
          key={value}
          className={cn(
            'relative flex cursor-pointer items-center gap-2 rounded-[10px] px-3.5 py-1.5 text-[12px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus',
            value === mode ? 'bg-surface-tint/[0.08] text-ink shadow-[inset_0_0_0_1px_var(--color-hairline)]' : 'text-ink-dim hover:bg-surface-tint/[0.04] hover:text-ink',
            saving && 'cursor-wait opacity-60'
          )}
        >
          <input className="sr-only" type="radio" name="appearance" value={value} checked={mode === value} onChange={(event) => void change(value, event.currentTarget)} />
          <Icon size={16} aria-hidden="true" weight={mode === value ? 'fill' : 'regular'} />
          {label}
        </label>)}
      </div>
    </fieldset>
    <p id="appearance-description" className="text-[12px] leading-relaxed text-ink-dim">
      System follows your device’s appearance.{mode === 'system' && ` Currently using ${resolved} mode.`}
    </p>
    {failure && <p role="alert" className="text-[12px] text-danger">{failure}</p>}
  </>
}
