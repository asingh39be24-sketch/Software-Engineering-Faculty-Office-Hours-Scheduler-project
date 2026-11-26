import fs from 'node:fs';
import path from 'node:path';
import { assertRuntimeConfig, config } from './config.js';
import { getDb } from './database/db.js';
import { createApp } from './app.js';
import { startReminderScheduler } from './services/reminderService.js';
import { isEmailConfigured } from './services/emailService.js';

try {
  assertRuntimeConfig();
} catch (e) {
  console.error(`\n  ${e.message}\n`);
  process.exit(1);
}

const db = getDb();
const app = createApp();
const stopReminders = startReminderScheduler(db);

const server = app.listen(config.port, () => {
  const hasUi = fs.existsSync(path.join(config.frontendDist, 'index.html'));
  console.log(`Office-Hours Scheduler API  http://localhost:${config.port}/api`);
  if (hasUi) console.log(`Web app                     http://localhost:${config.port}`);
  console.log(`Database                    ${config.dbPath}`);
  console.log(`Email delivery              ${isEmailConfigured() ? 'enabled (SMTP)' : 'disabled (in-app notifications only)'}`);
});

function shutdown() {
  stopReminders();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
