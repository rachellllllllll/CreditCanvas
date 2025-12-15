import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
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
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('נרשמת בהצלחה! בדוק את המייל לאימות.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  // אופציה: Magic Link (ללא סיסמה)
  const handleMagicLink = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      alert('נשלח קישור למייל שלך!');
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

        <button
          onClick={handleMagicLink}
          disabled={loading || !email}
          className="magic-link-btn"
        >
          שלח קישור למייל (ללא סיסמה)
        </button>

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
