/**
 * Unknown Credit Charge Descriptions Table
 * טבלת תיאורי חיוב אשראי לא מזוהים - תיאורים שנמצאו בדפי חשבון בנק
 * אך לא קיימים ב-KNOWN_CREDIT_CHARGE_DESCRIPTIONS
 */

import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { getFirebaseApp } from '../../utils/firebaseAuth';
import type { AnalyticsEvent } from './types';
import './UnknownCreditDescriptionsTable.css';

export interface UnknownDescriptionEntry {
  description: string;
  count: number;          // כמה פעמים נצפה (כמה אירועים הכילו את התיאור הזה)
  uniqueUsers: number;    // כמה משתמשים ייחודיים דיווחו
  lastSeen: number;       // timestamp של הדיווח האחרון
  eventIds: string[];     // מזהי האירועים שהכילו את התיאור הזה
}

interface UnknownCreditDescriptionsTableProps {
  events: AnalyticsEvent[];
  onDeleted?: () => void;  // callback אחרי מחיקה כדי לרענן את הנתונים
}

export default function UnknownCreditDescriptionsTable({
  events,
  onDeleted,
}: UnknownCreditDescriptionsTableProps) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // סינון אירועי unknown_credit_charge_descriptions ומיצוי התיאורים
  const unknownDescriptions = useMemo((): UnknownDescriptionEntry[] => {
    const descMap = new Map<
      string,
      { count: number; users: Set<string>; lastSeen: number; eventIds: Set<string> }
    >();

    events.forEach((e) => {
      if (e.event !== 'unknown_credit_charge_descriptions') return;
      const descriptions = e.metadata?.descriptions as string[] | undefined;
      if (!Array.isArray(descriptions)) return;

      for (const desc of descriptions) {
        const trimmed = desc.trim();
        if (!trimmed) continue;

        if (!descMap.has(trimmed)) {
          descMap.set(trimmed, {
            count: 0,
            users: new Set(),
            lastSeen: 0,
            eventIds: new Set(),
          });
        }
        const entry = descMap.get(trimmed)!;
        entry.count++;
        entry.users.add(e.visitorId);
        entry.lastSeen = Math.max(entry.lastSeen, e.timestamp);
        entry.eventIds.add(e.id);
      }
    });

    return Array.from(descMap.entries())
      .map(([description, data]) => ({
        description,
        count: data.count,
        uniqueUsers: data.users.size,
        lastSeen: data.lastSeen,
        eventIds: Array.from(data.eventIds),
      }))
      .sort((a, b) => b.count - a.count);
  }, [events]);

  const totalUniqueDescriptions = unknownDescriptions.length;
  const totalOccurrences = unknownDescriptions.reduce((sum, d) => sum + d.count, 0);

  // גלילה לטבלה
  const scrollToTable = useCallback(() => {
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // מחיקת כל האירועים שמכילים תיאור מסוים
  const handleDeleteDescription = useCallback(
    async (description: string, eventIds: string[]) => {
      if (!confirm(`למחוק את כל הדיווחים על "${description}"?\n(${eventIds.length} אירועים יימחקו)`)) {
        return;
      }
      setDeleting(description);
      try {
        const app = getFirebaseApp();
        if (!app) throw new Error('Firebase not initialized');
        const db = getFirestore(app);

        // מחק את כל האירועים שמכילים את התיאור הזה
        // כאשר הם מכילים רק את התיאור הזה - מוחקים את כל המסמך
        // כאשר הם מכילים מספר תיאורים - נמחק את כל המסמך (פשטות)
        for (const eventId of eventIds) {
          try {
            await deleteDoc(doc(db, 'analytics_events', eventId));
          } catch (err) {
            console.error(`[Admin] Error deleting event ${eventId}:`, err);
          }
        }
        onDeleted?.();
      } catch (err) {
        console.error('[Admin] Error deleting description events:', err);
        alert('שגיאה במחיקה: ' + (err instanceof Error ? err.message : 'unknown'));
      } finally {
        setDeleting(null);
      }
    },
    [onDeleted]
  );

  // מחיקת כל אירועי unknown_credit_charge_descriptions
  const handleDeleteAll = useCallback(async () => {
    if (!confirm(`למחוק את כל ${totalOccurrences} הדיווחים על תיאורים לא מזוהים?`)) {
      return;
    }
    setDeletingAll(true);
    try {
      const app = getFirebaseApp();
      if (!app) throw new Error('Firebase not initialized');
      const db = getFirestore(app);
      const eventsRef = collection(db, 'analytics_events');
      const q = query(eventsRef, where('event', '==', 'unknown_credit_charge_descriptions'));
      const snapshot = await getDocs(q);

      for (const docSnap of snapshot.docs) {
        try {
          await deleteDoc(doc(db, 'analytics_events', docSnap.id));
        } catch (err) {
          console.error(`[Admin] Error deleting event ${docSnap.id}:`, err);
        }
      }
      onDeleted?.();
    } catch (err) {
      console.error('[Admin] Error deleting all:', err);
      alert('שגיאה במחיקה: ' + (err instanceof Error ? err.message : 'unknown'));
    } finally {
      setDeletingAll(false);
    }
  }, [totalOccurrences, onDeleted]);

  if (totalUniqueDescriptions === 0) return null;

  return (
    <>
      {/* Summary Badge - clickable to scroll to table */}
      <div className="unknown-credit-summary" onClick={scrollToTable} title="לחץ לגלילה לטבלה">
        <div className="unknown-credit-summary-icon">💳</div>
        <div className="unknown-credit-summary-text">
          <span className="unknown-credit-summary-count">{totalUniqueDescriptions}</span>
          <span className="unknown-credit-summary-label">
            תיאורי חיוב אשראי לא מזוהים
          </span>
        </div>
        <div className="unknown-credit-summary-arrow">⬇</div>
      </div>

      {/* Full Table */}
      <div className="unknown-credit-table-section" ref={tableRef}>
        <div className="unknown-credit-table-header">
          <h2>💳 תיאורי חיוב אשראי לא מזוהים</h2>
          <p className="unknown-credit-table-subtitle">
            תיאורים שזוהו בדפי חשבון בנק אך לא נמצאים ברשימת{' '}
            <code>KNOWN_CREDIT_CHARGE_DESCRIPTIONS</code>
          </p>
          <div className="unknown-credit-table-stats">
            <span className="stat-badge">
              🔤 {totalUniqueDescriptions} תיאורים ייחודיים
            </span>
            <span className="stat-badge">
              📊 {totalOccurrences} דיווחים
            </span>
            <span className="stat-badge">
              👥 {new Set(unknownDescriptions.flatMap((d) => d.eventIds)).size} אירועים
            </span>
          </div>
          <button
            className="unknown-credit-delete-all-btn"
            onClick={handleDeleteAll}
            disabled={deletingAll}
          >
            {deletingAll ? '⏳ מוחק...' : '🗑️ מחק הכל'}
          </button>
        </div>

        <div className="unknown-credit-table-wrapper">
          <table className="unknown-credit-table">
            <thead>
              <tr>
                <th>#</th>
                <th>תיאור</th>
                <th>כמות דיווחים</th>
                <th>משתמשים</th>
                <th>נראה לאחרונה</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {unknownDescriptions.map((entry, index) => (
                <tr key={entry.description}>
                  <td className="row-number">{index + 1}</td>
                  <td className="description-cell">
                    <span className="description-text">{entry.description}</span>
                  </td>
                  <td className="count-cell">
                    <span className="count-badge">{entry.count}</span>
                  </td>
                  <td className="users-cell">{entry.uniqueUsers}</td>
                  <td className="date-cell">
                    {new Date(entry.lastSeen).toLocaleDateString('he-IL', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="actions-cell">
                    <button
                      className="delete-row-btn"
                      onClick={() =>
                        handleDeleteDescription(entry.description, entry.eventIds)
                      }
                      disabled={deleting === entry.description}
                      title={`מחק ${entry.eventIds.length} אירועים שמכילים תיאור זה`}
                    >
                      {deleting === entry.description ? '⏳' : '🗑️'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
