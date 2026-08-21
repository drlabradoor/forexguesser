import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { collectVersionInfo } from '../src/version.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.COMMIT_SHA;
  delete process.env.GIT_COMMIT;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('collectVersionInfo', () => {
  it('reads the version out of package.json', () => {
    expect(collectVersionInfo().version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('prefers COMMIT_SHA from the environment and shortens it', () => {
    process.env.COMMIT_SHA = '377d250abcdef1234567890';
    expect(collectVersionInfo().commit).toBe('377d250');
  });

  it('falls back to GIT_COMMIT when COMMIT_SHA is absent', () => {
    process.env.GIT_COMMIT = 'abcdef1234567';
    expect(collectVersionInfo().commit).toBe('abcdef1');
  });

  it('resolves a commit from the repository when no variable is set', () => {
    // The suite runs inside the checkout, so git answers here. In a container
    // without .git this is the branch that returns null instead of throwing.
    const commit = collectVersionInfo().commit;
    expect(commit === null || /^[0-9a-f]{7,}$/.test(commit)).toBe(true);
  });

  it('reports the given start time as an ISO string', () => {
    const startedAt = new Date('2026-08-21T13:30:00.000Z');
    expect(collectVersionInfo(startedAt).startedAt).toBe('2026-08-21T13:30:00.000Z');
  });
});
