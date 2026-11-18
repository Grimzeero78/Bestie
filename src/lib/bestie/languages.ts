/** Supported UI + conversation languages for Bestie. */

export const LANGUAGES = [
  { code: "en", native: "English", flag: "🇬🇧" },
  { code: "sw", native: "Kiswahili", flag: "🇰🇪" },
  { code: "fr", native: "Français", flag: "🇫🇷" },
  { code: "es", native: "Español", flag: "🇪🇸" },
  { code: "pt", native: "Português", flag: "🇧🇷" },
  { code: "zh", native: "中文", flag: "🇨🇳" },
  { code: "hi", native: "हिन्दी", flag: "🇮🇳" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export function getLanguage(code: string) {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
