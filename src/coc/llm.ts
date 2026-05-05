export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** ブラウザからサーバーへ渡すオプション（キーは含めない） */
export interface LlmClientOptions {
  /** 未指定時はサーバー環境変数 GEMINI_MODEL の既定値（Gemini モデル ID） */
  model?: string;
}

function resolveLlmChatUrl(): string {
  const envBase = import.meta.env.VITE_LLM_API_BASE?.trim();
  if (envBase) return `${envBase.replace(/\/$/, "")}/chat`;
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
  const res = await fetch(resolveLlmChatUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

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
