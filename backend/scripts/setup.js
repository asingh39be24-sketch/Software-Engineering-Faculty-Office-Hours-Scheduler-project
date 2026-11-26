// One-time local setup: creates backend/.env with a random JWT secret (if missing),
// creates the database, and loads sample data unless --empty is passed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BACKEND_ROOT } from '../src/config.js';

const envPath = path.join(BACKEND_ROOT, '.env');
if (!fs.existsSync(envPath)) {
  const template = fs.readFileSync(path.join(BACKEND_ROOT, '.env.example'), 'utf8');
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(envPath, template.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`));
  console.log('Created backend/.env with a freshly generated JWT_SECRET.');
  process.env.JWT_SECRET = secret;
} else {
  console.log('backend/.env already exists; leaving it unchanged.');
}

// Import after .env exists so config picks it up.
const { openDatabase } = await import('../src/database/db.js');
const { config } = await import('../src/config.js');
const db = openDatabase();
console.log(`Database ready at ${config.dbPath}`);
if (process.argv.includes('--empty')) {
  console.log('Skipping sample data. Create an administrator with `npm run create-admin`.');
} else {
  const { seed } = await import('./seed.js');
  seed({ db });
}
db.close();
