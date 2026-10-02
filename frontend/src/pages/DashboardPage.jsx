// frontend/src/pages/DashboardPage.jsx
// Vừa là shell (Sidebar + chuyển trang), vừa là nội dung Dashboard/Home mặc
// định sau khi login — không tách riêng DashboardHome.jsx nữa. RulesPage vẫn
// đứng riêng vì đó là màn điều hướng thật qua sidebar.
import React, { useState } from 'react';
import { api } from '../services/api';
import { useLiveSocket } from '../hooks/useLiveSocket';
import Sidebar from '../components/Sidebar';
import RulesPage from './RulesPage';
import RuleProgressSection from '../components/RuleProgressSection';
import VirtualList from '../components/VirtualList';
import SessionHistoryModal from '../components/SessionHistoryModal';
import { EffectStrip, EffectLogList } from '../components/EffectLog';

// Ảo hoá 3 cột feed (windowing) -- các hằng số này PHẢI khớp
// height + margin-bottom của .chat-row/.gift-row/.join-row trong App.css
// (xem comment ở đó). Cap 200 item/cột đã xử lý sẵn ở MAX_FEED_ITEMS
// trong useLiveSocket.js -- không đụng tới, đây chỉ là chiều cao 1 dòng
// dùng để tính toán viewport, không phải giới hạn số lượng.
const CHAT_ROW_HEIGHT = 64 + 8;
const GIFT_ROW_HEIGHT = 70 + 8;
const JOIN_ROW_HEIGHT = 36 + 8;

// FR-15: bộ lọc feed theo loại sự kiện. 'ALL' giữ nguyên bố cục 3 cột như
// trước; chọn 1 tab thì chỉ hiện đúng cột đó (rộng full) -- chỉ lọc hiển thị,
// dữ liệu/đếm trong useLiveSocket.js không bị đụng tới.
const FEED_TABS = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'COMMENT', label: '💬 Bình luận' },
  { key: 'GIFT', label: '🎁 Quà tặng' },
  { key: 'JOIN', label: '👤 Hoạt động' },
  // BR-EFF-03: danh sách effect + trạng thái ACK (không có trong chế độ 'ALL').
  { key: 'EFFECT', label: '⚡ Effect' },
];

