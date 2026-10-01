const { Router } = require('express');
const ruleController = require('../controllers/rule.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = Router();

// NFR-SEC-01: rules decide which effects fire on the live stream -- operator only.
router.use(requireAuth);

router.get('/', ruleController.list);
router.post('/', ruleController.create);
router.get('/:id', ruleController.getById);
router.put('/:id', ruleController.update);
router.patch('/:id/enable', ruleController.setEnabled);
router.delete('/:id', ruleController.remove);

module.exports = router;
