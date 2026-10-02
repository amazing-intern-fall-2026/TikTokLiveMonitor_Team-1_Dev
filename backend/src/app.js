const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');
const { corsOrigins } = require('./config/env');

const app = express();

// [CLAUDE EDIT 2026-10-02] Code gốc của Hdat-th (bddca39), giữ lại để tham khảo.
// Lý do sửa: cors() mặc định cho mọi origin; giới hạn theo CORS_ORIGINS (env.js).
// app.use(cors());
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
