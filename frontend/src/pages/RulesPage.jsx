// frontend/src/pages/RulesPage.jsx
// [CLAUDE EDIT 2026-10-02] Gốc: import React, { useState, useEffect, useCallback } from 'react';
// (bỏ useCallback vì fetchRules đã được thay bằng loadRules/applyRules, xem bên dưới).
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

// FR-22: chuyển đổi giữa rule của backend (docs/api/rule-management-api-spec.md:
// condition = { condition: {keywords[], matchMode, ...}, threshold: {metric, value, window} })
// và form phẳng của trang này. Cột DB event_type dùng CHAT, UI hiển thị COMMENT.
const EVENT_TYPE_TO_SOURCE = { CHAT: 'COMMENT', GIFT: 'GIFT', JOIN: 'JOIN' };
const SOURCE_TO_EVENT_TYPE = { COMMENT: 'CHAT', GIFT: 'GIFT', JOIN: 'JOIN' };

function toFormRule(r) {
    const inner = r.condition?.condition || {};
    const threshold = r.condition?.threshold || {};
    const eff = r.effect || {};
    return {
        id: `RULE-${r.id}`,
        rawId: r.id,
        name: r.name,
        source: EVENT_TYPE_TO_SOURCE[r.event_type] || 'GIFT',
        matchMode: inner.matchMode || 'ANY',
        keywords: (inner.keywords || []).join(', '),
        metric: threshold.metric || 'EVENT_COUNT',
        thresholdValue: threshold.value ?? 1,
        windowSec: threshold.window?.type === 'ROLLING' ? (threshold.window.seconds ?? 0) : 0,
        effectCode: eff.effectCode || '',
        polarity: eff.polarity || 'BUFF',
        cooldownMs: eff.cooldownMs ?? 0,
        maxTriggers: eff.maxTriggersPerSession ?? 5,
        priority: eff.priority ?? 5,
        enabled: r.is_active,
        // Bản gốc: giữ các trường form không hiển thị (giftId, giftTier, userFilter, target,
        // magnitude, durationMs, resetMode) để Lưu không làm mất chúng.
        raw: { condition: r.condition || {}, effect: eff },
    };
}

function newRuleForm() {
    return {
        name: 'Rule mới',
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
        enabled: true,
        // Game cần target/magnitude/durationMs trong EFFECT_COMMAND (interface contract v1.0).
        raw: { condition: {}, effect: { target: 'ALL_CHARACTERS', magnitude: 1, durationMs: 5000, resetMode: 'RESET_ZERO' } },
    };
}

function toRuleBody(form) {
    const rawCondition = form.raw?.condition || {};
    const inner = { ...(rawCondition.condition || {}), matchMode: form.matchMode };
    const keywords = String(form.keywords || '').split(',').map((k) => k.trim()).filter(Boolean);
    if (keywords.length > 0) {
        inner.keywords = keywords;
    } else {
        delete inner.keywords;
    }
    const windowSec = Number(form.windowSec);
    return {
        name: form.name.trim(),
        eventType: SOURCE_TO_EVENT_TYPE[form.source],
        condition: {
            ...rawCondition,
            condition: inner,
            threshold: {
                ...(rawCondition.threshold || {}),
                metric: form.metric,
                value: Number(form.thresholdValue),
                window: windowSec > 0 ? { type: 'ROLLING', seconds: windowSec } : { type: 'SESSION' },
            },
        },
        effect: {
            ...(form.raw?.effect || {}),
            effectCode: form.effectCode.trim(),
            polarity: form.polarity,
            cooldownMs: Number(form.cooldownMs),
            maxTriggersPerSession: Number(form.maxTriggers),
            priority: Number(form.priority),
        },
        isActive: form.enabled ?? true,
    };
}

