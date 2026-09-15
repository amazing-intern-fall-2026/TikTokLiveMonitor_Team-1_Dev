// frontend/src/pages/LoginPage.jsx
import React, { useState } from 'react';
import TikTokLogo from '../components/TikTokLogo';

export default function LoginPage({ onLoginSuccess }) {
    const [authForm, setAuthForm] = useState({ username: '', password: '' });
    const [errorMessage, setErrorMessage] = useState('');

    const handleLogin = (e) => {
        e.preventDefault();
        if (!authForm.username || !authForm.password) {
            setErrorMessage('Vui lòng nhập đầy đủ tài khoản & mật khẩu');
            return;
        }
        setErrorMessage('');
        onLoginSuccess(authForm.username);
    };

    return (
        <div className="center-wrapper">
            <div className="card login-card">
                <div className="brand-header">
                    <TikTokLogo size={32} />
                    <h2>TikTok LIVE Monitor</h2>
                    <p className="subtitle">Đăng nhập để vào khu vực quản trị</p>
                </div>
                {errorMessage && <div className="alert alert-error">{errorMessage}</div>}
                <form onSubmit={handleLogin} className="form-group">
                    <div className="field">
                        <label>Tài khoản Admin</label>
                        <input
                            type="text"
                            value={authForm.username}
                            onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
                            placeholder="Nhập username..."
                            autoFocus
                        />
                    </div>
                    <div className="field">
                        <label>Mật khẩu</label>
                        <input
                            type="password"
                            value={authForm.password}
                            onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                            placeholder="••••••••"
                        />
                    </div>
                    <button type="submit" className="btn btn-primary full-width">
                        Đăng nhập
                    </button>
                </form>
            </div>
        </div>
    );
}