/**
 * Analytics Module - איסוף נתונים אנונימיים
 * 
 * המודול הזה אוסף סטטיסטיקות שימוש אנונימיות.
 * הנתונים נשלחים ל-Firebase רק אם:
 * 1. המשתמש הסכים (consent)
 * 2. Firebase מוגדר (ANALYTICS_ENABLED = true)
 * 
 * האפליקציה עובדת רגיל גם בלי Firebase!
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, collection, addDoc, type Firestore } from 'firebase/firestore';

// ============================================
// Configuration - מוגדר מ-Environment Variables או ברירת מחדל
// ============================================

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBWhMTzgjpH_36Mxxs8FMm4f3jaYRDKWdo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "creditcanvas-ff0fc.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "creditcanvas-ff0fc",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "creditcanvas-ff0fc.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "74672397178",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:74672397178:web:e03d631a5788b30ed794c3"
};

export const ANALYTICS_CONFIG = {
  // מופעל רק ב-production או אם יש config תקין
  enabled: !!(firebaseConfig.apiKey && firebaseConfig.projectId),
};

// ============================================
// Firebase Initialization
// ============================================

let firebaseApp: FirebaseApp | null = null;
let firestore: Firestore | null = null;

function getFirebaseApp(): FirebaseApp | null {
  if (!ANALYTICS_CONFIG.enabled) return null;
  
  if (!firebaseApp) {
    try {
      // בדוק אם כבר יש app מאותחל
      const existingApps = getApps();
      if (existingApps.length > 0) {
        firebaseApp = existingApps[0];
      } else {
        firebaseApp = initializeApp(firebaseConfig);
      }
    } catch (err) {
      console.debug('[Analytics] Failed to initialize Firebase:', err);
      return null;
    }
  }
  return firebaseApp;
}

function getFirestoreDb(): Firestore | null {
  if (!firestore) {
    const app = getFirebaseApp();
    if (app) {
      try {
        firestore = getFirestore(app);
      } catch (err) {
        console.debug('[Analytics] Failed to get Firestore:', err);
        return null;
      }
    }
  }
  return firestore;
}

// ============================================
// Types
// ============================================

export interface UserProfile {
  visitorId: string;
  firstSeen: string;
  analyticsConsent: boolean | null; // null = לא ענה עדיין
  lastSeen?: string;
  visitCount?: number;
}

export interface AnalyticsEvent {
  visitorId: string;
  event: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ============================================
// Visitor ID Management
// ============================================

/**
 * יוצר מזהה ייחודי אקראי
 */