export default function RulesPage() {
    const [rules, setRules] = useState([]);
    // [CLAUDE EDIT 2026-10-02] Gốc: useState(false). loadRules() chạy ngay khi mount và không còn
    // tự setLoading(true) (tránh setState đồng bộ trong effect), nên bắt đầu ở trạng thái đang tải.
    const [loading, setLoading] = useState(true);
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

    // [CLAUDE EDIT 2026-10-02] Code gốc của hao (3c140b4), giữ lại để tham khảo.
    // Lý do sửa: (1) đọc sai cấu trúc rule của backend -- condition thật là
    // { condition: {keywords[], matchMode}, threshold: {metric, value, window} } và effect dùng
    // maxTriggersPerSession, nên form hiện sai giá trị và lúc lưu gửi condition thiếu threshold
    // (backend đúng spec trả 400, bản routes cũ thì lưu rule hỏng mà RuleEngine không bao giờ bắn);
    // (2) 3 cảnh báo lint (setState đồng bộ trong effect, thiếu dependency) -> chọn rule bằng
    // event handler thay cho effect đồng bộ formData; (3) /toggle -> PATCH /enable theo spec.
    // const fetchRules = useCallback(async () => {
    //     setLoading(true);
    //     try {
    //         const data = await api.getRules();
    //         // Map dữ liệu DB sang UI format tương ứng
    //         const mapped = (data || []).map((r) => {
    //             const cond = r.condition || {};
    //             const eff = r.effect || {};
    //             return {
    //                 id: `RULE-${r.id}`,
    //                 rawId: r.id,
    //                 name: r.name,
    //                 source: r.event_type || 'GIFT',
    //                 matchMode: cond.matchMode || 'ANY',
    //                 keywords: cond.keywords || '',
    //                 metric: cond.metric || 'DIAMOND_VALUE',
    //                 thresholdValue: cond.thresholdValue || 1000,
    //                 windowSec: cond.windowSec || 0,
    //                 effectCode: eff.effectCode || 'BUFF',
    //                 polarity: eff.polarity || 'BUFF',
    //                 cooldownMs: eff.cooldownMs || 30000,
    //                 maxTriggers: eff.maxTriggers || 5,
    //                 priority: eff.priority || 5,
    //                 enabled: r.is_active
    //             };
    //         });
    //         setRules(mapped);
    //         if (mapped.length > 0 && !selectedRuleId) {
    //             setSelectedRuleId(mapped[0].id);
    //             setFormData(mapped[0]);
    //         }
    //     } catch (err) {
    //         showNotification('error', `Lỗi tải danh sách rule: ${err.message}`);
    //     } finally {
    //         setLoading(false);
    //     }
    // }, [selectedRuleId]);
    //
    // useEffect(() => {
    //     fetchRules();
    // }, [fetchRules]);
    //
    // const selectedRule = rules.find((r) => r.id === selectedRuleId) || rules[0] || formData;
    //
    // useEffect(() => {
    //     if (selectedRule) {
    //         setFormData(selectedRule);
    //     }
    // }, [selectedRuleId, rules]);
    //
    // const handleToggleEnable = async (ruleRawId, e) => {
    //     e.stopPropagation();
    //     try {
    //         await api.toggleRule(ruleRawId);
    //         showNotification('success', 'Đã cập nhật trạng thái rule thành công.');
    //         fetchRules();
    //     } catch (err) {
    //         showNotification('error', `Lỗi đổi trạng thái: ${err.message}`);
    //     }
    // };

    // Đưa danh sách rule từ API vào state và chọn rule `selectRawId` (mặc định rule đầu tiên).
    const applyRules = (data, selectRawId) => {
        const mapped = (data || []).map(toFormRule);
        setRules(mapped);
        const next = mapped.find((r) => r.rawId === selectRawId) || mapped[0];
        setSelectedRuleId(next ? next.id : null);
        setFormData(next || newRuleForm());
        setFormErrors({});
    };

    // Tải lại sau khi lưu/bật tắt/huỷ (gọi từ event handler).
    const loadRules = async (selectRawId) => {
        try {
            applyRules(await api.getRules(), selectRawId);
        } catch (err) {
            showNotification('error', `Lỗi tải danh sách rule: ${err.message}`);
        }
    };

    // Lần tải đầu: setState chỉ trong callback của promise (cùng cách SessionHistoryModal).
    useEffect(() => {
        let cancelled = false;
        api.getRules()
            .then((data) => {
                if (!cancelled) applyRules(data);
            })
            .catch((err) => {
                if (!cancelled) showNotification('error', `Lỗi tải danh sách rule: ${err.message}`);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const handleSelectRule = (rule) => {
        setSelectedRuleId(rule.id);
        setFormData(rule);
        setFormErrors({});
    };

    const handleToggleEnable = async (rule, e) => {
        e.stopPropagation();
        try {
            await api.setRuleEnabled(rule.rawId, !rule.enabled);
            showNotification('success', `Đã ${rule.enabled ? 'tắt' : 'bật'} rule "${rule.name}".`);
            loadRules(formData.rawId);
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
        // [CLAUDE EDIT 2026-10-02] Thêm 2 kiểm tra khớp ruleValidator.js ở backend.
        if (!Number.isInteger(Number(formData.cooldownMs)) || Number(formData.cooldownMs) < 0) {
            errors.cooldownMs = 'Cooldown phải là số nguyên ≥ 0.';
        }
        if (!Number.isInteger(Number(formData.maxTriggers)) || Number(formData.maxTriggers) < 1) {
            errors.maxTriggers = 'Số lần tối đa/phiên phải là số nguyên ≥ 1.';
        }
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSaveRule = async () => {
        if (!validateForm()) {
            showNotification('error', 'Vui lòng kiểm tra lại thông tin cấu hình rule.');
            return;
        }

        // [CLAUDE EDIT 2026-10-02] Code gốc của hao (3c140b4), giữ lại để tham khảo.
        // Lý do sửa: payload sai cấu trúc (thiếu condition.threshold, maxTriggers thay vì
        // maxTriggersPerSession, eventType COMMENT) và luôn POST nên "Lưu" một rule có sẵn lại
        // tạo rule mới thay vì sửa. Giờ: rule có sẵn -> PUT, rule mới -> POST (toRuleBody).
        // try {
        //     const payload = {
        //         name: formData.name,
        //         eventType: formData.source,
        //         condition: {
        //             matchMode: formData.matchMode,
        //             keywords: formData.keywords,
        //             metric: formData.metric,
        //             thresholdValue: Number(formData.thresholdValue),
        //             windowSec: Number(formData.windowSec)
        //         },
        //         effect: {
        //             effectCode: formData.effectCode,
        //             polarity: formData.polarity,
        //             cooldownMs: Number(formData.cooldownMs),
        //             maxTriggers: Number(formData.maxTriggers),
        //             priority: Number(formData.priority)
        //         },
        //         isActive: formData.enabled ?? true
        //     };
        //
        //     await api.createRule(payload);
        //     showNotification('success', 'Đã lưu và đồng bộ cấu hình Rule sang Rule Engine thành công.');
        //     fetchRules();
        // } catch (err) {
        //     showNotification('error', `Lưu rule thất bại: ${err.message}`);
        // }
        try {
            const body = toRuleBody(formData);
            const saved = formData.rawId
                ? await api.updateRule(formData.rawId, body)
                : await api.createRule(body);
            showNotification('success', 'Đã lưu và đồng bộ cấu hình Rule sang Rule Engine thành công.');
            loadRules(saved.id);
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
                {/* [CLAUDE EDIT 2026-10-02] Code gốc của hao: onClick={() => { setFormData({ name: 'Rule mới tự động',
                    source: 'GIFT', ..., enabled: true }); }} -- chỉ đổi form nhưng vẫn giữ rule đang chọn (Lưu sẽ ghi
                    đè rule đó) và thiếu target/magnitude/durationMs mà Game cần. Giờ dùng newRuleForm() + bỏ chọn rule. */}
                <button className="tk-btn-connect" onClick={() => {
                    setSelectedRuleId(null);
                    setFormData(newRuleForm());
                    setFormErrors({});
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
                                // [CLAUDE EDIT 2026-10-02] Gốc: onClick={() => setSelectedRuleId(r.id)} và
                                // onChange={(e) => handleToggleEnable(r.rawId, e)} -- xem handleSelectRule/handleToggleEnable.
                                onClick={() => handleSelectRule(r)}
                            >
                                <input
                                    type="checkbox"
                                    className="custom-checkbox"
                                    checked={r.enabled}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => handleToggleEnable(r, e)}
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
                                {/* [CLAUDE EDIT 2026-10-02] Gốc có thêm 2 option dưới; RuleEngine/ruleValidator chỉ hỗ trợ ANY|ALL nên lưu sẽ bị 400.
                                <option value="EXACT">EXACT</option>
                                <option value="REGEX">REGEX</option> */}
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
                                {/* [CLAUDE EDIT 2026-10-02] Gốc có option NEUTRAL; contract/ruleValidator chỉ có BUFF|DEBUFF nên lưu sẽ bị 400.
                                <option value="NEUTRAL">NEUTRAL</option> */}
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
                            {formErrors.cooldownMs && <span style={{ color: 'red', fontSize: '12px' }}>{formErrors.cooldownMs}</span>}
                        </div>
                        <div>
                            <label className="field-label">Max lần/phiên</label>
                            <input
                                type="number"
                                value={formData.maxTriggers}
                                onChange={(e) => handleUpdateField('maxTriggers', Number(e.target.value))}
                            />
                            {formErrors.maxTriggers && <span style={{ color: 'red', fontSize: '12px' }}>{formErrors.maxTriggers}</span>}
                        </div>
                    </div>

                    <div className="card-actions">
                        {/* [CLAUDE EDIT 2026-10-02] Gốc: onClick={() => fetchRules()} -- fetchRules đã thay bằng loadRules. */}
                        <button className="btn-cancel" onClick={() => loadRules(formData.rawId)}>Huỷ</button>
                        <button className="btn-save" onClick={handleSaveRule}>Lưu rule</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
