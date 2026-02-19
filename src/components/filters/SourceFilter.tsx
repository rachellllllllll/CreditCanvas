import React, { useState } from "react";
import './SourceFilter.css';

interface SourceFilterProps {
  availableCards: string[];
  lastDateByCard: Record<string, number>;
  activeInViewByCard: Record<string, boolean>;
  selectedCards: string[];
  onToggleCard: (last4: string) => void;
  includeBank: boolean;
  onToggleBank: (include: boolean) => void;
  allSelected: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  dirHandle?: FileSystemDirectoryHandle; // לשמירת כינויים בתיקיה שנבחרה (File System Access API)
  inline?: boolean; // מצב inline - להציג ישירות את התוכן ללא כפתור
  onCardNameChange?: (last4: string, newName: string) => void; // callback לעדכון שם כרטיס
}

const SourceFilter: React.FC<SourceFilterProps> = ({ availableCards, lastDateByCard, activeInViewByCard, selectedCards, onToggleCard, includeBank, onToggleBank, allSelected, onSelectAll, onClearSelection, dirHandle, inline = false, onCardNameChange }) => {
  // כל ה-state הפנימי (editing, saving, cardNames) נשאר כאן
  // MainView רק מעביר את המינימום הדרוש
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [tempAlias, setTempAlias] = useState('');
  const [savingCard, setSavingCard] = useState<string | null>(null);
  const [savedCard, setSavedCard] = useState<string | null>(null);
  const [cardNames, setCardNames] = useState<Record<string, string>>({});
  const [loadingCardNames, setLoadingCardNames] = useState(false);
  const [cardNamesError, setCardNamesError] = useState<string | null>(null);
  const [showOldCards, setShowOldCards] = useState(false);

  // טעינת כינויים מהתיקיה (אם נבחרה). אם אין תיקיה – השאר ריק עד שמזינים.
  React.useEffect(() => {
    let cancelled = false;
    const loadFromDir = async () => {
      if (!dirHandle) return; // אין תיקיה נבחרת עדיין
      setLoadingCardNames(true);
      setCardNamesError(null);
      try {
        const fileName = 'cards-aliases.json';
        let data: Record<string, string> = {};
        try {
          const fh = await dirHandle.getFileHandle(fileName);
          const f = await fh.getFile();
          const text = await f.text();
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object') {
            data = parsed.cards || parsed; // תומך בשני פורמטים
          }
        } catch {
          // קובץ לא קיים – ניצור בשמירה הראשונה
        }
        if (!cancelled) setCardNames(data);
      } catch (e) {
        console.error('Load card aliases error', e);
        if (!cancelled) setCardNamesError('שגיאה בטעינת שמות כרטיסים');
      } finally {
        if (!cancelled) setLoadingCardNames(false);
      }
    };
    loadFromDir();
    return () => { cancelled = true; };
  }, [dirHandle]);

  React.useEffect(() => {
    setCardNames(prev => {
      const next = { ...prev };
      for (const c of availableCards) {
        if (!next[c]) next[c] = '';
      }
      return next;
    });
  }, [availableCards]);

  // פיצול כרטיסים לפעילים בתקופה האחרונה לעומת כרטיסים ישנים יותר
  const { recentCards, oldCards } = React.useMemo(() => {
    const rc: string[] = [];
    const oc: string[] = [];

    for (const c of availableCards) {
      if (activeInViewByCard[c]) rc.push(c);
      else oc.push(c);
    }

    return { recentCards: rc, oldCards: oc };
  }, [availableCards, activeInViewByCard]);

  const startEditingCard = (last4: string) => {
    setEditingCard(last4);
    setTempAlias(cardNames[last4] || '');
  };

  const cancelEditingCard = () => {
    setEditingCard(null);
    setTempAlias('');
  };

  const handleAliasKeyDown = (e: React.KeyboardEvent, last4: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveCardAlias(last4, tempAlias);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditingCard();
    }
  };

  const saveCardAlias = async (last4: string, newAlias: string) => {
    setSavingCard(last4);
    setCardNamesError(null);
    const trimmedAlias = newAlias.trim();
    const updated = { ...cardNames, [last4]: trimmedAlias };
    try {
      // כתיבה לתיקיה אם זמינה
      if (dirHandle) {
        const fileName = 'cards-aliases.json';
        const fh = await dirHandle.getFileHandle(fileName, { create: true });
        const w = await fh.createWritable();
        // נשמור בפורמט פשוט {"1234":"Alias"} (ללא עטיפת cards) לנוחות – או אפשר עם { cards: {...} }
        await w.write(JSON.stringify(updated, null, 2));
        await w.close();
      }
      // עדכון סטייט מקומי
      setCardNames(updated);
      // הודע ל-parent על השינוי כדי לעדכן את הטבלה
      if (onCardNameChange) {
        onCardNameChange(last4, trimmedAlias);
      }
      setEditingCard(null);
      setSavingCard(null);
      setSavedCard(last4);
      setTimeout(() => setSavedCard(null), 1200);
    } catch (e) {
      console.error('Save card alias error', e);
      setCardNamesError('שגיאה בשמירת שם כרטיס');
      setSavingCard(null);
    }
  };

  // במצב inline - מציג תמיד את התוכן בלי כפתור
  const showContent = inline || showSourceMenu;

  return (
    <div className={`source-filter-wrapper ${inline ? 'source-filter-inline' : ''}`} style={{ position: 'relative' }}>
      {!inline && (
        <button
          type="button"
          className={`source-filter-btn ${showSourceMenu ? 'open' : ''}`}
          onClick={() => setShowSourceMenu(s => !s)}
          aria-haspopup="true"
          aria-expanded={showSourceMenu}
          aria-controls="source-filter-pop"
        >
          מקורות {allSelected && includeBank ? '(הכל)' : ''}
        </button>
      )}
      {showContent && (
        <div id="source-filter-pop" className={`source-filter-popover ${inline ? 'source-filter-popover-inline' : ''}`} role="dialog" aria-label="בחירת מקורות נתונים">
          <div className="sf-section">
            <div className="sf-title">כרטיסי אשראי</div>
            {availableCards.length === 0 && <div className="sf-empty">לא נמצאו כרטיסים</div>}

            <div className="sf-cards-scroll-area">
              {recentCards.length > 0 && (
                <div className="sf-subtitle">כרטיסים בשימוש לאחרונה</div>
              )}
              {recentCards.map(last4 => {
                const isEditing = editingCard === last4;
                const isSaving = savingCard === last4;
                const wasSaved = savedCard === last4;
                const displayName = cardNames[last4] || 'שם כרטיס';
                const lastTs = lastDateByCard[last4];
                const lastDateLabel = lastTs
                  ? new Date(lastTs).toLocaleDateString('he-IL')
                  : null;

                return (
                  <div key={last4} className={`sf-item sf-card-line ${wasSaved ? 'saved-flash' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedCards.includes(last4)}
                      onChange={() => onToggleCard(last4)}
                      aria-label={`הצג כרטיס ${last4}`}
                    />
                    <div className="sf-card-main">
                      <div className="sf-card-top-row">
                        <span className="sf-card-digits" aria-hidden="true">••••{last4}</span>

                        {!isEditing ? (
                          <>
                            <span
                              className="sf-card-alias-display"
                              onClick={() => startEditingCard(last4)}
                              role="button"
                              tabIndex={0}
                              aria-label={`עריכת שם לכרטיס ••••${last4}`}
                            >
                              {displayName}
                            </span>
                            <button
                              type="button"
                              className="sf-edit-btn"
                              onClick={() => startEditingCard(last4)}
                              aria-label={`עריכת שם לכרטיס ••••${last4}`}
                            >✏️</button>
                          </>
                        ) : (
                          <>
                            <input
                              type="text"
                              className="sf-card-alias-input"
                              value={tempAlias}
                              onChange={e => setTempAlias(e.target.value)}
                              onBlur={() => saveCardAlias(last4, tempAlias)}
                              onKeyDown={e => handleAliasKeyDown(e, last4)}
                              placeholder="שם כרטיס"
                              autoFocus
                              disabled={isSaving}
                              aria-label={`שם לכרטיס ••••${last4}`}
                            />
                            {isSaving && <span className="sf-saving-indicator">💾</span>}
                          </>
                        )}
                      </div>
                      {lastDateLabel && (
                        <div className="sf-card-lastdate-row">
                          <span className="sf-card-lastdate">פעיל עד {lastDateLabel}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {oldCards.length > 0 && (
                <>
                  <button
                    type="button"
                    className="sf-old-cards-toggle"
                    onClick={() => setShowOldCards(v => !v)}
                  >
                    {showOldCards ? 'הסתר כרטיסים ישנים' : `הצג כרטיסים ישנים (${oldCards.length})`}
                  </button>
                  {showOldCards && (
                    <div className="sf-old-cards-group">
                      <div className="sf-subtitle sf-old-title">כרטיסים ישנים (לא בשימוש בחודשים האחרונים)</div>
                      {oldCards.map(last4 => {
                        const isEditing = editingCard === last4;
                        const isSaving = savingCard === last4;
                        const wasSaved = savedCard === last4;
                        const displayName = cardNames[last4] || 'שם כרטיס';
                        const lastTs = lastDateByCard[last4];
                        const lastDateLabel = lastTs
                          ? new Date(lastTs).toLocaleDateString('he-IL')
                          : null;

                        return (
                          <div key={last4} className={`sf-item sf-card-line sf-card-old ${wasSaved ? 'saved-flash' : ''}`}>
                            <input
                              type="checkbox"
                              checked={selectedCards.includes(last4)}
                              onChange={() => onToggleCard(last4)}
                              aria-label={`הצג כרטיס ישן ${last4}`}
                            />
                            <div className="sf-card-main">
                              <div className="sf-card-top-row">
                                <span className="sf-card-digits" aria-hidden="true">••••{last4}</span>
                                {/* <span className="sf-old-chip">היסטורי</span> */}

                                {!isEditing ? (
                                  <>
                                    <span
                                      className="sf-card-alias-display"
                                      onClick={() => startEditingCard(last4)}
                                      role="button"
                                      tabIndex={0}
                                      aria-label={`עריכת שם לכרטיס היסטורי ••••${last4}`}
                                    >
                                      {displayName}
                                    </span>
                                    <button
                                      type="button"
                                      className="sf-edit-btn"
                                      onClick={() => startEditingCard(last4)}
                                      aria-label={`עריכת שם לכרטיס היסטורי ••••${last4}`}
                                    >✏️</button>
                                  </>
                                ) : (
                                  <>
                                    <input
                                      type="text"
                                      className="sf-card-alias-input"
                                      value={tempAlias}
                                      onChange={e => setTempAlias(e.target.value)}
                                      onBlur={() => saveCardAlias(last4, tempAlias)}
                                      onKeyDown={e => handleAliasKeyDown(e, last4)}
                                      placeholder="שם כרטיס"
                                      autoFocus
                                      disabled={isSaving}
                                      aria-label={`שם לכרטיס היסטורי ••••${last4}`}
                                    />
                                    {isSaving && <span className="sf-saving-indicator">💾</span>}
                                  </>
                                )}
                              </div>
                              {lastDateLabel && (
                                <div className="sf-card-lastdate-row">
                                  <span className="sf-card-lastdate sf-card-lastdate-old">עד {lastDateLabel}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>{/* סוף sf-cards-scroll-area */}
            <div className="sf-actions">
              <button type="button" onClick={onSelectAll} disabled={availableCards.length === 0 || allSelected}>בחר כל</button>
              <button type="button" onClick={onClearSelection} disabled={selectedCards.length === 0}>נקה</button>
            </div>
            {cardNamesError && <div className="sf-error" role="alert">{cardNamesError}</div>}
            {loadingCardNames && <div className="sf-loading">טוען...</div>}
          </div>
          <div className="sf-section" style={{ borderTop: '1px solid #ececec', paddingTop: 10 }}>
            <div className="sf-title">חשבון בנק</div>
            <label className="sf-item">
              <input
                type="checkbox"
                checked={includeBank}
                onChange={() => onToggleBank(!includeBank)}
              />
              <span>חשבון עו"ש</span>
            </label>
          </div>
          {!inline && (
            <div className="sf-footer">
              <button type="button" className="sf-close" onClick={() => setShowSourceMenu(false)}>סגור</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SourceFilter;