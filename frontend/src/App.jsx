// frontend/src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { api } from './services/api';

const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const MAX_FEED_ITEMS = 200; // Đảm bảo NFR-PERF-05 & FR-13: Tránh tràn RAM tab browser

export default function App() {
  const [username, setUsername] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED');
  const [errorMessage, setErrorMessage] = useState('');

  // Feed realtime & Thống kê phiên
  const [events, setEvents] = useState([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [stats, setStats] = useState({
    comments: 0,
    diamonds: 0,
    totalGifts: 0,
    joins: 0,
  });

  const socketRef = useRef(null);

  useEffect(() => {
    // Khởi tạo kết nối Socket.io tới backend
    const socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('>>> [Socket.io] Kết nối backend thành công:', socket.id);
      setErrorMessage('');
    });

    socket.on('disconnect', () => {
      console.log('>>> [Socket.io] Mất kết nối tới backend');
      setConnectionStatus('DISCONNECTED');
    });

    // 1. Kênh CHAT (Khớp với backend liveStream.service & socket.service)
    socket.on('CHAT', (data) => {
      const feedItem = {
        id: `chat_${data.createTime || Date.now()}_${Math.random()}`,
        type: 'CHAT',
        user: data.nickname || data.username || 'Khán giả',
        text: data.comment,
        timestamp: data.createTime || Date.now(),
      };

      setEvents((prev) => [feedItem, ...prev.slice(0, MAX_FEED_ITEMS - 1)]);
      setStats((prev) => ({ ...prev, comments: prev.comments + 1 }));
    });

    // 2. Kênh GIFT (Tuân thủ BR-GF-01 & AC-02: Khử trùng streak)
    socket.on('GIFT', (data) => {
      const isFinished = data.repeatEnd !== undefined ? Boolean(data.repeatEnd) : true;
      const calculatedDiamonds = (Number(data.diamondCount) || 0) * (Number(data.repeatCount) || 1);

      const feedItem = {
        id: `gift_${Date.now()}_${Math.random()}`,
        type: 'GIFT',
        user: data.nickname || data.username || 'Khán giả',
        text: `tặng ${data.repeatCount}x ${data.giftName} (${calculatedDiamonds} 💎)`,
        isFinished,
        timestamp: data.createTime || Date.now(),
      };

      setEvents((prev) => [feedItem, ...prev.slice(0, MAX_FEED_ITEMS - 1)]);

      // CHỈ CỘNG KIM CƯƠNG VÀO TỔNG KHI COMBO ĐÃ HOÀN TẤT (repeatEnd = true)
      if (isFinished) {
        setStats((prev) => ({
          ...prev,
          totalGifts: prev.totalGifts + (Number(data.repeatCount) || 1),
          diamonds: prev.diamonds + calculatedDiamonds,
        }));
      }
    });

    // 3. Kênh MEMBER_JOIN (Khớp với test-events & WebcastEvent.ROOM_USER)
    socket.on('MEMBER_JOIN', (data) => {
      if (data.viewerCount !== undefined) {
        setViewerCount(Number(data.viewerCount));
      }

      const feedItem = {
        id: `join_${Date.now()}_${Math.random()}`,
        type: 'MEMBER_JOIN',
        user: data.nickname || data.username || 'Người xem mới',
        text: 'vừa tham gia phòng live',
        timestamp: data.createTime || Date.now(),
      };

      setEvents((prev) => [feedItem, ...prev.slice(0, MAX_FEED_ITEMS - 1)]);
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

  return (
    <div className="app-container">
      {/* 1. KHUNG ĐIỀU KHIỂN CHÍNH (TOP BAR) */}
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

      {/* 2. CHỈ SỐ REALTIME (METRICS DASHBOARD - FR-17) */}
      <section className="stats-panel">
        <div className="stat-card">
          <span className="stat-label">Số người xem (Snapshot)</span>
          <span className="stat-value">{viewerCount.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Tổng Bình luận</span>
          <span className="stat-value">{stats.comments.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Tổng Kim cương (Đã chốt)</span>
          <span className="stat-value" style={{ color: '#f59e0b' }}>
            {stats.diamonds.toLocaleString()} 💎
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Lượt vào phòng</span>
          <span className="stat-value">{stats.joins.toLocaleString()}</span>
        </div>
      </section>

      {/* 3. BỘ CÔNG CỤ MOCK (FR-31: PHỤC VỤ TEST ĐỘC LẬP VỚI GAME) */}
      <section className="mock-panel">
        <span className="mock-title">MOCK TOOL (API TEST):</span>
        <button className="btn btn-mock" onClick={() => api.sendMockChat('GO')}>
          + Mock Chat "GO"
        </button>
        <button className="btn btn-mock" onClick={() => api.sendMockChat('HEAL')}>
          + Mock Chat "HEAL"
        </button>
        <button className="btn btn-mock" onClick={() => api.sendMockGift('Hoa Hồng', 1, 1, true)}>
          + Mock Quà 1💎 (Chốt)
        </button>
        <button className="btn btn-mock" onClick={() => api.sendMockGift('Trống Đồng', 5, 100, false)}>
          + Mock Quà Combo (Đang chạy...)
        </button>
        <button className="btn btn-mock" onClick={() => api.sendMockGift('Sư Tử', 1, 1000, true)}>
          + Mock Quà 1000💎 (Chốt)
        </button>
        <button className="btn btn-mock" onClick={() => api.sendMockMemberJoin(viewerCount + 5)}>
          + Mock Join (+5 views)
        </button>
      </section>

      {/* 4. DÒNG SỰ KIỆN REALTIME (FR-13 & NFR-PERF-05) */}
      <main className="feed-container">
        <h3>Dòng Sự Kiện Thời Gian Thực ({events.length}/{MAX_FEED_ITEMS})</h3>
        <div className="feed-list">
          {events.length === 0 ? (
            <div className="empty-state">Hệ thống đang chờ sự kiện. Bấm các nút Mock ở trên để kiểm thử!</div>
          ) : (
            events.map((evt) => (
              <div key={evt.id} className={`feed-item feed-${evt.type.toLowerCase()}`}>
                <span className="feed-time">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                <span className="feed-tag">{evt.type}</span>
                <span className="feed-user">{evt.user}:</span>
                <span className="feed-content">{evt.text}</span>
                {evt.type === 'GIFT' && !evt.isFinished && (
                  <span className="streak-indicator">[Đang combo...]</span>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}