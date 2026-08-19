import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../../src/db/db.js';
import { UsersRepo } from '../../src/db/users.repo.js';

let repo: UsersRepo;

beforeEach(() => {
  const db = createDb(':memory:');
  repo = new UsersRepo(db);
});

describe('UsersRepo', () => {
  it('creates a new user with defaults on first access', () => {
    const user = repo.getOrCreate(42);
    expect(user).toMatchObject({
      telegramId: 42,
      freeRunUsed: false,
      unlimitedAccess: false,
      balanceOverride: null,
    });
  });

  it('returns the same user on repeated access', () => {
    repo.getOrCreate(42);
    repo.markRunUsed(42);
    const user = repo.getOrCreate(42);
    expect(user.freeRunUsed).toBe(true);
  });

  it('setUnlimited toggles unlimited_access', () => {
    repo.setUnlimited(7, true);
    expect(repo.getOrCreate(7).unlimitedAccess).toBe(true);
    repo.setUnlimited(7, false);
    expect(repo.getOrCreate(7).unlimitedAccess).toBe(false);
  });

  it('resetRun clears free_run_used', () => {
    repo.getOrCreate(9);
    repo.markRunUsed(9);
    repo.resetRun(9);
    expect(repo.getOrCreate(9).freeRunUsed).toBe(false);
  });

  it('setBalanceOverride stores a custom balance', () => {
    repo.setBalanceOverride(3, 5000);
    expect(repo.getOrCreate(3).balanceOverride).toBe(5000);
  });

  it('listAll returns every created user', () => {
    repo.getOrCreate(1);
    repo.getOrCreate(2);
    expect(repo.listAll().map((u) => u.telegramId).sort()).toEqual([1, 2]);
  });
});
