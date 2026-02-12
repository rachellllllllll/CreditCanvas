import './polyfills';  // חובה! לפני כל דבר אחר
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// Use the new enhanced Admin Dashboard
import { AdminDashboardV2 as AdminDashboard } from './components/admin'

/**
 * Simple hash-based router
 * #/admin -> AdminDashboard (V2 - Enhanced)
 * everything else -> App
 */
function Router() {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // אם ה-hash הוא #/admin, הצג את דף האדמין
  if (route === '#/admin' || route === '#admin') {
    return <AdminDashboard />;
  }

  // אחרת, הצג את האפליקציה הרגילה
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router />
  </StrictMode>,
)
