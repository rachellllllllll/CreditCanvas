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
      'r0527124976@gmail.com'
    ];

// ============================================
// Firebase Initialization
// ============================================

let firebaseApp: FirebaseApp | null = null;
let auth: Auth | null = null;
const googleProvider = new GoogleAuthProvider();

function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseApp) {
    try {
      const existingApps = getApps();
      if (existingApps.length > 0) {
        firebaseApp = existingApps[0];
      } else {
        firebaseApp = initializeApp(firebaseConfig);
      }
    } catch (err) {
      console.error('[Auth] Failed to initialize Firebase:', err);
      return null;
    }
  }
  return firebaseApp;
}

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
 * התחברות עם Google
 */
export async function signInWithGoogle(): Promise<User | null> {
  const authInstance = getFirebaseAuth();
  if (!authInstance) {
    throw new Error('Firebase Auth לא זמין');
  }

  try {
    const result = await signInWithPopup(authInstance, googleProvider);
    return result.user;
  } catch (error: unknown) {
    if (error instanceof Error) {
      // המשתמש סגר את החלון
      if (error.message.includes('popup-closed-by-user')) {
        return null;
      }
      throw error;
    }
    throw error;
  }
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
  const authInstance = getFirebaseAuth();
  if (!authInstance) {
    callback(null);
    return () => {};
  }
  
  return onAuthStateChanged(authInstance, callback);
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
