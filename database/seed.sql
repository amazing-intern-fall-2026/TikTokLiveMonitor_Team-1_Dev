-- Sample seed data for local development

INSERT INTO live_streams (host_username, title, viewer_count)
VALUES ('sample_host', 'Sample live stream', 0);

-- Sample rules for RuleEngine.service.js, adapted from the sample rule set
-- in SRS section 6.3 (R-01, R-04, R-06). `condition` holds both the SRS
-- trigger.condition and trigger.threshold (the table only has one JSONB
-- column for both); `effect` holds the SRS effect object plus cooldownMs/
-- maxTriggersPerSession/resetMode (same reason). event_type uses this
-- table's own naming (CHAT/GIFT/JOIN), not the Envelope's (COMMENT/GIFT/JOIN)
-- -- RuleEngine.service.js translates between the two.
-- Keywords ("heal"/"slow") and gift amounts are deliberately picked to match
-- the frontend's MOCK DEV TOOLS buttons ("+ Chat "!HEAL"", "+ Chat "!SLOW"",
-- "+ Quà Boss 1000💎") so clicking them visibly drives the Rule Engine.
INSERT INTO rules (name, event_type, condition, effect, is_active) VALUES
(
  'Bao comment - HEAL',
  'CHAT',
  '{"condition": {"keywords": ["heal"], "matchMode": "ANY"}, "threshold": {"metric": "EVENT_COUNT", "value": 3, "window": {"type": "ROLLING", "seconds": 30}}}',
  '{"effectCode": "HEAL_HP", "polarity": "BUFF", "target": "ALL_CHARACTERS", "magnitude": 1.2, "durationMs": 8000, "priority": 5, "cooldownMs": 10000, "maxTriggersPerSession": 5, "resetMode": "RESET_ZERO"}',
  TRUE
),
(
  'Bao comment - SLOW',
  'CHAT',
  '{"condition": {"keywords": ["slow"], "matchMode": "ANY"}, "threshold": {"metric": "EVENT_COUNT", "value": 3, "window": {"type": "ROLLING", "seconds": 30}}}',
  '{"effectCode": "SLOW_DOWN", "polarity": "DEBUFF", "target": "ALL_CHARACTERS", "magnitude": 0.7, "durationMs": 8000, "priority": 5, "cooldownMs": 10000, "maxTriggersPerSession": 5, "resetMode": "RESET_ZERO"}',
  TRUE
),
(
  'Qua tang tich luy',
  'GIFT',
  '{"condition": {}, "threshold": {"metric": "DIAMOND_VALUE", "value": 100, "window": {"type": "SESSION"}}}',
  '{"effectCode": "POWER_UP", "polarity": "BUFF", "target": "ALL_CHARACTERS", "magnitude": 1.5, "durationMs": 15000, "priority": 8, "cooldownMs": 20000, "resetMode": "SUBTRACT_THRESHOLD"}',
  TRUE
),
(
  'Moc nguoi xem',
  'JOIN',
  '{"condition": {}, "threshold": {"metric": "UNIQUE_USER_COUNT", "value": 3, "window": {"type": "SESSION"}}}',
  '{"effectCode": "SHIELD", "polarity": "BUFF", "target": "ALL_CHARACTERS", "magnitude": 1, "durationMs": 10000, "priority": 3, "cooldownMs": 15000, "resetMode": "RESET_ZERO"}',
  TRUE
);
