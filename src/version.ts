import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type CommitSource = 'env' | 'git-dir' | 'git-cli' | null;

export interface VersionInfo {
  version: string;
  commit: string | null;
  commitSource: CommitSource;
  startedAt: string;
}

const SHORT_SHA_LENGTH = 7;

function readPackageVersion(root: string): string {
  try {
    const raw = readFileSync(path.join(root, 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Resolves HEAD by reading `.git` itself rather than shelling out. Slim Node
 * images ship without the git binary, so a checkout can be present while
 * `git rev-parse` is not even runnable.
 */
export function readCommitFromGitDir(root: string): string | null {
  try {
    const gitDir = path.join(root, '.git');
    const head = readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();

    // Detached HEAD stores the sha outright.
    if (!head.startsWith('ref:')) {
      return head ? head.slice(0, SHORT_SHA_LENGTH) : null;
    }

    const ref = head.slice('ref:'.length).trim();

    try {
      const loose = readFileSync(path.join(gitDir, ref), 'utf8').trim();
      if (loose) return loose.slice(0, SHORT_SHA_LENGTH);
    } catch {
      // Not a loose ref — a freshly cloned repository keeps refs packed.
    }

    const packed = readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
    for (const line of packed.split(/\r?\n/)) {
      if (!line || line.startsWith('#') || line.startsWith('^')) continue;
      const [sha, name] = line.split(' ');
      if (name === ref && sha) return sha.slice(0, SHORT_SHA_LENGTH);
    }
    return null;
  } catch {
    return null;
  }
}

function resolveCommit(root: string): { commit: string | null; commitSource: CommitSource } {
  // GIT_SHA and APP_VERSION are the names the sibling bots already use in the
  // Bothost panel, so an operator setting one by habit gets a working value.
  const injected =
    process.env.COMMIT_SHA ?? process.env.GIT_COMMIT ?? process.env.GIT_SHA ?? process.env.APP_VERSION;
  if (injected?.trim()) {
    return { commit: injected.trim().slice(0, SHORT_SHA_LENGTH), commitSource: 'env' };
  }

  const fromGitDir = readCommitFromGitDir(root);
  if (fromGitDir) {
    return { commit: fromGitDir, commitSource: 'git-dir' };
  }

  try {
    const output = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: root,
    }).trim();
    if (output) return { commit: output, commitSource: 'git-cli' };
  } catch {
    // No git binary, or the directory is not a repository.
  }

  return { commit: null, commitSource: null };
}

/**
 * Resolved once at startup: nothing here changes while the process runs, and
 * `startedAt` is the point of knowing when a deploy actually landed.
 */
export function collectVersionInfo(
  startedAt: Date = new Date(),
  root: string = process.cwd()
): VersionInfo {
  return {
    version: readPackageVersion(root),
    ...resolveCommit(root),
    startedAt: startedAt.toISOString(),
  };
}
