import { useRef, useState } from 'react'
import type { DashboardWidget } from '@shared/dashboard'
import type { DashboardEditorState } from '@/components/DashboardEditor'

/** Shared native-menu interaction; callers handle focus after a selected slot changes. */
export function useDashboardWidgetPicker(editor: DashboardEditorState, id: string) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const choosingRef = useRef(false)
  const [choosing, setChoosing] = useState(false)
  const [failure, setFailure] = useState(false)

  const choose = async (): Promise<DashboardWidget | null> => {
    const current = editor.layout?.[id]
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!editor.editing || editor.saving || !current || !rect || choosingRef.current) return null
    choosingRef.current = true
    setChoosing(true)
    setFailure(false)
    let widget: DashboardWidget | null = null
    try {
      widget = await window.pulse.dashboard.choose(editor.surface, id, current, {
        x: rect.left,
        y: rect.bottom
      })
      if (widget) editor.changeWidget(id, widget, current)
      return widget
    } catch {
      setFailure(true)
      return null
    } finally {
      choosingRef.current = false
      setChoosing(false)
      if (!widget) buttonRef.current?.focus()
    }
  }

  return { buttonRef, choosing, failure, choose }
}
