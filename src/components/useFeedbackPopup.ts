import { useState, useEffect, useCallback, useRef } from 'react';
import type { UserProfile, FeedbackState } from '../utils/analytics';

// ============================================
// Feedback Timing Constants
// ============================================

const DAYS_BETWEEN_FEEDBACK = 90; // 3 חודשים
const DAYS_AFTER_DISMISS = 7;     // שבוע אחרי "לא עכשיו"
const MIN_VISITS = 3;             // מינימום ביקורים לפני בקשת משוב
const SHOW_DELAY_MS = 30_000;     // 30 שניות שהייה בדף
const MAX_CONSECUTIVE_DISMISSALS = 2; // מקסימום דחיות ברצף

function daysSince(isoDate: string | null): number {
  if (!isoDate) return Infinity;
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return (now - then) / (1000 * 60 * 60 * 24);
}

/**
 * בודק האם צריך להציג את ה-popup למשתמש
 */
export function shouldShowFeedback(profile: UserProfile | null): boolean {
  if (!profile) return false;

  const visits = profile.visitCount ?? 0;
  if (visits < MIN_VISITS) return false;

  const fb = profile.feedback;

  // אף פעם לא הוצג — הצג
  if (!fb) return true;

  // דחה יותר מדי פעמים ברצף ולא שלח בעבר — חכה 90 יום מהדחייה האחרונה
  if (fb.dismissCount >= MAX_CONSECUTIVE_DISMISSALS && fb.totalSubmissions === 0) {
    return daysSince(fb.lastDismissedAt) >= DAYS_BETWEEN_FEEDBACK;
  }

  // דחה ברצף — חכה שבוע
  if (fb.dismissCount > 0 && fb.dismissCount < MAX_CONSECUTIVE_DISMISSALS) {
    return daysSince(fb.lastDismissedAt) >= DAYS_AFTER_DISMISS;
  }

  // שלח בעבר — חכה 90 יום
  if (fb.lastSubmittedAt) {
    return daysSince(fb.lastSubmittedAt) >= DAYS_BETWEEN_FEEDBACK;
  }

  return true;
}

// ============================================
// Hook — מנהל את כל הלוגיקה
// ============================================

interface UseFeedbackPopupOptions {
  profile: UserProfile | null;
  dirHandle: FileSystemDirectoryHandle | null;
  analysisReady: boolean; // האם יש נתונים מוצגים
  saveProfile: (dir: FileSystemDirectoryHandle, profile: UserProfile) => Promise<void>;
  trackEvent: (event: string, profile: UserProfile | null, metadata?: Record<string, unknown>) => Promise<void>;
}

export function useFeedbackPopup({
  profile,
  dirHandle,
  analysisReady,
  saveProfile,
  trackEvent,
}: UseFeedbackPopupOptions) {
  const [showPopup, setShowPopup] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard so we only trigger the timer once per session
  const triggeredRef = useRef(false);

  // Timer: 30 שניות אחרי שהנתונים מוצגים
  useEffect(() => {
    if (!analysisReady || !profile || triggeredRef.current) return;
    if (!shouldShowFeedback(profile)) return;

    triggeredRef.current = true;
    timerRef.current = setTimeout(() => {
      // Re-check (profile could have changed)
      if (shouldShowFeedback(profile)) {
        setShowPopup(true);
      }
    }, SHOW_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [analysisReady, profile]);

  const handleSubmit = useCallback(async (data: { rating: number; text: string }) => {
    if (!profile || !dirHandle) return;

    const now = new Date().toISOString();
    const updatedFeedback: FeedbackState = {
      lastSubmittedAt: now,
      lastDismissedAt: profile.feedback?.lastDismissedAt ?? null,
      dismissCount: 0, // reset after submission
      totalSubmissions: (profile.feedback?.totalSubmissions ?? 0) + 1,
    };

    const updatedProfile: UserProfile = {
      ...profile,
      feedback: updatedFeedback,
    };

    // שמור ל-user-profile.json
    await saveProfile(dirHandle, updatedProfile);

    // שלח ל-Firebase
    await trackEvent('user_feedback', updatedProfile, {
      rating: data.rating,
      text: data.text || undefined,
      visitCount: profile.visitCount,
      submissionNumber: updatedFeedback.totalSubmissions,
    });
  }, [profile, dirHandle, saveProfile, trackEvent]);

  const handleDismiss = useCallback(async () => {
    setShowPopup(false);

    if (!profile || !dirHandle) return;

    const now = new Date().toISOString();
    const updatedFeedback: FeedbackState = {
      lastSubmittedAt: profile.feedback?.lastSubmittedAt ?? null,
      lastDismissedAt: now,
      dismissCount: (profile.feedback?.dismissCount ?? 0) + 1,
      totalSubmissions: profile.feedback?.totalSubmissions ?? 0,
    };

    const updatedProfile: UserProfile = {
      ...profile,
      feedback: updatedFeedback,
    };

    await saveProfile(dirHandle, updatedProfile);
  }, [profile, dirHandle, saveProfile]);

  return {
    showPopup,
    handleSubmit,
    handleDismiss,
    closePopup: useCallback(() => setShowPopup(false), []),
  };
}