export default function DashboardPage({ adminUsername, onLogout }) {
  const [activeNav, setActiveNav] = useState('dashboard');
  const [tiktokUsername, setTiktokUsername] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [feedTab, setFeedTab] = useState('ALL');

  const {
    connectionStatus,
    activeRoom,
    setActiveRoom,
    socketError,
    liveError,
    setConnectionStatus,
    chatEvents,
    joinEvents,
    giftEvents,
    viewerCount,
    stats,
    rates,
    effectLog,
    roomInfo,
    setRoomInfo,
    roomStatus,
    resetDashboardState,
    isPaused,
  } = useLiveSocket();

  const [isTogglingPause, setIsTogglingPause] = useState(false);
  const [showSessionHistory, setShowSessionHistory] = useState(false);

  // [CLAUDE EDIT 2026-10-02] Code gốc của hao (3132716), giữ lại để tham khảo.
  // Lý do sửa: thêm bộ đếm cho tab "Effect" (BR-EFF-03).
  // const feedCounts = { COMMENT: chatEvents.length, GIFT: giftEvents.length, JOIN: joinEvents.length };
  const feedCounts = { COMMENT: chatEvents.length, GIFT: giftEvents.length, JOIN: joinEvents.length, EFFECT: effectLog.length };
  const showEffect = feedTab === 'EFFECT';
  const showComment = feedTab === 'ALL' || feedTab === 'COMMENT';
  const showGift = feedTab === 'ALL' || feedTab === 'GIFT';
  const showJoin = feedTab === 'ALL' || feedTab === 'JOIN';

  const statusLabels = {
    DISCONNECTED: 'Chưa kết nối LIVE', CONNECTING: 'Đang kết nối',
    CONNECTED: `LIVE Connected @${activeRoom}`, RECONNECTING: 'Đang kết nối lại',
    ENDED: 'LIVE đã kết thúc', ERROR: 'Lỗi kết nối LIVE',
  };
  const displayStatus = socketError ? 'RECONNECTING' : connectionStatus;
  const emptyMessage = connectionStatus === 'ENDED' ? 'LIVE đã kết thúc. Kết nối phòng để xem phiên mới.'
    : displayStatus === 'RECONNECTING' ? 'Đang kết nối lại. Dữ liệu sẽ tiếp tục khi kết nối khôi phục.'
    : connectionStatus === 'ERROR' ? 'Không thể nhận dữ liệu. Vui lòng thử kết nối lại.'
    : connectionStatus === 'DISCONNECTED' ? 'Kết nối một phòng TikTok LIVE để bắt đầu.' : '';
  const runMock = async (action) => {
    try { await action(); } catch (err) { setErrorMessage(err.message || 'Không gửi được sự kiện thử nghiệm'); }
  };

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
      const room = await api.connectRoom(cleanUsername);
      // Vá lỗi chuyển phòng: chủ động đưa feed + metrics về 0 ngay khi đổi
      // @handle kết nối thành công, không đợi SESSION_RESET từ backend
      // (backend chưa phát event này) -- xem ghi chú trong useLiveSocket.js.
      resetDashboardState();
      // FR-09: avatar + giờ bắt đầu LIVE đã có sẵn trong response /connect
      // (xem liveStream.controller.js) -- set ngay, không cần đợi ROOM_INFO
      // qua socket (vốn chỉ còn hữu ích cho trường hợp reconnect).
      setRoomInfo({ avatarUrl: room.avatarUrl ?? null, liveStartedAt: room.liveStartedAt ?? null });
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
      setErrorMessage(e.message || 'Không thể ngắt kết nối. Vui lòng thử lại.');
      return;
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

  // FR-32: chỉ chặn effect MỚI phát sinh -- khác Kill Switch (FR-33), không
  // xoá effect đang chạy trên Game. isPaused là "nguồn sự thật" đến từ
  // backend qua socket (xem useLiveSocket.js), nút này chỉ gửi lệnh; UI
  // tự cập nhật khi RULE_PROGRESS/EFFECT_PAUSE_STATE quay lại, không tự
  // lạc quan set state ở đây để tránh lệch với trạng thái thật nếu request lỗi.
  const handleTogglePause = async () => {
    setIsTogglingPause(true);
    try {
      if (isPaused) {
        await api.resumeEffects();
      } else {
        await api.pauseEffects();
      }
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setIsTogglingPause(false);
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        activeNav={activeNav}
        onNavChange={setActiveNav}
        adminUsername={adminUsername}
        activeRoom={activeRoom}
        roomAvatarUrl={roomInfo.avatarUrl}
        roomStartedAt={roomInfo.liveStartedAt}
        onLogout={onLogout}
      />

      <div className="main-area">
        {activeNav === 'gift-rules' ? (
          <RulesPage />
        ) : (
          <>
            <header className="page-header">
              <div className="page-header-top">
                <h1>Live Dashboard</h1>
                <p className="page-subtitle">Theo dõi tương tác TikTok LIVE và các effect đang kích hoạt.</p>
              </div>

              {/* NFR-USA-02: nút dừng khẩn cấp phải luôn hiển thị, không cần
                  cuộn trang -- gộp effect-controls + room-control vào 1
                  nhóm bên phải để .page-header chỉ có 2 khối con (tiêu đề |
                  header-actions). Trước đây 3 khối con riêng lẻ + flex-wrap
                  khiến room-control bị justify-content:space-between đẩy
                  xuống dòng riêng một mình ngay khi text trạng thái kết nối
                  dài ra lúc LIVE Connected -- gộp lại để 2 khối cùng wrap
                  (hoặc không wrap) như một nhóm thay vì tách rời. */}
              <div className="header-actions">
                <div className="effect-controls">
                  <span className={`pause-status-badge ${isPaused ? 'pause-status-paused' : 'pause-status-live'}`}>
                    {isPaused ? '⏸ Effect đang TẠM DỪNG' : '▶ Effect đang phát bình thường'}
                  </span>
                  <button
                    className={`btn btn-sm ${isPaused ? 'btn-primary' : 'btn-outline'}`}
                    onClick={handleTogglePause}
                    disabled={isTogglingPause}
                  >
                    {isPaused ? '▶ Tiếp tục phát effect' : '⏸ Tạm dừng effect'}
                  </button>
                  <button className="btn btn-sm btn-danger-outline" onClick={handleKillSwitch}>
                    🚨 Kill Switch
                  </button>
                  <button className="btn btn-sm btn-outline" onClick={() => setShowSessionHistory(true)}>
                    🗂 Lịch sử phiên
                  </button>
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
                    {(connectionStatus === 'CONNECTED' || connectionStatus === 'RECONNECTING') ? (
                      <button className="btn btn-outline btn-sm" onClick={handleDisconnect}>
                        Ngắt kết nối
                      </button>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={handleConnectRoom} disabled={isBusyConnecting}>
                        {connectionStatus === 'CONNECTING' ? 'Đang kết nối...' : 'Kết nối'}
                      </button>
                    )}
                  </div>
                  <div className="status-line" role="status" aria-live="polite">
                    <span className={`status-dot dot-${displayStatus.toLowerCase()}`} />
                    <span className="status-text">
                      {statusLabels[displayStatus]}
                    </span>
                  </div>
                </div>
                {/* FR-08: phân biệt "LIVE đã kết thúc" (host tắt live / bị khoá)
                    với "mất mạng tạm thời, đang thử kết nối lại" -- hai trạng
                    thái khác hẳn nhau về ý nghĩa với người vận hành, không thể
                    gộp chung một dòng "Disconnected". */}
                {connectionStatus === 'CONNECTED' && roomStatus === 'ENDED' && (
                  <div className="status-line room-status-line">
                    <span className="status-dot dot-error" />
                    <span className="status-text">LIVE đã kết thúc</span>
                  </div>
                )}
                {connectionStatus === 'CONNECTED' && roomStatus === 'RECONNECTING' && (
                  <div className="status-line room-status-line">
                    <span className="status-dot dot-reconnecting" />
                    <span className="status-text">Mất kết nối tạm thời, đang thử kết nối lại...</span>
                  </div>
                )}
              </div>
            </header>

            {(errorMessage || socketError || liveError) && <div role="alert" className="alert alert-error page-alert">{errorMessage || socketError || liveError}</div>}

            <section className="metrics-grid">
              <div className="metric-card">
                <span className="metric-label">💬 Comments</span>
                {/* FR-17: tốc độ trên cửa sổ trượt 60 giây gần nhất, cùng hàng với số tổng.
                    [CLAUDE EDIT 2026-10-02] Code gốc của Ngô Đức Tài (63ed167): chỉ có
                    <span className="metric-value">{stats.comments.toLocaleString()}</span> (không có tốc độ/phút). */}
                <span className="metric-value-row">
                  <span className="metric-value">{stats.comments.toLocaleString()}</span>
                  <span className="metric-sub">{rates.commentsPerMin.toLocaleString()} / phút</span>
                </span>
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
                {/* [CLAUDE EDIT 2026-10-02] Code gốc của Ngô Đức Tài (63ed167): chỉ có
                    <span className="metric-value">{stats.diamonds.toLocaleString()}</span> (không có tốc độ/phút). */}
                <span className="metric-value-row">
                  <span className="metric-value">{stats.diamonds.toLocaleString()}</span>
                  <span className="metric-sub">{rates.diamondsPerMin.toLocaleString()} / phút</span>
                </span>
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
              <RuleProgressSection />
              <span className="receiving-pill">{displayStatus === 'CONNECTED' ? '● Receiving' : statusLabels[displayStatus]}</span>
            </div>

            {/* BR-EFF-03: dải trạng thái effect nằm cùng hàng với tab lọc để không chiếm thêm chiều cao. */}
            <div className="feed-toolbar">
            <div className="feed-tabs" role="tablist" aria-label="Lọc feed theo loại sự kiện">
              {FEED_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={feedTab === tab.key}
                  className={`feed-tab ${feedTab === tab.key ? 'feed-tab-active' : ''}`}
                  onClick={() => setFeedTab(tab.key)}
                >
                  {tab.label}
                  {tab.key !== 'ALL' && <span className="feed-tab-count">{feedCounts[tab.key]}</span>}
                </button>
              ))}
            </div>
            <EffectStrip effects={effectLog} />
            </div>

            <main className={`columns-grid ${feedTab === 'ALL' ? '' : 'columns-grid-single'}`}>
              {showEffect && (
              <div className="column-card">
                <div className="col-header"><h3>Effect ({effectLog.length})</h3></div>
                <EffectLogList effects={effectLog} />
              </div>
              )}

              {showComment && (
              <div className="column-card">
                <div className="col-header"><h3>Bình luận ({chatEvents.length})</h3></div>
                <VirtualList
                  className="col-body"
                  items={chatEvents}
                  itemHeight={CHAT_ROW_HEIGHT}
                  emptyState={<div className="empty-state">{emptyMessage || 'Chưa có bình luận mới'}</div>}
                  renderItem={(e) => (
                    <div key={e.id} className="feed-row chat-row">
                      <span className="row-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
                      <strong className="row-user">{e.user}:</strong>
                      <span className="row-text">{e.text}</span>
                    </div>
                  )}
                />
              </div>
              )}

              {showGift && (
              <div className="column-card">
                <div className="col-header"><h3>Quà tặng ({giftEvents.length})</h3></div>
                <VirtualList
                  className="col-body"
                  items={giftEvents}
                  itemHeight={GIFT_ROW_HEIGHT}
                  emptyState={<div className="empty-state">{emptyMessage || 'Chưa có quà tặng'}</div>}
                  renderItem={(e) => (
                    <div key={e.id} className={`feed-row gift-row ${e.diamonds >= 100 ? 'gift-large' : ''}`}>
                      <div className="gift-row-top">
                        <span className="row-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
                        <strong className="row-user">{e.user}</strong>
                      </div>
                      <div className="gift-row-bot">
                        {/* Render Icon Quà: giftImageUrl là optional (BR-DATA-01) --
                            chưa có ảnh (backend chưa gửi / lỗi tải) thì ẩn hẳn <img>
                            thay vì hiện icon vỡ, feed vẫn hiển thị đủ tên + số lượng. */}
                        {e.giftImageUrl && (
                          <img
                            src={e.giftImageUrl}
                            alt={e.giftName || 'Quà tặng'}
                            className="gift-icon"
                            width={20}
                            height={20}
                            onError={(ev) => { ev.currentTarget.style.display = 'none'; }}
                          />
                        )}
                        <span className="gift-tag">{e.repeatCount}x {e.giftName}</span>
                        <span className="diamond-tag">+{e.diamonds} 💎</span>
                        {!e.isFinished && <span className="streak-tag">Combo...</span>}
                      </div>
                    </div>
                  )}
                />
              </div>
              )}

              {showJoin && (
              <div className="column-card">
                <div className="col-header"><h3>Hoạt động ({joinEvents.length})</h3></div>
                <VirtualList
                  className="col-body"
                  items={joinEvents}
                  itemHeight={JOIN_ROW_HEIGHT}
                  emptyState={<div className="empty-state">{emptyMessage || 'Chưa có khán giả mới'}</div>}
                  renderItem={(e) => (
                    <div key={e.id} className="feed-row join-row">
                      <span className="row-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
                      <span className="row-user">{e.user}</span>
                      <span className="row-muted">đã vào phòng</span>
                    </div>
                  )}
                />
              </div>
              )}
            </main>

            <footer className="bottom-mock-bar">
              <span className="mock-lbl">MOCK DEV TOOLS:</span>
              <button className="btn btn-sm" onClick={() => runMock(() => api.sendMockChat('HEAL'))}>+ Chat "!HEAL"</button>
              <button className="btn btn-sm" onClick={() => runMock(() => api.sendMockChat('SLOW'))}>+ Chat "!SLOW"</button>
              <button className="btn btn-sm" onClick={() => runMock(() => api.sendMockMemberJoin(viewerCount + 1))}>+ 1 Khán giả Join</button>
              <button className="btn btn-sm" onClick={() => runMock(() => api.sendMockGift('Hoa Hồng', 1, 1, true))}>+ Quà 1💎</button>
              <button className="btn btn-sm" onClick={() => runMock(() => api.sendMockGift('Sư Tử', 1, 1000, true))}>+ Quà Boss 1000💎</button>
            </footer>
          </>
        )}
      </div>
      {showSessionHistory && <SessionHistoryModal onClose={() => setShowSessionHistory(false)} />}
    </div>
  );
}
