/**
 * AccountsManager — ממשק ניהול חשבונות בנק/אשראי מחוברים.
 * מאפשר הוספה, הסרה, וסנכרון ידני.
 * credentials נשמרים ב-localStorage ללא הצפנה (same-origin protection).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  loadAccounts,
  addAccount,
  removeAccount,
} from '../utils/encryption';
import type { AccountsData } from '../utils/encryption';
import { SUPPORTED_PROVIDERS } from '../utils/scrapedJsonParser';
import type { ProviderId } from '../utils/scrapedJsonParser';
import { performSync, loadSyncState } from '../utils/syncManager';
import type { SyncProgress } from '../utils/syncManager';
import type { CreditDetail } from '../types';
import './AccountsManager.css';

interface AccountsManagerProps {
  dirHandle: FileSystemDirectoryHandle | null;
  existingDetails: CreditDetail[];
  onSyncComplete?: (newDetails: CreditDetail[]) => void;
}

export default function AccountsManager({ dirHandle, existingDetails, onSyncComplete }: AccountsManagerProps) {
  const [accountsData, setAccountsData] = useState<AccountsData>(() => loadAccounts());
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

  // טעינת sync state
  useEffect(() => {
    if (!dirHandle) return;
    loadSyncState(dirHandle).then(state => {
      setLastSyncDate(state.lastSyncDate || null);
    });
  }, [dirHandle]);

  // הוספת חשבון
  const handleAddProvider = useCallback(() => {
    if (!newProvider.username || !newProvider.password) {
      setError('יש למלא שם משתמש וסיסמה');
      return;
    }
    setError(null);

    const providerInfo = SUPPORTED_PROVIDERS.find(p => p.id === newProvider.id);
    const updated = addAccount({
      id: newProvider.id,
      label: providerInfo?.label || newProvider.id,
      username: newProvider.username,
      password: newProvider.password,
    });

    setAccountsData(updated);
    setAddingProvider(false);
    setNewProvider({ id: 'visa-cal', username: '', password: '' });
  }, [newProvider]);

  // הסרת חשבון
  const handleRemoveProvider = useCallback((providerId: string) => {
    const updated = removeAccount(providerId);
    setAccountsData(updated);
  }, []);

  // סנכרון
  const handleSync = useCallback(async () => {
    if (!dirHandle) return;
    if (accountsData.accounts.length === 0) {
      setError('יש להוסיף לפחות חשבון אחד');
      return;
    }
    setError(null);
    setSyncProgress({ status: 'checking', message: 'מתחיל סנכרון...' });

    try {
      const { newDetails } = await performSync(
        dirHandle,
        existingDetails,
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
  }, [dirHandle, accountsData, existingDetails, onSyncComplete]);

  // --- Render ---

  if (!dirHandle) return null;

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
        {accountsData.accounts.length === 0 ? (
          <p className="accounts-manager__empty">לא הוגדרו חשבונות עדיין</p>
        ) : (
          accountsData.accounts.map(p => (
            <div key={p.id} className="accounts-manager__provider">
              <span className="accounts-manager__provider-label">{p.label}</span>
              <span className="accounts-manager__provider-user">({p.username})</span>
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
          disabled={accountsData.accounts.length === 0 || syncProgress?.status === 'syncing'}
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

      {/* הודעה על שמירה בדפדפן */}
      <p className="accounts-manager__note">
        💡 פרטי ההתחברות נשמרים בדפדפן זה בלבד (localStorage).
      </p>

      {error && <p className="accounts-manager__error">{error}</p>}
    </div>
  );
}
