const crypto = require('crypto');
const { broadcastGameCommand } = require('../sockets/socket.service');
const effectCommandRepository = require('../repositories/effectCommand.repository');
const liveStreamService = require('../services/liveStream.service');
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

module.exports = { killSwitch };
