// frontend/src/components/RuleProgressSection.jsx
import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const DEFAULT_RULES = [
    {
        ruleId: 'RULE-001',
        name: '!HEAL',
        source: 'COMMENT',
        metric: 'EVENT_COUNT',
        current: 0,
        target: 1,
        percent: 0,
        cooldownRemainingMs: 0
    },
    {
        ruleId: 'RULE-006',
        name: 'Boss 1000💎',
        source: 'GIFT',
        metric: 'DIAMOND_VALUE',
        current: 0,
        target: 1000,
        percent: 0,
        cooldownRemainingMs: 0
    }
];

export default function RuleProgressSection() {
    const [rules, setRules] = useState(DEFAULT_RULES);

    useEffect(() => {
        const socket = io(SOCKET_SERVER_URL, {
            transports: ['websocket', 'polling'],
            autoConnect: true
        });

        socket.on('RULE_PROGRESS', (data) => {
            if (Array.isArray(data)) {
                setRules(data);
            }
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

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'nowrap',
                overflowX: 'auto',
                maxWidth: '650px'
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
                    whiteSpace: 'nowrap'
                }}
            >
                ⚡ FR-23:
            </span>

            {rules.map((rule) => {
                const isFull = rule.percent >= 100;
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
                            padding: '4px 10px',
                            minWidth: '220px'
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
                                        color: '#ffffff',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        maxWidth: '100px'
                                    }}
                                    title={rule.name}
                                >
                                    {rule.name}
                                </strong>
                                <span style={{ color: '#25f4ee', fontFamily: 'monospace', fontSize: '10px' }}>
                                    {rule.current}/{rule.target}
                                    {rule.metric === 'DIAMOND_VALUE' ? '💎' : ''}
                                </span>
                            </div>

                            {/* Mini progress bar */}
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

                        {/* Trạng thái phần trăm / Cooldown */}
                        <span
                            style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                color: rule.cooldownRemainingMs > 0 ? '#f59e0b' : isFull ? '#25f4ee' : '#75767a',
                                whiteSpace: 'nowrap'
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