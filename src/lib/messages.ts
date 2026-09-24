import type { Language } from "./languages";

/** Content script → background */
export interface TranslateTextMessage {
  type: "translate-text";
  source: Language;
  target: Language;
  text: string;
}
export type TranslateTextResponse = { text: string } | { error: string };

/** Content script → background: toolbar badge for the sender's tab */
export interface BadgeMessage {
  type: "badge";
  text: string;
  error?: boolean;
}

/** Languages a tab keeps translating into across page loads, until "Show original". */
export interface TabMode {
  source: string;
  target: string;
}

/** Content script → background: read or update the sender tab's mode */
export type TabModeMessage =
  | { type: "get-tab-mode" }
  | { type: "set-tab-mode"; mode: TabMode | null };

/** Popup → content script */
export type PageMessage =
  | { type: "translate-page"; source: string; target: string }
  | { type: "restore-page" }
  | { type: "page-status" };

export interface PageStatus {
  state: "idle" | "translating" | "translated";
  source?: string;
  requestedSource?: string;
  target?: string;
  done: number;
  pending: number;
  error?: string;
}
