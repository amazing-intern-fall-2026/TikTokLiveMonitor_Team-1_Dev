import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import OverlayPage from './pages/OverlayPage.jsx'

// /overlay là URL độc lập cho OBS Browser Source — không qua Login/App vì
// OBS không đăng nhập được. Chỉ 1 route nên chưa cần cài react-router-dom;
// nếu sau này có thêm route độc lập khác, nên chuyển hẳn sang router thật.
const isOverlayRoute = window.location.pathname.startsWith('/overlay')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isOverlayRoute ? <OverlayPage /> : <App />}
  </StrictMode>,
)