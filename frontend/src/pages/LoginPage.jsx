// frontend/src/pages/LoginPage.jsx
import React, { useState } from 'react';
import TikTokLogo from '../components/TikTokLogo';
import { api } from '../services/api';

export default function LoginPage({ onLoginSuccess }) {
    const [authForm, setAuthForm] = useState({ username: '', password: '' });
    const [errorMessage, setErrorMessage] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!authForm.username || !authForm.password) {
            setErrorMessage('Vui lòng nhập đầy đủ tài khoản & mật khẩu');
            return;
        }
        setErrorMessage('');
        setIsLoggingIn(true);
        try {
            const { token } = await api.login(authForm.username, authForm.password);
            onLoginSuccess(authForm.username, token);
        } catch (err) {
            setErrorMessage(err.message || 'Đăng nhập thất bại');
        } finally {
            setIsLoggingIn(false);
        }
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
                    <button type="submit" className="btn btn-primary full-width" disabled={isLoggingIn}>
                        {isLoggingIn ? 'Đang đăng nhập...' : 'Đăng nhập'}
                    </button>
                </form>
            </div>
        </div>
    );
}