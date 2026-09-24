import type { Language } from "./languages";

/** Content script → background */
export interface TranslateTextMessage {
  type: "translate-text";
  source: Language;
  target: Language;
  text: string;
}
export type TranslateTextResponse = { text: string } | { error: string };

/** Popup → content script */
export type PageMessage =
  | { type: "translate-page"; source: string; target: string }
  | { type: "restore-page" }
  | { type: "page-status" };

export interface PageStatus {
  state: "idle" | "translating" | "translated";
  source?: string;
  done: number;
  pending: number;
  error?: string;
}
