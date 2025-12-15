import React, { useState } from 'react';
import { signUp as fbSignUp, signIn as fbSignIn } from '../lib/firebaseClient';
import Logo from './Logo';
import './Auth.css';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signup') {
        await fbSignUp(email, password);
        alert('נרשמת בהצלחה!');
      } else {
        await fbSignIn(email, password);
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <Logo />
        </div>
        <h2>{mode === 'signin' ? 'התחברות' : 'הרשמה'}</h2>
        <p className="auth-description">
          מערכת חכמה לניתוח הוצאות וניהול תקציב אישי
        </p>
       
        <form onSubmit={handleEmailAuth}>
          <input
            type="email"
            placeholder="כתובת מייל"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
          <input
            type="password"
            placeholder="סיסמה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
         
          <button type="submit" disabled={loading}>
            {loading ? '...טוען' : mode === 'signin' ? 'התחבר' : 'הרשם'}
          </button>
        </form>

        <p className="toggle-mode">
          {mode === 'signin' ? 'אין לך חשבון? ' : 'יש לך כבר חשבון? '}
          <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? 'הרשם כאן' : 'התחבר כאן'}
          </button>
        </p>
      </div>
    </div>
  );
}
