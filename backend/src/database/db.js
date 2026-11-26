import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { schemaSql, migrate, SCHEMA_VERSION } from './schema.js';

/**
 * Open (and if necessary create) a SQLite database and apply the schema.
 * Exported as a factory so tests can create isolated databases.
 */
export function openDatabase(file = config.dbPath) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON'); // SQLite leaves FK enforcement off by default
  db.pragma('busy_timeout = 5000'); // wait for the write lock instead of failing instantly
  migrate(db); // upgrade an older database first (no-op for a new one)
  db.exec(schemaSql);
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
  return db;
}

let shared = null;

/** The process-wide database connection used by the HTTP server. */
export function getDb() {
  if (!shared) shared = openDatabase();
  return shared;
}

/** Replace the shared connection (used by tests). */
export function setDb(db) {
  shared = db;
}
