import React, { useState } from 'react';
// Switch to Firebase auth
import { signUp as fbSignUp, signIn as fbSignIn, sendPasswordReset, sendVerificationEmail } from '../lib/firebaseClient';
import Logo from './Logo';
import './Auth.css';

export default function Auth() {
    const toHebError = (code?: string) => {
      switch (code) {
        case 'auth/invalid-email': return 'כתובת המייל לא חוקית';
        case 'auth/missing-password': return 'יש להזין סיסמה';
        case 'auth/weak-password': return 'סיסמה חלשה (מינימום 6 תווים)';
        case 'auth/email-already-in-use': return 'המייל הזה כבר רשום במערכת';
        case 'auth/user-not-found': return 'לא נמצא משתמש עם המייל הזה';
        case 'auth/wrong-password':
        case 'auth/invalid-credential': return 'המייל או הסיסמה שגויים';
        case 'auth/too-many-requests': return 'נחסמת זמנית עקב ניסיונות רבים. נסה מאוחר יותר';
        case 'auth/operation-not-allowed': return 'ספק אימייל/סיסמה לא הופעל בפרויקט Firebase';
        case 'auth/network-request-failed': return 'בעיה בחיבור לרשת. נסה שוב';
        case 'auth/invalid-continue-uri': return 'כתובת החזרה לא חוקית';
        case 'auth/unauthorized-continue-uri': return 'הדומיין אינו מאושר ב-Firebase Auth';
        case 'auth/user-disabled': return 'החשבון מושעה';
        default: return 'שגיאה בהתחברות. נסה שוב';
      }
    };
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
        try {
          await sendVerificationEmail();
          alert('נרשמת בהצלחה! שלחנו מייל לאימות. יש לאמת לפני כניסה למערכת.');
        } catch (e: any) {
          const msg = e?.code ? toHebError(e.code) : (e?.message || 'אירעה שגיאה בשליחת אימות');
          alert('נרשמת בהצלחה, אך שליחת מייל האימות נכשלה: ' + msg + '\nתוכל ללחוץ על "שלח שוב" במסך הבא.');
        }
      } else {
        await fbSignIn(email, password);
      }
    } catch (error: any) {
      const msg = error?.code ? toHebError(error.code) : (error?.message || 'אירעה שגיאה');
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      alert('אנא הזן כתובת מייל לשחזור סיסמה');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(email);
      alert('נשלח מייל לאיפוס סיסמה. בדוק את תיבת הדואר.');
    } catch (error: any) {
      const msg = error?.code ? toHebError(error.code) : (error?.message || 'אירעה שגיאה');
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  // Magic Link אינו נתמך ישירות בקלאסיק Firebase Email/Password; מסירים את הכפתור.

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

        <p className="toggle-mode" style={{ marginTop: '6px' }}>
          <button onClick={handleResetPassword} disabled={loading || !email}>
            שכחת סיסמה? שלח קישור לאיפוס
          </button>
        </p>

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
