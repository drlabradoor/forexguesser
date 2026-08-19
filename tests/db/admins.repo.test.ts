import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../../src/db/db.js';
import { AdminsRepo } from '../../src/db/admins.repo.js';

let repo: AdminsRepo;

beforeEach(() => {
  const db = createDb(':memory:');
  repo = new AdminsRepo(db);
});

describe('AdminsRepo', () => {
  it('isAdmin returns false for an unknown id', () => {
    expect(repo.isAdmin(1)).toBe(false);
  });

  it('add makes isAdmin return true', () => {
    repo.add(1, null);
    expect(repo.isAdmin(1)).toBe(true);
  });

  it('add is idempotent for the same id', () => {
    repo.add(1, null);
    repo.add(1, 2);
    expect(repo.listAll()).toEqual([1]);
  });

  it('listAll returns every admin id', () => {
    repo.add(1, null);
    repo.add(2, 1);
    expect(repo.listAll().sort()).toEqual([1, 2]);
  });
});
