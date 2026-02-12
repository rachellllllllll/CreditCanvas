/**
 * Firebase Authentication Module
 * מודול אימות לדף האדמין בלבד
 * 
 * המשתמשים הרגילים לא צריכים להתחבר - רק מנהלים!
 */

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup,
  GoogleAuthProvider, 
  signOut,
  onAuthStateChanged,
  type Auth,
  type User 
} from 'firebase/auth';

// ============================================
// Configuration
// ============================================

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBWhMTzgjpH_36Mxxs8FMm4f3jaYRDKWdo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "creditcanvas-ff0fc.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "creditcanvas-ff0fc",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "creditcanvas-ff0fc.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "74672397178",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:74672397178:web:e03d631a5788b30ed794c3"
};

// רשימת מיילים מורשים לאדמין
// אפשר להגדיר גם מ-environment variable: VITE_ADMIN_EMAILS=email1@gmail.com,email2@gmail.com
const ADMIN_EMAILS_ENV = import.meta.env.VITE_ADMIN_EMAILS || '';
const ADMIN_EMAILS: string[] = ADMIN_EMAILS_ENV 
  ? ADMIN_EMAILS_ENV.split(',').map((e: string) => e.trim().toLowerCase())
  : [
      // הוסף את המייל שלך כאן:
      // 'your-email@gmail.com',
    ];

// ============================================
// Firebase Initialization
// ============================================

let firebaseApp: FirebaseApp | null = null;
let auth: Auth | null = null;
const googleProvider = new GoogleAuthProvider();

export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseApp) {
    try {
      const existingApps = getApps();
      if (existingApps.length > 0) {
        firebaseApp = existingApps[0];
      } else {
        firebaseApp = initializeApp(firebaseConfig);
      }
      console.log('[Auth] Firebase app initialized successfully');
    } catch (err) {
      console.error('[Auth] Failed to initialize Firebase:', err);
      return null;
    }
  }
  return firebaseApp;
}

// Eagerly initialize Firebase at module load to avoid race conditions
getFirebaseApp();

function getFirebaseAuth(): Auth | null {
  if (!auth) {
    const app = getFirebaseApp();
    if (app) {
      try {
        auth = getAuth(app);
      } catch (err) {
        console.error('[Auth] Failed to get Auth:', err);
        return null;
      }
    }
  }
  return auth;
}

// ============================================
// Auth Functions
// ============================================

/**
 * התחברות עם Google (popup - יותר אמין מ-redirect)
 */
export async function signInWithGoogle(): Promise<User> {
  console.log('[Auth] signInWithGoogle called');
  
  const authInstance = getFirebaseAuth();
  if (!authInstance) {
    console.error('[Auth] No auth instance for sign in');
    throw new Error('Firebase Auth לא זמין');
  }

  console.log('[Auth] Opening Google sign-in popup...');
  
  try {
    const result = await signInWithPopup(authInstance, googleProvider);
    console.log('[Auth] Sign-in successful:', result.user.email);
    return result.user;
  } catch (error: unknown) {
    console.error('[Auth] Sign-in error:', error);
    if (error instanceof Error) {
      // Handle specific errors
      if (error.message.includes('popup-closed-by-user')) {
        throw new Error('החלון נסגר לפני השלמת ההתחברות');
      }
      if (error.message.includes('popup-blocked')) {
        throw new Error('הדפדפן חסם את חלון ההתחברות. אנא אפשר popups לאתר זה.');
      }
    }
    throw error;
  }
}

/**
 * בדיקת תוצאת redirect - לא בשימוש יותר (נשאר לתאימות)
 */
export async function checkRedirectResult(): Promise<User | null> {
  console.log('[Auth] checkRedirectResult called (no-op with popup auth)');
  return null;
}

/**
 * התנתקות
 */
export async function logOut(): Promise<void> {
  const authInstance = getFirebaseAuth();
  if (authInstance) {
    await signOut(authInstance);
  }
}

/**
 * האזנה לשינויי authentication
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  console.log('[Auth] onAuthChange listener registered');
  
  const authInstance = getFirebaseAuth();
  if (!authInstance) {
    console.error('[Auth] No auth instance for listener');
    callback(null);
    return () => {};
  }
  
  return onAuthStateChanged(authInstance, (user) => {
    console.log('[Auth] Auth state changed:', user ? `User: ${user.email}` : 'No user');
    callback(user);
  });
}

/**
 * קבלת המשתמש הנוכחי
 */
export function getCurrentUser(): User | null {
  const authInstance = getFirebaseAuth();
  return authInstance?.currentUser || null;
}

// ============================================
// Admin Authorization
// ============================================

/**
 * בדיקה אם משתמש הוא אדמין מורשה
 */
export function isAdmin(user: User | null): boolean {
  if (!user || !user.email) {
    return false;
  }
  
  const userEmail = user.email.toLowerCase();
  
  // אם אין רשימת אדמינים מוגדרת - אפשר לכולם (לפיתוח)
  if (ADMIN_EMAILS.length === 0) {
    console.warn('[Auth] אין רשימת אדמינים מוגדרת - כל משתמש מחובר יכול לגשת');
    return true;
  }
  
  return ADMIN_EMAILS.includes(userEmail);
}

/**
 * קבלת רשימת מיילים מורשים (לדיבוג)
 */
export function getAdminEmails(): string[] {
  return [...ADMIN_EMAILS];
}

// Export User type
export type { User };
