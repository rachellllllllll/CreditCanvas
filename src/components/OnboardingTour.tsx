import React, { useState, useEffect, useCallback } from 'react';
import './OnboardingTour.css';

interface TourStep {
  target: string; // data-tour attribute selector
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface OnboardingTourProps {
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="date-navigation"]',
    title: '📅 ניווט בין תקופות',
    content: 'החלף בין תצוגה חודשית לשנתית, והשתמש בחצים כדי לעבור בין חודשים',
    position: 'bottom',
  },
  {
    target: '[data-tour="display-mode"]',
    title: '🔍 סינון לפי סוג',
    content: 'בחר "הכנסות" כדי לראות רק הכנסות, "הוצאות" לראות רק הוצאות, או "הכל" לראות את שניהם',
    position: 'bottom',
  },
  {
    target: '[data-tour="category-chart"]',
    title: '📊 גרף קטגוריות',
    content: 'לחץ על קטגוריה בגרף כדי לראות רק את העסקאות שלה בטבלה למטה',
    position: 'bottom',
  },
  {
    target: '[data-tour="transactions-table"]',
    title: '✏️ עריכת עסקאות',
    content: 'לחץ על שורה בטבלה כדי לשנות את הקטגוריה של העסקה',
    position: 'top',
  },
  {
    target: '', // No target - centered modal
    title: '✨ מעולה! עכשיו אתה מוכן',
    content: '',
    position: 'bottom',
  },
];

const OnboardingTour: React.FC<OnboardingTourProps> = ({ isOpen, onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === TOUR_STEPS.length - 1;
  const isFinalTip = step.target === '';

  // Calculate tooltip and highlight positions
  const updatePositions = useCallback(() => {
    if (isFinalTip || !step.target) {
      setHighlightRect(null);
      return;
    }

    const element = document.querySelector(step.target);
    if (!element) {
      console.warn(`Tour element not found: ${step.target}`);
      return;
    }

    const rect = element.getBoundingClientRect();
    setHighlightRect(rect);

    // Calculate tooltip position based on step.position
    const padding = 16;
    const tooltipWidth = 320;
    const tooltipHeight = 180;

    let top = 0;
    let left = 0;

    switch (step.position) {
      case 'bottom':
        top = rect.bottom + padding;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'top':
        top = rect.top - tooltipHeight - padding;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - padding;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + padding;
        break;
      default:
        top = rect.bottom + padding;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
    }

    // Keep tooltip within viewport
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));

    setTooltipPosition({ top, left });
  }, [step, isFinalTip]);

  useEffect(() => {
    if (isOpen) {
      updatePositions();
      // Update on scroll/resize
      window.addEventListener('resize', updatePositions);
      window.addEventListener('scroll', updatePositions, true);
      return () => {
        window.removeEventListener('resize', updatePositions);
        window.removeEventListener('scroll', updatePositions, true);
      };
    }
  }, [isOpen, updatePositions]);

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    onSkip();
  };

  if (!isOpen) return null;

  return (
    <div className="tour-overlay">
      {/* Highlight cutout */}
      {highlightRect && !isFinalTip && (
        <div
          className="tour-highlight"
          style={{
            top: highlightRect.top - 8,
            left: highlightRect.left - 8,
            width: highlightRect.width + 16,
            height: highlightRect.height + 16,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className={`tour-tooltip ${isFinalTip ? 'tour-tooltip-centered' : ''}`}
        style={isFinalTip ? {} : { top: tooltipPosition.top, left: tooltipPosition.left }}
      >
        {/* Arrow pointing to element */}
        {!isFinalTip && highlightRect && (
          <div className={`tour-arrow tour-arrow-${step.position || 'bottom'}`} />
        )}

        <div className="tour-tooltip-content">
          <h3 className="tour-title">{step.title}</h3>
          
          {isFinalTip ? (
            // Final tip with checklist
            <div className="tour-final-content">
              <p className="tour-final-subtitle">מומלץ לעשות עכשיו:</p>
              <ul className="tour-checklist">
                <li>
                  <span className="tour-check">✓</span>
                  עבור על הקטגוריות ובדוק שהעסקאות סווגו נכון
                </li>
                <li>
                  <span className="tour-check">✓</span>
                  לחץ על "הכנסות" ובדוק שכל מה שמופיע הוא באמת הכנסה (ולא החזר)
                </li>
              </ul>
            </div>
          ) : (
            <p className="tour-text">{step.content}</p>
          )}

          {/* Progress and buttons */}
          <div className="tour-footer">
            <span className="tour-progress">
              {currentStep + 1} / {TOUR_STEPS.length}
            </span>
            
            <div className="tour-buttons">
              {currentStep > 0 && !isFinalTip && (
                <button className="tour-btn tour-btn-secondary" onClick={handlePrev}>
                  הקודם ▶
                </button>
              )}
              
              {!isLastStep && (
                <button className="tour-btn tour-btn-skip" onClick={handleSkip}>
                  דלג
                </button>
              )}
              
              <button className="tour-btn tour-btn-primary" onClick={handleNext}>
                {isLastStep ? 'סיים והתחל! 🚀' : '◀ הבא'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
