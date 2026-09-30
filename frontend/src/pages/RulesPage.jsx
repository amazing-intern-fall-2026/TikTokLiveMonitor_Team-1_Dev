// frontend/src/pages/RulesPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

export default function RulesPage() {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedRuleId, setSelectedRuleId] = useState(null);
    const [notification, setNotification] = useState({ type: '', message: '' });

    // Form state cho Rule được chọn hoặc tạo mới
    const [formData, setFormData] = useState({
        name: '',
        eventType: 'GIFT',
        keywords: '',
        metric: 'DIAMOND_VALUE',
        thresholdValue: 1000,
        windowSec: 0,
        effectCode: 'HEAL_HP',
        polarity: 'BUFF',
        cooldownMs: 30000,
        maxTriggers: 5,
        priority: 5,
        isActive: true
    });

    const [formErrors, setFormErrors] = useState({});

    const showNotification = (type, message) => {
        setNotification({ type, message });
        setTimeout(() => setNotification({ type: '', message: '' }), 4000);
    };

    const fetchRules = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getRules();
            // Map dữ liệu DB sang UI format tương ứng
            const mapped = (data || []).map((r) => {
                const cond = r.condition || {};
                const eff = r.effect || {};
                return {
                    id: `RULE-${r.id}`,
                    rawId: r.id,
                    name: r.name,
                    source: r.event_type || 'GIFT',
                    matchMode: cond.matchMode || 'ANY',
                    keywords: cond.keywords || '',
                    metric: cond.metric || 'DIAMOND_VALUE',
                    thresholdValue: cond.thresholdValue || 1000,
                    windowSec: cond.windowSec || 0,
                    effectCode: eff.effectCode || 'BUFF',
                    polarity: eff.polarity || 'BUFF',
                    cooldownMs: eff.cooldownMs || 30000,
                    maxTriggers: eff.maxTriggers || 5,
                    priority: eff.priority || 5,
                    enabled: r.is_active
                };
            });
            setRules(mapped);
            if (mapped.length > 0 && !selectedRuleId) {
                setSelectedRuleId(mapped[0].id);
                setFormData(mapped[0]);
            }
        } catch (err) {
            showNotification('error', `Lỗi tải danh sách rule: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, [selectedRuleId]);

    useEffect(() => {
        fetchRules();
    }, [fetchRules]);

    const selectedRule = rules.find((r) => r.id === selectedRuleId) || rules[0] || formData;

    useEffect(() => {
        if (selectedRule) {
            setFormData(selectedRule);
        }
    }, [selectedRuleId, rules]);

    const handleToggleEnable = async (ruleRawId, e) => {
        e.stopPropagation();
        try {
            await api.toggleRule(ruleRawId);
            showNotification('success', 'Đã cập nhật trạng thái rule thành công.');
            fetchRules();
        } catch (err) {
            showNotification('error', `Lỗi đổi trạng thái: ${err.message}`);
        }
    };

    const handleUpdateField = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (formErrors[field]) {
            setFormErrors((prev) => ({ ...prev, [field]: '' }));
        }
    };

    const validateForm = () => {
        const errors = {};
        if (!formData.name || !formData.name.trim()) {
            errors.name = 'Tên rule không được để trống.';
        }
        if (Number(formData.thresholdValue) <= 0) {
            errors.thresholdValue = 'Ngưỡng kích hoạt phải lớn hơn 0.';
        }
        if (!formData.effectCode || !formData.effectCode.trim()) {
            errors.effectCode = 'Mã hiệu ứng (effectCode) là bắt buộc.';
        }
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSaveRule = async () => {
        if (!validateForm()) {
            showNotification('error', 'Vui lòng kiểm tra lại thông tin cấu hình rule.');
            return;
        }

        try {
            const payload = {
                name: formData.name,
                eventType: formData.source,
                condition: {
                    matchMode: formData.matchMode,
                    keywords: formData.keywords,
                    metric: formData.metric,
                    thresholdValue: Number(formData.thresholdValue),
                    windowSec: Number(formData.windowSec)
                },
                effect: {
                    effectCode: formData.effectCode,
                    polarity: formData.polarity,
                    cooldownMs: Number(formData.cooldownMs),
                    maxTriggers: Number(formData.maxTriggers),
                    priority: Number(formData.priority)
                },
                isActive: formData.enabled ?? true
            };

            await api.createRule(payload);
            showNotification('success', 'Đã lưu và đồng bộ cấu hình Rule sang Rule Engine thành công.');
            fetchRules();
        } catch (err) {
            showNotification('error', `Lưu rule thất bại: ${err.message}`);
        }
    };

    return (
        <div className="tk-rules-view">
            <div className="tk-topbar">
                <div>
                    <h1 className="tk-page-title">Quản lý rule</h1>
                    <p className="tk-page-desc">FR-21 · FR-22 — Bật/tắt và tinh chỉnh rule trực tiếp trong lúc LIVE</p>
                </div>
                <button className="tk-btn-connect" onClick={() => {
                    setFormData({
                        name: 'Rule mới tự động',
                        source: 'GIFT',
                        matchMode: 'ANY',
                        keywords: '',
                        metric: 'DIAMOND_VALUE',
                        thresholdValue: 500,
                        windowSec: 0,
                        effectCode: 'BUFF',
                        polarity: 'BUFF',
                        cooldownMs: 30000,
                        maxTriggers: 5,
                        priority: 5,
                        enabled: true
                    });
                }}>
                    + Tạo rule mới
                </button>
            </div>

            {notification.message && (
                <div style={{
                    padding: '12px 16px',
                    margin: '12px 24px',
                    borderRadius: '6px',
                    backgroundColor: notification.type === 'error' ? '#ffebee' : '#e8f5e9',
                    color: notification.type === 'error' ? '#c62828' : '#2e7d32',
                    border: `1px solid ${notification.type === 'error' ? '#ef9a9a' : '#a5d6a7'}`
                }}>
                    {notification.message}
                </div>
            )}

            <div className="rule-view-container">
                {/* CỘT TRÁI: DANH SÁCH RULE */}
                <div className="rule-list">
                    {loading ? (
                        <p style={{ padding: '20px' }}>Đang tải danh sách...</p>
                    ) : rules.length === 0 ? (
                        <p style={{ padding: '20px' }}>Chưa có rule nào được cấu hình.</p>
                    ) : (
                        rules.map((r) => (
                            <div
                                key={r.id}
                                className={`rule-item ${r.id === selectedRuleId ? 'selected' : ''}`}
                                onClick={() => setSelectedRuleId(r.id)}
                            >
                                <input
                                    type="checkbox"
                                    className="custom-checkbox"
                                    checked={r.enabled}
                                    onChange={(e) => handleToggleEnable(r.rawId, e)}
                                />
                                <div className="rule-info">
                                    <p className="rule-title">{r.name}</p>
                                    <p className="rule-sub">{r.id} · Ưu tiên {r.priority}</p>
                                </div>
                                <div className="badge-group">
                                    <span className={`tag-pill tag-${r.source.toLowerCase()}`}>
                                        {r.source}
                                    </span>
                                    <span className="tag-effect">{r.effectCode}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* CỘT PHẢI: FORM CẤU HÌNH CHI TIẾT RULE */}
                <div className="rule-card">
                    <h2 className="card-title">
                        <input
                            type="text"
                            value={formData.name || ''}
                            onChange={(e) => handleUpdateField('name', e.target.value)}
                            style={{ fontSize: '20px', fontWeight: 'bold', width: '100%', border: '1px solid #ddd', padding: '4px 8px' }}
                        />
                    </h2>
                    {formErrors.name && <span style={{ color: 'red', fontSize: '12px' }}>{formErrors.name}</span>}
                    <p className="card-id">{formData.id || 'RULE-NEW'}</p>

                    <div className="section-label">Trigger</div>
                    <div className="grid-2">
                        <div>
                            <label className="field-label">Nguồn</label>
                            <select
                                value={formData.source}
                                onChange={(e) => handleUpdateField('source', e.target.value)}
                            >
                                <option value="COMMENT">COMMENT</option>
                                <option value="GIFT">GIFT</option>
                                <option value="JOIN">JOIN</option>
                            </select>
                        </div>
                        <div>
                            <label className="field-label">Match mode</label>
                            <select
                                value={formData.matchMode}
                                onChange={(e) => handleUpdateField('matchMode', e.target.value)}
                            >
                                <option value="ANY">ANY</option>
                                <option value="ALL">ALL</option>
                                <option value="EXACT">EXACT</option>
                                <option value="REGEX">REGEX</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="field-label">Từ khoá</label>
                        <input
                            type="text"
                            value={formData.keywords || ''}
                            onChange={(e) => handleUpdateField('keywords', e.target.value)}
                            placeholder="VD: GO, NHANH, CHAY"
                        />
                    </div>

                    <div className="section-label">Ngưỡng</div>
                    <div className="grid-3">
                        <div>
                            <label className="field-label">Metric</label>
                            <select
                                value={formData.metric}
                                onChange={(e) => handleUpdateField('metric', e.target.value)}
                            >
                                <option value="EVENT_COUNT">EVENT_COUNT</option>
                                <option value="UNIQUE_USER_COUNT">UNIQUE_USER_COUNT</option>
                                <option value="DIAMOND_VALUE">DIAMOND_VALUE</option>
                            </select>
                        </div>
                        <div>
                            <label className="field-label">Giá trị</label>
                            <input
                                type="number"
                                value={formData.thresholdValue}
                                onChange={(e) => handleUpdateField('thresholdValue', Number(e.target.value))}
                            />
                            {formErrors.thresholdValue && <span style={{ color: 'red', fontSize: '12px' }}>{formErrors.thresholdValue}</span>}
                        </div>
                        <div>
                            <label className="field-label">Cửa sổ (s)</label>
                            <input
                                type="number"
                                value={formData.windowSec}
                                onChange={(e) => handleUpdateField('windowSec', Number(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="section-label">Effect</div>
                    <div className="grid-2">
                        <div>
                            <label className="field-label">effectCode</label>
                            <input
                                type="text"
                                value={formData.effectCode || ''}
                                onChange={(e) => handleUpdateField('effectCode', e.target.value)}
                            />
                            {formErrors.effectCode && <span style={{ color: 'red', fontSize: '12px' }}>{formErrors.effectCode}</span>}
                        </div>
                        <div>
                            <label className="field-label">Polarity</label>
                            <select
                                value={formData.polarity}
                                onChange={(e) => handleUpdateField('polarity', e.target.value)}
                            >
                                <option value="BUFF">BUFF</option>
                                <option value="DEBUFF">DEBUFF</option>
                                <option value="NEUTRAL">NEUTRAL</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid-2">
                        <div>
                            <label className="field-label">Cooldown (ms)</label>
                            <input
                                type="number"
                                value={formData.cooldownMs}
                                onChange={(e) => handleUpdateField('cooldownMs', Number(e.target.value))}
                            />
                        </div>
                        <div>
                            <label className="field-label">Max lần/phiên</label>
                            <input
                                type="number"
                                value={formData.maxTriggers}
                                onChange={(e) => handleUpdateField('maxTriggers', Number(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="card-actions">
                        <button className="btn-cancel" onClick={() => fetchRules()}>Huỷ</button>
                        <button className="btn-save" onClick={handleSaveRule}>Lưu rule</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
