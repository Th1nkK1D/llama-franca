import { findLanguage } from "./languages";

export const sourcePref = storage.defineItem<string>("local:source", { fallback: "auto" });
const targetPref = storage.defineItem<string | null>("local:target", { fallback: null });

export async function getTarget() {
  return (await targetPref.getValue()) ?? findLanguage(browser.i18n.getUILanguage())?.code ?? "en";
}

export const setTarget = (code: string) => targetPref.setValue(code);
