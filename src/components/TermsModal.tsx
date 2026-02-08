import React from 'react';
import './TermsModal.css';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * מודל תנאי שימוש
 */
const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="terms-modal-overlay" onClick={onClose}>
      <div className="terms-modal" onClick={(e) => e.stopPropagation()}>
        <div className="terms-modal-header">
          <h2>📋 תנאי שימוש</h2>
          <button className="terms-modal-close" onClick={onClose} aria-label="סגור">
            ✕
          </button>
        </div>
        
        <div className="terms-modal-content">
          <section className="terms-section">
            <h3>🔒 1. שמירת מידע</h3>
            <ul>
              <li><strong>שמירה מקומית:</strong> כל הנתונים הפיננסיים נשמרים במחשב שלך בלבד.</li>
              <li><strong>ללא שרתים:</strong> איננו מאחסנים נתונים אישיים בשרתים שלנו.</li>
              <li><strong>אחריותך:</strong> אתה אחראי לגיבוי הנתונים שלך.</li>
            </ul>
          </section>

          <section className="terms-section">
            <h3>📊 2. איסוף נתונים אנונימיים</h3>
            <p>אנחנו אוספים נתוני שימוש אנונימיים לשיפור האפליקציה:</p>
            <div className="terms-columns">
              <div className="terms-column terms-column--positive">
                <span className="terms-column-label">✅ מה נאסוף:</span>
                <ul>
                  <li>אילו פיצ'רים בשימוש</li>
                  <li>התפלגות קטגוריות (באחוזים)</li>
                  <li>סוג מכשיר ודפדפן</li>
                </ul>
              </div>
              <div className="terms-column terms-column--negative">
                <span className="terms-column-label">❌ מה לא נאסוף:</span>
                <ul>
                  <li>סכומי כסף</li>
                  <li>שמות עסקים</li>
                  <li>מידע מזהה אישית</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="terms-section">
            <h3>⚠️ 3. הגבלת אחריות</h3>
            <ul>
              <li>האפליקציה מיועדת למעקב אישי בלבד.</li>
              <li>אין להסתמך עליה לצרכי מס או דיווח רשמי.</li>
              <li>השימוש באפליקציה הוא באחריותך המלאה.</li>
            </ul>
          </section>

          <section className="terms-section">
            <h3>📝 4. שינויים בתנאים</h3>
            <ul>
              <li>אנו רשאים לעדכן תנאים אלה מעת לעת.</li>
              <li>שימוש מתמשך מהווה הסכמה לתנאים המעודכנים.</li>
            </ul>
          </section>
        </div>

        <div className="terms-modal-footer">
          <button className="terms-modal-btn" onClick={onClose}>
            הבנתי, סגור
          </button>
        </div>
      </div>
    </div>
  );
};

export default TermsModal;
