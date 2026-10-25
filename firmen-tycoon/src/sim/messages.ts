// Meldungen (Postfach). Werden im Spielstand gespeichert, damit sie auch nach dem Nachrechnen sichtbar sind.

import type { GameMessage, GameState } from './state';

/** So viele Meldungen bleiben gespeichert (älteste fallen raus). */
export const MAX_MESSAGES = 60;

export function addMessage(state: GameState, msg: Omit<GameMessage, 'id' | 'at' | 'read'>): GameMessage {
  const message: GameMessage = { ...msg, id: state.nextMessageId++, at: state.minutes, read: false };
  state.messages.unshift(message);
  if (state.messages.length > MAX_MESSAGES) state.messages.length = MAX_MESSAGES;
  return message;
}

export function unreadCount(state: Readonly<GameState>): number {
  return state.messages.reduce((n, m) => n + (m.read ? 0 : 1), 0);
}

export function markAllRead(state: GameState): void {
  for (const m of state.messages) m.read = true;
}
