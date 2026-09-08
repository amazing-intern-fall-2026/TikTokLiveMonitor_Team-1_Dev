// frontend/src/services/api.js
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

async function request(endpoint, options = {}) {
  const res = await fetch(`${BACKEND_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Lỗi yêu cầu: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // 1. Quản lý kết nối phòng LIVE TikTok
  connectRoom: (username) =>
    request('/api/room/connect', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  disconnectRoom: () =>
    request('/api/room/disconnect', { method: 'POST' }),

  // 2. Dừng khẩn cấp toàn bộ effect (Kill Switch)
  triggerKillSwitch: () =>
    request('/api/effects/kill-switch', { method: 'POST' }),

  // 3. Công cụ giả lập sự kiện (Mocking Tool)
  sendMockComment: (commentText = 'GO', uniqueId = 'tester_01') =>
    request('/api/mock/event', {
      method: 'POST',
      body: JSON.stringify({
        type: 'COMMENT',
        user: { uniqueId, nickname: 'Người Test' },
        payload: { text: commentText, containsKeywords: [commentText.toUpperCase()] },
      }),
    }),

  sendMockGift: (giftName = 'Hoa Hồng', diamond = 10, repeatCount = 1) =>
    request('/api/mock/event', {
      method: 'POST',
      body: JSON.stringify({
        type: 'GIFT',
        user: { uniqueId: 'vip_tester', nickname: 'Đại Gia Test' },
        payload: {
          giftName,
          unitDiamondValue: diamond,
          repeatCount,
          totalDiamondValue: diamond * repeatCount,
          isStreakFinished: true,
          giftTier: diamond * repeatCount >= 1000 ? 'LARGE' : 'SMALL',
        },
      }),
    }),

  sendMockJoin: (uniqueId = 'new_viewer') =>
    request('/api/mock/event', {
      method: 'POST',
      body: JSON.stringify({
        type: 'JOIN',
        user: { uniqueId, nickname: 'Khán Giả Mới' },
        payload: { isFirstJoinInSession: true, joinCountInSession: 1 },
      }),
    }),
};