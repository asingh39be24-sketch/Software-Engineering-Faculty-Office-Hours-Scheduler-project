import fs from 'node:fs';
import { config } from '../src/config.js';

if (config.dbPath === ':memory:') process.exit(0);
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });
console.log(`Deleted ${config.dbPath}. Run \`npm run db:seed\` for sample data or \`npm run create-admin\` for an empty system.`);
