import type { Language } from "./languages";

export const OLLAMA_URL = "http://localhost:11434";
export const MODEL = "translategemma:4b";

// Exact template from https://ollama.com/library/translategemma.
export function buildPrompt(source: Language, target: Language, text: string) {
  const s = source.name;
  const t = target.name;
  return `You are a professional ${s} (${source.code}) to ${t} (${target.code}) translator. Your goal is to accurately convey the meaning and nuances of the original ${s} text while adhering to ${t} grammar, vocabulary, and cultural sensitivities.
Produce only the ${t} translation, without any additional explanations or commentary. Please translate the following ${s} text into ${t}:


${text}`;
}

export async function translate(source: Language, target: Language, text: string) {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [{ role: "user", content: buildPrompt(source, target, text) }],
      }),
    });
  } catch {
    throw new Error(`Ollama is not reachable at ${OLLAMA_URL}`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error(
        "Ollama rejected the extension origin, set OLLAMA_ORIGINS=chrome-extension://*",
      );
    }
    throw new Error(body.error ?? `Ollama responded ${res.status}`);
  }
  return (body.message?.content ?? "").trim() as string;
}
