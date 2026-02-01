import React from 'react';

const Footer: React.FC = () => (
  <div className="footer">
    {/* Privacy Message */}
    <div className="footer-privacy">
      <span className="footer-privacy-icon">🔒</span>
      <span>הנתונים שלך נשארים במחשב שלך בלבד • ללא סיסמאות • ללא שרתים</span>
    </div>
    <div className="footer-links">
      <a href="https://github.com/yourusername/your-repo" target="_blank" rel="noopener noreferrer">
        על האפליקציה הזו
      </a>
      {' | '}
      <a href="https://github.com/yourusername/your-repo/issues" target="_blank" rel="noopener noreferrer">
        משוב
      </a>
    </div>
    <div style={{ marginTop: 8, fontSize: 14, color: '#666' }}>
      גרסה 1.0.0 | פיתוח על ידי [Your Name]
    </div>
  </div>
);

export default Footer;
