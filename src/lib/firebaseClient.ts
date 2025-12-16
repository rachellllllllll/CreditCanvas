import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  setPersistence,
  browserLocalPersistence,
  sendEmailVerification,
  sendPasswordResetEmail,
  type User
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';

// TODO: Replace with your Firebase web app config from Firebase Console → Project settings → General → Your apps (</>)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Explicit persistence across tabs/sessions
setPersistence(auth, browserLocalPersistence).catch(() => {
  /* ignore – fallback to default persistence */
});

// Use browser language for auth emails (e.g., Hebrew UI)
try {
  // Not critical if fails
  (auth as any).useDeviceLanguage?.();
} catch {}

function getActionCodeSettings() {
  // Redirect back to the app after action completes
  const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
  return origin
    ? { url: origin, handleCodeInApp: false }
    : undefined;
}

export async function signUp(email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await addDoc(collection(db, 'user_logins'), {
    user_id: cred.user.uid,
    email: cred.user.email,
    logged_in_at: serverTimestamp()
  });
  return cred.user;
}

export async function signIn(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await addDoc(collection(db, 'user_logins'), {
    user_id: cred.user.uid,
    email: cred.user.email,
    logged_in_at: serverTimestamp()
  });
  return cred.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export function onAuthChange(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const settings = getActionCodeSettings();
  await sendPasswordResetEmail(auth, email, settings);
}

export async function sendVerificationEmail(): Promise<void> {
  if (!auth.currentUser) throw new Error('לא נמצא משתמש מחובר');
  const settings = getActionCodeSettings();
  await sendEmailVerification(auth.currentUser, settings);
}
