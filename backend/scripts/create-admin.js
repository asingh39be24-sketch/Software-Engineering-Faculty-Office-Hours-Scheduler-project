// Usage: npm run create-admin -- --name "Jane Doe" --email admin@uni.edu --password 'S3curePass'
// Omitted values are prompted for interactively.
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { openDatabase } from '../src/database/db.js';
import { insertUser } from '../src/services/userService.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), [])
);
const rl = readline.createInterface({ input: stdin, output: stdout });
const ask = async (k, q) => args[k] || (await rl.question(q));
try {
  const name = await ask('name', 'Full name: ');
  const email = await ask('email', 'Email: ');
  const password = await ask('password', 'Password (8+ chars, upper, lower, number): ');
  const db = openDatabase();
  const user = insertUser(db, { name, email, password, role: 'admin' });
  console.log(`Administrator created: ${user.name} <${user.email}> (id ${user.id})`);
  db.close();
} catch (e) {
  console.error(`Could not create administrator: ${e.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
