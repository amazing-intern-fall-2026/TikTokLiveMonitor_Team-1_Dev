// frontend/src/hooks/useLiveSocket.js
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const MAX_FEED_ITEMS = 200; // NFR-PERF-05 & FR-13: Chống tràn bộ nhớ DOM

// Envelope contract (mục 4.2 SRS) dùng "nickname" và "uniqueId" (field
// chuẩn của tiktok-live-connector cho @handle thật, LIVE thật không có
// "username" — field đó chỉ tồn tại ở mock do chính nhóm tự đặt tên).
function displayName(data) {
    return data?.nickname || data?.uniqueId || data?.username || 'Khán giả';
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
        const socket = io(SOCKET_SERVER_URL, {
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

        socket.on('CHAT', (data) => {
            const item = {
                id: `chat_${data.createTime || Date.now()}_${Math.random()}`,
                user: displayName(data),
                text: data.comment,
                timestamp: data.receivedAt || data.createTime || Date.now(),
            };
            setChatEvents((prev) => [item, ...prev.slice(0, MAX_FEED_ITEMS - 1)]);
            setStats((prev) => ({ ...prev, comments: prev.comments + 1 }));
        });

        socket.on('MEMBER_JOIN', (data) => {
            if (data.viewerCount !== undefined) setViewerCount(Number(data.viewerCount));
            const item = {
                id: `join_${Date.now()}_${Math.random()}`,
                user: displayName(data),
                timestamp: data.receivedAt || data.createTime || Date.now(),
            };
            setJoinEvents((prev) => [item, ...prev.slice(0, MAX_FEED_ITEMS - 1)]);
            setStats((prev) => ({ ...prev, joins: prev.joins + 1 }));
        });

        socket.on('GIFT', (data) => {
            const isFinished = data.repeatEnd !== undefined ? Boolean(data.repeatEnd) : true;
            const calculatedDiamonds = (Number(data.diamondCount) || 0) * (Number(data.repeatCount) || 1);
            const item = {
                id: `gift_${Date.now()}_${Math.random()}`,
                user: displayName(data),
                giftName: data.giftName,
                repeatCount: data.repeatCount || 1,
                diamonds: calculatedDiamonds,
                isFinished,
                timestamp: data.receivedAt || data.createTime || Date.now(),
            };
            setGiftEvents((prev) => [item, ...prev.slice(0, MAX_FEED_ITEMS - 1)]);
            if (isFinished) {
                setStats((prev) => ({
                    ...prev,
                    totalGifts: prev.totalGifts + (Number(data.repeatCount) || 1),
                    diamonds: prev.diamonds + calculatedDiamonds,
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