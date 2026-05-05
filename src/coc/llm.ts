export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export async function chatCompletionJson(config: LlmConfig, system: string, user: string): Promise<string> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.65,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
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

export async function chatCompletionText(
  config: LlmConfig,
  messages: ChatMessage[],
  temperature = 0.75
): Promise<string> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature,
      messages,
    }),
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

/** ```json ... ``` でラップされていてもパースできるように抽出を試みる */
export function parseJsonLoose(raw: string): unknown {
  const t = raw.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  const inner = fence ? fence[1]!.trim() : t;
  return JSON.parse(inner) as unknown;
}
