import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../helpers/testDb.js';
import { AdminsRepo } from '../../src/db/admins.repo.js';

let repo: AdminsRepo;

beforeEach(async () => {
  repo = new AdminsRepo(await createTestDb());
});

describe('AdminsRepo', () => {
  it('isAdmin returns false for an unknown id', async () => {
    expect(await repo.isAdmin(1)).toBe(false);
  });

  it('add makes isAdmin return true', async () => {
    await repo.add(1, null);
    expect(await repo.isAdmin(1)).toBe(true);
  });

  it('add is idempotent for the same id', async () => {
    await repo.add(1, null);
    await repo.add(1, 2);
    expect(await repo.listAll()).toEqual([1]);
  });

  it('listAll returns every admin id', async () => {
    await repo.add(1, null);
    await repo.add(2, 1);
    expect((await repo.listAll()).sort()).toEqual([1, 2]);
  });
});
