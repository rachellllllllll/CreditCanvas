import React, { useState, useEffect, useCallback } from 'react';
import type { UserProfile } from '../utils/analytics';
import './FeedbackPopup.css';

const RATING_LABELS: Record<number, string> = {
  1: 'לא טוב 😕',
  2: 'יכול להשתפר',
  3: 'בסדר 👌',
  4: 'טוב מאוד!',
  5: 'מעולה! 🎉',
};

// ============================================
// Component
// ============================================

interface FeedbackPopupProps {
  profile: UserProfile;
  onSubmit: (data: { rating: number; text: string }) => void;
  onDismiss: () => void;
}

const FeedbackPopup: React.FC<FeedbackPopupProps> = ({ profile, onSubmit, onDismiss }) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // אחרי שליחה מוצלחת — סגור אוטומטית אחרי 2.5 שניות
  useEffect(() => {
    if (submitted) {
      const timer = setTimeout(onDismiss, 2500);
      return () => clearTimeout(timer);
    }
  }, [submitted, onDismiss]);

  const handleSubmit = useCallback(() => {
    if (rating === 0) return;
    onSubmit({ rating, text: text.trim() });
    setSubmitted(true);
  }, [rating, text, onSubmit]);

  // Escape key closes
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onDismiss]);

  // Success state
  if (submitted) {
    return (
      <div className="feedback-popup-overlay" onClick={onDismiss}>
        <div className="feedback-popup feedback-popup--success" onClick={e => e.stopPropagation()}>
          <div className="feedback-success">
            <span className="feedback-success-icon">✅</span>
            <h3>תודה רבה!</h3>
            <p>המשוב שלך חשוב לנו לשיפור המערכת</p>
          </div>
        </div>
      </div>
    );
  }

  const isFirstTime = !profile.feedback?.totalSubmissions;
  const displayRating = hoverRating || rating;

  return (
    <div className="feedback-popup-overlay" onClick={onDismiss}>
      <div className="feedback-popup" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="feedback-popup-header">
          <h3>{isFirstTime ? 'מה דעתך על הכלי? 🙏' : 'עדיין שמחים לשמוע ממך 🙏'}</h3>
          <button className="feedback-popup-close" onClick={onDismiss} title="סגור">✕</button>
        </div>

        {/* Body */}
        <div className="feedback-popup-body">
          <p className="feedback-popup-subtitle">
            {isFirstTime
              ? 'נשמח לדעת מה חשבת — זה עוזר לנו להשתפר'
              : 'עבר זמן מאז ששמענו ממך. משהו השתנה?'}
          </p>

          {/* Stars */}
          <div className="feedback-stars">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                className={`feedback-star${
                  star <= (displayRating) ? ' feedback-star--active' : ''
                }${star <= hoverRating ? ' feedback-star--hover' : ''}`}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                aria-label={`${star} כוכבים`}
              >
                ★
              </button>
            ))}
          </div>

          {/* Rating label */}
          <div className={`feedback-rating-label${displayRating ? ' feedback-rating-label--active' : ''}`}>
            {displayRating ? RATING_LABELS[displayRating] : 'לחץ לדירוג'}
          </div>

          {/* Text */}
          <textarea
            className="feedback-textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="רוצה לשתף מה היה טוב או מה חסר? (לא חובה)"
            maxLength={500}
          />
        </div>

        {/* Footer */}
        <div className="feedback-popup-footer">
          <button
            className="feedback-btn feedback-btn--primary"
            onClick={handleSubmit}
            disabled={rating === 0}
          >
            שלח משוב
          </button>
          <button
            className="feedback-btn feedback-btn--secondary"
            onClick={onDismiss}
          >
            לא עכשיו
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackPopup;
