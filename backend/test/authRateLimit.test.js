'use strict';

/** Unit tests for authRateLimit.middleware.js (NFR-SEC-01 brute-force guard). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createAuthRateLimit } = require('../src/middlewares/authRateLimit.middleware');

/** Runs one request through the limiter; `outcome` is the status the controller would answer. */
function attempt(limiter, { ip = '1.2.3.4', outcome = 401 } = {}) {
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  });
  let passed = false;
  limiter({ ip, originalUrl: '/api/auth/login' }, res, () => {
    passed = true;
    res.statusCode = outcome;
    res.emit('finish');
  });
  return { passed, res };
}

describe('authRateLimit', () => {
  it('locks an IP out with 429 + Retry-After after maxFailures failed attempts', () => {
    let t = 0;
    const limiter = createAuthRateLimit({ maxFailures: 3, windowMs: 60_000, now: () => t });
    for (let i = 0; i < 3; i++) assert.equal(attempt(limiter).passed, true);
    t = 10_000;
    const blocked = attempt(limiter, { outcome: 200 });
    assert.equal(blocked.passed, false);
    assert.equal(blocked.res.statusCode, 429);
    assert.equal(blocked.res.headers['Retry-After'], '50');
  });

  it('unlocks once the window that began with the first failure has passed', () => {
    let t = 0;
    const limiter = createAuthRateLimit({ maxFailures: 2, windowMs: 60_000, now: () => t });
    attempt(limiter);
    attempt(limiter);
    t = 60_000;
    assert.equal(attempt(limiter, { outcome: 200 }).passed, true);
  });

  it('a successful login clears the failure count', () => {
    const limiter = createAuthRateLimit({ maxFailures: 3, windowMs: 60_000, now: () => 0 });
    attempt(limiter);
    attempt(limiter);
    attempt(limiter, { outcome: 200 });
    attempt(limiter);
    attempt(limiter);
    assert.equal(attempt(limiter).passed, true, 'only 2 failures since the success');
  });

  it('counts per IP and ignores non-401 errors such as 400', () => {
    const limiter = createAuthRateLimit({ maxFailures: 2, windowMs: 60_000, now: () => 0 });
    attempt(limiter, { ip: 'a' });
    attempt(limiter, { ip: 'a' });
    assert.equal(attempt(limiter, { ip: 'a' }).passed, false);
    assert.equal(attempt(limiter, { ip: 'b' }).passed, true);
    for (let i = 0; i < 5; i++) attempt(limiter, { ip: 'c', outcome: 400 });
    assert.equal(attempt(limiter, { ip: 'c' }).passed, true);
  });
});
