const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const { port } = require('./config/env');
const { makeLogger } = require('./utils/logger');

const registerSocketHandlers = require('./sockets/socket.handler');
const { initializeSocket } = require('./sockets/socket.service');
const ruleEngine = require('./services/RuleEngine.service');

const logger = makeLogger('server');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

initializeSocket(io);
registerSocketHandlers(io);
ruleEngine.init();

server.listen(port, () => {
  logger.info(`Server is running on http://localhost:${port}`);
});