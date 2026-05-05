import { registerSW } from "virtual:pwa-register";

import { skillCheck } from "./dice";
import { buildInvestigator, investigatorSummaryForPrompt, type Investigator } from "./investigator";
import type { ChatMessage } from "./llm";
import { chatCompletionJson, chatCompletionText, parseJsonLoose } from "./llm";
import {
  buildGmSystemPrompt,
  buildScenarioUserPrompt,
  buildSceneUserPrefix,
  SCENARIO_SYSTEM_PROMPT,
} from "./prompts";
import { validateScenario, type ScenarioGenConstraints, type ScenarioPayload } from "./scenario";

import { scrollPercentFromDocument } from "../lib/scroll";

const SCENE_ADVANCE_MARKER = "<<<SCENE_NEXT>>>";

function stripSceneAdvance(raw: string): { text: string; advanced: boolean } {
  const advanced = raw.includes(SCENE_ADVANCE_MARKER);
  const text = raw.split(SCENE_ADVANCE_MARKER).join("").trim();
  return { text, advanced };
}

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function readLlmOptions(): { model?: string } {
  const model = ($("coc-model") as HTMLInputElement | null)?.value.trim();
  return model ? { model } : {};
}

export function mountCocApp(): void {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* --- PWA（オフラインは静的シェル。API 呼び出しはオンライン必須） --- */
  registerSW({ immediate: true });

  /* --- WebGL 背景（軽微負荷） --- */
  function injectGlField(): void {
    if (window.__voidSignalGlInjected) return;
    window.__voidSignalGlInjected = true;
    void import("../gl/gl-field").then(({ mountGlField }) => mountGlField());
  }
  if (prefersReducedMotion.matches) injectGlField();
  else {
    const ric = window.requestIdleCallback;
    if (typeof ric === "function") ric(() => injectGlField(), { timeout: 2200 });
    else requestAnimationFrame(() => requestAnimationFrame(injectGlField));
  }

  /* --- スクロールプログレス --- */
  const scrollBar = $("scroll-progress");
  function updateScrollProgress(): void {
    if (!scrollBar) return;
    const p = scrollPercentFromDocument();
    scrollBar.style.setProperty("--read", p + "%");
    scrollBar.setAttribute("aria-valuenow", String(p));
  }
  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  window.addEventListener("resize", updateScrollProgress, { passive: true });
  updateScrollProgress();

  /* --- 状態 --- */
  let inv: Investigator | null = null;
  let scenario: ScenarioPayload | null = null;
  let gmSystemCached = "";
  const messagesHistory: ChatMessage[] = [];
  let sceneIndex = 0;

  const elSetup = $("coc-setup");
  const elPlay = $("coc-play");
  const elSheet = $("coc-inv-sheet");
  const elScenarioPreview = $("coc-scenario-preview");
  const elStatus = $("coc-status");
  const elChatLog = $("coc-chat-log");
  const elChatInput = $("coc-chat-input") as HTMLTextAreaElement | null;
  const elDiceLog = $("coc-dice-log");
  const elSkillSelect = $("coc-skill-select") as HTMLSelectElement | null;
  const elSidebarScene = $("coc-sidebar-scene");
  const elStatHp = $("coc-stat-hp");
  const elStatSan = $("coc-stat-san");
  const elStatLuck = $("coc-stat-luck");

  function setStatus(msg: string): void {
    if (elStatus) elStatus.textContent = msg;
  }

  function appendDiceLog(line: string): void {
    if (!elDiceLog) return;
    elDiceLog.textContent = `${line}\n${elDiceLog.textContent}`.slice(0, 8000);
  }

  function renderInv(): void {
    if (!elSheet) return;
    if (!inv) {
      elSheet.textContent = "まだ作成されていません。「調査員をランダム生成」を押してください。";
      return;
    }
    elSheet.textContent = investigatorSummaryForPrompt(inv);
    if (elStatHp) elStatHp.textContent = `HP ${inv.hp}/${inv.hpMax}`;
    if (elStatSan) elStatSan.textContent = `SAN ${inv.san}/${inv.sanMax}`;
    if (elStatLuck) elStatLuck.textContent = `幸運 ${inv.luck}`;
    if (elSkillSelect) {
      elSkillSelect.innerHTML = "";
      const keys = Object.keys(inv.skills).sort((a, b) => a.localeCompare(b));
      for (const k of keys) {
        const o = document.createElement("option");
        o.value = k;
        o.textContent = `${k} (${inv.skills[k]}%)`;
        elSkillSelect.appendChild(o);
      }
    }
    refreshSidebarScene();
  }

  function refreshSidebarScene(): void {
    if (!elSidebarScene) return;
    if (!scenario) {
      elSidebarScene.textContent = "—";
      return;
    }
    elSidebarScene.textContent = `${sceneIndex + 1} / ${scenario.scene_count} 「${scenario.scenes[sceneIndex]?.title ?? "?"}」`;
  }

  function appendChat(role: "gm" | "user", body: string): void {
    if (!elChatLog) return;
    const wrap = document.createElement("div");
    wrap.className = "coc-msg";
    const rr = document.createElement("div");
    rr.className = "coc-msg-role" + (role === "user" ? " user" : "");
    rr.textContent = role === "user" ? "あなた" : "ゲームマスター";
    const bd = document.createElement("div");
    bd.className = "coc-msg-body";
    bd.textContent = body;
    wrap.append(rr, bd);
    elChatLog.appendChild(wrap);
    elChatLog.scrollTop = elChatLog.scrollHeight;
  }

  $("coc-btn-roll-inv")?.addEventListener("click", () => {
    const nameInp = $("coc-inv-name") as HTMLInputElement | null;
    inv = buildInvestigator(nameInp?.value);
    renderInv();
    setStatus("調査員を生成しました。");
  });

  $("coc-btn-gen-scenario")?.addEventListener("click", async () => {
    const llmOpts = readLlmOptions();

    const sceneCount = parseInt(($("coc-scene-count") as HTMLSelectElement).value, 10);
    const era = ($("coc-era") as HTMLSelectElement).value;
    const tone = ($("coc-tone") as HTMLSelectElement).value;
    const themeHint = ($("coc-theme-hint") as HTMLTextAreaElement).value;

    const constraints: ScenarioGenConstraints = {
      sceneCount,
      era,
      tone,
      themeHint,
    };

    setStatus("シナリオ生成中…（JSON）");
    $("coc-btn-gen-scenario")?.setAttribute("disabled", "true");
    try {
      const raw = await chatCompletionJson(llmOpts, SCENARIO_SYSTEM_PROMPT, buildScenarioUserPrompt(constraints));
      let parsed: unknown;
      try {
        parsed = parseJsonLoose(raw);
      } catch {
        setStatus("シナリオ JSON のパースに失敗しました。");
        scenario = null;
        if (elScenarioPreview) elScenarioPreview.textContent = "";
        return;
      }
      const sc = validateScenario(parsed, sceneCount);
      if (!sc) {
        setStatus("シナリオ JSON の検証に失敗しました。もう一度お試しください。");
        scenario = null;
        if (elScenarioPreview) elScenarioPreview.textContent = "";
        return;
      }
      scenario = sc;
      if (elScenarioPreview) {
        elScenarioPreview.textContent = `${sc.title}\n\n${sc.premise}\n\nシーン: ${sc.scene_count}`;
      }
      setStatus("シナリオを生成しました。調査員とあわせて「セッション開始」を押してください。");
    } catch (e) {
      scenario = null;
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      $("coc-btn-gen-scenario")?.removeAttribute("disabled");
    }
  });

  $("coc-btn-roll-skill")?.addEventListener("click", () => {
    if (!inv || !elSkillSelect) return;
    const sk = elSkillSelect.value;
    const val = inv.skills[sk];
    if (typeof val !== "number") return;
    const r = skillCheck(val);
    const line = `[${sk}] 技能${val}% → d100=${r.roll} ${r.labelJa}`;
    appendDiceLog(line);
    setStatus(line);
  });

  $("coc-btn-roll-d100")?.addEventListener("click", () => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const roll = 1 + (buf[0]! % 100);
    const line = `[d100] ${roll}`;
    appendDiceLog(line);
    setStatus(line);
  });

  $("coc-btn-insert-roll")?.addEventListener("click", () => {
    if (!elChatInput || !elDiceLog) return;
    const firstLine = elDiceLog.textContent?.split("\n")[0]?.trim();
    if (!firstLine) return;
    elChatInput.value = `${elChatInput.value.trim()}\n（判定結果） ${firstLine}\n`.trim() + "\n";
    elChatInput.focus();
  });

  async function assistantTurn(): Promise<void> {
    const llmOpts = readLlmOptions();
    const msgs: ChatMessage[] = [{ role: "system", content: gmSystemCached }, ...messagesHistory];
    setStatus("GM が応答を生成中…");
    $("coc-btn-send")?.setAttribute("disabled", "true");
    try {
      const raw = await chatCompletionText(llmOpts, msgs);
      const { text, advanced } = stripSceneAdvance(raw);
      messagesHistory.push({ role: "assistant", content: text });
      appendChat("gm", text);
      if (advanced && scenario && sceneIndex < scenario.scene_count - 1) {
        sceneIndex += 1;
        refreshSidebarScene();
      }
      setStatus(advanced ? "場面が進行しました（マーカー検出）。" : "");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      $("coc-btn-send")?.removeAttribute("disabled");
    }
  }

  $("coc-btn-send")?.addEventListener("click", async () => {
    if (!elChatInput || !scenario || !inv) return;
    const t = elChatInput.value.trim();
    if (!t) return;
    const prefixed =
      `${buildSceneUserPrefix(sceneIndex, scenario)}\n\n${t}`;
    messagesHistory.push({ role: "user", content: prefixed });
    appendChat("user", t);
    elChatInput.value = "";
    await assistantTurn();
  });

  $("coc-btn-advance")?.addEventListener("click", async () => {
    if (!scenario || !inv) return;
    const msg =
      "[システム] プレイヤーは次シーンへ進行してよいと判断しました。終了条件を確認し、適切なら <<<SCENE_NEXT>>> を文末に付けて次シーンへ誘導してください。";
    messagesHistory.push({ role: "user", content: msg });
    appendChat("user", "（場面進行をリクエスト）");
    await assistantTurn();
  });

  $("coc-btn-start")?.addEventListener("click", async () => {
    if (!inv || !scenario) {
      setStatus("調査員とシナリオの両方を準備してください。");
      return;
    }

    gmSystemCached = buildGmSystemPrompt(inv, scenario);
    gmSystemCached += `\n\n場面進行の末尾に次シーンへ進んだときだけ ${SCENE_ADVANCE_MARKER} を付記してください。`;

    messagesHistory.length = 0;
    sceneIndex = 0;
    if (elChatLog) elChatLog.innerHTML = "";

    elSetup?.setAttribute("hidden", "true");
    elPlay?.removeAttribute("hidden");

    const bootstrap =
      `[セッション開始]\n${buildSceneUserPrefix(0, scenario)}\nオープニング描写と、プレイヤーの最初の行動を促す一文をお願いします。`;
    messagesHistory.push({ role: "user", content: bootstrap });
    appendChat("user", "セッションを開始します…");

    refreshSidebarScene();
    await assistantTurn();
    if (elChatInput) elChatInput.focus();
  });

  $("coc-btn-reset")?.addEventListener("click", () => {
    if (!confirm("セッションをリセットしますか？")) return;
    messagesHistory.length = 0;
    gmSystemCached = "";
    sceneIndex = 0;
    if (elChatLog) elChatLog.innerHTML = "";
    if (elDiceLog) elDiceLog.textContent = "";
    elPlay?.setAttribute("hidden", "true");
    elSetup?.removeAttribute("hidden");
    setStatus("");
    refreshSidebarScene();
  });
}
