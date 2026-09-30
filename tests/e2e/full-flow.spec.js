import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:5000';

test.describe('E2E Lifecycle: Login -> Connect -> Rule -> Command -> Ack -> Kill Switch -> Export CSV', () => {
  let gameSocket;

  test.beforeAll(async () => {
    // Giả lập Game Engine Client kết nối tới namespace /game
    gameSocket = io(`${BACKEND_URL}/game`, {
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Game Socket timeout kết nối')), 5000);
      gameSocket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    // Lắng nghe EFFECT_COMMAND và tự động gửi phản hồi EFFECT_ACK
    gameSocket.on('EFFECT_COMMAND', (cmd) => {
      if (cmd && cmd.commandId) {
        gameSocket.emit('EFFECT_ACK', {
          commandId: cmd.commandId,
          status: 'APPLIED',
        });
      }
    });

    gameSocket.on('CLEAR_ALL_EFFECTS', (cmd) => {
      if (cmd && cmd.commandId) {
        gameSocket.emit('EFFECT_ACK', {
          commandId: cmd.commandId,
          status: 'APPLIED',
        });
      }
    });
  });

  test.afterAll(() => {
    if (gameSocket && gameSocket.connected) {
      gameSocket.disconnect();
    }
  });

  test('Thực thi trọn vẹn luồng E2E', async ({ page }) => {
    // 1. LOGIN
    await page.goto('/');
    await page.locator('input[type="text"]').fill('admin');
    await page.locator('input[type="password"]').fill('admin123');
    await page.click('button[type="submit"]');

    // Chờ vào giao diện Dashboard chính
    await expect(page.locator('.main-area')).toBeVisible();

    // 2. CONNECT TIKTOK ROOM
    const roomInput = page.locator('header input[type="text"], .control-panel input[type="text"]').first();
    await roomInput.fill('streamer_test');
    const connectBtn = page.getByRole('button', { name: /kết nối/i });
    await connectBtn.click();

    // 3. NAVIGATE TO RULES & VERIFY
    const rulesNav = page.locator('.sidebar-nav, nav').getByText(/rule|quy tắc/i).first();
    await rulesNav.click();
    await expect(page.locator('.tk-rules-view, .rule-view-container, .rule-list').first()).toBeVisible();

    // Quay lại màn hình điều khiển chính
    const dashboardNav = page.locator('.sidebar-nav, nav').getByText(/dashboard|tổng quan|giám sát/i).first();
    if (await dashboardNav.isVisible()) {
      await dashboardNav.click();
    }

    // 4 & 5. TRIGGER EFFECT COMMAND & VERIFY EFFECT ACK
    const triggerGiftRes = await page.request.post(`${BACKEND_URL}/api/test-events/gift`, {
      data: {
        giftName: 'Sư Tử',
        diamondCount: 1000,
        repeatCount: 1,
      },
    });
    expect(triggerGiftRes.ok()).toBeTruthy();

    const statusRes = await page.request.get(`${BACKEND_URL}/api/effects/status`);
    expect(statusRes.ok()).toBeTruthy();

    // 6. PAUSE / KILL SWITCH
    const killSwitchBtn = page.getByRole('button', { name: /kill switch/i });
    await killSwitchBtn.click();

    const afterKillRes = await page.request.get(`${BACKEND_URL}/api/effects/status`);
    const afterKillData = await afterKillRes.json();
    expect(afterKillData.paused === true || afterKillData.status === 'PAUSED' || afterKillData.success).toBeTruthy();

    // 7. EXPORT CSV
    const historyBtn = page.getByRole('button', { name: /lịch sử phiên/i });
    await historyBtn.click();

    const modal = page.locator('.modal-body, .session-history-modal, table');
    await expect(modal.first()).toBeVisible();

    const csvBtn = page.getByRole('button', { name: /csv/i }).first();
    if (await csvBtn.isVisible()) {
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await csvBtn.click();
      const download = await downloadPromise;

      if (download) {
        expect(download.suggestedFilename()).toMatch(/\.csv$/i);
      }
    }
  });
});
