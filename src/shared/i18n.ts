// Every user-facing string goes through t(). Keys are checked at compile time
// against the English messages file.

import type messages from "../../public/_locales/en/messages.json";

export type MessageKey = keyof typeof messages;

export function t(key: MessageKey, ...subs: (string | number)[]): string {
  return chrome.i18n.getMessage(key, subs.map(String)) || key;
}

export const uiLocale = () => chrome.i18n.getUILanguage();
