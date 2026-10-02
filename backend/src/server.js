const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
// [CLAUDE EDIT 2026-10-02] Thêm corsOrigins (code gốc: const { port } = require('./config/env');).
const { port, corsOrigins } = require('./config/env');
const { makeLogger } = require('./utils/logger');

const registerSocketHandlers = require('./sockets/socket.handler');
const { initializeSocket } = require('./sockets/socket.service');
const ruleEngine = require('./services/RuleEngine.service');
const eventBatch = require('./services/eventBatch.service');
const retention = require('./services/retention.service');
const effectAck = require('./services/effectAck.service');

const logger = makeLogger('server');

const server = http.createServer(app);

// [CLAUDE EDIT 2026-10-02] Code gốc của TaiXN (e365800), giữ lại để tham khảo.
// Lý do sửa: origin '*' cho mọi trang web mở /monitor; dùng chung CORS_ORIGINS với REST (env.js).
// const io = new Server(server, {
//   cors: {
//     origin: '*'
//   }
// });
const io = new Server(server, {
  cors: {
    origin: corsOrigins,
  },
});

initializeSocket(io);
registerSocketHandlers(io);
ruleEngine.init();
eventBatch.init();
retention.init();
effectAck.init();

server.listen(port, () => {
  logger.info(`Server is running on http://localhost:${port}`);
});