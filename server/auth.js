/**
 * Tactical Security, RBAC & Device Authentication Middleware
 */

import { DISPATCH_PIN, REQUIRE_DEVICE_AUTH } from './config.js';
import db from './db.js';

// In-Memory IP Rate Limiter
const rateLimitMap = new Map();

export function rateLimiter(windowMs = 60000, maxRequests = 60) {
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };

    if (now > entry.resetAt) {
      entry.count = 1;
      entry.resetAt = now + windowMs;
    } else {
      entry.count++;
    }

    rateLimitMap.set(ip, entry);

    if (entry.count > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Rate limit exceeded for tactical telemetry.',
        retryAfterMs: entry.resetAt - now,
      });
    }

    next();
  };
}

/**
 * Dispatcher Authentication:
 * Checks Authorization header or X-Dispatch-PIN against DISPATCH_PIN.
 */
export function dispatcherAuth(req, res, next) {
  const token = req.headers['x-dispatch-pin'] ||
                (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));

  if (!DISPATCH_PIN) return next(); // If no PIN configured, open in dev mode

  if (token === DISPATCH_PIN) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Valid dispatcher tactical PIN required.' });
}

/**
 * Device Authentication:
 * Validates vehicle blackbox / phone X-Device-Token if enabled.
 */
export function deviceAuth(req, res, next) {
  if (!REQUIRE_DEVICE_AUTH) return next();

  const token = req.headers['x-device-token'] || req.query.device_token;
  if (!token) {
    return res.status(403).json({ error: 'Device authentication token required.' });
  }

  const device = db.prepare('SELECT id, label FROM devices WHERE token = ?').get(token);
  if (!device) {
    return res.status(403).json({ error: 'Unregistered or revoked device token.' });
  }

  req.device = device;
  db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(Date.now(), device.id);
  next();
}

/**
 * Audit Logging Helper
 */
export function logAudit(action, actor, details = {}) {
  try {
    db.prepare('INSERT INTO audit_logs (action, actor, details_json, ts) VALUES (?, ?, ?, ?)')
      .run(action, actor, JSON.stringify(details), Date.now());
  } catch (err) {
    console.error('[audit]', err.message);
  }
}
