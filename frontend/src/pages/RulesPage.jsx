// frontend/src/pages/RulesPage.jsx
import React, { useState } from 'react';

const INITIAL_RULES = [
    {
        id: "RULE-007",
        name: "Bão comment - Tăng tốc",
        source: "COMMENT",
        matchMode: "ANY",
        keywords: "GO, NHANH, CHAY",
        metric: "EVENT_COUNT",
        thresholdValue: 30,
        windowSec: 60,
        effectCode: "SPEED_UP",
        polarity: "BUFF",
        cooldownMs: 30000,
        maxTriggers: 10,
        priority: 5,
        enabled: true
    },
    {
        id: "RULE-003",
        name: "Combo quà lớn - Hồi máu",
        source: "GIFT",
        matchMode: "ANY",
        keywords: "",
        metric: "DIAMOND_VALUE",
        thresholdValue: 1000,
        windowSec: 0,
        effectCode: "HEAL_HP",
        polarity: "BUFF",
        cooldownMs: 45000,
        maxTriggers: 5,
        priority: 8,
        enabled: true
    },
    {
        id: "RULE-012",
        name: "Bão join - Triệu hồi quái",
        source: "JOIN",
        matchMode: "ANY",
        keywords: "",
        metric: "UNIQUE_USER_COUNT",
        thresholdValue: 50,
        windowSec: 120,
        effectCode: "SPAWN_ENEMY",
        polarity: "DEBUFF",
        cooldownMs: 60000,
        maxTriggers: 3,
        priority: 3,
        enabled: false
    },
    {
        id: "RULE-009",
        name: "Comment tiêu cực - Làm chậm",
        source: "COMMENT",
        matchMode: "ANY",
        keywords: "SLOW, LAG, DUNG",
        metric: "EVENT_COUNT",
        thresholdValue: 20,
        windowSec: 30,
        effectCode: "SLOW_DOWN",
        polarity: "DEBUFF",
        cooldownMs: 30000,
        maxTriggers: 10,
        priority: 4,
        enabled: false
    }
];

export default function RulesPage() {
    const [rules, setRules] = useState(INITIAL_RULES);
    const [selectedRuleId, setSelectedRuleId] = useState("RULE-007");

    const selectedRule = rules.find((r) => r.id === selectedRuleId) || rules[0];

    // Bật/tắt Rule tức thì trong lúc live (FR-22)
    const handleToggleEnable = (ruleId, e) => {
        e.stopPropagation();
        setRules((prev) =>
            prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r))
        );
    };

    const handleUpdateField = (field, value) => {
        setRules((prev) =>
            prev.map((r) => (r.id === selectedRuleId ? { ...r, [field]: value } : r))
        );
    };

    const handleSaveRule = () => {
        // Gửi cấu hình Rule mới về Backend để đồng bộ sang Rule Engine
        alert(`Đã lưu cấu hình ${selectedRule.id} thành công và đồng bộ sang Game Engine!`);
    };

    return (
        <div className="tk-rules-view">
            <div className="tk-topbar">
                <div>
                    <h1 className="tk-page-title">Quản lý rule</h1>
                    <p className="tk-page-desc">FR-21 · FR-22 — Bật/tắt và tinh chỉnh rule trực tiếp trong lúc LIVE</p>
                </div>
                <button className="tk-btn-connect" onClick={() => alert('Mở popup tạo rule mới')}>
                    + Tạo rule mới
                </button>
            </div>

            <div className="rule-view-container">
                {/* CỘT TRÁI: DANH SÁCH RULE */}
                <div className="rule-list">
                    {rules.map((r) => (
                        <div
                            key={r.id}
                            className={`rule-item ${r.id === selectedRuleId ? 'selected' : ''}`}
                            onClick={() => setSelectedRuleId(r.id)}
                        >
                            <input
                                type="checkbox"
                                className="custom-checkbox"
                                checked={r.enabled}
                                onChange={(e) => handleToggleEnable(r.id, e)}
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
                    ))}
                </div>

                {/* CỘT PHẢI: FORM CẤU HÌNH CHI TIẾT RULE */}
                <div className="rule-card">
                    <h2 className="card-title">{selectedRule.name}</h2>
                    <p className="card-id">{selectedRule.id}</p>

                    <div className="section-label">Trigger</div>
                    <div className="grid-2">
                        <div>
                            <label className="field-label">Nguồn</label>
                            <select
                                value={selectedRule.source}
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
                                value={selectedRule.matchMode}
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
                            value={selectedRule.keywords}
                            onChange={(e) => handleUpdateField('keywords', e.target.value)}
                            placeholder="VD: GO, NHANH, CHAY"
                        />
                    </div>

                    <div className="section-label">Ngưỡng</div>
                    <div className="grid-3">
                        <div>
                            <label className="field-label">Metric</label>
                            <select
                                value={selectedRule.metric}
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
                                value={selectedRule.thresholdValue}
                                onChange={(e) => handleUpdateField('thresholdValue', Number(e.target.value))}
                            />
                        </div>
                        <div>
                            <label className="field-label">Cửa sổ (s)</label>
                            <input
                                type="number"
                                value={selectedRule.windowSec}
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
                                value={selectedRule.effectCode}
                                onChange={(e) => handleUpdateField('effectCode', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="field-label">Polarity</label>
                            <select
                                value={selectedRule.polarity}
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
                                value={selectedRule.cooldownMs}
                                onChange={(e) => handleUpdateField('cooldownMs', Number(e.target.value))}
                            />
                        </div>
                        <div>
                            <label className="field-label">Max lần/phiên</label>
                            <input
                                type="number"
                                value={selectedRule.maxTriggers}
                                onChange={(e) => handleUpdateField('maxTriggers', Number(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="card-actions">
                        <button className="btn-cancel" onClick={() => alert('Đã hoàn tác thay đổi')}>Huỷ</button>
                        <button className="btn-save" onClick={handleSaveRule}>Lưu rule</button>
                    </div>
                </div>
            </div>
        </div>
    );
}