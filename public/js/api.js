const tg = window.Telegram?.WebApp;

export class ApiError extends Error {
  constructor(status, code) {
    super(`API ${status} ${code ?? ''}`.trim());
    this.status = status;
    this.code = code;
  }
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'X-Telegram-Init-Data': tg?.initData ?? '',
    },
  });
  if (!response.ok) {
    let code;
    try {
      code = (await response.json()).error;
    } catch {
      code = undefined;
    }
    throw new ApiError(response.status, code);
  }
  return response.json();
}

export function getConfig() {
  return fetch('/api/config').then((r) => {
    if (!r.ok) throw new ApiError(r.status);
    return r.json();
  });
}

export function getMe() {
  return apiFetch('/api/me');
}

export function postAnalyze({ imageBase64, mediaType }) {
  return apiFetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mediaType }),
  });
}
