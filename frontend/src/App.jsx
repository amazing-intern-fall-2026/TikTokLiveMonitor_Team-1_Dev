// frontend/src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { api } from './services/api';

const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const MAX_FEED_ITEMS = 200; // Đảm bảo NFR-PERF-05 chống tràn RAM trình duyệt

export default function App() {
  const [username, setUsername] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED'); // DISCONNECTED | CONNECTING | CONNECTED | ERROR
  const [errorMessage, setErrorMessage] = useState('');

  // Feed và Metrics
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({ comments: 0, diamonds: 0, joins: 0 });

  const socketRef = useRef(null);

  // Thiết lập Socket.io lắng nghe sự kiện từ Backend
  useEffect(() => {
    const socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket.io kết nối thành công với Backend:', socket.id);
    });

    socket.on('disconnect', () => {
      setConnectionStatus('DISCONNECTED');
    });

    // Nhận trạng thái kết nối từ Backend
    socket.on('status_change', (data) => {
      setConnectionStatus(data.status);
      if (data.error) setErrorMessage(data.error);
    });

    // Nhận sự kiện chuẩn hóa từ Backend
    socket.on('live_event', (newEvent) => {
      // 1. Cập nhật dòng sự kiện (chặn tối đa 200 mục để giữ bộ nhớ an toàn)
      setEvents((prev) => [newEvent, ...prev.slice(0, MAX_FEED_ITEMS - 1)]);

      // 2. Tích lũy số liệu thống kê realtime
      setStats((prev) => ({
        comments: prev.comments + (newEvent.type === 'COMMENT' ? 1 : 0),
        diamonds: prev.diamonds + (newEvent.type === 'GIFT' ? (newEvent.payload.totalDiamondValue || 0) : 0),
        joins: prev.joins + (newEvent.type === 'JOIN' ? 1 : 0),
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Xử lý nút Kết nối / Ngắt kết nối
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
      if (!username.trim()) {
        setErrorMessage('Vui lòng nhập Username TikTok hợp lệ');
        return;
      }
      try {
        setConnectionStatus('CONNECTING');
        await api.connectRoom(username.trim().replace(/^@/, ''));
      } catch (err) {
        setConnectionStatus('ERROR');
        setErrorMessage(err.message);
      }
    }
  };

  // Kích hoạt Dừng khẩn cấp
  const handleKillSwitch = async () => {
    try {
      await api.triggerKillSwitch();
      alert('Đã phát lệnh CLEAR_ALL_EFFECTS tới toàn hệ thống!');
    } catch (err) {
      alert(`Lỗi Kill Switch: ${err.message}`);
    }
  };

  return (
    <div className="app-container">
      {/* 1. THANH ĐIỀU KHIỂN CHÍNH (TOP BAR) */}
      <header className="header-panel">
        <div className="connection-group">
          <input
            type="text"
            className="input-username"
            placeholder="Nhập TikTok username (vd: streamer_abc)..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={connectionStatus === 'CONNECTED' || connectionStatus === 'CONNECTING'}
          />
          <button
            className={`btn ${connectionStatus === 'CONNECTED' ? 'btn-disconnect' : 'btn-connect'}`}
            onClick={handleToggleConnect}
            disabled={connectionStatus === 'CONNECTING'}
          >
            {connectionStatus === 'CONNECTED' ? 'Ngắt kết nối' : connectionStatus === 'CONNECTING' ? 'Đang kết nối...' : 'Kết nối Live'}
          </button>
          <span className={`status-badge status-${connectionStatus.toLowerCase()}`}>
            {connectionStatus}
          </span>
        </div>

        <button className="btn btn-kill-switch" onClick={handleKillSwitch}>
          DỪNG KHẨN CẤP (KILL SWITCH)
        </button>
      </header>

      {errorMessage && <div className="error-banner">{errorMessage}</div>}

      {/* 2. CHỈ SỐ REALTIME */}
      <section className="stats-panel">
        <div className="stat-card">
          <span className="stat-label">Tổng Comment</span>
          <span className="stat-value">{stats.comments}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Tổng Diamond</span>
          <span className="stat-value">{stats.diamonds}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Lượt Join</span>
          <span className="stat-value">{stats.joins}</span>
        </div>
      </section>

      {/* 3. BỘ MOCK DATA TOOL (DÀNH CHO TEST ĐỘC LẬP) */}
      <section className="mock-panel">
        <span className="mock-title">MOCK TOOL:</span>
        <button className="btn btn-mock" onClick={() => api.sendMockComment('GO')}>
          + Mock Comment "GO"
        </button>
        <button className="btn btn-mock" onClick={() => api.sendMockComment('HEAL')}>
          + Mock Comment "HEAL"
        </button>
        <button className="btn btn-mock" onClick={() => api.sendMockGift('Hoa Hồng', 1, 1)}>
          + Mock Quà Nhỏ (1💎)
        </button>
        <button className="btn btn-mock" onClick={() => api.sendMockGift('Sư Tử', 1000, 1)}>
          + Mock Quà Lớn (1000💎)
        </button>
        <button className="btn btn-mock" onClick={() => api.sendMockJoin()}>
          + Mock Khán Giả Vào
        </button>
      </section>

      {/* 4. BẢNG FEED SỰ KIỆN THỜI GIAN THỰC */}
      <main className="feed-container">
        <h3>Dòng Sự Kiện Thời Gian Thực ({events.length}/{MAX_FEED_ITEMS})</h3>
        <div className="feed-list">
          {events.length === 0 ? (
            <div className="empty-state">Chưa có tương tác nào. Bấm nút Mock hoặc kết nối phòng live để xem feed.</div>
          ) : (
            events.map((evt) => (
              <div key={evt.eventId || Math.random()} className={`feed-item feed-${evt.type.toLowerCase()}`}>
                <span className="feed-time">
                  {new Date(evt.receivedAt || Date.now()).toLocaleTimeString()}
                </span>
                <span className="feed-tag">{evt.type}</span>
                <span className="feed-user">{evt.user?.nickname || evt.user?.uniqueId}:</span>
                <span className="feed-content">
                  {evt.type === 'COMMENT' && evt.payload.text}
                  {evt.type === 'GIFT' && `đã tặng ${evt.payload.repeatCount}x ${evt.payload.giftName} (${evt.payload.totalDiamondValue} 💎)`}
                  {evt.type === 'JOIN' && 'đã tham gia phòng'}
                </span>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}