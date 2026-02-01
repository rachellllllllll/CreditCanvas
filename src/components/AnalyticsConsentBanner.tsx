import React from 'react';
import './AnalyticsConsentBanner.css';

interface AnalyticsConsentBannerProps {
  onAccept: () => void;
  onDecline: () => void;
  onMoreInfo?: () => void;
}

/**
 * באנר בקשת הסכמה לאיסוף נתונים אנונימיים
 */
const AnalyticsConsentBanner: React.FC<AnalyticsConsentBannerProps> = ({
  onAccept,
  onDecline,
  onMoreInfo
}) => {
  return (
    <div className="analytics-consent-overlay">
      <div className="analytics-consent-banner">
        <div className="analytics-consent-icon">💡</div>
       
        <div className="analytics-consent-content">
          <h3 className="analytics-consent-title">עזור לנו להשתפר</h3>
         
          <p className="analytics-consent-text">
            אנחנו אוספים נתוני שימוש אנונימיים כדי לשפר את האפליקציה.
          </p>
         
          <div className="analytics-consent-details">
            <div className="analytics-consent-column">
              <span className="analytics-consent-label analytics-consent-label--positive">מה נאסוף:</span>
              <ul>
                <li>אילו פיצ'רים בשימוש</li>
                <li>התפלגות קטגוריות (אחוזים)</li>
                <li>סוג מכשיר</li>
              </ul>
            </div>
            <div className="analytics-consent-column">
              <span className="analytics-consent-label analytics-consent-label--negative">מה לא נאסוף:</span>
              <ul>
                <li>סכומי כסף</li>
                <li>שמות עסקים</li>
                <li>מידע אישי</li>
              </ul>
            </div>
          </div>
        </div>
       
        <div className="analytics-consent-actions">
          <button
            className="analytics-consent-btn analytics-consent-btn--primary"
            onClick={onAccept}
          >
            אישור
          </button>
         
          <div className="analytics-consent-secondary">
            {onMoreInfo && (
              <button
                className="analytics-consent-link"
                onClick={onMoreInfo}
              >
                פרטים נוספים
              </button>
            )}
            <span className="analytics-consent-separator">|</span>
            <button
              className="analytics-consent-link"
              onClick={onDecline}
            >
              לא מעוניין
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsConsentBanner;
