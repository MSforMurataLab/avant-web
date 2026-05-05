import "dotenv/config";

/**
 * Google Gemini generateContent のプロキシ。
 * フロントは従来どおり OpenAI 風の messages を送り、サーバーが Gemini に変換する。
 * API キーは環境変数のみ（GEMINI_API_KEY または GOOGLE_API_KEY）。
 * シナリオ生成（_quota_bucket: "scenario"）は匿名クッキー単位で 1 日 3 回まで（日本時間）。
 */
import crypto from "node:crypto";
import http from "node:http";
import process from "node:process";

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const GEMINI_API_ROOT =
  (process.env.GEMINI_API_ROOT || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const ALLOW = process.env.CORS_ALLOW_ORIGIN || "*";
const SCENARIO_DAILY_LIMIT = Number(process.env.SCENARIO_QUOTA_PER_DAY || 3);
/** 同一モデルあたりの最大試行回数（バックオフ付き） */
const GEMINI_MAX_ATTEMPTS = Math.min(12, Math.max(1, Number(process.env.GEMINI_MAX_ATTEMPTS || 6)));
/** カンマ区切り。既定モデルが 503 等で続くとき、この順で別モデルを試す（429 の別枠・別負荷になりやすい） */
const GEMINI_FALLBACK_MODELS_RAW =
  process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash,gemini-2.0-flash,gemini-2.5-pro";

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 指数バックオフに載せてよいエラーか（キー不正・404 などは false）
 * @param {number} httpStatus
 * @param {string} bodyText
 */
function geminiTransientFailure(httpStatus, bodyText) {
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 404 || httpStatus === 400) return false;
  if (httpStatus === 503 || httpStatus === 500 || httpStatus === 502) return true;
  if (httpStatus === 429) return true;
  try {
    const o = JSON.parse(bodyText);
    const err = o && typeof o === "object" && "error" in o ? /** @type {{ error?: { status?: string; message?: string } }} */ (o).error : undefined;
    const st = typeof err?.status === "string" ? err.status : "";
    if (st === "UNAVAILABLE" || st === "RESOURCE_EXHAUSTED") return true;
    const msg = typeof err?.message === "string" ? err.message : "";
    if (/high demand|try again later|overloaded|temporarily unavailable|UNAVAILABLE/i.test(msg)) return true;
    return false;
  } catch {
    return httpStatus >= 500;
  }
}

/**
 * このモデルは諦めて別モデルへ切り替えるか（キー不正・リクエスト不正では切り替えない）
 * @param {number} httpStatus
 * @param {string} bodyText
 */
function shouldSwitchGeminiModel(httpStatus, bodyText) {
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 400) return false;
  if (httpStatus === 404) return true;
  if (httpStatus === 503 || httpStatus === 429 || httpStatus === 502 || httpStatus === 500) return true;
  try {
    const o = JSON.parse(bodyText);
    const err = o && typeof o === "object" && "error" in o ? /** @type {{ error?: { status?: string; message?: string } }} */ (o).error : undefined;
    const st = typeof err?.status === "string" ? err.status : "";
    if (st === "UNAVAILABLE" || st === "RESOURCE_EXHAUSTED") return true;
    const msg = typeof err?.message === "string" ? err.message : "";
    if (/high demand|try again later|overloaded|temporarily unavailable/i.test(msg)) return true;
    return false;
  } catch {
    return httpStatus >= 502;
  }
}

/** @param {string} primaryModelId */
function buildGeminiModelChain(primaryModelId) {
  const extras = GEMINI_FALLBACK_MODELS_RAW.split(",")
    .map((s) => normalizeGeminiModelId(s.trim()))
    .filter(Boolean);
  /** @type {string[]} */
  const chain = [];
  const seen = new Set();
  for (const m of [primaryModelId, ...extras]) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    chain.push(m);
  }
  return chain;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @type {Map<string, { day: string; n: number }>} */
const scenarioQuota = new Map();

/** @param {string | undefined} cookieHeader */
function parseCookies(cookieHeader) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function japanDayString() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * @param {http.ServerResponse} res
 * @param {string} sid
 */
