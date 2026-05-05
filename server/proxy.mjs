/**
 * OpenAI 互換 chat/completions のプロキシ。
 * API キーは環境変数のみ（クライアントには載せない）。
 */
import http from "node:http";
import process from "node:process";

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.OPENAI_API_KEY || "";
const BASE = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const ALLOW = process.env.CORS_ALLOW_ORIGIN || "*";

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
 * @param {() => void} fn
 */
function withCors(req, res, fn) {
  const origin = req.headers.origin;
  const allowed = allowOrigin(typeof origin === "string" ? origin : undefined);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", allowed);
    if (allowed !== "*") res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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

        const text = await upstream.text();
        const ct = upstream.headers.get("content-type") || "application/json; charset=utf-8";
        res.writeHead(upstream.status, { "Content-Type": ct });
        res.end(text);
      } catch (e) {
        if (!res.headersSent) {
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
