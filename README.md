# tiktok-live-monitor

## Cấu trúc dự án

```
tiktok-live-monitor/
├── frontend/     # React (Vite)
├── backend/      # Node.js + Express
├── database/     # schema.sql, seed.sql
├── docs/         # architecture, api, database docs
└── docker-compose.yml
```

## Chạy dự án

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend chạy tại `http://localhost:5000` (health check: `GET /health`).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend chạy tại `http://localhost:5173`.

### Docker Compose (tùy chọn)

```bash
docker compose up --build
```

## Demo cuối và nghiệm thu

- [Kịch bản demo](docs/demo/final-demo.md)
- [Rà soát bảo mật CSV](docs/demo/csv-security-review.md)
- [Kết quả kiểm tra](docs/demo/verification.md)
