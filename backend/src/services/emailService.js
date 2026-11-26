import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transport = null;
let warned = false;

export function isEmailConfigured() {
  return Boolean(config.smtp.host && config.smtp.from);
}

function getTransport() {
  if (!isEmailConfigured()) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transport;
}

/**
 * Sends an email if SMTP is configured. Never throws: email is a best-effort
 * secondary channel; in-app notifications are the system of record.
 */
export async function sendEmail({ to, subject, text }) {
  const t = getTransport();
  if (!t) {
    if (!warned && config.env !== 'test') {
      console.info('[email] SMTP not configured (SMTP_HOST / EMAIL_FROM); email delivery is disabled.');
      warned = true;
    }
    return { sent: false, reason: 'not_configured' };
  }
  try {
    await t.sendMail({ from: config.smtp.from, to, subject, text });
    return { sent: true };
  } catch (err) {
    console.error('[email] send failed:', err.message);
    return { sent: false, reason: 'error' };
  }
}
