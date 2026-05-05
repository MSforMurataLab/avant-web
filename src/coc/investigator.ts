import { rollInt, rollNdM, sumDice } from "./dice";

/** CoC 第6版で広く用いられる特性ロール（3d6 / 2d6+6 / 3d6+3）。 */
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
  idea: number;
  knowledge: number;
  luck: number;
  /** 技能名 → %（初期値・プリセット） */
  skills: Record<string, number>;
}

function roll3d6(): number {
  return sumDice(rollNdM(3, 6));
}

function roll2d6Plus6(): number {
  return sumDice(rollNdM(2, 6)) + 6;
}

function roll3d6Plus3(): number {
  return sumDice(rollNdM(3, 6)) + 3;
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
    str: roll3d6(),
    con: roll3d6(),
    pow: roll3d6(),
    dex: roll3d6(),
    app: roll3d6(),
    siz: roll2d6Plus6(),
    int: roll2d6Plus6(),
    edu: roll3d6Plus3(),
  };
}

/**
 * HP は第7版と同様に floor((CON+SIZ)/5)（最小1）。
 * 第6版の ceil((CON+SIZ)/10) は平均 HP が 2〜4 程度になりソロで過度に脆弱なため、耐久のみこの算出に寄せています。
 */
export function buildInvestigator(name?: string): Investigator {
  const stats = rollRandomStats();
  const hpMax = Math.max(1, Math.floor((stats.con + stats.siz) / 5));
  const sanMax = stats.pow * 5;
  const luck = sumDice(rollNdM(3, 6)) * 5;

  const dex = stats.dex;
  const edu = stats.edu;
  const nm = name?.trim() || SAMPLE_NAMES[rollInt(0, SAMPLE_NAMES.length - 1)]!;

  const skills: Record<string, number> = {
    回避: Math.min(99, dex * 2),
    応急手当: 30,
    言いくるめ: 15,
    説得: 20,
    心理学: 15,
    精神分析: 1,
    変装: 5,
    隠れる: 20,
    忍び歩き: 20,
    聞き耳: 25,
    図書館: Math.min(99, edu + 10),
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
    精神分析に対する抵抗: stats.pow * 5,
  };

  return {
    name: nm,
    stats,
    hp: hpMax,
    hpMax,
    mp: stats.pow,
    san: sanMax,
    sanMax,
    idea: stats.int * 5,
    knowledge: stats.edu * 5,
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
