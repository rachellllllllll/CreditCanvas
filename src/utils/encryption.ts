/**
 * הצפנה ופענוח credentials באמצעות Web Crypto API.
 * המשתמש מגדיר PIN → ממנו נגזר מפתח AES-256-GCM.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** גזירת מפתח הצפנה מ-PIN + salt */
async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/** הצפנת טקסט עם PIN */
export async function encrypt(plainText: string, pin: string): Promise<{ encrypted: string; salt: string; iv: string }> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(pin, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(plainText)
  );

  return {
    encrypted: bufferToBase64(encrypted),
    salt: bufferToBase64(salt.buffer),
    iv: bufferToBase64(iv.buffer),
  };
}

/** פענוח טקסט עם PIN */
export async function decrypt(encryptedData: { encrypted: string; salt: string; iv: string }, pin: string): Promise<string> {
  const salt = new Uint8Array(base64ToBuffer(encryptedData.salt));
  const iv = new Uint8Array(base64ToBuffer(encryptedData.iv));
  const data = base64ToBuffer(encryptedData.encrypted);
  const key = await deriveKey(pin, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  return new TextDecoder().decode(decrypted);
}

/** בדיקה שה-PIN נכון (מנסה לפענח ובודק שלא נכשל) */
export async function verifyPin(encryptedData: { encrypted: string; salt: string; iv: string }, pin: string): Promise<boolean> {
  try {
    await decrypt(encryptedData, pin);
    return true;
  } catch {
    return false;
  }
}

// --- סוגי נתונים לקובץ credentials ---

export interface ProviderCredentials {
  id: string;         // e.g. 'visa-cal', 'max', 'isracard', 'leumi', 'hapoalim'
  label: string;      // e.g. 'ויזה כאל'
  encrypted: string;
  salt: string;
  iv: string;
}

export interface CredentialsFile {
  version: number;
  pinVerification: { encrypted: string; salt: string; iv: string }; // מוצפן "VERIFY" לבדיקת PIN
  providers: ProviderCredentials[];
  lastSync?: string;  // ISO timestamp
}

const CREDENTIALS_FILENAME = 'credentials.enc.json';
const PIN_VERIFY_TEXT = 'CREDIT_DETAIL_PIN_OK';

/** שמירת קובץ credentials לתיקייה */
export async function saveCredentialsFile(
  dirHandle: FileSystemDirectoryHandle,
  data: CredentialsFile
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(CREDENTIALS_FILENAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

/** קריאת קובץ credentials מתיקייה */
export async function loadCredentialsFile(
  dirHandle: FileSystemDirectoryHandle
): Promise<CredentialsFile | null> {
  try {
    const fileHandle = await dirHandle.getFileHandle(CREDENTIALS_FILENAME);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as CredentialsFile;
  } catch {
    return null;
  }
}

/** יצירת קובץ credentials חדש עם PIN */
export async function createCredentialsFile(
  dirHandle: FileSystemDirectoryHandle,
  pin: string
): Promise<CredentialsFile> {
  const pinVerification = await encrypt(PIN_VERIFY_TEXT, pin);
  const data: CredentialsFile = {
    version: 1,
    pinVerification,
    providers: [],
  };
  await saveCredentialsFile(dirHandle, data);
  return data;
}

/** אימות PIN מול קובץ קיים */
export async function verifyCredentialsPin(
  credentialsFile: CredentialsFile,
  pin: string
): Promise<boolean> {
  try {
    const decrypted = await decrypt(credentialsFile.pinVerification, pin);
    return decrypted === PIN_VERIFY_TEXT;
  } catch {
    return false;
  }
}

/** הוספת provider לקובץ credentials */
export async function addProvider(
  dirHandle: FileSystemDirectoryHandle,
  credentialsFile: CredentialsFile,
  pin: string,
  provider: { id: string; label: string; username: string; password: string }
): Promise<CredentialsFile> {
  const plainData = JSON.stringify({ username: provider.username, password: provider.password });
  const encryptedData = await encrypt(plainData, pin);

  const existingIdx = credentialsFile.providers.findIndex(p => p.id === provider.id);
  const newProvider: ProviderCredentials = {
    id: provider.id,
    label: provider.label,
    ...encryptedData,
  };

  if (existingIdx >= 0) {
    credentialsFile.providers[existingIdx] = newProvider;
  } else {
    credentialsFile.providers.push(newProvider);
  }

  await saveCredentialsFile(dirHandle, credentialsFile);
  return credentialsFile;
}

/** הסרת provider מקובץ credentials */
export async function removeProvider(
  dirHandle: FileSystemDirectoryHandle,
  credentialsFile: CredentialsFile,
  providerId: string
): Promise<CredentialsFile> {
  credentialsFile.providers = credentialsFile.providers.filter(p => p.id !== providerId);
  await saveCredentialsFile(dirHandle, credentialsFile);
  return credentialsFile;
}

/** פענוח credentials של provider ספציפי */
export async function decryptProvider(
  provider: ProviderCredentials,
  pin: string
): Promise<{ username: string; password: string }> {
  const decrypted = await decrypt(
    { encrypted: provider.encrypted, salt: provider.salt, iv: provider.iv },
    pin
  );
  return JSON.parse(decrypted);
}
