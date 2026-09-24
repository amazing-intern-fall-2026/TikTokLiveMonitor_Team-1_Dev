// frontend/src/components/RuleProgressSection.jsx
import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Không dùng dữ liệu rule giả nữa — ruleId thật lấy từ bảng `rules` trên
// backend, không trùng với "RULE-001"/"RULE-006" đoán trước đây. Bắt đầu
// rỗng, tự lấp dần khi RULE_PROGRESS thật gửi tới.
const DEFAULT_RULES = [];

// Chưa có API liệt kê rule đã cấu hình sẵn (FR-21 CRUD rule chưa code),
// nên không biết trước có bao nhiêu rule để vẽ khung đúng số lượng thật.
// Vẽ tạm N khung placeholder ở 0% thay vì để trống hẳn, để Operator biết
// hệ thống đang chờ sự kiện chứ không phải bị treo/lỗi. Khung này biến mất
// dần khi rule thật (từ RULE_PROGRESS) lấp đầy -- xem renderedRules bên dưới.
const PLACEHOLDER_SLOT_COUNT = 3;

// Icon theo nguồn sự kiện trigger rule (SRS mục 6.2 trigger.source).
const SOURCE_ICON = {
    COMMENT: '💬',
    GIFT: '🎁',
    JOIN: '👤',
};

export default function RuleProgressSection() {
    const [rules, setRules] = useState(DEFAULT_RULES);

    useEffect(() => {
        const socket = io(`${SOCKET_SERVER_URL}/monitor`, {
            transports: ['websocket', 'polling'],
            autoConnect: true
        });

        socket.on('RULE_PROGRESS', (data) => {
            if (!data || !data.ruleId) return;
            setRules((prev) => {
                const idx = prev.findIndex((r) => r.ruleId === data.ruleId);
                const merged = {
                    ruleId: data.ruleId,
                    name: data.ruleName || data.ruleId,
                    source: data.source,
                    metric: data.metric,
                    current: data.current,
                    target: data.target,
                    percent: data.target ? Math.min(100, Math.round((data.current / data.target) * 100)) : 0,
                    cooldownRemainingMs: data.onCooldown ? (prev[idx]?.cooldownRemainingMs || 1000) : 0,
                };
                if (idx === -1) return [...prev, merged];
                const next = [...prev];
                next[idx] = merged;
                return next;
            });
        });

        const timer = setInterval(() => {
            setRules((prevRules) =>
                prevRules.map((r) =>
                    r.cooldownRemainingMs > 0
                        ? { ...r, cooldownRemainingMs: Math.max(0, r.cooldownRemainingMs - 1000) }
                        : r
                )
            );
        }, 1000);

        return () => {
            clearInterval(timer);
            socket.disconnect();
        };
    }, []);

    // Số khung placeholder cần vẽ thêm -- chỉ lấp phần còn thiếu, không vẽ
    // chồng lên rule thật đã có (vd. đã có 2 rule thật thì chỉ còn 1 placeholder).
    const placeholderCount = Math.max(0, PLACEHOLDER_SLOT_COUNT - rules.length);
    const placeholders = Array.from({ length: placeholderCount }, (_, i) => ({
        ruleId: `placeholder-${i}`,
        name: 'Đang chờ rule...',
        source: null,
        metric: null,
        current: 0,
        target: null,
        percent: 0,
        cooldownRemainingMs: 0,
        isPlaceholder: true,
    }));

    const renderedRules = [...rules, ...placeholders];

    return (
        // Đứng riêng 1 hàng dưới section-heading-row (xem DashboardPage.jsx)
        // thay vì chen chung với tiêu đề + nút Receiving -- đủ không gian để
        // các khung to rõ ràng, không bị ép chật như khi còn nằm chung hàng.
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                marginTop: '-8px',
            }}
        >
            <span
                style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#25f4ee',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                }}
            >
                🎯 Tiến độ mục tiêu:
            </span>

            {/* Tự xuống dòng khi màn hình hẹp (flexWrap: 'wrap' ở container
                cha) thay vì co nhỏ dần hay tràn ngang có scrollbar. Mỗi khung
                có minWidth cố định để chữ/số liệu luôn đọc được rõ ràng, và
                flex-grow để lấp hết phần dư khi có chỗ trống. */}
            {renderedRules.map((rule) => {
                const isFull = rule.percent >= 100;
                const icon = SOURCE_ICON[rule.source] || null;
                return (
                    <div
                        key={rule.ruleId}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: '#161823',
                            border: '1px solid #2f3136',
                            borderRadius: '6px',
                            padding: '6px 14px',
                            flex: '1 1 220px',
                            minWidth: '220px',
                            opacity: rule.isPlaceholder ? 0.45 : 1,
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: '11px',
                                    lineHeight: '1.2',
                                    marginBottom: '3px'
                                }}
                            >
                                <strong
                                    style={{
                                        color: rule.isPlaceholder ? '#75767a' : '#ffffff',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        minWidth: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                    }}
                                    title={rule.name}
                                >
                                    {icon && <span>{icon}</span>}
                                    {rule.name}
                                </strong>
                                <span style={{ color: rule.isPlaceholder ? '#75767a' : '#25f4ee', fontFamily: 'monospace', fontSize: '10px', flexShrink: 0, marginLeft: '6px' }}>
                                    {rule.isPlaceholder ? '0/0' : (
                                        <>
                                            {rule.current}/{rule.target}
                                            {rule.metric === 'DIAMOND_VALUE' ? '💎' : ''}
                                        </>
                                    )}
                                </span>
                            </div>

                            <div
                                style={{
                                    width: '100%',
                                    height: '4px',
                                    background: '#2a2a2a',
                                    borderRadius: '2px',
                                    overflow: 'hidden'
                                }}
                            >
                                <div
                                    style={{
                                        width: `${Math.min(100, rule.percent)}%`,
                                        height: '100%',
                                        background: isFull
                                            ? 'linear-gradient(90deg, #f59e0b, #fe2c55)'
                                            : 'linear-gradient(90deg, #25f4ee, #38bdf8)',
                                        transition: 'width 0.3s ease'
                                    }}
                                />
                            </div>
                        </div>

                        <span
                            style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                color: rule.cooldownRemainingMs > 0 ? '#f59e0b' : isFull ? '#25f4ee' : '#75767a',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                            }}
                        >
                            {rule.cooldownRemainingMs > 0
                                ? `${Math.ceil(rule.cooldownRemainingMs / 1000)}s`
                                : `${rule.percent}%`}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}