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

const UNREACHABLE = `Ollama is not reachable at ${OLLAMA_URL}. Is it running?`;
const FORBIDDEN = "Ollama rejected the extension origin, set OLLAMA_ORIGINS=chrome-extension://*";
const MISSING_MODEL = `Model ${MODEL} isn't installed. Run: ollama pull ${MODEL}`;

async function request(path: string, init?: RequestInit) {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}${path}`, init);
  } catch {
    throw new Error(UNREACHABLE);
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 403) throw new Error(FORBIDDEN);
  if (res.status === 404 && /model/i.test(body.error ?? "")) throw new Error(MISSING_MODEL);
  if (!res.ok) throw new Error(body.error ?? `Ollama responded ${res.status}`);
  return body;
}

export async function checkSetup() {
  try {
    const { models = [] } = await request("/api/tags");
    if (!models.some((m: { name: string }) => m.name === MODEL)) return MISSING_MODEL;
  } catch (error) {
    return (error as Error).message;
  }
}

export async function translate(source: Language, target: Language, text: string) {
  const body = await request("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      messages: [{ role: "user", content: buildPrompt(source, target, text) }],
    }),
  });
  return (body.message?.content ?? "").trim() as string;
}
