const fs = require('fs');
const path = require('path');
const { makeLogger } = require('./logger');

const logger = makeLogger('giftTier');

const CONFIG_PATH = path.resolve(__dirname, '../config/giftTiers.json');

/**
 * Fallback used only if giftTiers.json is missing or malformed, so a bad
 * edit to the config never breaks the GIFT pipeline (fail open).
 */
const FALLBACK_CONFIG = {
  tiers: [
    { max: 99, tier: 'SMALL' },
    { max: 499, tier: 'MEDIUM' },
    { max: 1999, tier: 'LARGE' },
  ],
  defaultTier: 'EPIC',
};

/**
 * BR-GF-04: tier thresholds are Admin-configurable without a deploy, so this
 * re-reads giftTiers.json from disk on every call (no require() caching) --
 * an edit to the file takes effect on the very next gift.
 */
function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.tiers) || !parsed.defaultTier) {
      throw new Error('giftTiers.json must have a "tiers" array and a "defaultTier"');
    }
    return parsed;
  } catch (err) {
    logger.error('Failed to load giftTiers.json, falling back to defaults', { error: err.message });
    return FALLBACK_CONFIG;
  }
}

function getGiftTier(totalDiamondValue) {
  const { tiers, defaultTier } = loadConfig();
  const match = tiers.find((t) => totalDiamondValue <= t.max);
  return match ? match.tier : defaultTier;
}

module.exports = { getGiftTier };
