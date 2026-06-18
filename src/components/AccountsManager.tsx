/**
 * AccountsManager — ממשק ניהול חשבונות בנק/אשראי מחוברים.
 * מאפשר הוספה, הסרה, וסנכרון ידני.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  loadCredentialsFile,
  createCredentialsFile,
  verifyCredentialsPin,
  addProvider,
  removeProvider,
} from '../utils/encryption';
import type { CredentialsFile } from '../utils/encryption';
import { SUPPORTED_PROVIDERS } from '../utils/scrapedJsonParser';
import type { ProviderId } from '../utils/scrapedJsonParser';
import { isExtensionInstalled, performSync, wasSyncedToday, loadSyncState } from '../utils/syncManager';
import type { SyncProgress } from '../utils/syncManager';
import type { CreditDetail } from '../types';
import './AccountsManager.css';

interface AccountsManagerProps {
  dirHandle: FileSystemDirectoryHandle | null;
  existingDetails: CreditDetail[];
  onSyncComplete?: (newDetails: CreditDetail[]) => void;
}

export default function AccountsManager({ dirHandle, existingDetails, onSyncComplete }: AccountsManagerProps) {
  const [credentialsFile, setCredentialsFile] = useState<CredentialsFile | null>(null);
  const [pin, setPin] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // הוספת provider
  const [addingProvider, setAddingProvider] = useState(false);
  const [newProvider, setNewProvider] = useState<{ id: ProviderId; username: string; password: string }>({
    id: 'visa-cal',
    username: '',
    password: '',
  });

  // API תמיד זמין ב-Vercel
  useEffect(() => {
    setExtensionInstalled(true);
  }, []);

  // טעינת credentials
  useEffect(() => {
    if (!dirHandle) return;
    loadCredentialsFile(dirHandle).then(file => {
      setCredentialsFile(file);
    });
    loadSyncState(dirHandle).then(state => {
      setLastSyncDate(state.lastSyncDate || null);
    });
  }, [dirHandle]);

  // אימות PIN
  const handleVerifyPin = useCallback(async () => {
    if (!credentialsFile || !pin) return;
    setError(null);
    const valid = await verifyCredentialsPin(credentialsFile, pin);
    if (valid) {
      setPinVerified(true);
    } else {
      setError('PIN שגוי');
    }
  }, [credentialsFile, pin]);

  // יצירת קובץ credentials חדש
  const handleCreateCredentials = useCallback(async () => {
    if (!dirHandle || !pin || pin.length < 4) {
      setError('PIN חייב להכיל לפחות 4 תווים');
      return;
    }
    setError(null);
    const file = await createCredentialsFile(dirHandle, pin);
    setCredentialsFile(file);
    setPinVerified(true);
    setShowSetup(false);
  }, [dirHandle, pin]);

  // הוספת provider
  const handleAddProvider = useCallback(async () => {
    if (!dirHandle || !credentialsFile || !pinVerified) return;
    if (!newProvider.username || !newProvider.password) {
      setError('יש למלא שם משתמש וסיסמה');
      return;
    }
    setError(null);

    const providerInfo = SUPPORTED_PROVIDERS.find(p => p.id === newProvider.id);
    const updated = await addProvider(dirHandle, credentialsFile, pin, {
      id: newProvider.id,
      label: providerInfo?.label || newProvider.id,
      username: newProvider.username,
      password: newProvider.password,
    });

    setCredentialsFile(updated);
    setAddingProvider(false);
    setNewProvider({ id: 'visa-cal', username: '', password: '' });
  }, [dirHandle, credentialsFile, pin, pinVerified, newProvider]);

  // הסרת provider
  const handleRemoveProvider = useCallback(async (providerId: string) => {
    if (!dirHandle || !credentialsFile) return;
    const updated = await removeProvider(dirHandle, credentialsFile, providerId);
    setCredentialsFile(updated);
  }, [dirHandle, credentialsFile]);

  // סנכרון
  const handleSync = useCallback(async () => {
    if (!dirHandle || !pinVerified) return;
    setError(null);
    setSyncProgress({ status: 'checking', message: 'מתחיל סנכרון...' });

    try {
      const { newDetails } = await performSync(
        dirHandle,
        existingDetails,
        pin,
        (progress) => setSyncProgress(progress)
      );

      if (newDetails.length > 0 && onSyncComplete) {
        onSyncComplete(newDetails);
      }

      setLastSyncDate(new Date().toISOString());
    } catch (err) {
      setError((err as Error).message);
      setSyncProgress(null);
    }
  }, [dirHandle, pinVerified, pin, existingDetails, onSyncComplete]);

  // --- Render ---

  if (!dirHandle) return null;

  // תוסף לא מותקן
  if (extensionInstalled === false) {
    return (
      <div className="accounts-manager">
        <div className="accounts-manager__no-extension">
          <h3>🔌 סנכרון אוטומטי</h3>
          <p>
            כדי לסנכרן עסקאות אוטומטית מהבנק/אשראי, יש להתקין את התוסף
            <strong> Credit Detail Auto Sync</strong>.
          </p>
          <a
            href="#"
            className="accounts-manager__install-link"
            onClick={(e) => { e.preventDefault(); /* TODO: link to Chrome Web Store */ }}
          >
            התקן תוסף →
          </a>
        </div>
      </div>
    );
  }

  // אין credentials — הצע הגדרה
  if (!credentialsFile) {
    return (
      <div className="accounts-manager">
        <div className="accounts-manager__setup">
          <h3>🔐 הגדרת סנכרון אוטומטי</h3>
          <p>הגדר PIN להצפנת פרטי ההתחברות שלך. ה-PIN ישמש לפענוח בכל סנכרון.</p>
          {!showSetup ? (
            <button className="accounts-manager__btn" onClick={() => setShowSetup(true)}>
              הגדר חשבונות
            </button>
          ) : (
            <div className="accounts-manager__pin-form">
              <input
                type="password"
                placeholder="בחר PIN (4+ תווים)"
                value={pin}
                onChange={e => setPin(e.target.value)}
                minLength={4}
              />
              <button className="accounts-manager__btn" onClick={handleCreateCredentials} disabled={pin.length < 4}>
                צור
              </button>
            </div>
          )}
          {error && <p className="accounts-manager__error">{error}</p>}
        </div>
      </div>
    );
  }

  // יש credentials אבל לא הוזן PIN
  if (!pinVerified) {
    return (
      <div className="accounts-manager">
        <div className="accounts-manager__pin-form">
          <h3>🔑 הזן PIN</h3>
          <input
            type="password"
            placeholder="PIN"
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleVerifyPin()}
          />
          <button className="accounts-manager__btn" onClick={handleVerifyPin}>
            אישור
          </button>
          {error && <p className="accounts-manager__error">{error}</p>}
        </div>
      </div>
    );
  }

  // PIN מאומת — ממשק מלא
  return (
    <div className="accounts-manager">
      <div className="accounts-manager__header">
        <h3>🔄 חשבונות מחוברים</h3>
        {lastSyncDate && (
          <span className="accounts-manager__last-sync">
            סנכרון אחרון: {new Date(lastSyncDate).toLocaleDateString('he-IL')}
          </span>
        )}
      </div>

      {/* רשימת providers */}
      <div className="accounts-manager__providers">
        {credentialsFile.providers.length === 0 ? (
          <p className="accounts-manager__empty">לא הוגדרו חשבונות עדיין</p>
        ) : (
          credentialsFile.providers.map(p => (
            <div key={p.id} className="accounts-manager__provider">
              <span className="accounts-manager__provider-label">{p.label}</span>
              <button
                className="accounts-manager__remove-btn"
                onClick={() => handleRemoveProvider(p.id)}
                title="הסר חשבון"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {/* הוספת provider */}
      {addingProvider ? (
        <div className="accounts-manager__add-form">
          <select
            value={newProvider.id}
            onChange={e => setNewProvider({ ...newProvider, id: e.target.value as ProviderId })}
          >
            {SUPPORTED_PROVIDERS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="שם משתמש / ת.ז."
            value={newProvider.username}
            onChange={e => setNewProvider({ ...newProvider, username: e.target.value })}
          />
          <input
            type="password"
            placeholder="סיסמה"
            value={newProvider.password}
            onChange={e => setNewProvider({ ...newProvider, password: e.target.value })}
          />
          <div className="accounts-manager__add-actions">
            <button className="accounts-manager__btn" onClick={handleAddProvider}>שמור</button>
            <button className="accounts-manager__btn accounts-manager__btn--secondary" onClick={() => setAddingProvider(false)}>
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <button className="accounts-manager__btn" onClick={() => setAddingProvider(true)}>
          + הוסף חשבון
        </button>
      )}

      {/* כפתור סנכרון */}
      <div className="accounts-manager__sync">
        <button
          className="accounts-manager__btn accounts-manager__btn--primary"
          onClick={handleSync}
          disabled={credentialsFile.providers.length === 0 || syncProgress?.status === 'syncing'}
        >
          {syncProgress?.status === 'syncing' ? '⏳ מסנכרן...' : '🔄 סנכרן עכשיו'}
        </button>
      </div>

      {/* התקדמות סנכרון */}
      {syncProgress && (
        <div className={`accounts-manager__progress accounts-manager__progress--${syncProgress.status}`}>
          {syncProgress.message}
          {syncProgress.current && syncProgress.total && (
            <span> ({syncProgress.current}/{syncProgress.total})</span>
          )}
        </div>
      )}

      {error && <p className="accounts-manager__error">{error}</p>}
    </div>
  );
}
