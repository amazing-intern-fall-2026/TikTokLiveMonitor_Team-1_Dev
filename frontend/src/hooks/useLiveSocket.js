// frontend/src/hooks/useLiveSocket.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { api } from '../services/api';

const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const MAX_FEED_ITEMS = 200; // NFR-PERF-05 & FR-13: Chống tràn bộ nhớ DOM

const EMPTY_STATS = { comments: 0, diamonds: 0, totalGifts: 0, joins: 0 };
const EMPTY_ROOM_INFO = { avatarUrl: null, liveStartedAt: null };

// Helper phân giải tên khán giả chuẩn Envelope Contract (Mục 4.2 SRS)
function resolveUserName(data, fallback = 'Khán giả') {
    if (!data) return fallback;
    return (
        data.user?.nickname ||
        data.user?.uniqueId ||
        data.nickname ||
        data.username ||
        fallback
    );
}

export function useLiveSocket() {
    const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED');
    const [activeRoom, setActiveRoom] = useState('');
    const [socketError, setSocketError] = useState('');
    const [liveError, setLiveError] = useState('');
    const [chatEvents, setChatEvents] = useState([]);
    const [joinEvents, setJoinEvents] = useState([]);
    const [giftEvents, setGiftEvents] = useState([]);
    const [viewerCount, setViewerCount] = useState(0);
    const [stats, setStats] = useState(EMPTY_STATS);
    // FR-32: trạng thái pause effect, đồng bộ qua socket event
    // 'EFFECT_PAUSE_STATE' trên /monitor (RuleEngine.service.js#setEffectsPaused)
    // -- không tự đoán/toggle ở FE, luôn tin theo giá trị backend phát ra để
    // mọi dashboard đang mở (nhiều Operator/tab) thấy đúng cùng 1 trạng thái.
    const [isPaused, setIsPaused] = useState(false);

    // FR-09: streamer avatar + TikTok-reported LIVE start time, from the
    // backend's ROOM_INFO broadcast (see liveStream.service.js).
    const [roomInfo, setRoomInfo] = useState(EMPTY_ROOM_INFO);
    // FR-08: the TikTok room's own state -- LIVE | RECONNECTING | ENDED |
    // DISCONNECTED, from the backend's ROOM_STATUS broadcast. Distinct from
    // connectionStatus above, which is only about our own Socket.IO link to
    // the backend, not whether the TikTok LIVE itself is still going.
    const [roomStatus, setRoomStatus] = useState(null);

    const socketRef = useRef(null);

    // Vá lỗi chuyển phòng: gọi ngay sau khi đổi @handle kết nối thành công,
    // đưa toàn bộ feed + số liệu về 0 thay vì cộng dồn từ phòng trước.
    // Backend chưa phát event SESSION_RESET qua /monitor nên chủ động reset
    // phía FE ngay khi connect thành công (xem DashboardPage.handleConnectRoom);
    // nhánh lắng nghe 'SESSION_RESET' bên dưới sẵn sàng dùng khi backend có.
    const resetDashboardState = useCallback(() => {
        setChatEvents([]);
        setJoinEvents([]);
        setGiftEvents([]);
        setViewerCount(0);
        setStats(EMPTY_STATS);
        setRoomInfo(EMPTY_ROOM_INFO);
        setRoomStatus(null);
    }, []);

    useEffect(() => {
        // Namespace /monitor (tách riêng khỏi /game, nơi backend phát
        // EffectCommand cho Game Client) -- xem backend/src/sockets/socket.service.js
        const socket = io(`${SOCKET_SERVER_URL}/monitor`, {
            transports: ['websocket', 'polling'],
            autoConnect: true,
        });
        socketRef.current = socket;

        socket.on('connect', () => setSocketError(''));
        socket.on('disconnect', () => {
            setSocketError('Mất kết nối tới máy chủ. Đang kết nối lại…');
        });
        socket.on('connect_error', () => {
            setSocketError('Không thể kết nối tới máy chủ. Đang kết nối lại…');
        });
        socket.on('LIVE_STATUS', (data) => {
            if (!['CONNECTED', 'DISCONNECTED', 'RECONNECTING', 'ENDED', 'ERROR'].includes(data?.status)) return;
            setConnectionStatus(data.status);
            setActiveRoom(data.username || '');
            setLiveError(data.status === 'ERROR' ? (data.message || 'Không thể kết nối phòng LIVE') : '');
        });

        // Chưa được backend phát ở thời điểm này (chỉ có CHAT/GIFT/MEMBER_JOIN/
        // RULE_PROGRESS) -- để sẵn nhánh này để cắm vào ngay khi có, không phải
        // chờ backend xong mới sửa FE lần nữa.
        socket.on('SESSION_RESET', resetDashboardState);

        // FR-32: cờ pause do RuleEngine.service.js#setEffectsPaused phát ra
        // (event 'EFFECT_PAUSE_STATE', payload { paused, issuedAt }) mỗi khi
        // Operator bấm "Tạm dừng"/"Tiếp tục" ở BẤT KỲ tab nào -- không chỉ
        // tab vừa bấm, nên nhiều dashboard cùng mở luôn đồng bộ.
        socket.on('EFFECT_PAUSE_STATE', (data) => {
            if (typeof data?.paused === 'boolean') {
                setIsPaused(data.paused);
            }
        });

        // Lấy trạng thái pause hiện tại ngay khi mount (mở tab mới / F5) --
        // không đợi lần EFFECT_PAUSE_STATE broadcast kế tiếp mới biết.
        api.getEffectStatus()
            .then((data) => {
                if (typeof data?.paused === 'boolean') {
                    setIsPaused(data.paused);
                }
            })
            .catch(() => {
                // Best-effort: nếu backend chưa có route này (chưa deploy phần
                // FR-32), giữ nguyên mặc định isPaused=false, không chặn UI.
            });

        // FR-09: streamer avatar + LIVE start time, sent once right after a
        // successful connect (also available synchronously from the
        // /connect REST response -- see api.connectRoom -- this listener
        // covers the reconnect case, where only the socket broadcasts it).
        socket.on('ROOM_INFO', (data) => {
            setRoomInfo({
                avatarUrl: data.avatarUrl ?? null,
                liveStartedAt: data.liveStartedAt ?? null,
            });
        });

        // FR-08: LIVE | RECONNECTING | ENDED | DISCONNECTED -- lets the
        // dashboard tell "TikTok LIVE thực sự đã kết thúc" apart from
        // "mất mạng tạm thời, đang thử kết nối lại" instead of treating
        // every drop the same way.
        socket.on('ROOM_STATUS', (data) => {
            if (data?.status) setRoomStatus(data.status);
        });

        // 1. CHAT (SRS 4.3)
        socket.on('CHAT', (data) => {
            const commentText = data.payload?.text ?? data.comment ?? '';
            const item = {
                id: data.eventId || `chat_${data.createTime || Date.now()}_${Math.random()}`,
                user: resolveUserName(data, 'Khán giả'),
                text: commentText,
                timestamp: data.receivedAt || data.createTime || Date.now(),
            };
            setChatEvents((prev) => [item, ...prev.slice(0, MAX_FEED_ITEMS - 1)]);
            setStats((prev) => ({ ...prev, comments: prev.comments + 1 }));
        });

        // 2. MEMBER_JOIN (SRS 4.4)
        socket.on('MEMBER_JOIN', (data) => {
            const snapshot = data.payload?.viewerCountSnapshot ?? data.viewerCount;
            if (snapshot !== undefined) setViewerCount(Number(snapshot));

            const item = {
                id: data.eventId || `join_${Date.now()}_${Math.random()}`,
                user: resolveUserName(data, 'Người xem'),
                timestamp: data.receivedAt || data.createTime || Date.now(),
            };
            setJoinEvents((prev) => [item, ...prev.slice(0, MAX_FEED_ITEMS - 1)]);
            setStats((prev) => ({ ...prev, joins: prev.joins + 1 }));
        });

        // 2b. VIEWER_COUNT -- periodic tick from ROOM_USER, updates the live count
        // directly instead of waiting for the next JOIN to carry a snapshot.
        socket.on('VIEWER_COUNT', (data) => {
            const count = data.payload?.viewerCount;
            if (count !== undefined) setViewerCount(Number(count));
        });

        // 3. GIFT (SRS 4.5 & BR-GF-01: Chống đếm trùng chuỗi quà)
        socket.on('GIFT', (data) => {
            const isFinished = data.payload?.isStreakFinished ?? (data.repeatEnd !== undefined ? Boolean(data.repeatEnd) : true);
            const repeatCount = Number(data.payload?.repeatCount || data.repeatCount || 1);
            const unitDiamonds = Number(data.payload?.unitDiamondValue || data.diamondCount || 0);
            const totalDiamonds = data.payload?.totalDiamondValue ?? (unitDiamonds * repeatCount);
            // giftImageUrl: field optional theo SRS mục 4.5 -- backend có thể
            // chưa gửi (chờ Đạt bổ sung vào payload GIFT), nên luôn có fallback
            // undefined an toàn, không throw khi field vắng mặt (BR-DATA-01).
            const giftImageUrl = data.payload?.giftImageUrl ?? data.giftImageUrl ?? null;

            const item = {
                id: data.eventId || `gift_${Date.now()}_${Math.random()}`,
                user: resolveUserName(data, 'Khán giả'),
                giftName: data.payload?.giftName || data.giftName,
                giftImageUrl,
                repeatCount,
                diamonds: totalDiamonds,
                isFinished,
                timestamp: data.receivedAt || data.createTime || Date.now(),
            };
            setGiftEvents((prev) => [item, ...prev.slice(0, MAX_FEED_ITEMS - 1)]);
            if (isFinished) {
                setStats((prev) => ({
                    ...prev,
                    totalGifts: prev.totalGifts + repeatCount,
                    diamonds: prev.diamonds + totalDiamonds,
                }));
            }
        });

        return () => socket.disconnect();
    }, [resetDashboardState]);

    return {
        connectionStatus,
        setConnectionStatus,
        activeRoom,
        setActiveRoom,
        socketError,
        liveError,
        chatEvents,
        joinEvents,
        giftEvents,
        viewerCount,
        stats,
        roomInfo,
        setRoomInfo,
        roomStatus,
        setRoomStatus,
        resetDashboardState,
        isPaused,
    };
}