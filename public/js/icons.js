const svg = (body) =>
  `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  signals: svg('<path d="M3 17l5-6 4 4 5-8"/><path d="M3 21h18"/>'),
  camera: svg('<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/>'),
  trading: svg('<path d="M3 21h18"/><path d="M5 21V10M10 21V10M14 21V10M19 21V10"/><path d="M12 3l9 5H3z"/>'),
  upload: svg('<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>'),
  refresh: svg('<path d="M20 12a8 8 0 10-2.3 5.6"/><path d="M20 5v5h-5"/>'),
  check: svg('<path d="M4 12.5l5 5 11-11"/>'),
  warn: svg('<path d="M12 8v5"/><circle cx="12" cy="16.5" r="0.6" fill="currentColor"/><circle cx="12" cy="12" r="9"/>'),
  arrowUp: svg('<path d="M5 15l7-7 7 7"/>'),
  arrowDown: svg('<path d="M5 9l7 7 7-7"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  lock: svg('<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>'),
  wallet: svg('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12.5h2"/>'),
};
