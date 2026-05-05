/** LLM が出力するシナリオ JSON の型と検証（長さ・シーン数を強制）。 */

export interface ScenarioScene {
  id: number;
  title: string;
  /** 導入テキスト（短め） */
  read_aloud: string;
  /** この場で得られる手がかりのヒント（ネタバレしすぎない程度） */
  clue_hints: string[];
  /** GM が技能判定を提案してよい例 */
  suggested_skills: string[];
  /** 次シーンへ進める条件（プレイヤー向けに端的に） */
  advance_when: string;
}

export interface ScenarioPayload {
  title: string;
  /** 全体の前提（短く） */
  premise: string;
  era: string;
  tone: string;
  /** 生成時に指定したシーン数と一致すること */
  scene_count: number;
  scenes: ScenarioScene[];
  /** SAN ロストや戦闘などは軽度に。著作物の転載禁止。 */
  safety_notes: string;
}

export interface ScenarioGenConstraints {
  sceneCount: number;
  era: string;
  tone: string;
  /** プレイヤーが追加したテーマのヒント（任意） */
  themeHint: string;
}

export function validateScenario(raw: unknown, expectedSceneCount: number): ScenarioPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.title !== "string" || typeof o.premise !== "string") return null;
  if (typeof o.scene_count !== "number" || !Number.isFinite(o.scene_count)) return null;
  if (o.scene_count !== expectedSceneCount) return null;
  if (!Array.isArray(o.scenes) || o.scenes.length !== expectedSceneCount) return null;

  const scenes: ScenarioScene[] = [];
  let id = 1;
  for (const s of o.scenes) {
    if (!s || typeof s !== "object") return null;
    const sc = s as Record<string, unknown>;
    if (typeof sc.title !== "string" || typeof sc.read_aloud !== "string") return null;
    if (typeof sc.advance_when !== "string") return null;
    if (!Array.isArray(sc.clue_hints) || !Array.isArray(sc.suggested_skills)) return null;
    if (!sc.clue_hints.every((x) => typeof x === "string")) return null;
    if (!sc.suggested_skills.every((x) => typeof x === "string")) return null;
    if (sc.read_aloud.length > 1200) return null;
    if (sc.title.length > 120) return null;
    scenes.push({
      id: id++,
      title: sc.title,
      read_aloud: sc.read_aloud,
      clue_hints: sc.clue_hints as string[],
      suggested_skills: sc.suggested_skills as string[],
      advance_when: sc.advance_when,
    });
  }

  if (o.premise.length > 1500) return null;
  if (o.title.length > 200) return null;

  return {
    title: o.title,
    premise: o.premise,
    era: typeof o.era === "string" ? o.era : "",
    tone: typeof o.tone === "string" ? o.tone : "",
    scene_count: o.scene_count,
    scenes,
    safety_notes: typeof o.safety_notes === "string" ? o.safety_notes : "",
  };
}

export function scenarioJsonForPrompt(sc: ScenarioPayload): string {
  return JSON.stringify(sc, null, 2);
}
