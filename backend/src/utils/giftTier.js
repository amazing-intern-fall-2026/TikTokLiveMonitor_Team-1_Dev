/**
 * Placeholder tier thresholds. SRS BR-GF-04 calls for these to be
 * Admin-configurable without a deploy; that config system is out of scope
 * for this task, so thresholds are hardcoded here for now.
 */
const TIER_THRESHOLDS = [
  { max: 99, tier: 'SMALL' },
  { max: 499, tier: 'MEDIUM' },
  { max: 1999, tier: 'LARGE' },
];

function getGiftTier(totalDiamondValue) {
  const match = TIER_THRESHOLDS.find((t) => totalDiamondValue <= t.max);
  return match ? match.tier : 'EPIC';
}

module.exports = { getGiftTier };
