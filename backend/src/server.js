const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const { port } = require('./config/env');

const registerSocketHandlers = require('./sockets/socket.handler');
const { initializeSocket } = require('./sockets/socket.service');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

initializeSocket(io);
registerSocketHandlers(io);

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});