export function generateVisitorId(): string {
  // שימוש ב-crypto.randomUUID אם זמין, אחרת fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback למקרה שאין crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * טוען את פרופיל המשתמש מהתיקיה
 */
export async function loadUserProfile(dirHandle: FileSystemDirectoryHandle): Promise<UserProfile | null> {
  try {
    const fileHandle = await dirHandle.getFileHandle('user-profile.json');
    const file = await fileHandle.getFile();
    const content = await file.text();
    return JSON.parse(content) as UserProfile;
  } catch {
    // קובץ לא קיים - משתמש חדש
    return null;
  }
}

/**
 * שומר את פרופיל המשתמש לתיקיה
 */
export async function saveUserProfile(
  dirHandle: FileSystemDirectoryHandle, 
  profile: UserProfile
): Promise<void> {
  try {
    const fileHandle = await dirHandle.getFileHandle('user-profile.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(profile, null, 2));
    await writable.close();
  } catch (err) {
    console.warn('Failed to save user profile:', err);
  }
}

/**
 * מקבל או יוצר פרופיל משתמש
 */
export async function getOrCreateUserProfile(
  dirHandle: FileSystemDirectoryHandle
): Promise<{ profile: UserProfile; isNewUser: boolean }> {
  const existingProfile = await loadUserProfile(dirHandle);
  
  if (existingProfile) {
    // משתמש חוזר - עדכן lastSeen וספירה
    const updatedProfile: UserProfile = {
      ...existingProfile,
      lastSeen: new Date().toISOString(),
      visitCount: (existingProfile.visitCount || 1) + 1
    };
    await saveUserProfile(dirHandle, updatedProfile);
    return { profile: updatedProfile, isNewUser: false };
  }
  
  // משתמש חדש
  const newProfile: UserProfile = {
    visitorId: generateVisitorId(),
    firstSeen: new Date().toISOString(),
    analyticsConsent: null, // לא ענה עדיין
    lastSeen: new Date().toISOString(),
    visitCount: 1
  };
  await saveUserProfile(dirHandle, newProfile);
  return { profile: newProfile, isNewUser: true };
}

/**
 * עדכון הסכמת המשתמש
 */
export async function updateAnalyticsConsent(
  dirHandle: FileSystemDirectoryHandle,
  consent: boolean
): Promise<UserProfile | null> {
  const profile = await loadUserProfile(dirHandle);
  if (!profile) return null;
  
  const updatedProfile: UserProfile = {
    ...profile,
    analyticsConsent: consent
  };
  await saveUserProfile(dirHandle, updatedProfile);
  return updatedProfile;
}

// ============================================
// Device & Browser Info (אנונימי)
// ============================================

export interface DeviceInfo {
  deviceType: 'desktop' | 'mobile' | 'tablet';
  screenSize: string;
  language: string;
  timezone: string;
}

export function getDeviceInfo(): DeviceInfo {
  const width = window.screen.width;
  const height = window.screen.height;
  
  // זיהוי סוג מכשיר
  let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';
  if (width <= 768) {
    deviceType = 'mobile';
  } else if (width <= 1024) {
    deviceType = 'tablet';
  }
  
  return {
    deviceType,
    screenSize: `${width}x${height}`,
    language: navigator.language || 'unknown',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
  };
}

// ============================================
// Analytics Events (שליחה ל-Firebase)
// ============================================

// Queue לאירועים (למקרה שאין אינטרנט)
let eventQueue: AnalyticsEvent[] = [];

/**
 * שולח אירוע אנליטיקס
 * אם Firebase לא מוגדר או המשתמש לא הסכים - לא עושה כלום
 * @param skipConsentCheck - אם true, שולח גם ללא הסכמה (רק לאירועי consent_decision)
 */
export async function trackEvent(
  event: string,
  profile: UserProfile | null,
  metadata?: Record<string, unknown>,
  skipConsentCheck: boolean = false
): Promise<void> {
  // בדיקות - אם לא עוברות, יוצאים בשקט
  if (!ANALYTICS_CONFIG.enabled) {
    console.debug('[Analytics] Disabled - not tracking:', event);
    return;
  }
  
  if (!profile) {
    console.debug('[Analytics] No profile - not tracking:', event);
    return;
  }
  
  // בדיקת הסכמה - מדלגים רק לאירועי consent_decision
  if (!skipConsentCheck && profile.analyticsConsent !== true) {
    console.debug('[Analytics] No consent - not tracking:', event);
    return;
  }
  
  const analyticsEvent: AnalyticsEvent = {
    visitorId: profile.visitorId,
    event,
    timestamp: Date.now(),
    metadata
  };
  
  // נסה לשלוח, אם נכשל - שמור לqueue
  try {
    await sendToFirebase(analyticsEvent);
    console.debug('[Analytics] Sent:', event);
  } catch {
    console.debug('[Analytics] Failed to send, queuing:', event);
    eventQueue.push(analyticsEvent);
  }
}

/**
 * שולח אירוע ל-Firebase Firestore
 */
async function sendToFirebase(event: AnalyticsEvent): Promise<void> {
  if (!ANALYTICS_CONFIG.enabled) {
    console.log('[Analytics] DISABLED - not sending to Firebase');
    return;
  }
  
  const db = getFirestoreDb();
  if (!db) {
    console.log('[Analytics] Firestore not available - db is null');
    return;
  }
  
  try {
    console.log('[Analytics] Sending to Firebase:', event.event, event);
    const docRef = await addDoc(collection(db, 'analytics_events'), {
      ...event,
      createdAt: new Date().toISOString()
    });
    console.log('[Analytics] ✅ Successfully saved to Firebase with ID:', docRef.id);
  } catch (err) {
    console.error('[Analytics] ❌ Failed to send to Firestore:', err);
    throw err; // רה-throw כדי שהqueue יתפוס
  }
}

/**
 * שולח את כל האירועים שבתור (אחרי שחוזר האינטרנט)
 */
export async function flushEventQueue(): Promise<void> {
  if (eventQueue.length === 0) return;
  
  const eventsToSend = [...eventQueue];
  eventQueue = [];
  
  for (const event of eventsToSend) {
    try {
      await sendToFirebase(event);
    } catch {
      // נכשל שוב - החזר לתור
      eventQueue.push(event);
    }
  }
}

// ============================================
// Predefined Events - אירועים מוכנים לשימוש
// ============================================

/**
 * התחלת סשן - נשלח תמיד בכל כניסה (גם למי שסירב)
 * זה מאפשר לדעת כמה משתמשים פעילים יש
 */
export async function trackSessionStart(
  profile: UserProfile,
  isNewUser: boolean
): Promise<void> {
  const deviceInfo = getDeviceInfo();
  const referrer = getReferrerSource();
  const prevSessionDuration = getPreviousSessionDuration();
  
  // התחל סשן חדש
  startSession();
  
  // נשלח תמיד - ללא תלות בהסכמה
  await trackEvent('session_start', profile, {
    isNewUser,
    visitCount: profile.visitCount,
    platform: 'web',
    locale: deviceInfo.language,
    deviceType: deviceInfo.deviceType,
    referrer, // מקור התנועה
    ...(prevSessionDuration ? { prevSessionDurationSeconds: prevSessionDuration } : {})
  }, true); // skipConsentCheck = true
}

/**
 * אירוע החלטת הסכמה - נשלח תמיד (גם אם סירב)
 * זה האירוע היחיד שנשלח ללא תלות בהסכמה
 */
export async function trackConsentDecision(
  profile: UserProfile,
  consented: boolean,
  isNewUser: boolean,
  stats?: {
    fileCount: number;
    transactionCount: number;
    monthCount: number;
    categoryCount: number;
  }
): Promise<void> {
  const deviceInfo = getDeviceInfo();
  
  // נשלח תמיד - ברגע ההחלטה
  await trackEvent('consent_decision', profile, {
    consented,
    isNewUser,
    visitCount: profile.visitCount,
    platform: 'web',
    locale: deviceInfo.language,
    // אם הסכים - נצרף גם סטטיסטיקות
    ...(consented && stats ? stats : {})
  }, true); // skipConsentCheck = true
}

/**
 * משתמש חדש - נשלח רק אם הסכים
 */
export async function trackNewUser(profile: UserProfile): Promise<void> {
  const deviceInfo = getDeviceInfo();
  await trackEvent('new_user', profile, {
    ...deviceInfo
  });
}

/**
 * משתמש חוזר - נשלח רק אם הסכים
 */
export async function trackReturningUser(profile: UserProfile): Promise<void> {
  await trackEvent('returning_user', profile, {
    visitCount: profile.visitCount
  });
}

// ============================================
// Unknown Categories Tracking
// ============================================

/**
 * מידע על קטגוריה לא מזוהה
 */
export interface UnknownCategoryInfo {
  excelCategory: string;      // שם הקטגוריה מהאקסל
  count: number;              // כמה עסקאות
  descriptions: string[];     // TOP 10 תיאורי עסקאות נפוצים
}

/**
 * מיפוי קטגוריה שהמשתמש בחר
 */
export interface CategoryMapping {
  excelCategory: string;      // שם הקטגוריה מהאקסל
  selectedCategory: string;   // הקטגוריה שהמשתמש בחר
  count: number;              // כמה עסקאות
  descriptions: string[];     // TOP 10 תיאורי עסקאות
}

/**
 * טעינת קבצים - כולל מידע על קטגוריות לא מזוהות
 */
export async function trackFilesLoaded(
  profile: UserProfile | null,
  data: {
    fileCount: number;
    transactionCount: number;
    monthCount: number;
    categoryCount: number;
    sessionId?: string;
    unknownCategories?: UnknownCategoryInfo[];
  }
): Promise<void> {
  await trackEvent('files_loaded', profile, data);
}

/**
 * שליחת מיפויי קטגוריות שהמשתמש בחר
 * נשלח כשהמשתמש מסיים את דיאלוג הקטגוריות
 */
export async function trackCategoryAssigned(
  profile: UserProfile | null,
  data: {
    sessionId: string;
    mappings: CategoryMapping[];
  }
): Promise<void> {
  // skipConsentCheck = true כי אם המשתמש הגיע לכאן, הוא כבר אישר תנאי שימוש
  await trackEvent('category_assigned', profile, data, true);
}

/**
 * שימוש בפיצ'ר
 */
export async function trackFeatureUsage(
  profile: UserProfile | null,
  featureName: string
): Promise<void> {
  await trackEvent('feature_used', profile, { feature: featureName });
}

/**
 * סטטיסטיקות קטגוריות (אחוזים בלבד, קטגוריות סטנדרטיות)
 */
export async function trackCategoryStats(
  profile: UserProfile | null,
  categoryPercentages: Record<string, number>
): Promise<void> {
  // רק קטגוריות סטנדרטיות - לא מותאמות אישית
  const standardCategories = [
    'מזון', 'תחבורה', 'קניות', 'בילויים', 'חשבונות', 
    'בריאות', 'ביטוח', 'חינוך', 'אחר'
  ];
  
  const filteredStats: Record<string, number> = {};
  let otherTotal = 0;
  
  for (const [category, percent] of Object.entries(categoryPercentages)) {
    if (standardCategories.includes(category)) {
      filteredStats[category] = Math.round(percent);
    } else {
      otherTotal += percent;
    }
  }
  
  // הוסף את ה"אחר"
  if (otherTotal > 0) {
    filteredStats['אחר'] = Math.round(otherTotal + (filteredStats['אחר'] || 0));
  }
  
  await trackEvent('category_stats', profile, { categories: filteredStats });
}

// ============================================
// Session Duration Tracking - מעקב זמן שהייה
// ============================================

const SESSION_START_KEY = 'analytics_session_start';
const LAST_ACTIVITY_KEY = 'analytics_last_activity';
const PREV_SESSION_DURATION_KEY = 'analytics_prev_session_duration';

/**
 * מתחיל סשן חדש - קורא בכל כניסה לאפליקציה
 */
export function startSession(): void {
  try {
    const now = Date.now();
    localStorage.setItem(SESSION_START_KEY, now.toString());
    localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());
  } catch {
    // localStorage לא זמין
  }
}

/**
 * מעדכן את זמן הפעילות האחרונה - קורא בכל פעולה
 */
export function updateLastActivity(): void {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
  } catch {
    // localStorage לא זמין
  }
}

