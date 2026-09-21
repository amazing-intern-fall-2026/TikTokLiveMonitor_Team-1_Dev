// frontend/src/App.jsx
// Chỉ giữ vai trò điều phối: quyết định hiển thị page nào, không chứa
// markup/logic riêng của từng page — mọi page đều tự quản lý chính nó.
import React, { useState } from 'react';
import './App.css';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

// Không dùng react-router-dom (xem ghi chú trong main.jsx) nên "bảo vệ
// route" ở đây nghĩa là: quyết định màn hình khởi tạo dựa trên jwt_token
// đã lưu, thay vì chuyển hướng URL. Có token hợp lệ -> vào thẳng
// Dashboard; không có/hết hạn -> ở lại Login.
const TOKEN_KEY = 'jwt_token';

function readStoredUsername() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    // Payload JWT là base64url ở giữa 3 phần token; không cần verify chữ ký
    // ở FE (đó là việc của backend) -- chỉ đọc để hiển thị + phát hiện hết hạn.
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return payload.username || payload.sub || '';
  } catch {
    // Token hỏng/không đúng định dạng JWT -> coi như chưa đăng nhập.
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

export default function App() {
  const initialUsername = readStoredUsername();
  const [currentScreen, setCurrentScreen] = useState(initialUsername ? 'DASHBOARD' : 'LOGIN');
  const [adminUsername, setAdminUsername] = useState(initialUsername || '');

  const handleLoginSuccess = (username, token) => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    }
    setAdminUsername(username);
    setCurrentScreen('DASHBOARD');
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setAdminUsername('');
    setCurrentScreen('LOGIN');
  };

  if (currentScreen === 'LOGIN') {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return <DashboardPage adminUsername={adminUsername} onLogout={handleLogout} />;
}