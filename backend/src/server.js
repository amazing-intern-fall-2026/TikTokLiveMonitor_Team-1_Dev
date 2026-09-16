const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const { port } = require('./config/env');

const registerSocketHandlers = require('./sockets/socket.handler');
const { initializeSocket } = require('./sockets/socket.service');
const ruleEngine = require('./services/RuleEngine.service');

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
  console.log(`Server is running on http://localhost:${port}`);
});