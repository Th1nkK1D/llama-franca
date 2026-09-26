import type { Language } from "./languages";
import { modelPref, promptPref } from "./prefs";

export const OLLAMA_URL = "http://localhost:11434";

export function buildPrompt(template: string, source: Language, target: Language, text: string) {
  const values: Record<string, string> = {
    "{source}": source.name,
    "{source_code}": source.code,
    "{target}": target.name,
    "{target_code}": target.code,
    "{text}": text,
  };
  return template.replace(/\{\w+\}/g, (match) => values[match] ?? match);
}

const UNREACHABLE = `Ollama is not reachable at ${OLLAMA_URL}. Is it running?`;
const FORBIDDEN = "Ollama rejected the extension origin, set OLLAMA_ORIGINS=chrome-extension://*";
const missingModel = (model: string) =>
  `Model ${model} isn't installed. Run: ollama pull ${model}, or pick another in Settings.`;

async function request(path: string, init?: RequestInit, model?: string) {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}${path}`, init);
  } catch {
    throw new Error(UNREACHABLE);
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 403) throw new Error(FORBIDDEN);
  if (res.status === 404 && model && /model/i.test(body.error ?? ""))
    throw new Error(missingModel(model));
  if (!res.ok) throw new Error(body.error ?? `Ollama responded ${res.status}`);
  return body;
}

export async function listModels() {
  const { models = [] } = await request("/api/tags");
  return (models as { name: string }[]).map((m) => m.name).sort();
}

export async function checkSetup() {
  try {
    const [model, models] = await Promise.all([modelPref.getValue(), listModels()]);
    if (!models.includes(model)) return missingModel(model);
  } catch (error) {
    return (error as Error).message;
  }
}

export async function translate(source: Language, target: Language, text: string) {
  const [model, template] = await Promise.all([modelPref.getValue(), promptPref.getValue()]);
  const body = await request(
    "/api/chat",
    {
      method: "POST",
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: "user", content: buildPrompt(template, source, target, text) }],
      }),
    },
    model,
  );
  return (body.message?.content ?? "").trim() as string;
}
