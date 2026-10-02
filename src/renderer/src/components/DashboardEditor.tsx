import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { PencilSimple, X } from '@phosphor-icons/react'
import {
  DASHBOARD_SLOTS,
  normalizeDashboardLayout,
  type DashboardLayout,
  type DashboardSlot,
  type DashboardSurface
} from '@shared/dashboard'
import { useDashboardLayouts } from '@/hooks/useDashboardLayouts'
import { widgetId, widgetLabel, widgetOptions } from '@/lib/dashboard-widgets'
import { METRICS } from '@/lib/metric-registry'
import { Button } from './ui/button'

export function useDashboardEditor(surface: DashboardSurface) {
  const preferences = useDashboardLayouts()
  const [draft, setDraft] = useState<DashboardLayout | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [failure, setFailure] = useState<string | null>(null)
  const layout = draft ?? preferences.data?.[surface]
  const begin = (): void => {
    if (preferences.data) {
      setDraft(preferences.data[surface])
      setFailure(null)
    }
  }
  const cancel = (): void => {
    if (!savingRef.current) {
      setDraft(null)
      setFailure(null)
    }
  }
  const reset = (): void => {
    if (!savingRef.current) setDraft(normalizeDashboardLayout(surface, undefined))
  }
  const save = async (): Promise<void> => {
    if (!draft || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setFailure(null)
    try {
      preferences.saved(await window.pulse.dashboard.update(surface, draft))
      setDraft(null)
    } catch {
      setFailure('Could not save your layout. Your changes are still here; please try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }
  return {
    ...preferences,
    surface,
    layout,
    editing: draft !== null,
    saving,
    failure,
    begin,
    cancel,
    reset,
    save,
    setDraft
  }
}
export type DashboardEditorState = ReturnType<typeof useDashboardEditor>

export function DashboardEditControls({
  editor
}: {
  editor: DashboardEditorState
}): React.JSX.Element {
  if (!editor.editing)
    return (
      <Button variant="secondary" size="sm" onClick={editor.begin} disabled={!editor.layout}>
        <PencilSimple size={14} />
        Customize{editor.surface === 'menuBar' ? ' menu bar' : ''}
      </Button>
    )
  return (
    <div className="dashboard-edit-controls">
      <span className="text-[12px] text-ink-dim">Choose what appears in each position</span>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={editor.reset} disabled={editor.saving}>
          Restore defaults
        </Button>
        <Button variant="secondary" size="sm" onClick={editor.cancel} disabled={editor.saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void editor.save()} disabled={editor.saving}>
          {editor.saving ? 'Saving…' : 'Save layout'}
        </Button>
      </div>
      {editor.failure && (
        <p role="alert" className="w-full text-[12px] text-danger">
          {editor.failure}
        </p>
      )}
    </div>
  )
}

export function EditableDashboardSlot({
  id,
  editor,
  children
}: {
  id: string
  editor: DashboardEditorState
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const changeRef = useRef<HTMLButtonElement>(null)
  const slot = DASHBOARD_SLOTS[editor.surface].find((entry) => entry.id === id)!
  return (
    <div
      className={`dashboard-slot ${editor.editing ? 'dashboard-slot--editing' : ''}`}
      data-dashboard-slot={id}
    >
      {editor.editing && (
        <>
          <Button
            variant="secondary"
            size="sm"
            ref={changeRef}
            className="dashboard-slot-change"
            onClick={() => setOpen(true)}
            disabled={editor.saving}
            aria-label={`Change ${slot.label.toLowerCase()}`}
          >
            <PencilSimple size={12} />
            Change
          </Button>
          <WidgetPicker
            slot={slot}
            editor={editor}
            open={open}
            onOpenChange={setOpen}
            onCloseFocus={() => changeRef.current?.focus()}
          />
        </>
      )}
      {children}
    </div>
  )
}

function WidgetPicker({
  slot,
  editor,
  open,
  onOpenChange,
  onCloseFocus
}: {
  slot: DashboardSlot
  editor: DashboardEditorState
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseFocus: () => void
}): React.JSX.Element {
  const selectRef = useRef<HTMLSelectElement>(null)
  const options = widgetOptions(slot.kind, editor.surface)
  const current = editor.layout?.[slot.id]
  const groups = new Map<string, typeof options>()
  for (const widget of options) {
    const group = 'metric' in widget ? METRICS[widget.metric].domain : 'Special widgets'
    groups.set(group, [...(groups.get(group) ?? []), widget])
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            selectRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            onCloseFocus()
          }}
          className="dashboard-picker fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border border-hairline bg-panel p-6 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="text-[18px] font-semibold">{slot.label}</Dialog.Title>
            <Dialog.Close aria-label="Close widget picker" className="rounded-md p-1 text-ink-dim">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-2 text-[13px] leading-relaxed text-ink-dim">
            Choose the widget for this position. Your layout stays the same.
          </Dialog.Description>
          <label
            className="mt-5 block text-[12px] font-medium"
            htmlFor={`widget-${editor.surface}-${slot.id}`}
          >
            Widget
          </label>
          <select
            ref={selectRef}
            id={`widget-${editor.surface}-${slot.id}`}
            className="dashboard-widget-select mt-2 w-full rounded-xl border border-hairline bg-panel-2 px-3 py-3 text-[13px]"
            value={current ? widgetId(current) : ''}
            disabled={editor.saving}
            onChange={(event) => {
              const widget = options.find((option) => widgetId(option) === event.target.value)
              if (widget)
                editor.setDraft((draft) => (draft ? { ...draft, [slot.id]: widget } : draft))
            }}
          >
            {Array.from(groups, ([group, widgets]) => (
              <optgroup label={group[0].toUpperCase() + group.slice(1)} key={group}>
                {widgets.map((widget) => (
                  <option value={widgetId(widget)} key={widgetId(widget)}>
                    {widgetLabel(widget)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
            {slot.kind === 'goal'
              ? 'Uses the goal you have set in Settings.'
              : 'Available readings depend on your device and logged data.'}
          </p>
          <div className="mt-5 flex justify-end">
            <Dialog.Close asChild>
              <Button size="sm">Done</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
