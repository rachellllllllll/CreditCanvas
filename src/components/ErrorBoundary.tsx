import React from 'react';
import { trackConsoleError } from '../utils/analytics';
import type { UserProfile } from '../utils/analytics';
import './ErrorBoundary.css';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  userProfile?: UserProfile | null;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorCount: number;
}

/**
 * Error Boundary - lovks React errors ואדמין אותם ל-Firebase
 * אם יותר מ-3 שגיאות - מציגה fallback
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // شارك الخطأ مع Firebase (بشكل غير متزامن)
    this.trackError(error, errorInfo);
  }

  private async trackError(error: Error, errorInfo: React.ErrorInfo) {
    try {
      await trackConsoleError(this.props.userProfile || null, {
        errorType: 'react_error',
        errorName: error.name,
        errorMessage: error.message,
        componentStack: errorInfo.componentStack?.substring(0, 200),
        isRecoverable: this.state.errorCount < 3, // אם יותר מ-3 שגיאות - may be unrecoverable
        timestamp: Date.now(),
      });
    } catch (analyticsError) {
      console.warn('[ErrorBoundary] Failed to track error:', analyticsError);
    }
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // אם יותר מ-3 שגיאות - מציגה fallback ומעלה חשיקה
      if (this.state.errorCount > 3) {
        return (
          this.props.fallback || (
            <div className="error-boundary-critical">
              <div className="error-boundary-content">
                <h2>⚠️ בעיה קריטית</h2>
                <p>ישנה בעיה קריטית ש אפשר לא להחזיר.</p>
                <p className="error-id">דיווח השגיאה נשלח למנהל המערכת.</p>
                <div className="error-actions">
                  <button onClick={() => window.location.href = '/'} className="error-btn-primary">
                    חזרה לדף הבית
                  </button>
                </div>
              </div>
            </div>
          )
        );
      }

      // שגיאה שניתן להחזיר - הצע ניסיון חוזר
      return (
        <div className="error-boundary-recoverable">
          <div className="error-boundary-content">
            <h2>❌ שגיאה בטעינה</h2>
            <p>קרתה שגיאה בעת טעינת הדף. אנא נסה שוב.</p>
            
            {process.env.NODE_ENV === 'development' && (
              <details className="error-details">
                <summary>פרטי שגיאה (development בלבד)</summary>
                <pre className="error-stack">
                  <strong>{this.state.error?.message}</strong>
                  {'\n\n'}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            
            <div className="error-actions">
              <button onClick={this.handleReset} className="error-btn-primary">
                🔄 נסה שוב
              </button>
              <button onClick={() => window.location.href = '/'} className="error-btn-secondary">
                🏠 חזרה לדף הבית
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
