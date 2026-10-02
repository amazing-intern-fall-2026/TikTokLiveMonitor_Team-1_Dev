import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';

/**
 * E2E against a running stack (docker compose up, frontend :5173, backend :5000).
 *
 *   E2E_ADMIN_PASSWORD=<ADMIN_PASSWORD> E2E_GAME_CLIENT_SECRET=<GAME_CLIENT_SECRET> \
 *     npx playwright test tests/e2e/full-flow.spec.js --workers=1
 *
 * No real TikTok LIVE is needed: events come from /api/test-events (dev only).
 * What this does NOT cover (needs a real LIVE + persisted session): the report
 * for a session that was actually recorded, see docs/demo/verification.md.
 * Set E2E_EXPECT_SESSION=1 if the DB already holds a closed session.
 */
const BACKEND_URL = process.env.E2E_BACKEND_URL || 'http://localhost:5000';
const USERNAME = process.env.E2E_ADMIN_USERNAME || 'operator';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';
const GAME_SECRET = process.env.E2E_GAME_CLIENT_SECRET || '';

test.skip(!PASSWORD || !GAME_SECRET, 'set E2E_ADMIN_PASSWORD and E2E_GAME_CLIENT_SECRET');

async function login(page, password = PASSWORD) {
  await page.goto('/');
  await page.locator('input[type="text"]').fill(USERNAME);
  await page.locator('input[type="password"]').fill(password);
  await page.click('button[type="submit"]');
}

