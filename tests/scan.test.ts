import { describe, it, expect, vi, afterEach } from 'vitest';
import { startScan, phaseFor, cruiseAt, PHASES, FLOOR_MS, CATCH_UP_MS } from '../public/js/scan.js';

afterEach(() => {
  vi.useRealTimers();
});

function collect() {
  const seen: number[] = [];
  const scan = startScan(({ percent }: { percent: number }) => seen.push(percent));
  return { seen, scan, last: () => seen[seen.length - 1] };
}

describe('cruiseAt', () => {
  it('starts at zero', () => {
    expect(cruiseAt(0)).toBe(0);
  });

  it('never reaches 100, however long the model takes', () => {
    // Час ожидания -- заведомо больше любого реального ответа.
    expect(cruiseAt(3_600_000)).toBeLessThan(100);
  });

  it('slows down past the cruise ceiling instead of stopping dead', () => {
    const early = cruiseAt(5000);
    const later = cruiseAt(9000);
    expect(later).toBeGreaterThan(early);
    expect(later - early).toBeLessThan(cruiseAt(2000) - cruiseAt(0));
  });
});

describe('phaseFor', () => {
  it('picks the phase whose threshold the progress has passed', () => {
    expect(phaseFor(0)).toBe(PHASES[0]);
    expect(phaseFor(24)).toBe(PHASES[0]);
    expect(phaseFor(25)).toBe(PHASES[1]);
    expect(phaseFor(60)).toBe(PHASES[2]);
    expect(phaseFor(100)).toBe(PHASES[3]);
  });

  it('walks every phase on the way to 100', () => {
    const walked = new Set(Array.from({ length: 101 }, (_, p) => phaseFor(p)));
    expect(walked.size).toBe(PHASES.length);
  });
});

describe('startScan', () => {
  it('never shows 100% while the answer has not arrived', async () => {
    vi.useFakeTimers();
    const { seen, scan } = collect();

    await vi.advanceTimersByTimeAsync(60_000);
    scan.stop();

    expect(Math.max(...seen)).toBeLessThan(100);
  });

  it('holds the floor when the answer comes back immediately', async () => {
    vi.useFakeTimers();
    const { scan } = collect();

    await vi.advanceTimersByTimeAsync(100);
    let settled = false;
    void scan.finish().then(() => {
      settled = true;
    });

    // Ответ пришёл на 100-й миллисекунде, но анимацию снимают -- до пола
    // результат не показывается.
    await vi.advanceTimersByTimeAsync(FLOOR_MS - 200);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(200);
    expect(settled).toBe(true);
  });

  it('lands exactly on 100% before resolving', async () => {
    vi.useFakeTimers();
    const { scan, last } = collect();

    await vi.advanceTimersByTimeAsync(100);
    const finished = scan.finish();
    await vi.advanceTimersByTimeAsync(FLOOR_MS);
    await finished;

    expect(last()).toBe(100);
  });

  it('adds only the catch-up once the floor is already behind', async () => {
    vi.useFakeTimers();
    const { scan } = collect();

    // Медленный ответ: пол давно пройден, ждать больше нечего.
    await vi.advanceTimersByTimeAsync(8000);
    let settled = false;
    void scan.finish().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(CATCH_UP_MS - 100);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(200);
    expect(settled).toBe(true);
  });

  it('stops ticking after stop()', async () => {
    vi.useFakeTimers();
    const { seen, scan } = collect();

    await vi.advanceTimersByTimeAsync(500);
    scan.stop();
    const afterStop = seen.length;
    await vi.advanceTimersByTimeAsync(5000);

    expect(seen.length).toBe(afterStop);
  });
});
