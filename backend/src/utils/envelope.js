const crypto = require('crypto');

/**
 * v1.0 only ever monitors a single LIVE room at a time (SRS AS-01), so a
 * single module-level session/seq counter stands in for a real session
 * store until session management (FR-03) exists.
 */
const sessionId = `session_${Date.now()}`;
let seq = 0;

function nextSeq() {
  seq += 1;
  return seq;
}

/**
 * Wraps a normalized event payload in the SRS section 4.1 Envelope shape
 * shared by every event type (COMMENT | JOIN | GIFT).
 */
function wrapEnvelope({ type, roomId, user, payload, sourceTimestamp }) {
  const envelope = {
    eventId: crypto.randomUUID(),
    sessionId,
    roomId,
    type,
    receivedAt: new Date().toISOString(),
    user,
    payload,
    seq: nextSeq(),
  };

  if (sourceTimestamp) {
    envelope.sourceTimestamp = sourceTimestamp;
  }

  return envelope;
}

module.exports = { wrapEnvelope };
