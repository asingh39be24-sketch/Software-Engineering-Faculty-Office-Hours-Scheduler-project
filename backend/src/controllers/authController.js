import { getDb } from '../database/db.js';
import { config } from '../config.js';
import * as auth from '../services/authService.js';
import * as users from '../services/userService.js';

export const register = (req, res) => res.status(201).json(auth.register(getDb(), req.body));
export const login = (req, res) => res.json(auth.login(getDb(), req.body));
export const me = (req, res) => res.json({ user: req.user });
export const updateMe = (req, res) => res.json({ user: users.updateProfile(getDb(), req.user.id, req.body || {}) });
export const changePassword = (req, res) => {
  users.changePassword(getDb(), req.user.id, req.body || {});
  res.json({ ok: true });
};
export const publicConfig = (_req, res) =>
  res.json({
    adminSelfRegistration: Boolean(config.adminRegistrationCode),
    cancellationCutoffMinutes: config.cancellationCutoffMinutes,
  });
