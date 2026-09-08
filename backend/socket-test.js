const { io } = require('socket.io-client');

const socket = io('http://localhost:5000');

socket.on('connect', () => {
  console.log('Connected to server:', socket.id);
});

socket.on('CHAT', (data) => {
  console.log('CHAT received:', data);
});

socket.on('GIFT', (data) => {
  console.log('GIFT received:', data);
});

socket.on('MEMBER_JOIN', (data) => {
  console.log('MEMBER_JOIN received:', data);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});