/**
 * מחשב את משך הסשן הנוכחי בשניות
 */
export function getCurrentSessionDuration(): number {
  try {
    const start = localStorage.getItem(SESSION_START_KEY);
    const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!start || !lastActivity) return 0;
    return Math.round((parseInt(lastActivity) - parseInt(start)) / 1000);
  } catch {
    return 0;
  }
}

/**
 * שומר את משך הסשן לשליחה בפעם הבאה (כשסוגרים את הדף)
 */
export function saveSessionDurationForLater(): void {
  try {
    const duration = getCurrentSessionDuration();
    if (duration > 0) {
      localStorage.setItem(PREV_SESSION_DURATION_KEY, duration.toString());
    }
  } catch {
    // localStorage לא זמין
  }
}

/**
 * מקבל את משך הסשן הקודם (לשליחה בכניסה הבאה)
 */
export function getPreviousSessionDuration(): number | null {
  try {
    const duration = localStorage.getItem(PREV_SESSION_DURATION_KEY);
    if (duration) {
      localStorage.removeItem(PREV_SESSION_DURATION_KEY); // מנקים אחרי קריאה
      return parseInt(duration);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * שולח את משך הסשן הקודם (אם קיים)
 */
export async function trackPreviousSessionDuration(profile: UserProfile): Promise<void> {
  const duration = getPreviousSessionDuration();
  if (duration && duration > 5) { // רק אם יותר מ-5 שניות (לא סתם פתח וסגר)
    await trackEvent('session_duration', profile, {
      durationSeconds: duration,
      durationMinutes: Math.round(duration / 60)
    }, true); // skipConsentCheck - תמיד שולחים
  }
}

// ============================================
// Referrer Tracking - מקור התנועה
// ============================================

/**
 * מזהה את מקור התנועה
 */
export function getReferrerSource(): string {
  try {
    const ref = document.referrer.toLowerCase();
    if (!ref) return 'direct';
    if (ref.includes('google')) return 'google';
    if (ref.includes('bing')) return 'bing';
    if (ref.includes('facebook') || ref.includes('fb.com')) return 'facebook';
    if (ref.includes('linkedin')) return 'linkedin';
    if (ref.includes('twitter') || ref.includes('t.co')) return 'twitter';
    if (ref.includes('github')) return 'github';
    if (ref.includes('whatsapp')) return 'whatsapp';
    if (ref.includes('telegram')) return 'telegram';
    if (ref.includes('reddit')) return 'reddit';
    return 'other';
  } catch {
    return 'unknown';
  }
}

// ============================================
// LocalStorage fallback (אם אין תיקיה)
// ============================================

const CONSENT_STORAGE_KEY = 'analytics_consent_asked';

/**
 * בדיקה אם כבר שאלנו את המשתמש בסשן הזה (ב-sessionStorage)
 * משתמשים ב-sessionStorage כי רוצים לשאול פעם אחת לכל סשן
 */
export function wasConsentAsked(): boolean {
  try {
    return sessionStorage.getItem(CONSENT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * סימון ששאלנו את המשתמש בסשן הזה
 */
export function markConsentAsked(): void {
  try {
    sessionStorage.setItem(CONSENT_STORAGE_KEY, 'true');
  } catch {
    // sessionStorage לא זמין
  }
}
