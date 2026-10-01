const ruleRepository = require('../repositories/rule.repository');
const ruleEngine = require('../services/RuleEngine.service');
const { validateRuleBody } = require('../utils/ruleValidator');

const MAX_INT4 = 2147483647;

/** Returns the numeric id, or null if the path param isn't a valid positive int4 (rules.id is SERIAL). */
function parseId(raw) {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return id >= 1 && id <= MAX_INT4 ? id : null;
}

function invalidId(res) {
  return res.status(400).json({ message: 'rule id must be a positive integer' });
}

function invalidBody(res, errors) {
  return res.status(400).json({ message: errors.join('; '), errors });
}

const notFound = (res) => res.status(404).json({ message: 'Rule not found' });

/** GET /api/rules[?isActive=true|false] */
async function list(req, res) {
  const { isActive } = req.query;
  if (isActive !== undefined && isActive !== 'true' && isActive !== 'false') {
    return res.status(400).json({ message: 'isActive must be "true" or "false"' });
  }
  const rules = await ruleRepository.findAll({ isActive: isActive === undefined ? undefined : isActive === 'true' });
  res.json(rules);
}

async function getById(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalidId(res);
  const rule = await ruleRepository.findById(id);
  if (!rule) return notFound(res);
  res.json(rule);
}

async function create(req, res) {
  const { errors, value } = validateRuleBody(req.body);
  if (errors.length > 0) return invalidBody(res, errors);

  const rule = await ruleRepository.create(value);
  await ruleEngine.reload();
  res.status(201).json(rule);
}

async function update(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalidId(res);
  const { errors, value } = validateRuleBody(req.body);
  if (errors.length > 0) return invalidBody(res, errors);

  const rule = await ruleRepository.update(id, value);
  if (!rule) return notFound(res);
  await ruleEngine.reload();
  res.json(rule);
}

/** PATCH /api/rules/:id/enable  body: { "enabled": true | false } -- enables or disables without touching the rest of the rule. */
async function setEnabled(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalidId(res);
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ message: 'body must be {"enabled": true|false}' });
  }

  const rule = await ruleRepository.setActive(id, enabled);
  if (!rule) return notFound(res);
  await ruleEngine.reload();
  res.json(rule);
}

async function remove(req, res) {
  const id = parseId(req.params.id);
  if (!id) return invalidId(res);
  const deleted = await ruleRepository.softDelete(id);
  if (!deleted) return notFound(res);
  await ruleEngine.reload();
  res.status(204).end();
}

module.exports = { list, getById, create, update, setEnabled, remove };
