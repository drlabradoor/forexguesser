const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const uploadScreen = document.getElementById('upload-screen');
const loadingScreen = document.getElementById('loading-screen');
const resultScreen = document.getElementById('result-screen');
const usedScreen = document.getElementById('used-screen');
const fileInput = document.getElementById('file-input');

let nikolaiUrl = '#';

function showScreen(el) {
  for (const screen of [uploadScreen, loadingScreen, resultScreen, usedScreen]) {
    screen.classList.add('hidden');
  }
  el.classList.remove('hidden');
}

function apiFetch(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'X-Telegram-Init-Data': tg.initData,
    },
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function animateBalance(target) {
  const el = document.getElementById('balance');
  let current = 0;
  const step = Math.max(1, Math.round(target / 40));
  const timer = setInterval(() => {
    current = Math.min(target, current + step);
    el.textContent = `$${current.toLocaleString('ru-RU')}`;
    if (current >= target) clearInterval(timer);
  }, 30);
}

function renderSignal(signal) {
  const trendLabel = { bullish: 'Бычий 📈', bearish: 'Медвежий 📉', neutral: 'Нейтральный ⏸' }[signal.trend];
  document.getElementById('signal').innerHTML = `
    <p><strong>Направление:</strong> ${trendLabel}</p>
    <p><strong>Вход:</strong> ${signal.entryPrice}</p>
    <p><strong>Стоп-лосс:</strong> ${signal.stopLoss}</p>
    <p><strong>Тейк-профит 1:</strong> ${signal.takeProfit1}</p>
    <p><strong>Тейк-профит 2:</strong> ${signal.takeProfit2}</p>
    <p><strong>Тейк-профит 3:</strong> ${signal.takeProfit3}</p>
    <p>${signal.rationale}</p>
  `;
}

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  showScreen(loadingScreen);
  const imageBase64 = await fileToBase64(file);

  const response = await apiFetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mediaType: file.type }),
  });

  if (response.status === 403) {
    document.getElementById('cta-button-used').href = nikolaiUrl;
    showScreen(usedScreen);
    return;
  }

  const data = await response.json();
  renderSignal(data.signal);
  document.getElementById('cta-button').href = nikolaiUrl;
  showScreen(resultScreen);
  animateBalance(data.balance);
});

async function init() {
  const configData = await (await fetch('/api/config')).json();
  nikolaiUrl = configData.nikolaiUrl;

  const me = await (await apiFetch('/api/me')).json();
  if (me.alreadyUsed) {
    document.getElementById('cta-button-used').href = nikolaiUrl;
    showScreen(usedScreen);
  } else {
    showScreen(uploadScreen);
  }
}

init();
