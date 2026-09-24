export interface Language {
  code: string;
  name: string;
  label?: string;
}

export const LANGUAGES: Language[] = [
  { code: "en", name: "English" },
  { code: "th", name: "Thai" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh-Hans", name: "Chinese", label: "Chinese (Simplified)" },
  { code: "zh-Hant", name: "Chinese", label: "Chinese (Traditional)" },
  { code: "vi", name: "Vietnamese" },
  { code: "id", name: "Indonesian" },
  { code: "ms", name: "Malay" },
  { code: "tl", name: "Tagalog" },
  { code: "km", name: "Central Khmer", label: "Khmer" },
  { code: "lo", name: "Lao" },
  { code: "my", name: "Burmese" },
  { code: "hi", name: "Hindi" },
  { code: "bn", name: "Bengali" },
  { code: "ar", name: "Arabic" },
  { code: "fa", name: "Persian" },
  { code: "he", name: "Hebrew" },
  { code: "tr", name: "Turkish" },
  { code: "ru", name: "Russian" },
  { code: "uk", name: "Ukrainian" },
  { code: "pl", name: "Polish" },
  { code: "cs", name: "Czech" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "no", name: "Norwegian" },
  { code: "fi", name: "Finnish" },
  { code: "el", name: "Greek" },
  { code: "hu", name: "Hungarian" },
  { code: "ro", name: "Romanian" },
];

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
