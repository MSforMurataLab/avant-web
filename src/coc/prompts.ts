import type { ScenarioGenConstraints } from "./scenario";
import type { Investigator } from "./investigator";
import { investigatorSummaryForPrompt } from "./investigator";
import type { ScenarioPayload } from "./scenario";
import { scenarioJsonForPrompt } from "./scenario";

export function buildScenarioUserPrompt(c: ScenarioGenConstraints): string {
  return [
    "以下の制約で、クトゥルフ神話TRPG第7版を想定したオリジナル短期ソロシナリオをJSONのみで出力してください。",
    `- シーン数は正確に ${c.sceneCount} 個。増やしたり減らしたりしない。`,
    "- 各シーンの read_aloud は最大400文字程度。全体 premise は最大600文字程度。",
    "- 既存の商業シナリオ・キャンペーン・固有名の転載は禁止。地名・人名はすべて架空。",
    "- ゴア過多・自傷・実在宗教・実在スキャンダルの連想を避ける。ホラーは心理的・超常的な暗示に留める。",
    `- 時代の雰囲気: ${c.era}`,
    `- トーン: ${c.tone}`,
    c.themeHint.trim()
      ? `- プレイヤーからの追加テーマ（必ず安全に取り扱い、断定しない）: ${c.themeHint.trim()}`
      : "",
    "",
    "出力スキーマ（このキー名を厳守し、JSONオブジェクト1つだけ）:",
    "{",
    '  "title": string,',
    '  "premise": string,',
    '  "era": string,',
    '  "tone": string,',
    `  "scene_count": ${c.sceneCount},`,
    '  "safety_notes": string,',
    '  "scenes": [',
    "    {",
    '      "title": string,',
    '      "read_aloud": string,',
    '      "clue_hints": string[],',
    '      "suggested_skills": string[],',
    '      "advance_when": string',
    "    }",
    "  ]",
    "}",
    "",
    `scene_count の数値は必ず ${c.sceneCount}。scenes 配列の長さも ${c.sceneCount}。`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const SCENARIO_SYSTEM_PROMPT = [
  "あなたはクトゥルフ神話TRPG第7版に詳しいゲームマスター補助AIです。",
  "ユーザーの指示に従い、オリジナルの短期ソロ用シナリオを厳密なJSONで出力します。",
  "説明文やコードフェンスは付けず、パース可能な単一のJSONオブジェクトのみを返してください。",
].join("\n");

export function buildGmSystemPrompt(inv: Investigator, scenario: ScenarioPayload): string {
  const sceneIdxNote =
    "現在はシナリオを開始する前です。セッション開始後はユーザーメッセージで現在シーン番号が渡されます。";

  return [
    "あなたはクトゥルフ神話TRPG第7版のソロ専用ゲームマスターです。NPCの台詞と場面記述も演じ分けてください。",
    "",
    "## 絶対ルール",
    "- プレイヤーは常に1人（ソロ）。複数PCや他プレイヤーへの振りはしない。",
    "- ルール判定は第7版に準拠し、技能値・難易度（レギュラー／ハード／極限）を明示してから判定を促す。d100の出目はプレイヤーがこのサイトのサイコロUIで振り、結果を貼るか説明するまで確定しない（乱造しない）。",
    "- シナリオは以下のJSONに固定されている。シーンを勝手に増やさない。最終シーンを終えたらエピローグを簡潔に述べ、セッション終了を宣言する。",
    "- 著作権のあるシナリオや設定の複製はしない。",
    "",
    "## 調査員カード",
    investigatorSummaryForPrompt(inv),
    "",
    "## シナリオ（JSON・変更禁止）",
    scenarioJsonForPrompt(scenario),
    "",
    "## 進行",
    "- 各返答は読みやすい長さに分割してよいが、プレイヤーの入力を待つまで長々と独白しない。",
    "- advance_when（シナリオ JSON の進行目安）を満たしたら次シーンへ進めることを提案する。プレイヤーが場面進行を希望したときは条件を確認して進行する。",
    sceneIdxNote,
  ].join("\n");
}

export function buildSceneUserPrefix(sceneIndex: number, scenario: ScenarioPayload): string {
  const sc = scenario.scenes[sceneIndex];
  if (!sc) return `[システム] シーン不明（index=${sceneIndex}）`;
  return [
    `[システム] 現在シーン ${sceneIndex + 1}/${scenario.scene_count}: 「${sc.title}」`,
    `進行の目安: ${sc.advance_when}`,
  ].join("\n");
}
