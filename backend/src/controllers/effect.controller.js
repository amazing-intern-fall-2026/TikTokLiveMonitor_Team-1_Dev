const crypto = require('crypto');
const { broadcastGameCommand } = require('../sockets/socket.service');
const effectCommandRepository = require('../repositories/effectCommand.repository');
const liveStreamService = require('../services/liveStream.service');
const ruleEngine = require('../services/RuleEngine.service');
const { makeLogger } = require('../utils/logger');

const logger = makeLogger('effect');

/**
 * FR-33 / BR-EFF-04: immediately clears every effect currently running on
 * the Game Client, bypassing the (not-yet-built) Rule Engine queue entirely.
 * Broadcasting is the operation that matters for the demo; persistence is
 * best-effort logging (FR-40) and must never block or fail the response.
 */
async function killSwitch(req, res) {
  const payload = {
    commandId: crypto.randomUUID(),
    type: 'CLEAR_ALL_EFFECTS',
    issuedAt: new Date().toISOString(),
  };

  broadcastGameCommand('CLEAR_ALL_EFFECTS', payload);

  effectCommandRepository
    .create({ sessionId: liveStreamService.getCurrentSessionId(), payload, status: 'SENT' })
    .catch((err) => {
      logger.error('Failed to log kill-switch command', { error: err.message });
    });

  res.json(payload);
}

/**
 * FR-32: "Tạm dừng effect" -- unlike killSwitch(), this does NOT touch
 * effects already running on the Game Client (that's what the kill switch
 * is for). It only flips RuleEngine's gate so no *new* EffectCommand gets
 * queued; data collection/display keeps running untouched. Broadcasts
 * EFFECT_PAUSE_STATE on /monitor so every open dashboard reflects the
 * state immediately (see RuleEngine.service.js#setEffectsPaused).
 */
function pauseEffects(req, res) {
  const paused = ruleEngine.setEffectsPaused(true);
  res.json({ paused });
}

function resumeEffects(req, res) {
  const paused = ruleEngine.setEffectsPaused(false);
  res.json({ paused });
}

/** Lets a freshly-opened dashboard (or a page refresh) learn the current pause state without waiting for the next EFFECT_PAUSE_STATE broadcast. */
function getEffectStatus(req, res) {
  res.json({ paused: ruleEngine.isEffectsPaused() });
}

module.exports = { killSwitch, pauseEffects, resumeEffects, getEffectStatus };