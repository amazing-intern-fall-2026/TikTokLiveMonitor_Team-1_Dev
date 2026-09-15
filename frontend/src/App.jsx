// frontend/src/App.jsx
// Chỉ giữ vai trò điều phối: quyết định hiển thị page nào, không chứa
// markup/logic riêng của từng page — mọi page đều tự quản lý chính nó.
import React, { useState } from 'react';
import './App.css';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'live-events', label: 'Live Events', icon: 'live-events' },
  { key: 'effects', label: 'Effects', icon: 'effects' },
  { key: 'gift-rules', label: 'Gift Rules', icon: 'gift-rules' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

function NavIcon({ name }) {
  const common = { width: 18, height: 18, viewBox: '0 0 18 18', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' };
  switch (name) {
    case 'dashboard':
      return (
        <svg {...common}>
          <rect x="2" y="2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
          <rect x="10" y="2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
          <rect x="2" y="10" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
          <rect x="10" y="10" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case 'live-events':
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="1.8" fill="currentColor" />
          <path d="M5.8 5.8a4.5 4.5 0 0 0 0 6.4M12.2 5.8a4.5 4.5 0 0 1 0 6.4M3.3 3.3a8.2 8.2 0 0 0 0 11.4M14.7 3.3a8.2 8.2 0 0 1 0 11.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case 'effects':
      return (
        <svg {...common}>
          <path d="M9 2.2 10.3 6.6 14.7 8 10.3 9.4 9 13.8 7.7 9.4 3.3 8 7.7 6.6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case 'gift-rules':
      return (
        <svg {...common}>
          <rect x="2.5" y="7" width="13" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2.5 10h13M9 7v8" stroke="currentColor" strokeWidth="1.3" />
          <path d="M9 7c-1.4 0-2.6-.9-2.6-2.2C6.4 3.6 7.2 3 8 3c1 0 1 1.6 1 4M9 7c1.4 0 2.6-.9 2.6-2.2 0-1.2-.8-1.8-1.6-1.8-1 0-1 1.6-1 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.3" />
          <path d="M9 2.6v1.6M9 13.8v1.6M15.4 9h-1.6M4.2 9H2.6M13.2 4.8l-1.1 1.1M5.9 12.1l-1.1 1.1M13.2 13.2l-1.1-1.1M5.9 5.9 4.8 4.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

/** Reads the Envelope contract's user block, falling back gracefully if a field is missing. */
function displayName(user) {
  return user?.nickname || user?.uniqueId || 'Khán giả';
}

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