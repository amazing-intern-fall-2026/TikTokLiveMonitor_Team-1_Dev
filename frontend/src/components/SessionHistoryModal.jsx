// frontend/src/components/SessionHistoryModal.jsx
// FR-38: xem lại các phiên ĐÃ ĐÓNG; FR-37: tải báo cáo CSV từng phiên.
// Chỉ hiển thị khi Dashboard mở modal này (xem nút "Lịch sử phiên" trong
// DashboardPage.jsx) -- không tự fetch cho tới khi mở, tránh gọi API thừa.
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

const PAGE_SIZE = 10;

export default function SessionHistoryModal({ onClose }) {
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ sessions: [], total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSessions({ page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setErrorMessage(err.message || 'Không tải được danh sách phiên');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, retry]);

  const loadPage = (nextPage) => {
    setIsLoading(true);
    setErrorMessage('');
    setPage(nextPage);
    setRetry((value) => value + 1);
  };

  const handleDownload = async (sessionId) => {
    setDownloadingId(sessionId);
    try {
      await api.downloadSessionCsv(sessionId);
    } catch (err) {
      alert(`Lỗi tải CSV: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card session-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Lịch sử phiên</h2>
          <button className="btn btn-sm btn-outline" onClick={onClose}>
            Đóng
          </button>
        </div>

        {errorMessage && <div role="alert" className="alert alert-error">{errorMessage} <button className="btn btn-sm" onClick={() => loadPage(page)}>Thử lại</button></div>}

        {isLoading ? (
          <div className="empty-state">Đang tải...</div>
        ) : errorMessage ? null : data.sessions.length === 0 ? (
          <div className="empty-state">Chưa có phiên nào đã đóng</div>
        ) : (
          <div className="session-history-table-wrap">
            <table className="session-history-table">
              <thead>
                <tr>
                  <th>Phòng</th>
                  <th>Bắt đầu</th>
                  <th>Thời lượng</th>
                  <th>💬</th>
                  <th>👤</th>
                  <th>🎁</th>
                  <th>💎</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr key={s.session_id}>
                    <td>@{s.host_username}</td>
                    <td>{new Date(s.connected_at).toLocaleString()}</td>
                    <td>{Math.round(s.duration_seconds / 60)} phút</td>
                    <td>{s.total_comments}</td>
                    <td>{s.total_joins}</td>
                    <td>{s.total_gifts}</td>
                    <td>{s.total_diamonds}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={downloadingId === s.session_id}
                        onClick={() => handleDownload(s.session_id)}
                      >
                        {downloadingId === s.session_id ? 'Đang tải...' : '⬇ CSV'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.totalPages > 1 && (
          <div className="session-history-pagination">
            <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => loadPage(page - 1)}>
              ← Trước
            </button>
            <span>
              Trang {data.page} / {data.totalPages}
            </span>
            <button
              className="btn btn-sm btn-outline"
              disabled={page >= data.totalPages}
              onClick={() => loadPage(page + 1)}
            >
              Sau →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
