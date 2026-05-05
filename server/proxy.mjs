/**
 * OpenAI 互換 chat/completions のプロキシ。
 * API キーは環境変数のみ（クライアントには載せない）。
 * シナリオ生成（_quota_bucket: "scenario"）は匿名クッキー単位で 1 日 3 回まで（日本時間）。
 */
import crypto from "node:crypto";
import http from "node:http";
import process from "node:process";

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.OPENAI_API_KEY || "";
const BASE = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const ALLOW = process.env.CORS_ALLOW_ORIGIN || "*";
const SCENARIO_DAILY_LIMIT = Number(process.env.SCENARIO_QUOTA_PER_DAY || 3);

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
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
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
          res.end(JSON.stringify({ error: "OPENAI_API_KEY がサーバーに設定されていません。" }));
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

        const payload = {
          model: typeof json.model === "string" && json.model.trim() ? json.model.trim() : DEFAULT_MODEL,
          temperature: typeof json.temperature === "number" ? json.temperature : 0.7,
          messages: json.messages,
          ...(json.response_format && typeof json.response_format === "object"
            ? { response_format: json.response_format }
            : {}),
        };

        let upstream;
        try {
          upstream = await fetch(`${BASE}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${API_KEY}`,
            },
            body: JSON.stringify(payload),
          });
        } catch (e) {
          res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
          res.end(
            JSON.stringify({
              error: e instanceof Error ? e.message : String(e),
            })
          );
          return;
        }

        if (upstream.ok && quotaIncrementKey) {
          const key = quotaIncrementKey.key;
          const day = japanDayString();
          let rec = scenarioQuota.get(key);
          if (!rec || rec.day !== day) rec = { day, n: 0 };
          rec.n += 1;
          scenarioQuota.set(key, rec);
        }

        const text = await upstream.text();
        const ct = upstream.headers.get("content-type") || "application/json; charset=utf-8";
        res.writeHead(upstream.status, { "Content-Type": ct });
        res.end(text);
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
  console.error(`[llm-proxy] http://127.0.0.1:${PORT}/api/llm/chat`);
});
