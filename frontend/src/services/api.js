// frontend/src/services/api.js
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

async function request(endpoint, options = {}) {
  const res = await fetch(`${BACKEND_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Lỗi HTTP: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // 1. Quản lý phòng Live (FR-01 -> FR-08)
  connectRoom: (username) =>
    request('/api/livestream/connect', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  disconnectRoom: () =>
    request('/api/livestream/disconnect', {
      method: 'POST',
    }),

  getHealth: () => request('/health'),

  // 2. Kill-Switch: Dừng khẩn cấp toàn bộ effect Game (FR-33, BR-EFF-04)
  triggerKillSwitch: () =>
    request('/api/effects/kill-switch', {
      method: 'POST',
    }),

  // 3. Mock Test Suite khớp chính xác với testEvent.routes.js của Thiên Tài (FR-31)
  sendMockChat: (comment = 'GO', username = 'tester_vn', nickname = 'Khán Giả Test') =>
    request('/api/test-events/chat', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'mock_usr_' + Date.now(),
        username,
        nickname,
        comment,
        createTime: Date.now(),
      }),
    }),

  sendMockGift: (giftName = 'Hoa Hồng', repeatCount = 1, diamondCount = 1, repeatEnd = true) =>
    request('/api/test-events/gift', {
      method: 'POST',
      body: JSON.stringify({
        userId: 'mock_vip_' + Date.now(),
        username: 'dai_gia_test',
        nickname: 'Đại Gia',
        giftId: 'gift_' + giftName.toLowerCase().replace(/\s+/g, '_'),
        giftName,
        repeatCount,
        diamondCount,
        repeatEnd, // Tuân thủ BR-GF-01: Chỉ chốt điểm khi chuỗi kết thúc
        createTime: Date.now(),
      }),
    }),

  sendMockMemberJoin: (viewerCount = 100) =>
    request('/api/test-events/member-join', {
      method: 'POST',
      body: JSON.stringify({
        viewerCount,
        createTime: Date.now(),
      }),
    }),
};