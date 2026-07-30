export function isDelayedSkeletonVisible(
  pendingKey: string | null,
  revealedKey: string | null
): boolean {
  return pendingKey != null && pendingKey === revealedKey
}
