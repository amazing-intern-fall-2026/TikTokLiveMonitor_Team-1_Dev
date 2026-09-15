// frontend/src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { api } from './services/api';

const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const MAX_FEED_ITEMS = 200; // Đảm bảo NFR-PERF-05 & FR-13: Tránh tràn RAM tab browser

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'live-events', label: 'Live Events', icon: 'live-events' },
  { key: 'effects', label: 'Effects', icon: 'effects' },
  { key: 'gift-rules', label: 'Gift Rules', icon: 'gift-rules' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

function NavIcon({ name }) {
  const common = { width: 18, height: 18, viewBox: '0 0 18 18', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' };
  switch (name) {
    case 'dashboard':
      return (
        <svg {...common}>
          <rect x="2" y="2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
          <rect x="10" y="2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
          <rect x="2" y="10" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
          <rect x="10" y="10" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case 'live-events':
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="1.8" fill="currentColor" />
          <path d="M5.8 5.8a4.5 4.5 0 0 0 0 6.4M12.2 5.8a4.5 4.5 0 0 1 0 6.4M3.3 3.3a8.2 8.2 0 0 0 0 11.4M14.7 3.3a8.2 8.2 0 0 1 0 11.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case 'effects':
      return (
        <svg {...common}>
          <path d="M9 2.2 10.3 6.6 14.7 8 10.3 9.4 9 13.8 7.7 9.4 3.3 8 7.7 6.6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case 'gift-rules':
      return (
        <svg {...common}>
          <rect x="2.5" y="7" width="13" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2.5 10h13M9 7v8" stroke="currentColor" strokeWidth="1.3" />
          <path d="M9 7c-1.4 0-2.6-.9-2.6-2.2C6.4 3.6 7.2 3 8 3c1 0 1 1.6 1 4M9 7c1.4 0 2.6-.9 2.6-2.2 0-1.2-.8-1.8-1.6-1.8-1 0-1 1.6-1 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.3" />
          <path d="M9 2.6v1.6M9 13.8v1.6M15.4 9h-1.6M4.2 9H2.6M13.2 4.8l-1.1 1.1M5.9 12.1l-1.1 1.1M13.2 13.2l-1.1-1.1M5.9 5.9 4.8 4.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

/** Reads the Envelope contract's user block, falling back gracefully if a field is missing. */
function displayName(user) {
  return user?.nickname || user?.uniqueId || 'Khán giả';
}

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [username, setUsername] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  // Feed realtime theo 3 cột (Bình luận / Quà tặng / Hoạt động) & thống kê phiên
  const [comments, setComments] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState({
    comments: 0,
    gifts: 0,
    diamonds: 0,
    joins: 0,
    likes: 0,
    viewers: 0,
  });

  const socketRef = useRef(null);

  useEffect(() => {
    // Khởi tạo kết nối Socket.io tới backend -- namespace /monitor (tách
    // riêng khỏi /game, nơi backend phát EffectCommand cho Game Client)
    const socket = io(`${SOCKET_SERVER_URL}/monitor`, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('>>> [Socket.io] Kết nối backend thành công:', socket.id);
      setErrorMessage('');
      setIsSocketConnected(true);
      setConnectionStatus((prev) => (prev === 'RECONNECTING' ? 'CONNECTED' : prev));
    });

    socket.on('disconnect', (reason) => {
      console.log('>>> [Socket.io] Mất kết nối tới backend:', reason);
      setIsSocketConnected(false);
      setConnectionStatus((prev) => (prev === 'CONNECTED' ? 'RECONNECTING' : prev));
    });

    // 1. Kênh CHAT -- Envelope { user: {nickname, uniqueId}, payload: {text}, receivedAt }
    socket.on('CHAT', (envelope) => {
      const item = {
        id: envelope.eventId || `chat_${Date.now()}_${Math.random()}`,
        user: displayName(envelope.user),
        text: envelope.payload?.text ?? '',
        timestamp: envelope.receivedAt || Date.now(),
      };

      setComments((prev) => [item, ...prev.slice(0, MAX_FEED_ITEMS - 1)]);
      setStats((prev) => ({ ...prev, comments: prev.comments + 1 }));
    });

    // 2. Kênh GIFT -- Tuân thủ BR-GF-01 & AC-02: Khử trùng streak
    socket.on('GIFT', (envelope) => {
      const payload = envelope.payload || {};
      const isFinished = payload.isStreakFinished !== undefined ? Boolean(payload.isStreakFinished) : true;
      const repeatCount = Number(payload.repeatCount) || 1;
      const totalDiamondValue = Number(payload.totalDiamondValue) || 0;

      const item = {
        id: envelope.eventId || `gift_${Date.now()}_${Math.random()}`,
        user: displayName(envelope.user),
        giftName: payload.giftName || 'Quà tặng',
        repeatCount,
        totalDiamondValue,
        isFinished,
        timestamp: envelope.receivedAt || Date.now(),
      };

      setGifts((prev) => [item, ...prev.slice(0, MAX_FEED_ITEMS - 1)]);

      // CHỈ CỘNG KIM CƯƠNG VÀO TỔNG KHI COMBO ĐÃ HOÀN TẤT (isStreakFinished = true)
      if (isFinished) {
        setStats((prev) => ({
          ...prev,
          gifts: prev.gifts + repeatCount,
          diamonds: prev.diamonds + totalDiamondValue,
        }));
      }
    });

    // 3. Kênh MEMBER_JOIN -- Envelope payload {isFirstJoinInSession, joinCountInSession}
    socket.on('MEMBER_JOIN', (envelope) => {
      const item = {
        id: envelope.eventId || `join_${Date.now()}_${Math.random()}`,
        user: displayName(envelope.user),
        timestamp: envelope.receivedAt || Date.now(),
      };

      setActivities((prev) => [item, ...prev.slice(0, MAX_FEED_ITEMS - 1)]);
      setStats((prev) => ({ ...prev, joins: prev.joins + 1 }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Xử lý Connect / Disconnect Live Stream (FR-01 -> FR-07)
  const handleToggleConnect = async () => {
    setErrorMessage('');
    if (connectionStatus === 'CONNECTED') {
      try {
        await api.disconnectRoom();
        setConnectionStatus('DISCONNECTED');
      } catch (err) {
        setErrorMessage(err.message);
      }
    } else {
      const cleanUsername = username.trim().replace(/^@/, '');
      if (!cleanUsername) {
        setErrorMessage('Vui lòng nhập chính xác TikTok username');
        return;
      }
      try {
        setConnectionStatus('CONNECTING');
        await api.connectRoom(cleanUsername);
        setConnectionStatus('CONNECTED');
      } catch (err) {
        setConnectionStatus('ERROR');
        setErrorMessage(err.message || 'Lỗi kết nối phòng LIVE');
      }
    }
  };

  // Nút Dừng Khẩn Cấp (FR-33 / BR-EFF-04)
  const handleKillSwitch = async () => {
    try {
      await api.triggerKillSwitch();
      alert('ĐÃ PHÁT LỆNH CLEAR_ALL_EFFECTS SANG GAME ENGINE THÀNH CÔNG!');
    } catch (err) {
      alert(`Lỗi Kill-Switch: ${err.message}`);
    }
  };

  const isBusyConnecting = connectionStatus === 'CONNECTING' || connectionStatus === 'RECONNECTING';
  const controlButtonLabel = isBusyConnecting
    ? connectionStatus === 'RECONNECTING'
      ? 'Đang kết nối lại...'
      : 'Đang kết nối...'
    : 'Điều khiển';

  const sessionId = socketRef.current?.id ? `sess_${socketRef.current.id.slice(0, 8)}` : 'sess_—';

  const statCards = [
    { label: 'Comments', value: stats.comments, hint: `+${stats.comments} phiên này` },
    { label: 'Joins', value: stats.joins, hint: `+${stats.joins} phiên này` },
    { label: 'Gifts', value: stats.gifts, hint: `+${stats.gifts} phiên này` },
    { label: 'Likes', value: stats.likes, hint: 'Tổng lượt thích' },
    { label: 'Viewers', value: stats.viewers, hint: 'Đang xem' },
  ];

  return (
    <div className="app-shell">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-badge">♪</span>
          <div>
            <div className="sidebar-logo-title">TikTok LIVE</div>
            <div className="sidebar-logo-subtitle">Monitor</div>
          </div>
        </div>

        <div className="sidebar-section-label">MONITOR</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`sidebar-nav-item ${activePage === item.key ? 'active' : ''}`}
              onClick={() => setActivePage(item.key)}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div>TikTok LIVE Monitor v1.0</div>
          <div>Session ID: {sessionId}</div>
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="main-area">
        <header className="topbar">
          <div>
            <h1 className="topbar-title">Live Dashboard</h1>
            <p className="topbar-subtitle">Theo dõi tương tác TikTok LIVE và các effect đang kích hoạt.</p>
          </div>

          <div className="topbar-controls">
            <input
              type="text"
              className="input-username"
              placeholder="Nhập tiktok username..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={connectionStatus === 'CONNECTED' || isBusyConnecting}
            />
            <button className="btn btn-control" onClick={handleToggleConnect} disabled={isBusyConnecting}>
              {controlButtonLabel}
            </button>
            <span className={`status-badge status-${connectionStatus.toLowerCase()}`}>{connectionStatus}</span>
          </div>
        </header>

        {errorMessage && <div className="error-banner">{errorMessage}</div>}

        {activePage !== 'dashboard' ? (
          <section className="placeholder-panel">
            <h2>{NAV_ITEMS.find((n) => n.key === activePage)?.label}</h2>
            <p>Tính năng này đang được phát triển.</p>
          </section>
        ) : (
          <>
            {/* STATS ROW */}
            <section className="stats-grid">
              {statCards.map((card) => (
                <div className="stat-card" key={card.label}>
                  <span className="stat-label">{card.label}</span>
                  <span className="stat-value">{card.value.toLocaleString()}</span>
                  <span className="stat-hint">{card.hint}</span>
                </div>
              ))}
            </section>

            {/* REALTIME EVENTS */}
            <section className="events-section">
              <div className="events-section-header">
                <div>
                  <h2>Realtime Events</h2>
                  <p>Bình luận · Quà tặng · Hoạt động</p>
                </div>
                <span className={`receiving-indicator ${isSocketConnected ? 'is-live' : 'is-offline'}`}>
                  <span className="dot" />
                  {isSocketConnected ? 'Receiving' : 'Offline'}
                </span>
              </div>

              <div className="columns-grid">
                <FeedColumn
                  title="Bình luận"
                  subtitle="Bình luận từ người xem"
                  items={comments}
                  emptyText="Chưa có bình luận nào."
                  renderItem={(item) => (
                    <>
                      <div className="column-item-row">
                        <span className="column-item-user">@{item.user}</span>
                        <span className="column-item-time">{formatTime(item.timestamp)}</span>
                      </div>
                      <div className="column-item-content">{item.text}</div>
                    </>
                  )}
                />

                <FeedColumn
                  title="Quà tặng"
                  subtitle="Lịch sử quà trong phiên LIVE"
                  items={gifts}
                  emptyText="Chưa có quà tặng nào."
                  renderItem={(item) => (
                    <>
                      <div className="column-item-row">
                        <span className="column-item-user">@{item.user}</span>
                        <span className="column-item-time">{formatTime(item.timestamp)}</span>
                      </div>
                      <div className="column-item-row">
                        <span className="column-item-content">
                          {item.giftName}
                          {!item.isFinished && <span className="streak-indicator"> (đang combo...)</span>}
                        </span>
                        <span className="gift-count-badge">x{item.repeatCount}</span>
                      </div>
                    </>
                  )}
                />

                <FeedColumn
                  title="Hoạt động"
                  subtitle="Người tham gia và lượt thả tim"
                  items={activities}
                  emptyText="Chưa có hoạt động nào."
                  renderItem={(item) => (
                    <>
                      <div className="column-item-row">
                        <span className="column-item-user">@{item.user}</span>
                        <span className="column-item-time">{formatTime(item.timestamp)}</span>
                      </div>
                      <div className="column-item-content">đã vào phòng</div>
                    </>
                  )}
                />
              </div>
            </section>

            {/* DEV SIMULATION TOOLBAR */}
            <footer className="dev-sim-bar">
              <span className="dev-sim-label">DEV SIMULATION (FR-31):</span>
              <div className="dev-sim-buttons">
                <button className="btn btn-mock" onClick={() => api.sendMockChat('Chạy nhanh')}>
                  + Comment
                </button>
                <button className="btn btn-mock" onClick={() => api.sendMockMemberJoin(stats.viewers + 1)}>
                  + Join
                </button>
                <button className="btn btn-mock" onClick={() => api.sendMockGift('Hoa Hồng', 1, 1, true)}>
                  + Rose (1💎)
                </button>
                <button className="btn btn-mock" onClick={() => api.sendMockGift('Mũ Gấu Bông', 1, 99, true)}>
                  + Mũ gấu (99💎)
                </button>
              </div>
              <button className="btn btn-kill-switch" onClick={handleKillSwitch}>
                KILL SWITCH (FR-33)
              </button>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function FeedColumn({ title, subtitle, items, emptyText, renderItem }) {
  return (
    <div className="column-card">
      <div className="column-header">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <div className="column-list">
        {items.length === 0 ? (
          <div className="empty-state">{emptyText}</div>
        ) : (
          items.map((item) => (
            <div className="column-item" key={item.id}>
              {renderItem(item)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString();
}
