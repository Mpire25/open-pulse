// Shared entrance animation. y stays small so animating content never
// meaningfully extends the scroll area (the container also reserves its
// scrollbar gutter — no flashing scrollbars during fades).
export const fade = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.04 * i, duration: 0.45, ease: [0.16, 1, 0.3, 1] as const }
  })
}
