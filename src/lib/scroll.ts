/** スクロール進捗（0〜100）。単体テスト可能な純関数。 */
export function computeScrollPercent(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((scrollTop / max) * 100)));
}

export function scrollPercentFromDocument(): number {
  const root = document.documentElement;
  return computeScrollPercent(root.scrollTop, root.scrollHeight, root.clientHeight);
}
