// BR-EFF-03 trên Dashboard: effect nào đã gửi sang Game và Game phản hồi ra sao.
// Dữ liệu từ socket /monitor (EFFECT_HISTORY khi mở trang, EFFECT_STATUS mỗi lần đổi
// trạng thái) -- xem useLiveSocket.js và backend/src/services/effectLog.service.js.
import React from 'react';

// `short` dùng trong dải hẹp, `label` trong danh sách đầy đủ.
const STATUS_META = {
  SENT: { label: 'Chờ ACK', short: 'Chờ ACK', cls: 'sent' },
  APPLIED: { label: 'Đã áp dụng', short: 'Áp dụng', cls: 'applied' },
  REJECTED: { label: 'Bị từ chối', short: 'Từ chối', cls: 'rejected' },
  EXPIRED: { label: 'Hết hạn', short: 'Hết hạn', cls: 'expired' },
  NO_ACK: { label: 'Không có ACK', short: 'Không ACK', cls: 'noack' },
};
const SUMMARY_ORDER = ['APPLIED', 'REJECTED', 'EXPIRED', 'NO_ACK', 'SENT'];

const metaOf = (status) => STATUS_META[status] || { label: status, short: status, cls: 'sent' };
const nameOf = (e) => (e.kind === 'KILL_SWITCH' ? '🚨 KILL SWITCH' : e.effectCode || 'Effect');

// Dải gọn cạnh các tab lọc: số effect theo từng trạng thái (chi tiết ở tab "Effect").
export function EffectStrip({ effects }) {
  const counts = {};
  for (const e of effects) counts[e.status] = (counts[e.status] || 0) + 1;

  return (
    <section className="effect-strip" aria-label="Trạng thái effect gửi sang Game">
      <span className="effect-strip-title">⚡ Effect</span>
      {effects.length === 0 ? (
        <span className="effect-strip-empty">Chưa có effect nào được phát. Effect xuất hiện khi một rule đạt ngưỡng.</span>
      ) : (
        <span className="effect-strip-counts" title={`Tính trên ${effects.length} effect gần nhất`}>
          {SUMMARY_ORDER.filter((s) => counts[s]).map((s) => (
            <span key={s} className={`effect-badge effect-${metaOf(s).cls}`}>
              {metaOf(s).short} {counts[s]}
            </span>
          ))}
        </span>
      )}
    </section>
  );
}

// Danh sách đầy đủ (tab "Effect"): giờ, effect, trạng thái, rule kích hoạt, lý do từ chối.
export function EffectLogList({ effects }) {
  if (effects.length === 0) {
    return <div className="empty-state">Chưa có effect nào được phát</div>;
  }
  return (
    <div className="effect-list">
      {effects.map((e) => (
        <div key={e.commandId} className="feed-row effect-row">
          <div className="effect-row-top">
            <span className="row-time">{new Date(e.issuedAt).toLocaleTimeString()}</span>
            <strong className="row-user">{nameOf(e)}</strong>
            <span className={`effect-badge effect-${metaOf(e.status).cls}`}>{metaOf(e.status).label}</span>
          </div>
          {(e.summary || e.reason) && (
            <div className="effect-row-sub">
              {e.summary}
              {e.reason ? ` — ${e.reason}` : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
