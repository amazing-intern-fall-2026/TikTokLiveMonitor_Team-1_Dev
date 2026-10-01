import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { Server } from '../../backend/node_modules/socket.io/dist/index.js';
let server, io, snapshot;
test.beforeAll(async () => {
  server = createServer();
  io = new Server(server, { cors: { origin: '*' } });
  io.of('/monitor').on('connection', (socket) => socket.emit('LIVE_STATUS', snapshot));
  await new Promise((resolve) => server.listen(5000, resolve));
});
test.afterAll(async () => { await new Promise((resolve) => io.close(resolve)); });
test('header lifecycle, feed retention, reconnect snapshot and history retry', async ({ page }) => {
  snapshot = { status: 'CONNECTED', username: 'demo_host' };
  let historyFails = true;
  await page.addInitScript(() => {
    localStorage.setItem('jwt_token', `x.${btoa(JSON.stringify({ sub: 'demo_operator', exp: 4102444800 }))}.x`);
  });
  await page.route('**/api/**', async (route) => {
    if (route.request().url().includes('/sessions')) {
      await route.fulfill({ status: historyFails ? 503 : 200, json: historyFails ? { message: 'Không tải được lịch sử' } : { sessions: [], total: 0, totalPages: 1 } });
    } else await route.fulfill({ json: { paused: false } });
  });
  await page.goto('/');
  await expect(page.locator('header .status-text')).toHaveText('LIVE Connected @demo_host');
  io.of('/monitor').emit('CHAT', { eventId: 'one', user: { nickname: 'Demo viewer' }, payload: { text: 'hello demo' } });
  await expect(page.getByText('hello demo')).toBeVisible();
  io.of('/monitor').emit('LIVE_STATUS', { status: 'RECONNECTING', username: 'demo_host' });
  await expect(page.locator('header .status-text')).toHaveText('Đang kết nối lại');
  await expect(page.getByText('hello demo')).toBeVisible();
  snapshot = { status: 'ENDED', username: 'demo_host' };
  io.of('/monitor').emit('LIVE_STATUS', snapshot);
  await expect(page.locator('header .status-text')).toHaveText('LIVE đã kết thúc');
  await page.reload();
  await expect(page.locator('header .status-text')).toHaveText('LIVE đã kết thúc');
  await expect(page.getByText('LIVE đã kết thúc. Kết nối phòng để xem phiên mới.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Lịch sử phiên' }).click();
  await expect(page.getByRole('alert')).toContainText('Không tải được lịch sử');
  await expect(page.getByText('Chưa có phiên nào đã đóng')).toHaveCount(0);
  historyFails = false;
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByText('Chưa có phiên nào đã đóng')).toBeVisible();
});