test.describe('E2E: Login -> Rules -> Effect -> Ack -> Kill Switch -> History', () => {
  let gameSocket;
  const received = [];

  test.beforeAll(async ({ request }) => {
    // NFR-SEC-02: the /game namespace needs a game_client JWT from POST /api/auth/game-token.
    const tokenRes = await request.post(`${BACKEND_URL}/api/auth/game-token`, { data: { clientSecret: GAME_SECRET } });
    expect(tokenRes.ok(), 'game-token request').toBeTruthy();
    const { token } = await tokenRes.json();

    gameSocket = io(`${BACKEND_URL}/game`, { transports: ['websocket'], auth: { token }, reconnection: false });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Game socket connect timeout')), 5000);
      gameSocket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      gameSocket.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const ack = (cmd) => gameSocket.emit('EFFECT_ACK', { commandId: cmd.commandId, status: 'APPLIED' });
    gameSocket.on('EFFECT_COMMAND', (cmd) => {
      received.push(cmd.effectCode);
      ack(cmd);
    });
    gameSocket.on('CLEAR_ALL_EFFECTS', (cmd) => {
      received.push('CLEAR_ALL_EFFECTS');
      ack(cmd);
    });
  });

  test.afterAll(() => {
    gameSocket?.disconnect();
  });

  test('wrong password is rejected, then a real login reaches the dashboard', async ({ page }) => {
    await login(page, 'definitely-not-the-password');
    await expect(page.locator('.alert-error')).toBeVisible();
    await expect(page.locator('.main-area')).toHaveCount(0);

    await login(page);
    await expect(page.locator('.main-area')).toBeVisible();
  });

  test('rule -> EFFECT_COMMAND -> Game ack shown on the dashboard, then Kill Switch and history', async ({ page }) => {
    await login(page);
    await expect(page.locator('.main-area')).toBeVisible();

    // FR-22: rule screen lists the seeded rules from the API (not hard-coded data).
    await page.locator('.sidebar-nav, nav').getByText('Gift Rules').first().click();
    await expect(page.locator('.rule-item').first()).toBeVisible();
    expect(await page.locator('.rule-item').count()).toBeGreaterThanOrEqual(4);
    await page.locator('.sidebar-nav, nav').getByText('Dashboard').first().click();

    // Own rule per run (unique keyword + effectCode, no cooldown): independent of the seeded rules'
    // cooldown/counters and of effect history left by earlier runs. Deleted again in `finally`.
    const token = await page.evaluate(() => localStorage.getItem('jwt_token'));
    const auth = { Authorization: `Bearer ${token}` };
    const stamp = Date.now();
    const keyword = `e2e${stamp}`;
    const effectCode = `E2E_FX_${stamp}`;
    const created = await page.request.post(`${BACKEND_URL}/api/rules`, {
      headers: auth,
      data: {
        name: `e2e-${stamp}`,
        eventType: 'CHAT',
        condition: {
          condition: { keywords: [keyword], matchMode: 'ANY' },
          threshold: { metric: 'EVENT_COUNT', value: 1, window: { type: 'ROLLING', seconds: 5 } },
        },
        effect: { effectCode, polarity: 'BUFF', target: 'ALL_CHARACTERS', magnitude: 1, durationMs: 1000, priority: 1, cooldownMs: 0 },
        isActive: true,
      },
    });
    expect(created.status()).toBe(201);
    const ruleId = (await created.json()).id;

    try {
      const chat = await page.request.post(`${BACKEND_URL}/api/test-events/chat`, {
        data: { comment: keyword, userId: `e2e_${stamp}`, uniqueId: `e2e_${stamp}` },
      });
      expect(chat.ok()).toBeTruthy();

      // The Game receives the command and acks it ...
      await expect.poll(() => received.includes(effectCode), { timeout: 10000 }).toBeTruthy();
      // ... BR-EFF-03: and the dashboard shows that very command as APPLIED.
      await page.getByRole('tab', { name: /Effect/ }).click();
      await expect(page.locator('.effect-row').filter({ hasText: effectCode })).toContainText('Đã áp dụng', { timeout: 10000 });
      await expect(page.locator('.effect-strip')).toContainText('Áp dụng');
    } finally {
      await page.request.delete(`${BACKEND_URL}/api/rules/${ruleId}`, { headers: auth });
    }

    // FR-33: Kill Switch (browser alert is the UI's confirmation) clears effects on the Game and pauses new ones.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /kill switch/i }).click();
    await expect.poll(() => received.includes('CLEAR_ALL_EFFECTS'), { timeout: 5000 }).toBeTruthy();
    await expect(page.locator('.pause-status-badge')).toContainText('TẠM DỪNG');
    const status = await (await page.request.get(`${BACKEND_URL}/api/effects/status`)).json();
    expect(status.paused).toBe(true);

    await expect(page.locator('.effect-row').filter({ hasText: 'KILL SWITCH' }).first()).toContainText('Đã áp dụng', { timeout: 5000 });

    // Leave the stack as found: resume effects.
    const resume = await page.request.post(`${BACKEND_URL}/api/effects/resume`, { headers: auth });
    expect(resume.ok()).toBeTruthy();

    // FR-37/38: history modal opens and finishes loading; with a closed session its CSV downloads.
    // Set E2E_EXPECT_SESSION=1 when the DB is known to hold one (otherwise only the empty state is accepted).
    await page.getByRole('button', { name: /lịch sử phiên/i }).click();
    await expect(page.locator('.modal-overlay')).toBeVisible();
    await expect(page.getByText('Đang tải...')).toHaveCount(0, { timeout: 10000 });
    const csvBtn = page.getByRole('button', { name: /csv/i }).first();
    if (process.env.E2E_EXPECT_SESSION) {
      await expect(csvBtn).toBeVisible();
    }
    if (await csvBtn.isVisible()) {
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), csvBtn.click()]);
      expect(download.suggestedFilename()).toMatch(/^session-.+\.csv$/i);
    } else {
      await expect(page.getByText('Chưa có phiên nào đã đóng')).toBeVisible();
    }
  });

  test('connecting to a handle that is not LIVE shows an error and does not break the dashboard', async ({ page }) => {
    await login(page);
    await expect(page.locator('.main-area')).toBeVisible();
    await page.getByPlaceholder('Nhập TikTok username...').fill('zz_e2e_nolive_0000');
    await page.getByRole('button', { name: 'Kết nối', exact: true }).click();
    await expect(page.locator('.page-alert')).toBeVisible({ timeout: 40000 });
    await expect(page.locator('header .status-text')).not.toContainText('LIVE Connected');
    await expect(page.getByRole('button', { name: 'Kết nối', exact: true })).toBeEnabled();
  });
});

