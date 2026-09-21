// frontend/src/hooks/useLiveSocket.js
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const MAX_FEED_ITEMS = 200; // NFR-PERF-05 & FR-13: Chống tràn bộ nhớ DOM

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
    const [chatEvents, setChatEvents] = useState([]);
    const [joinEvents, setJoinEvents] = useState([]);
    const [giftEvents, setGiftEvents] = useState([]);
    const [viewerCount, setViewerCount] = useState(0);
    const [stats, setStats] = useState({ comments: 0, diamonds: 0, totalGifts: 0, joins: 0 });

    const socketRef = useRef(null);

    useEffect(() => {
        // Namespace /monitor (tách riêng khỏi /game, nơi backend phát
        // EffectCommand cho Game Client) -- xem backend/src/sockets/socket.service.js
        const socket = io(`${SOCKET_SERVER_URL}/monitor`, {
            transports: ['websocket', 'polling'],
            autoConnect: true,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            setConnectionStatus((prev) => (prev === 'RECONNECTING' ? 'CONNECTED' : prev));
        });

        socket.on('disconnect', () => {
            setConnectionStatus((prev) => (prev === 'CONNECTED' ? 'RECONNECTING' : prev));
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

            const item = {
                id: data.eventId || `gift_${Date.now()}_${Math.random()}`,
                user: resolveUserName(data, 'Khán giả'),
                giftName: data.payload?.giftName || data.giftName,
                giftImageUrl: data.payload?.giftImageUrl,
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
    }, []);

    return {
        connectionStatus,
        setConnectionStatus,
        chatEvents,
        joinEvents,
        giftEvents,
        viewerCount,
        stats,
    };
}