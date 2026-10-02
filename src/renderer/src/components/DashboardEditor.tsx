import { useRef, useState } from 'react'
import { Check, PencilSimple } from '@phosphor-icons/react'
import {
  DASHBOARD_SLOTS,
  normalizeDashboardLayout,
  type DashboardLayout,
  type DashboardSurface
} from '@shared/dashboard'
import { useDashboardLayouts } from '@/hooks/useDashboardLayouts'
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
      <button
        type="button"
        className="dashboard-action"
        onClick={editor.begin}
        disabled={!editor.layout}
      >
        <PencilSimple size={14} />
        Customize{editor.surface === 'menuBar' ? ' menu bar' : ''}
      </button>
    )
  return (
    <div className="dashboard-edit-controls">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="dashboard-action dashboard-action--quiet"
          onClick={editor.reset}
          disabled={editor.saving}
        >
          Restore defaults
        </button>
        <button
          type="button"
          className="dashboard-action"
          onClick={editor.cancel}
          disabled={editor.saving}
        >
          Cancel
        </button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => void editor.save()}
          disabled={editor.saving}
        >
          <Check size={14} weight="bold" aria-hidden="true" />
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
  children,
  fill = false
}: {
  fill?: boolean
  id: string
  editor: DashboardEditorState
  children: React.ReactNode
}): React.JSX.Element {
  const [choosing, setChoosing] = useState(false)
  const [failure, setFailure] = useState(false)
  const changeRef = useRef<HTMLButtonElement>(null)
  const slot = DASHBOARD_SLOTS[editor.surface].find((entry) => entry.id === id)!
  return (
    <div
      className={`dashboard-slot dashboard-slot--${slot.kind} dashboard-slot--${editor.surface} ${fill ? 'dashboard-slot--chart' : ''} ${editor.editing ? 'dashboard-slot--editing' : ''}`}
      data-dashboard-slot={id}
    >
      {editor.editing && (
        <>
          <button
            type="button"
            ref={changeRef}
            className="dashboard-slot-change"
            onClick={async () => {
              const current = editor.layout?.[id]
              const rect = changeRef.current?.getBoundingClientRect()
              if (!current || !rect || choosing) return
              setChoosing(true)
              setFailure(false)
              try {
                const widget = await window.pulse.dashboard.choose(editor.surface, id, current, {
                  x: rect.left,
                  y: rect.bottom
                })
                if (widget)
                  editor.setDraft((draft) => draft ? { ...draft, [id]: widget } : draft)
              } catch {
                setFailure(true)
              } finally {
                setChoosing(false)
                changeRef.current?.focus()
              }
            }}
            aria-haspopup="menu"
            aria-busy={choosing}
            title={`Change ${slot.label.toLowerCase()}`}
            disabled={editor.saving}
            aria-label={`Change ${slot.label.toLowerCase()}`}
          >
            <PencilSimple size={16} />
          </button>
          {failure && (
            <span role="alert" className="dashboard-slot-error">
              Could not open menu. Try again.
            </span>
          )}
        </>
      )}
      {children}
    </div>
  )
}
