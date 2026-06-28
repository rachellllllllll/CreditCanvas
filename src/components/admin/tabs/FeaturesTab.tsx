/**
 * Features Tab Component
 * הצגת כל הפיצ'רים שהמשתמש השתמש בהם
 */

import React, { useMemo } from 'react';
import type { UserSummary } from '../userDataUtils';

interface FeaturesTabProps {
  user: UserSummary;
}

interface FeatureUsage {
  name: string;
  count: number;
  lastUsed: number;
}

// Feature display names in Hebrew
const FEATURE_NAMES: Record<string, string> = {
  'category_edit': 'עריכת קטגוריות',
  'export_csv': 'ייצוא CSV',
  'yearly_view': 'תצוגה שנתית',
  'duplicate_detection': 'זיהוי כפילויות',
  'category_create': 'יצירת קטגוריה',
  'import_categories': 'ייבוא קטגוריות',
  'share': 'שיתוף',
  'filter_transactions': 'סינון עסקאות',
  'search': 'חיפוש',
  'settings': 'הגדרות',
};

export default function FeaturesTab({ user }: FeaturesTabProps) {
  // Count feature usage
  const featureUsage = useMemo(() => {
    const usageMap = new Map<string, { count: number; lastUsed: number }>();
    
    user.events.forEach(e => {
      if (e.event === 'feature_used' && e.metadata?.feature) {
        const featureName = String(e.metadata.feature);
        const existing = usageMap.get(featureName) || { count: 0, lastUsed: 0 };
        usageMap.set(featureName, {
          count: existing.count + 1,
          lastUsed: Math.max(existing.lastUsed, e.timestamp),
        });
      }
    });
    
    const features: FeatureUsage[] = [];
    usageMap.forEach((value, name) => {
      features.push({
        name,
        count: value.count,
        lastUsed: value.lastUsed,
      });
    });
    
    // Sort by usage count (descending)
    return features.sort((a, b) => b.count - a.count);
  }, [user.events]);

  // All possible features
  const allFeatures = Object.keys(FEATURE_NAMES);
  const usedFeatureNames = new Set(featureUsage.map(f => f.name));
  const unusedFeatures = allFeatures.filter(f => !usedFeatureNames.has(f));

  if (featureUsage.length === 0) {
    return (
      <div className="tab-empty-state">
        <span className="tab-empty-icon">⚡</span>
        <p>לא נרשם שימוש בפיצ׳רים ספציפיים</p>
      </div>
    );
  }

  return (
    <div className="features-tab-wrapper">
      {/* Summary */}
      <div className="features-summary">
        <div className="features-summary-stat">
          <span className="features-summary-value">{featureUsage.length}</span>
          <span className="features-summary-label">פיצ׳רים בשימוש</span>
        </div>
        <div className="features-summary-stat">
          <span className="features-summary-value">
            {featureUsage.reduce((sum, f) => sum + f.count, 0)}
          </span>
          <span className="features-summary-label">סה״כ שימושים</span>
        </div>
      </div>

      {/* Used Features */}
      <div className="features-section">
        <h3 className="features-section-title">✅ פיצ׳רים בשימוש</h3>
        <div className="features-list">
          {featureUsage.map((feature) => (
            <div key={feature.name} className="feature-item feature-item-used">
              <div className="feature-info">
                <div className="feature-name">
                  <span className="feature-icon">⚡</span>
                  <span className="feature-label">
                    {FEATURE_NAMES[feature.name] || feature.name}
                  </span>
                </div>
                <div className="feature-meta">
                  <span className="feature-count">{feature.count} פעמים</span>
                  <span className="feature-separator">·</span>
                  <span className="feature-last-used">
                    {new Date(feature.lastUsed).toLocaleDateString('he-IL', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
              </div>
              <div className="feature-usage-bar">
                <div 
                  className="feature-usage-fill" 
                  style={{ 
                    width: `${Math.min(100, (feature.count / featureUsage[0].count) * 100)}%` 
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Unused Features */}
      {unusedFeatures.length > 0 && (
        <div className="features-section">
          <h3 className="features-section-title">❌ פיצ׳רים שלא נוצלו</h3>
          <div className="features-unused-list">
            {unusedFeatures.map((feature) => (
              <span key={feature} className="feature-unused-tag">
                {FEATURE_NAMES[feature] || feature}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
