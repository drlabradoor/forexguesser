const PHRASE_MS = 4000;

const PHRASES = [
  'Сопоставляем инструмент и таймфрейм…',
  'Оцениваем читаемость меток цены и времени…',
  'Разбираем свечную структуру…',
  'Считаем уровни входа и защиты…',
];

/**
 * The phrases are on a timer, not tied to real progress -- the request is a
 * single round trip. `finish()` waits for the phrase on screen to run its
 * course, because cutting a sentence off mid-way reads as a glitch.
 */
export function startStatusRotation(element) {
  let index = 0;
  let pendingResolve = null;
  element.textContent = PHRASES[0];

  const timer = setInterval(() => {
    if (pendingResolve) {
      clearInterval(timer);
      pendingResolve();
      return;
    }
    index += 1;
    element.textContent = PHRASES[index % PHRASES.length];
  }, PHRASE_MS);

  return {
    finish() {
      return new Promise((resolve) => {
        pendingResolve = resolve;
      });
    },
  };
}
