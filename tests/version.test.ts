import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectVersionInfo, readCommitFromGitDir } from '../src/version.js';

const originalEnv = { ...process.env };
const SHA = '377d250ab1c2d3e4f5061728394a5b6c7d8e9f01';

let root: string;

function writeGitFile(relativePath: string, contents: string): void {
  const target = path.join(root, '.git', relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.COMMIT_SHA;
  delete process.env.GIT_COMMIT;
  root = mkdtempSync(path.join(os.tmpdir(), 'version-test-'));
});

afterEach(() => {
  process.env = { ...originalEnv };
  rmSync(root, { recursive: true, force: true });
});

describe('readCommitFromGitDir', () => {
  it('follows HEAD to a loose ref', () => {
    writeGitFile('HEAD', 'ref: refs/heads/main\n');
    writeGitFile(path.join('refs', 'heads', 'main'), `${SHA}\n`);

    expect(readCommitFromGitDir(root)).toBe('377d250');
  });

  it('falls back to packed-refs when the loose ref is absent', () => {
    writeGitFile('HEAD', 'ref: refs/heads/main\n');
    writeGitFile(
      'packed-refs',
      `# pack-refs with: peeled fully-peeled sorted\n${SHA} refs/heads/main\ndeadbeef1234567890abcdef1234567890abcdef refs/remotes/origin/main\n`
    );

    expect(readCommitFromGitDir(root)).toBe('377d250');
  });

  it('reads a detached HEAD directly', () => {
    writeGitFile('HEAD', `${SHA}\n`);

    expect(readCommitFromGitDir(root)).toBe('377d250');
  });

  it('returns null when there is no .git directory', () => {
    expect(readCommitFromGitDir(root)).toBeNull();
  });

  it('returns null when HEAD points at a ref that resolves nowhere', () => {
    writeGitFile('HEAD', 'ref: refs/heads/missing\n');
    writeGitFile('packed-refs', `${SHA} refs/heads/other\n`);

    expect(readCommitFromGitDir(root)).toBeNull();
  });
});

describe('collectVersionInfo', () => {
  it('reads the version out of package.json', () => {
    expect(collectVersionInfo().version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('prefers COMMIT_SHA from the environment and says so', () => {
    process.env.COMMIT_SHA = '377d250abcdef1234567890';
    const info = collectVersionInfo(new Date(), root);

    expect(info.commit).toBe('377d250');
    expect(info.commitSource).toBe('env');
  });

  it('falls back to GIT_COMMIT when COMMIT_SHA is absent', () => {
    process.env.GIT_COMMIT = 'abcdef1234567';
    expect(collectVersionInfo(new Date(), root).commit).toBe('abcdef1');
  });

  it('reads .git before shelling out to the git binary', () => {
    writeGitFile('HEAD', 'ref: refs/heads/main\n');
    writeGitFile(path.join('refs', 'heads', 'main'), `${SHA}\n`);
    const info = collectVersionInfo(new Date(), root);

    expect(info.commit).toBe('377d250');
    expect(info.commitSource).toBe('git-dir');
  });

  it('reports no commit and no source when nothing can resolve one', () => {
    // A bare temp directory: no .git to read, and `git rev-parse` run there
    // finds no repository either.
    const info = collectVersionInfo(new Date(), root);

    expect(info.commit).toBeNull();
    expect(info.commitSource).toBeNull();
  });

  it('reports the given start time as an ISO string', () => {
    expect(collectVersionInfo(new Date('2026-08-21T13:30:00.000Z')).startedAt).toBe(
      '2026-08-21T13:30:00.000Z'
    );
  });
});
