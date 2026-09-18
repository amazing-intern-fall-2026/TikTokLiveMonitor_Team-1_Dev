// frontend/src/pages/OverlayPage.jsx
import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const METRIC_LABEL = {
    EVENT_COUNT: 'lượt',
    UNIQUE_USER_COUNT: 'người',
    DIAMOND_VALUE: '💎',
};

export default function OverlayPage() {
    const [rulesById, setRulesById] = useState({});

    useEffect(() => {
        const prevBodyBg = document.body.style.background;
        const prevHtmlBg = document.documentElement.style.background;
        document.body.style.background = 'transparent';
        document.documentElement.style.background = 'transparent';
        return () => {
            document.body.style.background = prevBodyBg;
            document.documentElement.style.background = prevHtmlBg;
        };
    }, []);

    useEffect(() => {
        const socket = io(`${SOCKET_SERVER_URL}/monitor`, {
            transports: ['websocket', 'polling'],
            autoConnect: true,
        });

        const handleProgress = (data) => {
            console.log('[OVERLAY] Nhận RULE_PROGRESS:', data);
            if (!data || data.ruleId === undefined) return;
            setRulesById((prev) => ({
                ...prev,
                [data.ruleId]: data
            }));
        };

        socket.on('RULE_PROGRESS', handleProgress);

        return () => {
            socket.off('RULE_PROGRESS', handleProgress);
            socket.disconnect();
        };
    }, []);

    const rules = Object.values(rulesById);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'transparent', pointerEvents: 'none', select: 'none', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
            <div
                style={{
                    position: 'absolute',
                    bottom: 24,
                    left: 24,
                    width: 340,
                    background: 'rgba(15, 17, 23, 0.85)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#25f4ee', display: 'inline-block' }} />
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f4f4f2', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        Mục Tiêu Phòng LIVE
                    </p>
                </div>

                {rules.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: '#9a9a9a' }}>Đang chờ rule đầu tiên ghi nhận sự kiện...</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {rules.map((r) => {
                            const pct = r.target ? Math.min(100, Math.round((r.current / r.target) * 100)) : 0;
                            const isCooldown = Boolean(r.onCooldown);
                            return (
                                <div key={r.ruleId} style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: isCooldown ? 0.6 : 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                                        <span style={{ color: '#ffffff', fontWeight: 600 }}>{r.ruleName || `Rule #${r.ruleId}`}</span>
                                        <span style={{ color: isCooldown ? '#f59e0b' : '#25f4ee', fontFamily: 'monospace', flexShrink: 0 }}>
                                            {isCooldown ? '⏳ Đang hồi' : `${r.current}/${r.target ?? '?'} ${METRIC_LABEL[r.metric] || ''}`}
                                        </span>
                                    </div>
                                    <div style={{ height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                                        <div
                                            style={{
                                                height: '100%',
                                                width: `${pct}%`,
                                                background: isCooldown ? '#f59e0b' : pct >= 100 ? '#fe2c55' : 'linear-gradient(90deg, #25f4ee, #00b4d8)',
                                                transition: 'width 0.3s ease',
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}