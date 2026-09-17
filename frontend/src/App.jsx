// frontend/src/App.jsx
// Chỉ giữ vai trò điều phối: quyết định hiển thị page nào, không chứa
// markup/logic riêng của từng page — mọi page đều tự quản lý chính nó.
import React, { useState } from 'react';
import './App.css';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('LOGIN');
  const [adminUsername, setAdminUsername] = useState('');

  const handleLoginSuccess = (username) => {
    setAdminUsername(username);
    setCurrentScreen('DASHBOARD');
  };

  const handleLogout = () => {
    setAdminUsername('');
    setCurrentScreen('LOGIN');
  };

  if (currentScreen === 'LOGIN') {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return <DashboardPage adminUsername={adminUsername} onLogout={handleLogout} />;
}