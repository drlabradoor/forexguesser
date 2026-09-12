const listeners = new Set();

export const state = {
  tab: 'screenshot',
  phase: 'loading', // loading | idle | selected | analyzing | result | error
  targetUrl: 'https://t.me/',
  profile: null, // { telegramId, firstName, photoUrl }
  hasAccess: false,
  teaserUsed: false,
  signals: null, // null = ещё не загружали
  signalsError: false,
  expandedSignalId: null,
  file: null,
  previewUrl: null,
  shotIsLight: false, // светлый ли скриншот: от этого зависит вариант луча
  signal: null,
  error: null, // { title, text, action } where action is 'retry' | 'cta' | 'none'
};

export function setState(patch) {
  Object.assign(state, patch);
  for (const listener of listeners) listener(state);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
