/**
 * Прогресс сканирования: проценты и фаза.
 *
 * Прогресс фейковый -- запрос к модели это один round trip, промежуточных
 * этапов у него нет. Но врать про завершение ему нельзя: счётчик доходит до
 * 85% по таймеру, дальше асимптотически ползёт к 99 и на 100 не встаёт
 * никогда, пока ответ действительно не пришёл. Ровно поэтому «100%, и ничего
 * не происходит» здесь недостижимо в принципе.
 */

const TICK_MS = 50;

/** До этой отметки счётчик едет линейно, дальше -- тормозит. */
const CRUISE_CEILING = 85;
const CRUISE_MS = 4000;

/** Потолок ожидания. Асимптота, а не цель: 100 достижимо только по ответу. */
const DRIFT_CEILING = 99;
const DRIFT_TAU = 3000;

/**
 * Анимацию снимают на видео, ей нужно время быть увиденной. Без пола быстрый
 * ответ схлопывает её в мелькание -- то есть убивает ровно то, ради чего она
 * сделана. Догон укладывается внутрь пола, а не добавляется к нему: минимум
 * от загрузки до результата остаётся FLOOR_MS, а не FLOOR_MS + CATCH_UP_MS.
 */
export const FLOOR_MS = 2500;
export const CATCH_UP_MS = 400;

/**
 * Фазы переключаются по порогам прогресса, а не по таймеру. При привязке к
 * часам быстрый ответ показал бы только первую фразу, а медленный гонял бы их
 * по кругу -- обе поломки были в прежней реализации.
 */
export const PHASES = [
  {
    at: 0,
    title: 'Считываем структуру свечей',
    subtitle: 'Разбираем геометрию движения и контекст таймфрейма',
  },
  {
    at: 25,
    title: 'Ищем уровни поддержки и сопротивления',
    subtitle: 'Отмечаем зоны отбоя и скопления ликвидности',
  },
  {
    at: 50,
    title: 'Оцениваем направление тренда',
    subtitle: 'Сопоставляем импульсные и коррекционные участки',
  },
  {
    at: 75,
    title: 'Считаем уровни входа и защиты',
    subtitle: 'Сводим вход, стоп-лосс и цели в один план',
  },
];

export function phaseFor(percent) {
  let current = PHASES[0];
  for (const phase of PHASES) {
    if (percent >= phase.at) current = phase;
  }
  return current;
}

export function cruiseAt(elapsed) {
  if (elapsed <= 0) return 0;
  if (elapsed < CRUISE_MS) return (CRUISE_CEILING * elapsed) / CRUISE_MS;
  const drift = 1 - Math.exp(-(elapsed - CRUISE_MS) / DRIFT_TAU);
  return CRUISE_CEILING + (DRIFT_CEILING - CRUISE_CEILING) * drift;
}

/**
 * `onTick` зовётся с `{ percent, phase }` примерно двадцать раз в секунду.
 * `finish()` возвращает промис, который разрешается после добега до 100% --
 * результат показывается только тогда, иначе счётчик оборвался бы на 63%.
 */
export function startScan(onTick) {
  const startedAt = Date.now();
  let percent = 0;
  let catchUp = null;
  let settle = null;

  function emit(value) {
    percent = value;
    onTick({ percent: Math.round(value), phase: phaseFor(value) });
  }

  function tick() {
    if (catchUp) {
      const progress = Math.min(1, (Date.now() - catchUp.at) / CATCH_UP_MS);
      emit(catchUp.from + (100 - catchUp.from) * progress);
      if (progress >= 1) {
        clearInterval(timer);
        settle();
      }
      return;
    }
    emit(cruiseAt(Date.now() - startedAt));
  }

  const timer = setInterval(tick, TICK_MS);
  emit(0);

  return {
    finish() {
      return new Promise((resolve) => {
        settle = resolve;
        const waited = Date.now() - startedAt;
        const hold = Math.max(0, FLOOR_MS - CATCH_UP_MS - waited);
        setTimeout(() => {
          catchUp = { from: percent, at: Date.now() };
        }, hold);
      });
    },
    stop() {
      clearInterval(timer);
    },
  };
}
