/** Preserve each icon's hue at small sizes without borrowing darker text shades. */
export function iconColor(color: string): string {
  return color.replace(
    /var\((--color-(?:activity|heart|recovery|sleep|hydration|body-metric|accent|success|danger|workout-[a-z]+))\)/g,
    (_match, token: string) => `var(${token}-icon, var(${token}))`
  )
}
