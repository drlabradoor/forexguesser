import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../helpers/testDb.js';
import { UsersRepo } from '../../src/db/users.repo.js';

let repo: UsersRepo;

beforeEach(async () => {
  repo = new UsersRepo(await createTestDb());
});

describe('UsersRepo', () => {
  it('creates a new user with defaults on first access', async () => {
    const user = await repo.getOrCreate(42);
    expect(user).toMatchObject({
      telegramId: 42,
      freeRunUsed: false,
      unlimitedAccess: false,
      balanceOverride: null,
    });
  });

  it('returns the same user on repeated access', async () => {
    await repo.getOrCreate(42);
    await repo.markRunUsed(42);
    const user = await repo.getOrCreate(42);
    expect(user.freeRunUsed).toBe(true);
  });

  it('setUnlimited toggles unlimited_access', async () => {
    await repo.setUnlimited(7, true);
    expect((await repo.getOrCreate(7)).unlimitedAccess).toBe(true);
    await repo.setUnlimited(7, false);
    expect((await repo.getOrCreate(7)).unlimitedAccess).toBe(false);
  });

  it('resetRun clears free_run_used', async () => {
    await repo.getOrCreate(9);
    await repo.markRunUsed(9);
    await repo.resetRun(9);
    expect((await repo.getOrCreate(9)).freeRunUsed).toBe(false);
  });

  it('setBalanceOverride stores a custom balance', async () => {
    await repo.setBalanceOverride(3, 5000);
    expect((await repo.getOrCreate(3)).balanceOverride).toBe(5000);
  });

  it('listAll returns every created user', async () => {
    await repo.getOrCreate(1);
    await repo.getOrCreate(2);
    const ids = (await repo.listAll()).map((u) => u.telegramId).sort();
    expect(ids).toEqual([1, 2]);
  });
});
