CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  free_run_used INTEGER NOT NULL DEFAULT 0,
  unlimited_access INTEGER NOT NULL DEFAULT 0,
  balance_override REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  telegram_id INTEGER PRIMARY KEY,
  added_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
