export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** ブラウザからサーバーへ渡すオプション（キーは含めない） */
export interface LlmClientOptions {
  /** 未指定時はサーバー環境変数 GEMINI_MODEL の既定値（Gemini モデル ID） */
  model?: string;
}

function resolveLlmChatUrl(): string {
  const envBase = import.meta.env.VITE_LLM_API_BASE?.trim();
  if (envBase) return `${envBase.replace(/\/$/, "")}/chat`;

  /** GitHub Pages 等の静的ホストは同一オリジンへの POST を許可しないため 405 になる */
  if (import.meta.env.PROD) {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    if (host.endsWith(".github.io")) {
      throw new Error(
        "このビルドにはプロキシ URL が埋め込まれていません。Render 等で proxy を起動したうえで、GitHub の Actions「Secrets」または「Variables」にキー名 VITE_LLM_API_BASE（例: https://xxx.onrender.com/api/llm、末尾スラッシュなし）を設定し、Deploy to GitHub Pages を再実行してからスーパーリロードしてください。"
      );
    }
  }

  return new URL("api/llm/chat", `${window.location.origin}${import.meta.env.BASE_URL}`).href;
}

async function postChatCompletion(body: {
  model?: string;
  temperature: number;
  messages: ChatMessage[];
  response_format?: { type: string };
  /** サーバーがシナリオ生成回数を数えるときのみ付与（上流には転送しない） */
  _quota_bucket?: "scenario";
}): Promise<string> {
  const url = resolveLlmChatUrl();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      mode: "cors",
      body: JSON.stringify(body),
    });
  } catch (e) {
    const pageOrigin = typeof window !== "undefined" ? window.location.origin : "";
    throw new Error(
      [
        "プロキシへの通信がブラウザでブロックされました（Failed to fetch）。",
        `POST 先: ${url}`,
        pageOrigin
          ? `Render の環境変数 CORS_ALLOW_ORIGIN に「${pageOrigin}」を追加してください（末尾スラッシュなし・GitHub Pages は https://ユーザーまたは組織名.github.io）。`
          : "",
        "あわせて VITE_LLM_API_BASE が https で始まっているか、Render が起動しているかを確認してください。",
        `詳細: ${e instanceof Error ? e.message : String(e)}`,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API ${res.status}: ${t.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("応答に content がありません");
  return content;
}

export async function chatCompletionJson(
  opts: LlmClientOptions | undefined,
  system: string,
  user: string
): Promise<string> {
  return postChatCompletion({
    ...(opts?.model ? { model: opts.model } : {}),
    temperature: 0.65,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    _quota_bucket: "scenario",
  });
}

export async function chatCompletionText(
  opts: LlmClientOptions | undefined,
  messages: ChatMessage[],
  temperature = 0.75
): Promise<string> {
  return postChatCompletion({
    ...(opts?.model ? { model: opts.model } : {}),
    temperature,
    messages,
  });
}

/** ```json ... ``` でラップされていてもパースできるように抽出を試みる */
export function parseJsonLoose(raw: string): unknown {
  const t = raw.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  const inner = fence ? fence[1]!.trim() : t;
  return JSON.parse(inner) as unknown;
}
