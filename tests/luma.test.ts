import { describe, it, expect } from 'vitest';
import { meanLuma, isLight, LIGHT_THRESHOLD } from '../public/js/luma.js';

/** Пиксели в том виде, в каком их отдаёт `getImageData`: RGBA подряд. */
function pixels(...rgba: number[][]) {
  return new Uint8ClampedArray(rgba.flat());
}

const WHITE = [255, 255, 255, 255];
const BLACK = [0, 0, 0, 255];
const TRANSPARENT = [255, 255, 255, 0];

describe('meanLuma', () => {
  it('reads white as the top of the range', () => {
    expect(meanLuma(pixels(WHITE, WHITE))).toBeCloseTo(1, 5);
  });

  it('reads black as the bottom of the range', () => {
    expect(meanLuma(pixels(BLACK, BLACK))).toBe(0);
  });

  it('averages across the whole image, not just the first pixel', () => {
    expect(meanLuma(pixels(WHITE, BLACK))).toBeCloseTo(0.5, 5);
  });

  // Прозрачное просвечивает тёмным фоном приложения, а не белым: PNG с альфой
  // иначе уводил бы замер в «светлый» на пустом месте.
  it('counts transparent pixels as dark', () => {
    expect(meanLuma(pixels(TRANSPARENT, TRANSPARENT))).toBe(0);
  });

  it('weighs green above red above blue', () => {
    const red = meanLuma(pixels([255, 0, 0, 255]));
    const green = meanLuma(pixels([0, 255, 0, 255]));
    const blue = meanLuma(pixels([0, 0, 255, 255]));
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });

  it('reads an empty buffer as dark instead of NaN', () => {
    expect(meanLuma(new Uint8ClampedArray())).toBe(0);
  });
});

describe('isLight', () => {
  it('calls a chart on a white background light', () => {
    expect(isLight(pixels(WHITE, WHITE, WHITE, BLACK))).toBe(true);
  });

  it('calls a chart on a dark background dark', () => {
    expect(isLight(pixels(BLACK, BLACK, BLACK, WHITE))).toBe(false);
  });

  // Порог -- граница, а не «больше или равно»: ровно серая картинка уходит в
  // тёмный вариант, который работает и на середине диапазона.
  it('keeps the dark beam for a mid-grey image', () => {
    const grey = Math.round(255 * LIGHT_THRESHOLD);
    expect(isLight(pixels([grey, grey, grey, 255]))).toBe(false);
  });
});
