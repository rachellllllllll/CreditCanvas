/**
 * User Timeline with Tabs Component
 * תצוגת Timeline משופרת עם טאבים - סקירה מלאה של משתמש
 */

import React, { useState, useMemo } from 'react';
import type { UserSummary } from './userDataUtils';
import { deviceIcon } from './userDataUtils';
import TimelineTab from './tabs/TimelineTab';
import StatsTab from './tabs/StatsTab';
import FeedbacksTab from './tabs/FeedbacksTab';
import FeaturesTab from './tabs/FeaturesTab';
import ErrorsTab from './tabs/ErrorsTab';
import TechnicalTab from './tabs/TechnicalTab';
import './UserTimelineTabs.css';

interface UserTimelineTabsProps {
  user: UserSummary;
  onClose: () => void;
}

// Tab definitions
type TabId = 'timeline' | 'stats' | 'feedbacks' | 'features' | 'errors' | 'technical';

interface TabDefinition {
  id: TabId;
  icon: string;
  label: string;
  component: React.ComponentType<{ user: UserSummary }>;
  // Function to check if tab should be enabled
  isEnabled: (user: UserSummary) => boolean;
}

const TAB_DEFINITIONS: TabDefinition[] = [
  {
    id: 'timeline',
    icon: '📅',
    label: 'Timeline',
    component: TimelineTab,
    isEnabled: (user) => user.events.length > 0,
  },
  {
    id: 'stats',
    icon: '📊',
    label: 'סטטיסטיקה',
    component: StatsTab,
    isEnabled: (user) => user.fileUploads > 0 || user.visitCount > 0,
  },
  {
    id: 'feedbacks',
    icon: '💬',
    label: 'משובים',
    component: FeedbacksTab,
    isEnabled: (user) => user.feedbackCount > 0,
  },
  {
    id: 'features',
    icon: '⚡',
    label: 'פיצ\'רים',
    component: FeaturesTab,
    isEnabled: (user) => user.featuresUsed.length > 0,
  },
  {
    id: 'errors',
    icon: '🔴',
    label: 'שגיאות',
    component: ErrorsTab,
    isEnabled: (user) => user.errorCount > 0,
  },
  {
    id: 'technical',
    icon: '🔧',
    label: 'מידע טכני',
    component: TechnicalTab,
    isEnabled: () => true, // Always enabled
  },
];

export default function UserTimelineTabs({ user, onClose }: UserTimelineTabsProps) {
  // Find first enabled tab as default
  const firstEnabledTab = useMemo(() => {
    const enabled = TAB_DEFINITIONS.find(tab => tab.isEnabled(user));
    return enabled?.id || 'timeline';
  }, [user]);

  const [activeTab, setActiveTab] = useState<TabId>(firstEnabledTab);

  // Get active tab definition
  const activeTabDef = TAB_DEFINITIONS.find(t => t.id === activeTab) || TAB_DEFINITIONS[0];
  const ActiveTabComponent = activeTabDef.component;

  return (
    <div className="user-timeline-panel user-timeline-tabs">
      {/* Header */}
      <div className="timeline-header">
        <div className="timeline-header-info">
          <span className="timeline-user-id">
            {deviceIcon(user.deviceType)} משתמש <code>{user.visitorId.slice(0, 8)}</code>
          </span>
          <div className="timeline-user-badges">
            <span className="timeline-badge">{user.visitCount} ביקורים</span>
            <span className="timeline-badge">{user.fileUploads} העלאות</span>
            {user.feedbackRating !== null && (
              <span className="timeline-badge timeline-badge-gold">
                {'⭐'.repeat(Math.round(user.feedbackRating))} {user.feedbackRating}
              </span>
            )}
            {user.errorCount > 0 && (
              <span className="timeline-badge timeline-badge-red">
                {user.errorCount} שגיאות
              </span>
            )}
            {user.featuresUsed.length > 0 && (
              <span className="timeline-badge">{user.featuresUsed.length} פיצ׳רים</span>
            )}
          </div>
        </div>
        <button className="timeline-close-btn" onClick={onClose} title="סגור">✕</button>
      </div>

      {/* Tabs Navigation - Desktop */}
      <nav className="timeline-tabs-nav" role="tablist">
        {TAB_DEFINITIONS.map(tab => {
          const enabled = tab.isEnabled(user);
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-disabled={!enabled}
              disabled={!enabled}
              className={`timeline-tab ${activeTab === tab.id ? 'timeline-tab-active' : ''} ${!enabled ? 'timeline-tab-disabled' : ''}`}
              onClick={() => enabled && setActiveTab(tab.id)}
            >
              <span className="timeline-tab-icon">{tab.icon}</span>
              <span className="timeline-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Tabs Navigation - Mobile (Dropdown) */}
      <div className="timeline-tabs-mobile">
        <select
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as TabId)}
          className="timeline-tabs-select"
        >
          {TAB_DEFINITIONS.map(tab => {
            const enabled = tab.isEnabled(user);
            return (
              <option key={tab.id} value={tab.id} disabled={!enabled}>
                {tab.icon} {tab.label}
                {!enabled ? ' (אין נתונים)' : ''}
              </option>
            );
          })}
        </select>
      </div>

      {/* Tab Content */}
      <div className="timeline-tab-content" role="tabpanel">
        <ActiveTabComponent user={user} />
      </div>
    </div>
  );
}
