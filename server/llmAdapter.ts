/**
 * Universal LLM Adapter
 * Supports Manus built-in, Google Gemini, and Anthropic Claude.
 * Provider is selected per-request via the `provider` parameter.
 */

import { invokeLLM } from "./_core/llm";

export type LLMProvider = "manus" | "gemini" | "claude";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMOptions {
  provider: LLMProvider;
  messages: LLMMessage[];
  responseFormat?: "json" | "text";
}

// ─── Manus (built-in) ─────────────────────────────────────────────────────────

async function callManus(messages: LLMMessage[], responseFormat: "json" | "text"): Promise<string> {
  const opts: Parameters<typeof invokeLLM>[0] = { messages };
  if (responseFormat === "json") {
    opts.response_format = { type: "json_object" } as { type: "json_object" };
  }
  const response = await invokeLLM(opts);
  const content = response.choices[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

// ─── Google Gemini ────────────────────────────────────────────────────────────

async function callGemini(messages: LLMMessage[], responseFormat: "json" | "text"): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY nicht gesetzt");

  // Separate system prompt from conversation
  const systemMsg = messages.find((m) => m.role === "system");
  const userMessages = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    contents: userMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      ...(responseFormat === "json" ? { responseMimeType: "application/json" } : {}),
    },
  };

  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API Fehler ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// ─── Anthropic Claude ─────────────────────────────────────────────────────────

async function callClaude(messages: LLMMessage[], responseFormat: "json" | "text"): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt");

  const systemMsg = messages.find((m) => m.role === "system");
  const userMessages = messages.filter((m) => m.role !== "system");

  const systemPrompt = responseFormat === "json"
    ? `${systemMsg?.content ?? ""}\n\nAntworte AUSSCHLIESSLICH mit validem JSON – kein Markdown, keine Erklärungen.`
    : (systemMsg?.content ?? "");

  const body = {
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    system: systemPrompt,
    messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API Fehler ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return data.content?.find((c) => c.type === "text")?.text ?? "";
}

// ─── Universal Dispatcher ─────────────────────────────────────────────────────

export async function callLLM(opts: LLMOptions): Promise<string> {
  const { provider, messages, responseFormat = "text" } = opts;

  let raw: string;
  switch (provider) {
    case "gemini":
      raw = await callGemini(messages, responseFormat);
      break;
    case "claude":
      raw = await callClaude(messages, responseFormat);
      break;
    default:
      raw = await callManus(messages, responseFormat);
  }

  // Strip markdown code fences if present
  return raw
    .replace(/^```(?:json|html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

// ─── Provider Labels ──────────────────────────────────────────────────────────

export const PROVIDER_LABELS: Record<LLMProvider, string> = {
  manus: "Manus (Built-in)",
  gemini: "Google Gemini 2.5 Flash",
  claude: "Anthropic Claude Sonnet",
};

export const PROVIDER_DESCRIPTIONS: Record<LLMProvider, string> = {
  manus: "Nutzt das eingebaute Manus-Modell. Kein eigener API-Key nötig.",
  gemini: "Schnell & günstig. Benötigt GEMINI_API_KEY.",
  claude: "Bester HTML-Output. Benötigt ANTHROPIC_API_KEY.",
};
