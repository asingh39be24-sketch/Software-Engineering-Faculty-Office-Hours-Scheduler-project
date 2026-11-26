import { config } from '../src/config.js';
import { openDatabase } from '../src/database/db.js';

const db = openDatabase();
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
console.log(`Database ready at ${config.dbPath} (${tables.map((t) => t.name).join(', ')})`);
db.close();