// [CLAUDE EDIT 2026-10-02] Code gốc của hao (ee5e11f), giữ lại để tham khảo.
// Lý do sửa: bản gốc không chạy được với hệ thống hiện tại -- đăng nhập admin/admin123 (không khớp
// ADMIN_PASSWORD), nối /game không token (bị MISSING_TOKEN từ NFR-SEC-02), bước "kết nối streamer_test"
// cần LIVE thật, và nhiều assertion luôn đúng (vd afterKillData.success). Bản mới dùng token thật và
// assert đúng trạng thái.
//
// import { test, expect } from '@playwright/test';
// import { io } from 'socket.io-client';
//
// const BACKEND_URL = 'http://localhost:5000';
//
// test.describe('E2E Lifecycle: Login -> Connect -> Rule -> Command -> Ack -> Kill Switch -> Export CSV', () => {
//   let gameSocket;
//
//   test.beforeAll(async () => {
//     // Giả lập Game Engine Client kết nối tới namespace /game
//     gameSocket = io(`${BACKEND_URL}/game`, {
//       transports: ['websocket'],
//       reconnection: false,
//     });
//
//     await new Promise((resolve, reject) => {
//       const timer = setTimeout(() => reject(new Error('Game Socket timeout kết nối')), 5000);
//       gameSocket.on('connect', () => {
//         clearTimeout(timer);
//         resolve();
//       });
//     });
//
//     // Lắng nghe EFFECT_COMMAND và tự động gửi phản hồi EFFECT_ACK
//     gameSocket.on('EFFECT_COMMAND', (cmd) => {
//       if (cmd && cmd.commandId) {
//         gameSocket.emit('EFFECT_ACK', {
//           commandId: cmd.commandId,
//           status: 'APPLIED',
//         });
//       }
//     });
//
//     gameSocket.on('CLEAR_ALL_EFFECTS', (cmd) => {
//       if (cmd && cmd.commandId) {
//         gameSocket.emit('EFFECT_ACK', {
//           commandId: cmd.commandId,
//           status: 'APPLIED',
//         });
//       }
//     });
//   });
//
//   test.afterAll(() => {
//     if (gameSocket && gameSocket.connected) {
//       gameSocket.disconnect();
//     }
//   });
//
//   test('Thực thi trọn vẹn luồng E2E', async ({ page }) => {
//     // 1. LOGIN
//     await page.goto('/');
//     await page.locator('input[type="text"]').fill('admin');
//     await page.locator('input[type="password"]').fill('admin123');
//     await page.click('button[type="submit"]');
//
//     // Chờ vào giao diện Dashboard chính
//     await expect(page.locator('.main-area')).toBeVisible();
//
//     // 2. CONNECT TIKTOK ROOM
//     const roomInput = page.locator('header input[type="text"], .control-panel input[type="text"]').first();
//     await roomInput.fill('streamer_test');
//     const connectBtn = page.getByRole('button', { name: /kết nối/i });
//     await connectBtn.click();
//
//     // 3. NAVIGATE TO RULES & VERIFY
//     const rulesNav = page.locator('.sidebar-nav, nav').getByText(/rule|quy tắc/i).first();
//     await rulesNav.click();
//     await expect(page.locator('.tk-rules-view, .rule-view-container, .rule-list').first()).toBeVisible();
//
//     // Quay lại màn hình điều khiển chính
//     const dashboardNav = page.locator('.sidebar-nav, nav').getByText(/dashboard|tổng quan|giám sát/i).first();
//     if (await dashboardNav.isVisible()) {
//       await dashboardNav.click();
//     }
//
//     // 4 & 5. TRIGGER EFFECT COMMAND & VERIFY EFFECT ACK
//     const triggerGiftRes = await page.request.post(`${BACKEND_URL}/api/test-events/gift`, {
//       data: {
//         giftName: 'Sư Tử',
//         diamondCount: 1000,
//         repeatCount: 1,
//       },
//     });
//     expect(triggerGiftRes.ok()).toBeTruthy();
//
//     const statusRes = await page.request.get(`${BACKEND_URL}/api/effects/status`);
//     expect(statusRes.ok()).toBeTruthy();
//
//     // 6. PAUSE / KILL SWITCH
//     const killSwitchBtn = page.getByRole('button', { name: /kill switch/i });
//     await killSwitchBtn.click();
//
//     const afterKillRes = await page.request.get(`${BACKEND_URL}/api/effects/status`);
//     const afterKillData = await afterKillRes.json();
//     expect(afterKillData.paused === true || afterKillData.status === 'PAUSED' || afterKillData.success).toBeTruthy();
//
//     // 7. EXPORT CSV
//     const historyBtn = page.getByRole('button', { name: /lịch sử phiên/i });
//     await historyBtn.click();
//
//     const modal = page.locator('.modal-body, .session-history-modal, table');
//     await expect(modal.first()).toBeVisible();
//
//     const csvBtn = page.getByRole('button', { name: /csv/i }).first();
//     if (await csvBtn.isVisible()) {
//       const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
//       await csvBtn.click();
//       const download = await downloadPromise;
//
//       if (download) {
//         expect(download.suggestedFilename()).toMatch(/\.csv$/i);
//       }
//     }
//   });
// });
//
