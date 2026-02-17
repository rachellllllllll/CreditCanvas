import React, { useState } from 'react';
import './OnboardingScreen.css';

// === Collapsible Section Component ===
interface CollapsibleSectionProps {
  title: string;
  icon: string;
  stepNumber?: number;
  defaultOpen?: boolean;
  highlight?: boolean;
  variant?: 'blue' | 'purple' | 'green' | 'neutral';
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  stepNumber,
  defaultOpen = false,
  highlight = false,
  variant = 'neutral',
  children
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`onboarding-section ${variant} ${highlight ? 'highlight' : ''} ${isOpen ? 'open' : 'closed'}`}>
      <button 
        className="onboarding-section-header"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="onboarding-section-title">
          {stepNumber && <span className="step-number">{stepNumber}</span>}
          <span className="section-icon">{icon}</span>
          <span className="section-text">{title}</span>
        </div>
        <span className={`toggle-icon ${isOpen ? 'open' : ''}`}>
          ▼
        </span>
      </button>
      <div className={`onboarding-section-content ${isOpen ? 'open' : ''}`}>
        <div className="onboarding-section-inner">
          {children}
        </div>
      </div>
    </div>
  );
};

// === Main Onboarding Screen Component ===
interface OnboardingScreenProps {
  termsAccepted: boolean;
  onTermsChange: (accepted: boolean) => void;
  onShowTermsModal: () => void;
  onPickDirectory: () => void;
  loadingState: {
    step: string;
    message: string;
    progress?: { current: number; total: number };
  } | null;
  error: string | null;
}

const PREPARATION_SEEN_KEY = 'onboardingPreparationSeen';

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  termsAccepted,
  onTermsChange,
  onShowTermsModal,
  onPickDirectory,
  loadingState,
  error
}) => {
  // Check if user has seen the preparation section before
  const [isNewUser] = useState(() => {
    try {
      return !localStorage.getItem(PREPARATION_SEEN_KEY);
    } catch {
      return true;
    }
  });

  // Mark preparation as seen when user clicks the main button
  const handlePickDirectory = () => {
    try {
      localStorage.setItem(PREPARATION_SEEN_KEY, 'true');
    } catch { /* ignore */ }
    onPickDirectory();
  };

  // Loading state UI
  if (loadingState) {
    return (
      <div className="onboarding" role="dialog" aria-labelledby="onboardingTitle" aria-modal="true">
        <div className="onboarding-inner">
          <div className="onboarding-header">
            <h1 id="onboardingTitle">
              <span className="title-icon">💰</span>
              מערכת ניתוח חיובי אשראי
            </h1>
          </div>
          
          <div className="loading-state">
            <div className="loading-spinner" />
            <p className="loading-message">{loadingState.message}</p>
            {loadingState.progress && (
              <div className="loading-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${(loadingState.progress.current / loadingState.progress.total) * 100}%` }}
                  />
                </div>
                <p className="progress-text">
                  {loadingState.progress.current} / {loadingState.progress.total}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding" role="dialog" aria-labelledby="onboardingTitle" aria-modal="true">
      <div className="onboarding-inner">
        {/* Header */}
        <div className="onboarding-header">
          <h1 id="onboardingTitle">
            <span className="title-icon">💰</span>
            מערכת ניתוח חיובי אשראי
          </h1>
          <p className="onboarding-subtitle">
            נתח את ההוצאות וההכנסות שלך בקלות, בחינם ובפרטיות מלאה
          </p>
        </div>

        {/* Step 1: Preparation */}
        <CollapsibleSection
          title="הכנת הקבצים"
          icon="📥"
          stepNumber={1}
          defaultOpen={isNewUser}
          highlight={isNewUser}
          variant="blue"
        >
          <div className="preparation-content">
            <p className="prep-intro">
              הורד קבצי Excel מהאתר או מהאפליקציה של הבנק/חברת האשראי:
            </p>
            
            <div className="prep-columns">
              <div className="prep-column">
                <div className="prep-column-header">
                  <span className="prep-icon">💳</span>
                  <span>כרטיסי אשראי</span>
                </div>
                <ul className="prep-list">
                  <li>ויזה / לאומי קארד / כאל</li>
                  <li>ישראכרט / מאסטרקארד</li>
                  <li>אמריקן אקספרס</li>
                  <li>מקס / דיינרס</li>
                </ul>
              </div>
              
              <div className="prep-column">
                <div className="prep-column-header">
                  <span className="prep-icon">🏦</span>
                  <span>חשבונות בנק</span>
                </div>
                <ul className="prep-list">
                  <li>לאומי / הפועלים</li>
                  <li>דיסקונט / מזרחי</li>
                  <li>הבינלאומי / יהב</li>
                  <li>וכל בנק אחר...</li>
                </ul>
              </div>
            </div>

            <div className="prep-tip">
              <span className="tip-icon">💡</span>
              <div className="tip-content">
                <strong>טיפ:</strong> שים את כל הקבצים בתיקייה אחת (גם תת-תיקיות נקראות אוטומטית!)
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Step 2: Select Folder - Always visible */}
        <div className="onboarding-section main-action">
          <div className="main-action-header">
            <span className="step-number">2</span>
            <span className="section-icon">🚀</span>
            <span className="section-text">בחירת תיקייה והפעלה</span>
          </div>
          
          <div className="main-action-content">
            {/* Terms checkbox */}
            <label className={`terms-checkbox ${termsAccepted ? 'accepted' : ''}`}>
              <input 
                type="checkbox" 
                checked={termsAccepted}
                onChange={(e) => onTermsChange(e.target.checked)}
              />
              <span className="checkbox-text">
                קראתי ואני מסכים ל
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onShowTermsModal();
                  }}
                  className="terms-link"
                >
                  תנאי השימוש
                </button>
              </span>
            </label>

            {/* Main CTA Button */}
            <button 
              onClick={handlePickDirectory} 
              className="main-cta-button"
              disabled={!termsAccepted}
              autoFocus
            >
              <span className="cta-icon">📁</span>
              <span className="cta-text">בחר תיקייה עם קבצי Excel</span>
            </button>
          </div>
        </div>

        {/* Step 3: What happens next */}
        <CollapsibleSection
          title="מה המערכת תעשה?"
          icon="🔮"
          stepNumber={3}
          defaultOpen={false}
          variant="purple"
        >
          <ul className="features-list">
            <li>
              <span className="feature-check">✅</span>
              <span>קריאת כל קבצי ה-Excel מהתיקייה</span>
            </li>
            <li>
              <span className="feature-check">✅</span>
              <span>זיהוי אוטומטי של סוג הקובץ (בנק / אשראי)</span>
            </li>
            <li>
              <span className="feature-check">✅</span>
              <span>איחוד כל הנתונים וקטלוג אוטומטי</span>
            </li>
            <li>
              <span className="feature-check">✅</span>
              <span>הצגה בגרפים וטבלאות לפי חודש ושנה</span>
            </li>
          </ul>
        </CollapsibleSection>

        {/* Error message */}
        {error && (
          <div className="onboarding-error">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingScreen;
