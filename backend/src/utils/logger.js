/**
 * FR-40: Structured logger.
 * In development (NODE_ENV !== 'production') emits human-readable lines;
 * in production emits newline-delimited JSON so log aggregators can parse them.
 *
 * Log level is controlled by the LOG_LEVEL env var (error|warn|info|debug).
 * Defaults to 'debug' in development, 'info' in production.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const isProd = process.env.NODE_ENV === 'production';
const configuredLevelStr = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');
const configuredLevelNum = LEVELS[configuredLevelStr] ?? LEVELS.info;

function write(level, module, message, meta) {
  const ts = new Date().toISOString();
  const line = isProd
    ? JSON.stringify({ ts, level, module, message, ...(meta || {}) })
    : `${ts} [${level.toUpperCase().padEnd(5)}] [${module}] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`;

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function makeLogger(module) {
  return {
    error: (message, meta) => {
      if (configuredLevelNum >= LEVELS.error) write('error', module, message, meta);
    },
    warn: (message, meta) => {
      if (configuredLevelNum >= LEVELS.warn) write('warn', module, message, meta);
    },
    info: (message, meta) => {
      if (configuredLevelNum >= LEVELS.info) write('info', module, message, meta);
    },
    debug: (message, meta) => {
      if (configuredLevelNum >= LEVELS.debug) write('debug', module, message, meta);
    },
  };
}

module.exports = { makeLogger };
