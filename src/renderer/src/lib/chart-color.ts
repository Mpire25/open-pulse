/** Large data marks use a softer shade in light mode; foregrounds keep their contrast.
 * The fallback preserves the original dark palette and any unthemed/custom color. */
export function chartColor(color: string): string {
  return color.replace(
    /var\((--color-(?:activity|heart|recovery|sleep|hydration|body-metric|danger|workout-[a-z]+))\)/g,
    (_match, token: string) => `var(${token}-mark, var(${token}))`
  )
}
