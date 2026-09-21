const LRUSet = require('../utils/lruSet');

/**
 * FR-19: "Sự kiện có eventId đã xử lý sẽ bị bỏ qua, không tính lại vào
 * ngưỡng." In-memory, LRU-bounded so a long session doesn't grow this
 * unboundedly (SRS 4.1's eventId is a UUID v4 per event -- 10k entries is
 * ~360KB, comfortably covers any realistic near-term redelivery window
 * without holding every eventId for the life of the process).
 */
const MAX_TRACKED_EVENT_IDS = 10000;
const seenEventIds = new LRUSet(MAX_TRACKED_EVENT_IDS);

/** Returns true (and does NOT mark it seen) if eventId is missing -- can't dedupe what we can't identify, so fail open rather than silently drop. */
function isDuplicate(eventId) {
  if (!eventId) {
    return false;
  }
  if (seenEventIds.has(eventId)) {
    return true;
  }
  seenEventIds.add(eventId);
  return false;
}

module.exports = { isDuplicate };
