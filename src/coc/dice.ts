/** d100 および技能判定（CoC 第7版の一般的な解釈）。乱数は crypto.getRandomValues を使用。 */

export function rollInt(min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  const range = hi - lo + 1;
  if (range <= 0) return lo;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return lo + (buf[0]! % range);
}

export function rollD100(): number {
  return rollInt(1, 100);
}

export function rollNdM(n: number, m: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rollInt(1, m));
  return out;
}

export function sumDice(rolls: number[]): number {
  return rolls.reduce((a, b) => a + b, 0);
}

export type SkillOutcome =
  | "critical"
  | "extreme"
  | "hard"
  | "regular"
  | "fail"
  | "fumble";

export interface SkillCheckResult {
  roll: number;
  skill: number;
  outcome: SkillOutcome;
  labelJa: string;
}

/** 技能値 skill に対する d100。極限／ハード／レギュラー／失敗／ファンブルを判定。 */
export function skillCheck(skill: number): SkillCheckResult {
  const s = Math.max(0, Math.min(99, Math.floor(skill)));
  const roll = rollD100();
  const fifth = Math.max(1, Math.floor(s / 5));
  const half = Math.max(1, Math.floor(s / 2));

  const fumble =
    (s < 50 && roll >= 96) || (s >= 50 && roll === 100) || (s === 100 && roll === 100);

  if (fumble) {
    return { roll, skill: s, outcome: "fumble", labelJa: "ファンブル" };
  }

  if (roll === 1) {
    return { roll, skill: s, outcome: "critical", labelJa: "決定的成功（01）" };
  }

  if (roll <= fifth && roll <= s) {
    return { roll, skill: s, outcome: "extreme", labelJa: "極限的成功" };
  }
  if (roll <= half && roll <= s) {
    return { roll, skill: s, outcome: "hard", labelJa: "ハード成功" };
  }
  if (roll <= s) {
    return { roll, skill: s, outcome: "regular", labelJa: "レギュラー成功" };
  }

  return { roll, skill: s, outcome: "fail", labelJa: "失敗" };
}
