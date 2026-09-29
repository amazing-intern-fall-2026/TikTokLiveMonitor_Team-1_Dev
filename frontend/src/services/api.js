// frontend/src/services/api.js
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Khoá lưu JWT của Operator trong localStorage -- dùng chung với App.jsx
// (App import hằng này, không tự khai báo lại) để 2 nơi không bao giờ lệch tên.
export const TOKEN_KEY = 'jwt_token';

// api.js là module thuần, không phải component React nên không tự đổi được
// màn hình. App.jsx đăng ký handleLogout qua hàm này; khi nhận 401 request()
// sẽ gọi lại handler đó để đưa người dùng về màn Login.
let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function request(endpoint, options = {}) {
  const token = readToken();
  // Gộp header thay vì để ...options ghi đè cả object headers.
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${BACKEND_URL}${endpoint}`, { ...options, headers });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    // 401 + đã gửi token = token hết hạn/sai -> tự logout. Không kích hoạt khi
    // request không mang token (chưa đăng nhập), tránh vòng lặp vô nghĩa.
    if (res.status === 401 && token) {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {
        /* localStorage không khả dụng -> vẫn tiếp tục logout ở state */
      }
      if (unauthorizedHandler) unauthorizedHandler();
    }
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

  // 2b. Tạm dừng / tiếp tục phát effect sang Game, KHÔNG xoá effect đang
  // chạy (khác Kill-Switch) -- FR-32. Trạng thái pause thật sự luôn được
  // phát lại qua socket event 'EFFECT_PAUSE_STATE' trên /monitor (xem
  // useLiveSocket.js); 2 hàm dưới chỉ là cách kích hoạt, không tự set state.
  pauseEffects: () =>
    request('/api/effects/pause', {
      method: 'POST',
    }),

  resumeEffects: () =>
    request('/api/effects/resume', {
      method: 'POST',
    }),

  // Trạng thái pause hiện tại -- gọi lúc mở dashboard / F5, để không phải
  // đợi lần EFFECT_PAUSE_STATE broadcast kế tiếp mới biết đang pause hay không.
  getEffectStatus: () => request('/api/effects/status'),

  // 2c. FR-38: Lịch sử phiên -- danh sách phiên ĐÃ ĐÓNG, phân trang.
  getSessions: ({ page = 1, pageSize = 20, room, dateFrom, dateTo } = {}) => {
    const params = new URLSearchParams({ page, pageSize });
    if (room) params.set('room', room);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    return request(`/api/sessions?${params.toString()}`);
  },

  // FR-37: tải báo cáo phiên dạng CSV. KHÔNG dùng request() ở trên vì response
  // là file nhị phân (Content-Type: text/csv), không phải JSON -- fetch thủ
  // công, tự đính Bearer token (giống request()), rồi ép trình duyệt lưu file
  // qua 1 thẻ <a> tạm (window.open/<a href> thường sẽ KHÔNG gửi được header
  // Authorization, nên không dùng được cho route đã yêu cầu xác thực).
  downloadSessionCsv: async (sessionId) => {
    const token = (() => {
      try {
        return localStorage.getItem(TOKEN_KEY);
      } catch {
        return null;
      }
    })();
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/export?format=csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      if (res.status === 401 && token) {
        try {
          localStorage.removeItem(TOKEN_KEY);
        } catch {
          /* localStorage không khả dụng -- vẫn tiếp tục logout ở state */
        }
        if (unauthorizedHandler) unauthorizedHandler();
      }
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || `Lỗi HTTP: ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `session-${sessionId}-report.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

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
        isStreakFinished: repeatEnd, // Tuân thủ BR-GF-01: Chỉ chốt điểm khi chuỗi kết thúc
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