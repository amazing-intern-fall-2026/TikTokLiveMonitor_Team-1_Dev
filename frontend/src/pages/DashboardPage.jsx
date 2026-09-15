// frontend/src/pages/DashboardPage.jsx
import React, { useState } from 'react';
import { LayoutGrid, Radio, Sparkles, Gift, Settings } from 'lucide-react';
import { api } from '../services/api';
import { useLiveSocket } from '../hooks/useLiveSocket';
import TikTokLogo from '../components/TikTokLogo';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', Icon: LayoutGrid, ready: true },
  { key: 'live-events', label: 'Live Events', Icon: Radio, ready: false },
  { key: 'effects', label: 'Effects', Icon: Sparkles, ready: false },
  { key: 'gift-rules', label: 'Gift Rules', Icon: Gift, ready: false },
  { key: 'settings', label: 'Settings', Icon: Settings, ready: false },
];

export default function DashboardPage({ adminUsername, onLogout }) {
  const [activeNav, setActiveNav] = useState('dashboard');
  const [tiktokUsername, setTiktokUsername] = useState('');
  const [activeRoom, setActiveRoom] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const {
    connectionStatus,
    setConnectionStatus,
    chatEvents,
    joinEvents,
    giftEvents,
    viewerCount,
    stats,
  } = useLiveSocket();

  const isBusyConnecting = connectionStatus === 'CONNECTING' || connectionStatus === 'RECONNECTING';

  const handleConnectRoom = async () => {
    setErrorMessage('');
    const cleanUsername = tiktokUsername.trim().replace(/^@/, '');
    if (!cleanUsername) {
      setErrorMessage('Vui lòng nhập username TikTok');
      return;
    }
    try {
      setConnectionStatus('CONNECTING');
      await api.connectRoom(cleanUsername);
      setActiveRoom(cleanUsername);
      setConnectionStatus('CONNECTED');
    } catch (err) {
      setConnectionStatus('ERROR');
      setErrorMessage(err.message || 'Không thể kết nối phòng LIVE');
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.disconnectRoom();
    } catch (e) {
      console.warn(e);
    }
    setConnectionStatus('DISCONNECTED');
    setActiveRoom('');
  };

  const handleKillSwitch = async () => {
    try {
      await api.triggerKillSwitch();
      alert('ĐÃ PHÁT LỆNH CLEAR_ALL_EFFECTS SANG GAME ENGINE!');
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <TikTokLogo size={24} />
          <div>
            <p className="brand-name">TikTok LIVE</p>
            <p className="brand-name-sub">Monitor</p>
          </div>
        </div>

        <p className="sidebar-section-label">Monitor</p>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${activeNav === item.key ? 'nav-item-active' : ''} ${!item.ready ? 'nav-item-disabled' : ''}`}
              onClick={() => item.ready && setActiveNav(item.key)}
              disabled={!item.ready}
              title={item.ready ? undefined : 'Chưa triển khai'}
            >
              <item.Icon className="nav-icon" size={20} strokeWidth={1.75} />
              {item.label}
              {!item.ready && <span className="nav-soon">Sắp có</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p>Đăng nhập: {adminUsername}</p>
          <p className="sidebar-session">Session ID: {activeRoom || '—'}</p>
          <button className="link-btn" onClick={onLogout}>Đăng xuất</button>
        </div>
      </aside>

      <div className="main-area">
        <header className="page-header">
          <div>
            <h1>Live Dashboard</h1>
            <p className="page-subtitle">Theo dõi tương tác TikTok LIVE và các effect đang kích hoạt.</p>
          </div>

          <div className="room-control">
            <div className="room-input-group">
              <span className="prefix">@</span>
              <input
                type="text"
                value={tiktokUsername}
                onChange={(e) => setTiktokUsername(e.target.value)}
                placeholder="Nhập TikTok username..."
                disabled={connectionStatus === 'CONNECTED' || isBusyConnecting}
              />
              {connectionStatus === 'CONNECTED' ? (
                <button className="btn btn-outline btn-sm" onClick={handleDisconnect}>
                  Ngắt kết nối
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={handleConnectRoom} disabled={isBusyConnecting}>
                  {connectionStatus === 'CONNECTING' ? 'Đang kết nối...' : 'Kết nối'}
                </button>
              )}
            </div>
            <div className="status-line">
              <span className={`status-dot dot-${connectionStatus.toLowerCase()}`} />
              <span className="status-text">
                {connectionStatus === 'CONNECTED' ? `LIVE Connected @${activeRoom}` : connectionStatus}
              </span>
            </div>
          </div>
        </header>

        {errorMessage && <div className="alert alert-error page-alert">{errorMessage}</div>}

        <section className="metrics-grid">
          <div className="metric-card">
            <span className="metric-label">💬 Comments</span>
            <span className="metric-value">{stats.comments.toLocaleString()}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">👤 Joins</span>
            <span className="metric-value">{stats.joins.toLocaleString()}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">🎁 Gifts</span>
            <span className="metric-value">{stats.totalGifts.toLocaleString()}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">💎 Diamonds</span>
            <span className="metric-value">{stats.diamonds.toLocaleString()}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">👁 Viewers</span>
            <span className="metric-value">{viewerCount.toLocaleString()}</span>
          </div>
        </section>

        <div className="section-heading-row">
          <div>
            <h2>Realtime Events</h2>
            <p className="page-subtitle">Bình luận · Quà tặng · Hoạt động</p>
          </div>
          <span className="receiving-pill">● Receiving</span>
        </div>

        <main className="columns-grid">
          <div className="column-card">
            <div className="col-header"><h3>Bình luận ({chatEvents.length})</h3></div>
            <div className="col-body">
              {chatEvents.length === 0 ? (
                <div className="empty-state">Chưa có bình luận mới</div>
              ) : (
                chatEvents.map((e) => (
                  <div key={e.id} className="feed-row chat-row">
                    <span className="row-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
                    <strong className="row-user">{e.user}:</strong>
                    <span className="row-text">{e.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="column-card">
            <div className="col-header"><h3>Quà tặng ({giftEvents.length})</h3></div>
            <div className="col-body">
              {giftEvents.length === 0 ? (
                <div className="empty-state">Chưa có quà tặng</div>
              ) : (
                giftEvents.map((e) => (
                  <div key={e.id} className={`feed-row gift-row ${e.diamonds >= 100 ? 'gift-large' : ''}`}>
                    <div className="gift-row-top">
                      <span className="row-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
                      <strong className="row-user">{e.user}</strong>
                    </div>
                    <div className="gift-row-bot">
                      <span className="gift-tag">{e.repeatCount}x {e.giftName}</span>
                      <span className="diamond-tag">+{e.diamonds} 💎</span>
                      {!e.isFinished && <span className="streak-tag">Combo...</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="column-card">
            <div className="col-header"><h3>Hoạt động ({joinEvents.length})</h3></div>
            <div className="col-body">
              {joinEvents.length === 0 ? (
                <div className="empty-state">Chưa có khán giả mới</div>
              ) : (
                joinEvents.map((e) => (
                  <div key={e.id} className="feed-row join-row">
                    <span className="row-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
                    <span className="row-user">{e.user}</span>
                    <span className="row-muted">đã vào phòng</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>

        <footer className="bottom-mock-bar">
          <span className="mock-lbl">MOCK DEV TOOLS:</span>
          <button className="btn btn-sm" onClick={() => api.sendMockChat('HEAL')}>+ Chat "!HEAL"</button>
          <button className="btn btn-sm" onClick={() => api.sendMockChat('SLOW')}>+ Chat "!SLOW"</button>
          <button className="btn btn-sm" onClick={() => api.sendMockMemberJoin(viewerCount + 1)}>+ 1 Khán giả Join</button>
          <button className="btn btn-sm" onClick={() => api.sendMockGift('Hoa Hồng', 1, 1, true)}>+ Quà 1💎</button>
          <button className="btn btn-sm" onClick={() => api.sendMockGift('Sư Tử', 1, 1000, true)}>+ Quà Boss 1000💎</button>
          <button className="btn btn-sm btn-danger-outline" onClick={handleKillSwitch}>🚨 Kill Switch</button>
        </footer>
      </div>
    </div>
  );
}