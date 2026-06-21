/**
 * ניהול credentials בדפדפן באמצעות localStorage.
 * ללא הצפנה — הגנת same-origin מספיקה לשימוש אישי.
 */

const STORAGE_KEY = 'creditDetailAccounts';

export interface StoredAccount {
  id: string;         // e.g. 'visa-cal', 'max', 'isracard', 'leumi', 'hapoalim'
  label: string;      // e.g. 'ויזה כאל'
  username: string;
  password: string;
}

export interface AccountsData {
  accounts: StoredAccount[];
  rememberCredentials: boolean;
}

/** טעינת חשבונות מ-localStorage */
export function loadAccounts(): AccountsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AccountsData;
  } catch {
    // ignore
  }
  return { accounts: [], rememberCredentials: true };
}

/** שמירת חשבונות ל-localStorage */
export function saveAccounts(data: AccountsData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/** הוספה/עדכון חשבון */
export function addAccount(
  account: { id: string; label: string; username: string; password: string }
): AccountsData {
  const data = loadAccounts();
  const existingIdx = data.accounts.findIndex(a => a.id === account.id);

  if (existingIdx >= 0) {
    data.accounts[existingIdx] = account;
  } else {
    data.accounts.push(account);
  }

  saveAccounts(data);
  return data;
}

/** הסרת חשבון */
export function removeAccount(providerId: string): AccountsData {
  const data = loadAccounts();
  data.accounts = data.accounts.filter(a => a.id !== providerId);
  saveAccounts(data);
  return data;
}

/** קבלת credentials לספק מסוים */
export function getAccountCredentials(
  providerId: string
): { username: string; password: string } | null {
  const data = loadAccounts();
  const account = data.accounts.find(a => a.id === providerId);
  if (!account) return null;
  return { username: account.username, password: account.password };
}

/** מחיקת כל הנתונים */
export function clearAllAccounts(): void {
  localStorage.removeItem(STORAGE_KEY);
}