function appendSidCookie(res, sid) {
  const segments = [
    `coc_quota_sid=${encodeURIComponent(sid)}`,
    "HttpOnly",
    "Path=/",
    "Max-Age=31536000",
    process.env.COOKIE_SAMESITE_NONE === "1" ? "SameSite=None" : "SameSite=Lax",
    process.env.COOKIE_SECURE === "1" ? "Secure" : "",
  ].filter(Boolean);
  res.appendHeader("Set-Cookie", segments.join("; "));
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function resolveQuotaSid(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  let sid = cookies.coc_quota_sid;
  if (sid && UUID_RE.test(sid)) return sid;
  sid = crypto.randomUUID();
  appendSidCookie(res, sid);
  return sid;
}

/** @param {string | undefined} origin */
function allowOrigin(origin) {
  if (!origin) return ALLOW === "*" ? "*" : null;
  if (ALLOW === "*") return "*";
  const list = ALLOW.split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(origin) ? origin : null;
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function applyCors(req, res) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const allowed = allowOrigin(origin);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", allowed);
    if (allowed !== "*") {
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {() => void} fn
 */
function withCors(req, res, fn) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  fn();
}

/** @param {string} rawId */
function normalizeGeminiModelId(rawId) {
  let m = rawId.trim();
  if (m.startsWith("models/")) m = m.slice("models/".length);
  const colon = m.indexOf(":");
  if (colon !== -1) m = m.slice(0, colon);
  return m;
}

/**
 * OpenAI 系モデル名がクライアントから来た場合はサーバー既定にフォールバック
 * @param {string | undefined} clientModel
 * @param {string} fallback
 */
function resolveGeminiModel(clientModel, fallback) {
  const m = typeof clientModel === "string" ? clientModel.trim() : "";
  if (!m) return normalizeGeminiModelId(fallback);
  if (/^(gpt-|o\d|chatgpt-|text-davinci)/i.test(m)) return normalizeGeminiModelId(fallback);
  return normalizeGeminiModelId(m);
}

/**
 * @param {unknown[]} messagesOpenAi
 * @param {number} temperature
 * @param {string | undefined} responseMimeType
 */
function buildGeminiBody(messagesOpenAi, temperature, responseMimeType) {
  const systemTexts = [];
  /** @type {{ role: string; parts: { text: string }[] }[]} */
  const contents = [];

  for (const raw of messagesOpenAi) {
    if (!raw || typeof raw !== "object") continue;
    const m = /** @type {{ role?: string; content?: unknown }} */ (raw);
    const role = typeof m.role === "string" ? m.role : "user";
    const content = typeof m.content === "string" ? m.content : "";
    if (!content && role !== "system") continue;

    if (role === "system") {
      systemTexts.push(content);
      continue;
    }
    const gemRole = role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last && last.role === gemRole) {
      last.parts[0].text += `\n\n${content}`;
    } else {
      contents.push({ role: gemRole, parts: [{ text: content }] });
    }
  }

  /** @type {Record<string, unknown>} */
  const body = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: 8192,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };

  if (systemTexts.length > 0) {
    body.systemInstruction = { parts: [{ text: systemTexts.join("\n\n") }] };
  }

  if (responseMimeType) {
    /** @type {{ generationConfig: Record<string, unknown> }} */ (body).generationConfig.responseMimeType =
      responseMimeType;
  }

  return body;
}

/** @param {unknown} gemJson */
function extractGeminiText(gemJson) {
  if (!gemJson || typeof gemJson !== "object") return "";
  const cand = /** @type {{ candidates?: unknown[] }} */ (gemJson).candidates?.[0];
  if (!cand || typeof cand !== "object") return "";
  const content = /** @type {{ content?: { parts?: unknown[] } }} */ (cand).content;
  const parts = content?.parts;
  if (!Array.isArray(parts)) return "";
  let out = "";
  for (const p of parts) {
    if (p && typeof p === "object" && typeof /** @type {{text?: string}} */ (p).text === "string") {
      out += /** @type {{text: string}} */ (p).text;
    }
  }
  return out;
}

/** Gemini の応答を OpenAI chat.completion 互換 JSON に変換（フロントは変更しない） */
function geminiToOpenAiChatCompletion(modelIdUsed, gemJson, contentOverride) {
  const content = contentOverride ?? extractGeminiText(gemJson);
  return {
    id: "gemini-proxy",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelIdUsed,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
  };
}

