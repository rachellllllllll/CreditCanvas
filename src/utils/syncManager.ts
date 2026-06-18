/**
 * מנהל סנכרון — מזהה חודשים חסרים ומתקשר עם Vercel API להשלמתם.
 */

import type { CreditDetail } from '../types';
import type { ScrapedResult } from './scrapedJsonParser';
import { saveScrapedResult } from './scrapedJsonParser';
import { loadCredentialsFile, verifyCredentialsPin, decryptProvider } from './encryption';
import type { CredentialsFile, ProviderCredentials } from './encryption';

// --- API Communication ---

/** בדיקה אם ה-API זמין */
export async function isExtensionInstalled(): Promise<boolean> {
  // בגרסת Vercel API — תמיד זמין (אין צורך בתוסף)
  return true;
}

/** שליחת בקשת scraping ל-Vercel API Route */
export async function requestScrapeFromExtension(
  providerId: string,
  credentials: { username: string; password: string },
  options: { startDate: string; endDate?: string }
): Promise<ScrapedResult> {
  const response = await fetch('/api/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId,
      credentials,
      startDate: options.startDate,
      endDate: options.endDate,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorData.error || `Scrape failed: ${response.status}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Scraping failed');
  }

  return result as ScrapedResult;
}

// --- Sync State ---

export interface SyncState {
  lastSyncDate?: string;          // ISO timestamp של סנכרון אחרון
  providerLastDates: Record<string, string>; // providerId → תאריך עסקה אחרון ISO
}

const SYNC_STATE_FILENAME = 'sync-state.json';

export async function loadSyncState(dirHandle: FileSystemDirectoryHandle): Promise<SyncState> {
  try {
    const fileHandle = await dirHandle.getFileHandle(SYNC_STATE_FILENAME);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as SyncState;
  } catch {
    return { providerLastDates: {} };
  }
}

export async function saveSyncState(dirHandle: FileSystemDirectoryHandle, state: SyncState): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(SYNC_STATE_FILENAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(state, null, 2));
  await writable.close();
}

// --- Sync Logic ---

/** מציאת התאריך המאוחר ביותר מרשימת עסקאות */
export function findLatestTransactionDate(details: CreditDetail[]): Date | null {
  let latest: Date | null = null;

  for (const d of details) {
    const parts = d.date.split('/');
    if (parts.length < 3) continue;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const yearRaw = parts[2];
    const year = yearRaw.length === 2 ? 2000 + parseInt(yearRaw, 10) : parseInt(yearRaw, 10);

    const date = new Date(year, month, day);
    if (!latest || date > latest) {
      latest = date;
    }
  }

  return latest;
}

/** בדיקה אם צריך סנכרון (יותר מ-N ימים מהעסקה האחרונה) */
export function needsSync(details: CreditDetail[], thresholdDays: number = 3): boolean {
  const latest = findLatestTransactionDate(details);
  if (!latest) return true; // אין עסקאות בכלל

  const now = new Date();
  const diffMs = now.getTime() - latest.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays > thresholdDays;
}

/** חישוב תאריך ההתחלה ל-scraping (מהעסקה האחרונה של ה-provider) */
export function getScrapeStartDate(
  syncState: SyncState,
  providerId: string,
  fallbackDays: number = 60
): string {
  const lastDate = syncState.providerLastDates[providerId];
  if (lastDate) {
    // התחל יום אחד לפני התאריך האחרון (חפיפה קטנה לבטיחות, dedupe יטפל)
    const d = new Date(lastDate);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  // אין היסטוריה — קח 60 ימים אחורה
  const d = new Date();
  d.setDate(d.getDate() - fallbackDays);
  return d.toISOString().slice(0, 10);
}

// --- Main Sync Flow ---

export interface SyncProgress {
  status: 'checking' | 'syncing' | 'done' | 'error' | 'skipped' | 'no-extension' | 'no-credentials';
  message: string;
  provider?: string;
  current?: number;
  total?: number;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

/**
 * ביצוע סנכרון מלא:
 * 1. בדיקה שהתוסף מותקן
 * 2. טעינת credentials
 * 3. לכל provider — בדיקה אם חסר מידע → scrape → שמירה
 */
export async function performSync(
  dirHandle: FileSystemDirectoryHandle,
  existingDetails: CreditDetail[],
  pin: string,
  onProgress?: SyncProgressCallback
): Promise<{ newDetails: CreditDetail[]; filesCreated: string[] }> {
  const newDetails: CreditDetail[] = [];
  const filesCreated: string[] = [];

  // 1. בדיקת תוסף
  onProgress?.({ status: 'checking', message: 'בודק תוסף...' });
  const extensionReady = await isExtensionInstalled();
  if (!extensionReady) {
    onProgress?.({ status: 'no-extension', message: 'התוסף לא מותקן' });
    return { newDetails, filesCreated };
  }

  // 2. טעינת credentials
  const credentialsFile = await loadCredentialsFile(dirHandle);
  if (!credentialsFile || credentialsFile.providers.length === 0) {
    onProgress?.({ status: 'no-credentials', message: 'לא הוגדרו חשבונות' });
    return { newDetails, filesCreated };
  }

  // 3. אימות PIN
  const pinValid = await verifyCredentialsPin(credentialsFile, pin);
  if (!pinValid) {
    onProgress?.({ status: 'error', message: 'PIN שגוי' });
    return { newDetails, filesCreated };
  }

  // 4. טעינת sync state
  const syncState = await loadSyncState(dirHandle);

  // 5. סנכרון כל provider
  const providers = credentialsFile.providers;
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    onProgress?.({
      status: 'syncing',
      message: `מסנכרן ${provider.label}...`,
      provider: provider.id,
      current: i + 1,
      total: providers.length,
    });

    try {
      // חישוב תאריך התחלה
      const startDate = getScrapeStartDate(syncState, provider.id);

      // פענוח credentials
      const creds = await decryptProvider(provider, pin);

      // שליחת בקשה לתוסף
      const result = await requestScrapeFromExtension(
        provider.id,
        creds,
        { startDate }
      );

      // שמירת תוצאות
      if (result.accounts.some(a => a.success && a.txns.length > 0)) {
        const fileName = await saveScrapedResult(dirHandle, result);
        filesCreated.push(fileName);

        // עדכון sync state
        const allTxnDates = result.accounts
          .flatMap(a => a.txns?.map(t => t.date) ?? [])
          .filter(Boolean)
          .sort();
        const latestTxnDate = allTxnDates[allTxnDates.length - 1];
        if (latestTxnDate) {
          syncState.providerLastDates[provider.id] = latestTxnDate;
        }

        // פרסור לפורמט CreditDetail
        const { parseScrapedTransactions } = await import('./scrapedJsonParser');
        const details = parseScrapedTransactions(result);
        newDetails.push(...details);
      }
    } catch (err) {
      const error = err as Error;
      console.warn(`[Sync] Failed for ${provider.id}:`, error.message);
      onProgress?.({
        status: 'error',
        message: `שגיאה בסנכרון ${provider.label}: ${error.message}`,
        provider: provider.id,
      });
    }
  }

  // 6. עדכון sync state
  syncState.lastSyncDate = new Date().toISOString();
  await saveSyncState(dirHandle, syncState);

  onProgress?.({
    status: 'done',
    message: `סנכרון הושלם — ${newDetails.length} עסקאות חדשות`,
  });

  return { newDetails, filesCreated };
}

/** בדיקה אם סנכרון כבר בוצע היום */
export async function wasSyncedToday(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
  const state = await loadSyncState(dirHandle);
  if (!state.lastSyncDate) return false;

  const lastSync = new Date(state.lastSyncDate);
  const now = new Date();

  return (
    lastSync.getFullYear() === now.getFullYear() &&
    lastSync.getMonth() === now.getMonth() &&
    lastSync.getDate() === now.getDate()
  );
}
