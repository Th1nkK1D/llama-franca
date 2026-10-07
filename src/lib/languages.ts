export interface Language {
  code: string;
  name: string;
  label?: string;
}

export const LANGUAGES: Language[] = [
  { code: "ar", name: "Arabic" },
  { code: "bn", name: "Bengali" },
  { code: "my", name: "Burmese" },
  { code: "zh-Hans", name: "Chinese", label: "Chinese (Simplified)" },
  { code: "zh-Hant", name: "Chinese", label: "Chinese (Traditional)" },
  { code: "cs", name: "Czech" },
  { code: "da", name: "Danish" },
  { code: "nl", name: "Dutch" },
  { code: "en", name: "English" },
  { code: "et", name: "Estonian" },
  { code: "fi", name: "Finnish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "el", name: "Greek" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "hu", name: "Hungarian" },
  { code: "id", name: "Indonesian" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "km", name: "Central Khmer", label: "Khmer" },
  { code: "ko", name: "Korean" },
  { code: "lo", name: "Lao" },
  { code: "ms", name: "Malay" },
  { code: "no", name: "Norwegian" },
  { code: "fa", name: "Persian" },
  { code: "pl", name: "Polish" },
  { code: "pt", name: "Portuguese" },
  { code: "ro", name: "Romanian" },
  { code: "ru", name: "Russian" },
  { code: "es", name: "Spanish" },
  { code: "sv", name: "Swedish" },
  { code: "tl", name: "Tagalog" },
  { code: "th", name: "Thai" },
  { code: "tr", name: "Turkish" },
  { code: "uk", name: "Ukrainian" },
  { code: "vi", name: "Vietnamese" },
];

export const displayName = (language: Language) => language.label ?? language.name;

/** Map a detector / `<html lang>` code like "en-US", "zh-TW", "iw" to a supported language. */
export function findLanguage(code: string | undefined): Language | undefined {
  if (!code) return;
  const [base = "", ...rest] = code.toLowerCase().split(/[-_]/);
  if (base === "zh") {
    const traditional = rest.some((part) => ["hant", "tw", "hk", "mo"].includes(part));
    return LANGUAGES.find((l) => l.code === (traditional ? "zh-Hant" : "zh-Hans"));
  }
  const aliases: Record<string, string> = { iw: "he", fil: "tl", nb: "no", nn: "no" };
  const wanted = aliases[base] ?? base;
  return LANGUAGES.find((l) => l.code === wanted);
}
