import type { Language } from "./languages";

export const LOADING_MODEL = "Loading model, the first translation takes a while…";

export type Reply<T> = T | { error: string };

/** Content script → background */
export interface TranslateTextMessage {
  type: "translate-text";
  source: Language;
  target: Language;
  text: string;
}
export interface TranslateTextResult {
  text: string;
}

/** Content script → background: Ollama loads the model on first use (and after it idles out), which takes a while. */
export type ModelMessage = { type: "model-loaded" } | { type: "load-model" };
export interface ModelResult {
  loaded: boolean;
}

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

/** Content script → background */
export type TabModeMessage =
  | { type: "get-tab-mode" }
  | { type: "set-tab-mode"; mode: TabMode | null };

/** Popup or background → content script */
export type PageMessage =
  | { type: "translate-page"; source: string; target: string }
  | { type: "translate-selection"; text: string; source: string; target: string }
  | { type: "restore-page" }
  | { type: "page-status" };

export interface PageStatus {
  state: "idle" | "translating" | "translated";
  source?: string;
  requestedSource?: string;
  target?: string;
  done: number;
  pending: number;
  loadingModel?: boolean;
  error?: string;
}
