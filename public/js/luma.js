/**
 * Яркость скриншота: от неё зависит, каким лучом его сканировать.
 *
 * `mix-blend-mode: screen` на белом поле даёт белое при любом цвете сверху --
 * оранжевый луч исчезает на светлой теме графика не из-за неудачного оттенка,
 * а математически. Поэтому у скана два варианта, и выбрать между ними можно
 * только посмотрев на саму картинку.
 */

import { decode } from './image.js';

/** Достаточная сторона для замера: нужна средняя яркость, а не детали. */
const PROBE_EDGE = 32;

/** Выше этой средней яркости график считается светлым. */
export const LIGHT_THRESHOLD = 0.6;

/**
 * Средняя яркость по Rec. 709, диапазон 0..1. Принимает пиксели в том виде, в
 * каком их отдаёт `getImageData`: RGBA подряд.
 */
export function meanLuma(pixels) {
  const count = Math.floor(pixels.length / 4);
  if (!count) return 0;

  let sum = 0;
  for (let i = 0; i < count * 4; i += 4) {
    const luma = (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255;
    // Прозрачное просвечивает тёмным фоном приложения, а не белым -- иначе PNG
    // с альфой уводил бы замер в «светлый» на пустом месте.
    sum += luma * (pixels[i + 3] / 255);
  }
  return sum / count;
}

export function isLight(pixels) {
  return meanLuma(pixels) > LIGHT_THRESHOLD;
}

/**
 * Замер по файлу. Вся логика решения живёт в `isLight`, здесь только доставка
 * пикселей: декод чужой картинки и канвас в node-тесте не воспроизводятся, а
 * порог обязан быть проверяемым.
 */
export async function probeIsLight(file) {
  const source = await decode(file);
  const scale = Math.min(1, PROBE_EDGE / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return isLight(context.getImageData(0, 0, canvas.width, canvas.height).data);
}