const server = http.createServer((req, res) => {
  withCors(req, res, () => {
    void (async () => {
      try {
        applyCors(req, res);

        if (req.method !== "POST" || req.url !== "/api/llm/chat") {
          res.writeHead(req.method === "POST" || req.method === "GET" ? 404 : 405);
          res.end();
          return;
        }

        if (!API_KEY) {
          res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
          res.end(
            JSON.stringify({
              error:
                "GEMINI_API_KEY（または GOOGLE_API_KEY）がサーバーに設定されていません。Google AI Studio で発行したキーを環境変数に設定してください。",
            })
          );
          return;
        }

        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
        }

        let json;
        try {
          json = JSON.parse(raw || "{}");
        } catch {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "JSON が不正です。" }));
          return;
        }

        const quotaScenario = json._quota_bucket === "scenario";
        delete json._quota_bucket;

        /** @type {{ key: string } | null} */
        let quotaIncrementKey = null;

        if (quotaScenario) {
          const sid = resolveQuotaSid(req, res);
          const key = `s:${sid}`;
          const day = japanDayString();
          let rec = scenarioQuota.get(key);
          if (!rec || rec.day !== day) rec = { day, n: 0 };
          if (rec.n >= SCENARIO_DAILY_LIMIT) {
            res.writeHead(429, { "Content-Type": "application/json; charset=utf-8" });
            res.end(
              JSON.stringify({
                error: `シナリオ生成は1日あたり${SCENARIO_DAILY_LIMIT}回までです（日本時間 0:00 でカウントがリセットされます）。`,
              })
            );
            return;
          }
          quotaIncrementKey = { key };
        }

        if (!Array.isArray(json.messages) || json.messages.length === 0) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "messages が必要です。" }));
          return;
        }

        const temperature = typeof json.temperature === "number" ? json.temperature : 0.7;
        const wantsJson =
          json.response_format &&
          typeof json.response_format === "object" &&
          json.response_format.type === "json_object";

        const primaryModel = resolveGeminiModel(json.model, DEFAULT_MODEL);
        const modelChain = buildGeminiModelChain(primaryModel);
        const geminiBody = buildGeminiBody(json.messages, temperature, wantsJson ? "application/json" : undefined);

        if (!Array.isArray(geminiBody.contents) || geminiBody.contents.length === 0) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Gemini へ渡す user/model のメッセージがありません。" }));
          return;
        }

        const payloadJson = JSON.stringify(geminiBody);

        let responseText = "";
        /** @type {string} */
        let modelUsed = primaryModel;

        try {
          modelLoop: for (let mi = 0; mi < modelChain.length; mi++) {
            const modelId = modelChain[mi];
            const url = `${GEMINI_API_ROOT}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(API_KEY)}`;

            for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
              const upstream = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payloadJson,
              });
              responseText = await upstream.text();

              if (upstream.ok) {
                modelUsed = modelId;
                break modelLoop;
              }

              const retrySameModel =
                attempt < GEMINI_MAX_ATTEMPTS && geminiTransientFailure(upstream.status, responseText);

              if (retrySameModel) {
                const backoffMs =
                  Math.min(22_000, 550 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 700);
                console.error(
                  `[gemini-proxy] model=${modelId} ${upstream.status} → ${backoffMs}ms 後に再試行 (${attempt}/${GEMINI_MAX_ATTEMPTS})`
                );
                await sleep(backoffMs);
                continue;
              }

              const canSwitch = mi < modelChain.length - 1 && shouldSwitchGeminiModel(upstream.status, responseText);

              if (canSwitch) {
                console.error(`[gemini-proxy] model=${modelId} が利用不可 → ${modelChain[mi + 1]} を試します`);
                continue modelLoop;
              }

              res.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8" });
              res.end(responseText || JSON.stringify({ error: `Gemini API ${upstream.status}` }));
              return;
            }
          }
        } catch (e) {
          res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
          res.end(
            JSON.stringify({
              error: e instanceof Error ? e.message : String(e),
            })
          );
          return;
        }

        if (!responseText) {
          res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Gemini から応答がありませんでした。" }));
          return;
        }

        /** @type {unknown} */
        let gemParsed;
        try {
          gemParsed = JSON.parse(responseText);
        } catch {
          res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Gemini の応答 JSON が不正です。" }));
          return;
        }

        const assistantText = extractGeminiText(gemParsed);
        const cand0 =
          gemParsed &&
          typeof gemParsed === "object" &&
          Array.isArray(/** @type {{ candidates?: unknown[] }} */ (gemParsed).candidates)
            ? /** @type {{ candidates: unknown[] }} */ (gemParsed).candidates[0]
            : null;
        const finishReason =
          cand0 && typeof cand0 === "object" && typeof /** @type {{ finishReason?: unknown }} */ (cand0).finishReason === "string"
            ? /** @type {{ finishReason: string }} */ (cand0).finishReason
            : "";

        if (
          quotaIncrementKey &&
          assistantText.trim().length > 0 &&
          finishReason !== "SAFETY"
        ) {
          const key = quotaIncrementKey.key;
          const day = japanDayString();
          let rec = scenarioQuota.get(key);
          if (!rec || rec.day !== day) rec = { day, n: 0 };
          rec.n += 1;
          scenarioQuota.set(key, rec);
        }

        const openAiShaped = geminiToOpenAiChatCompletion(modelUsed, gemParsed, assistantText);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(openAiShaped));
      } catch (e) {
        if (!res.headersSent) {
          applyCors(req, res);
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
      }
    })();
  });
});

server.listen(PORT, () => {
  console.error(`[gemini-proxy] http://127.0.0.1:${PORT}/api/llm/chat → Gemini generateContent`);
});
