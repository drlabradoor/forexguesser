import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface VersionInfo {
  version: string;
  commit: string | null;
  startedAt: string;
}

const SHORT_SHA_LENGTH = 7;

function readPackageVersion(): string {
  try {
    const raw = readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * An injected variable wins over asking git: the running container may have
 * been built without `git` on PATH, or without a `.git` directory at all, and
 * a missing commit must degrade to null rather than take the server down.
 */
function readCommit(): string | null {
  const injected = process.env.COMMIT_SHA ?? process.env.GIT_COMMIT;
  if (injected?.trim()) {
    return injected.trim().slice(0, SHORT_SHA_LENGTH);
  }
  try {
    const output = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: process.cwd(),
    });
    return output.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Resolved once at startup: the values cannot change while the process runs,
 * and `startedAt` is the whole point of knowing when a deploy landed.
 */
export function collectVersionInfo(startedAt: Date = new Date()): VersionInfo {
  return {
    version: readPackageVersion(),
    commit: readCommit(),
    startedAt: startedAt.toISOString(),
  };
}
