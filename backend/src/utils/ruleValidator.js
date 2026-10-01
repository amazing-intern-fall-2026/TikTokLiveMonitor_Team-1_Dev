const EVENT_TYPES = ['CHAT', 'GIFT', 'JOIN'];
const METRICS = ['EVENT_COUNT', 'UNIQUE_USER_COUNT', 'DIAMOND_VALUE'];
const WINDOW_TYPES = ['SESSION', 'ROLLING'];
const MATCH_MODES = ['ANY', 'ALL'];
const RESET_MODES = ['RESET_ZERO', 'SUBTRACT_THRESHOLD'];
const POLARITIES = ['BUFF', 'DEBUFF'];

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPositiveNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Checks `rules.condition` -- shape: { condition: {keywords, matchMode, userFilter, giftId, giftTier}, threshold: {metric, value, window} } (see RuleEngine.matchCondition). */
function validateCondition(condition, errors) {
  if (!isPlainObject(condition)) {
    errors.push('condition must be an object');
    return;
  }

  const inner = condition.condition;
  if (inner !== undefined) {
    if (!isPlainObject(inner)) {
      errors.push('condition.condition must be an object');
    } else {
      if (
        inner.keywords !== undefined &&
        (!Array.isArray(inner.keywords) || !inner.keywords.every((k) => typeof k === 'string' && k.trim()))
      ) {
        errors.push('condition.condition.keywords must be an array of non-empty strings');
      }
      if (inner.matchMode !== undefined && !MATCH_MODES.includes(inner.matchMode)) {
        errors.push(`condition.condition.matchMode must be one of ${MATCH_MODES.join(', ')}`);
      }
    }
  }

  const threshold = condition.threshold;
  if (!isPlainObject(threshold)) {
    errors.push('condition.threshold must be an object');
    return;
  }
  if (!METRICS.includes(threshold.metric)) {
    errors.push(`condition.threshold.metric must be one of ${METRICS.join(', ')}`);
  }
  if (!isPositiveNumber(threshold.value)) {
    errors.push('condition.threshold.value must be a positive number');
  }
  if (threshold.window !== undefined) {
    if (!isPlainObject(threshold.window) || !WINDOW_TYPES.includes(threshold.window.type)) {
      errors.push(`condition.threshold.window.type must be one of ${WINDOW_TYPES.join(', ')}`);
    } else if (
      threshold.window.type === 'ROLLING' &&
      threshold.window.seconds !== undefined &&
      !isPositiveNumber(threshold.window.seconds)
    ) {
      errors.push('condition.threshold.window.seconds must be a positive number');
    }
  }
}

/** Checks `rules.effect` -- the EffectCommand fields RuleEngine.fireRule copies out (effectCode is config, NFR-MNT-01, so it is not restricted to a fixed list). */
function validateEffect(effect, errors) {
  if (!isPlainObject(effect)) {
    errors.push('effect must be an object');
    return;
  }
  if (typeof effect.effectCode !== 'string' || !effect.effectCode.trim()) {
    errors.push('effect.effectCode must be a non-empty string');
  }
  if (effect.polarity !== undefined && !POLARITIES.includes(effect.polarity)) {
    errors.push(`effect.polarity must be one of ${POLARITIES.join(', ')}`);
  }
  if (effect.target !== undefined && typeof effect.target !== 'string') {
    errors.push('effect.target must be a string');
  }
  if (effect.magnitude !== undefined && !(typeof effect.magnitude === 'number' && Number.isFinite(effect.magnitude))) {
    errors.push('effect.magnitude must be a number');
  }
  if (effect.durationMs !== undefined && !isPositiveNumber(effect.durationMs)) {
    errors.push('effect.durationMs must be a positive number');
  }
  if (effect.priority !== undefined && !Number.isInteger(effect.priority)) {
    errors.push('effect.priority must be an integer');
  }
  if (effect.cooldownMs !== undefined && !(Number.isInteger(effect.cooldownMs) && effect.cooldownMs >= 0)) {
    errors.push('effect.cooldownMs must be a non-negative integer');
  }
  if (
    effect.maxTriggersPerSession !== undefined &&
    !(Number.isInteger(effect.maxTriggersPerSession) && effect.maxTriggersPerSession > 0)
  ) {
    errors.push('effect.maxTriggersPerSession must be a positive integer');
  }
  if (effect.resetMode !== undefined && !RESET_MODES.includes(effect.resetMode)) {
    errors.push(`effect.resetMode must be one of ${RESET_MODES.join(', ')}`);
  }
}

/**
 * Validates a create/update body. Accepts `eventType` (or the column name
 * `event_type`). Returns { errors, value } -- `value` is the normalized
 * { name, eventType, condition, effect, isActive } when errors is empty.
 */
function validateRuleBody(body) {
  const errors = [];
  if (!isPlainObject(body)) {
    return { errors: ['request body must be a JSON object'] };
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 255) {
    errors.push('name must be a non-empty string of at most 255 characters');
  }

  const eventType = body.eventType ?? body.event_type;
  if (!EVENT_TYPES.includes(eventType)) {
    errors.push(`eventType must be one of ${EVENT_TYPES.join(', ')}`);
  }

  validateCondition(body.condition, errors);
  validateEffect(body.effect, errors);

  const isActive = body.isActive ?? body.is_active;
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    errors.push('isActive must be a boolean');
  }

  if (errors.length > 0) {
    return { errors };
  }
  return { errors, value: { name, eventType, condition: body.condition, effect: body.effect, isActive } };
}

module.exports = { validateRuleBody };
