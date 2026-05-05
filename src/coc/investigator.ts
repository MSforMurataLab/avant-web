import { rollInt, rollNdM, sumDice } from "./dice";

/**
 * CoC 第7版の特性値（ページ参照用の数値そのもの）。
 * STR/POW 等は (3d6 合計)×5 で 15〜90、SIZ/INT/EDU は (2d6+6 合計)×5 で 40〜90。
 */
export interface Stats {
  str: number;
  con: number;
  pow: number;
  dex: number;
  app: number;
  siz: number;
  int: number;
  edu: number;
}

export interface Investigator {
  name: string;
  stats: Stats;
  hp: number;
  hpMax: number;
  mp: number;
  san: number;
  sanMax: number;
  /** アイデアロールの目標値（第7版では INT 特性値と同一）。 */
  idea: number;
  /** 知識ロールの目標値（第7版では EDU 特性値と同一）。 */
  knowledge: number;
  luck: number;
  /** 技能名 → %（初期値・プリセット） */
  skills: Record<string, number>;
}

function roll3d6Sum(): number {
  return sumDice(rollNdM(3, 6));
}

function roll2d6Plus6Sum(): number {
  return sumDice(rollNdM(2, 6)) + 6;
}

/** STR, CON, POW, DEX, APP — (3d6)×5 */
function rollStat3d6x5(): number {
  return roll3d6Sum() * 5;
}

/** SIZ, INT, EDU — (2d6+6)×5 */
function rollStat2d6Plus6x5(): number {
  return roll2d6Plus6Sum() * 5;
}

const SAMPLE_NAMES = [
  "アーサー・ブレイク",
  "ミリアム・クロフト",
  "ジェイソン・ウェイト",
  "エレナ・ヴォス",
  "サミュエル・リー",
  "リディア・グレイ",
];

export function rollRandomStats(): Stats {
  return {
    str: rollStat3d6x5(),
    con: rollStat3d6x5(),
    pow: rollStat3d6x5(),
    dex: rollStat3d6x5(),
    app: rollStat3d6x5(),
    siz: rollStat2d6Plus6x5(),
    int: rollStat2d6Plus6x5(),
    edu: rollStat2d6Plus6x5(),
  };
}

/**
 * 派生ステータスは第7版キーパールールブックに準拠。
 * HP = floor((CON+SIZ)/10)、MP = floor(POW/5)、開始 SAN = POW、アイデア・知識はそれぞれ INT・EDU と同一値。
 */
export function buildInvestigator(name?: string): Investigator {
  const stats = rollRandomStats();
  const hpMax = Math.max(1, Math.floor((stats.con + stats.siz) / 10));
  const mp = Math.max(1, Math.floor(stats.pow / 5));
  const sanMax = stats.pow;
  const luck = roll3d6Sum() * 5;

  const dex = stats.dex;
  const edu = stats.edu;
  const nm = name?.trim() || SAMPLE_NAMES[rollInt(0, SAMPLE_NAMES.length - 1)]!;

  const dodge = Math.max(0, Math.floor(dex / 2));
  const libraryUse = Math.min(99, edu);

  const skills: Record<string, number> = {
    回避: dodge,
    応急手当: 30,
    言いくるめ: 15,
    説得: 10,
    心理学: 10,
    精神分析: 1,
    変装: 5,
    隠れる: 20,
    忍び歩き: 20,
    聞き耳: 25,
    図書館: libraryUse,
    目星: 25,
    博物学: 10,
    追跡: 10,
    写真術: 10,
    天文学: 1,
    歴史: 5,
    自然科学: 10,
    信用: 15,
    値切り: 5,
    拳銃: 20,
    サブマシンガン: 15,
    ショットガン: 30,
    マーシャルアーツ: 1,
    ナイフ: 25,
    棍棒: 25,
    投擲: 20,
    精神分析に対する抵抗: stats.pow,
  };

  return {
    name: nm,
    stats,
    hp: hpMax,
    hpMax,
    mp,
    san: sanMax,
    sanMax,
    idea: stats.int,
    knowledge: stats.edu,
    luck,
    skills,
  };
}

export function investigatorSummaryForPrompt(inv: Investigator): string {
  const { stats } = inv;
  const skillLines = Object.entries(inv.skills)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `- ${k}: ${v}%`)
    .join("\n");

  return [
    `名前: ${inv.name}`,
    `STR ${stats.str} CON ${stats.con} POW ${stats.pow} DEX ${stats.dex} APP ${stats.app}`,
    `SIZ ${stats.siz} INT ${stats.int} EDU ${stats.edu}`,
    `HP ${inv.hp}/${inv.hpMax} MP ${inv.mp} SAN ${inv.san}/${inv.sanMax}`,
    `アイデア ${inv.idea}% 知識 ${inv.knowledge}% 幸運 ${inv.luck}`,
    "技能:",
    skillLines,
  ].join("\n");
}
