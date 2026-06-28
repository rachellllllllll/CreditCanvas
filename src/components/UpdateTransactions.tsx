/**
 * UpdateTransactions — ממשק לעדכון עסקאות:
 * 1. קישורים ישירים לאתרי הבנקים/אשראי
 * 2. אזור drag & drop לגרירת קבצים שהורדו
 * 3. פרסור בזיכרון → שמירת דלתא ל-transactions.json (ללא שמירת קובץ המקור)
 */

import React, { useState, useCallback, useRef } from 'react';
import './UpdateTransactions.css';
import type { CreditDetail } from '../types';
import { readXLSX, readXLS, sheetToArray } from '../utils/xlsxMinimal';
import { parseCreditDetailsFromSheet } from '../utils/creditParser';
import { parseBankStatementFromSheet } from '../utils/bankParser';
import { detectSheetTypeFromSheet } from '../utils/sheetType';
import { loadTransactionStore, saveTransactionStore, findNewTransactions } from '../utils/transactionStore';

// קישורים ישירים לדפי הכניסה/עסקאות
const BANK_LINKS = [
  { id: 'hapoalim', label: 'הפועלים', icon: '🏦', url: 'https://login.bankhapoalim.co.il/' },
  { id: 'leumi', label: 'לאומי', icon: '🏦', url: 'https://hb2.bankleumi.co.il/' },
  { id: 'discount', label: 'דיסקונט', icon: '🏦', url: 'https://start.discountbank.co.il/' },
  { id: 'mizrahi', label: 'מזרחי', icon: '🏦', url: 'https://www.mizrahi-tefahot.co.il/' },
  { id: 'max', label: 'מקס', icon: '💳', url: 'https://www.max.co.il/' },
  { id: 'cal', label: 'כאל', icon: '💳', url: 'https://www.cal-online.co.il/' },
  { id: 'isracard', label: 'ישראכרט', icon: '💳', url: 'https://digital.isracard.co.il/' },
];

interface UpdateTransactionsProps {
  dirHandle: FileSystemDirectoryHandle | null;
  existingDetails: CreditDetail[];
  onFilesAdded?: (count: number) => void;
}

export default function UpdateTransactions({ dirHandle, existingDetails, onFilesAdded }: UpdateTransactionsProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // זיהוי סוג קובץ תקין
  const isValidFile = (name: string) => {
    const lower = name.toLowerCase();
    return lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv') || lower.endsWith('.json');
  };

  // פרסור קבצים בזיכרון ושמירת עסקאות חדשות ל-transactions.json
  const saveFiles = useCallback(async (files: File[]) => {
    if (!dirHandle) {
      setStatus({ type: 'error', message: 'יש לבחור תיקייה קודם' });
      return;
    }

    setProcessing(true);
    setStatus(null);

    const validFiles = files.filter(f => isValidFile(f.name));
    if (validFiles.length === 0) {
      setStatus({ type: 'error', message: 'לא נמצאו קבצים מתאימים (xlsx, xls, csv, json)' });
      setProcessing(false);
      return;
    }

    try {
      // שלב 1: פרסר את כל הקבצים שנגררו → CreditDetail[]
      const allIncoming: CreditDetail[] = [];
      
      for (const file of validFiles) {
        try {
          const buffer = await file.arrayBuffer();
          const name = file.name.toLowerCase();
          
          let sheets: Record<string, unknown[][]> = {};
          
          if (name.endsWith('.xlsx')) {
            const workbook = await readXLSX(buffer);
            for (const sheet of workbook.sheets) {
              sheets[sheet.name] = sheetToArray(sheet);
            }
          } else if (name.endsWith('.xls')) {
            const workbook = await readXLS(buffer, file.name);
            for (const sheet of workbook.sheets) {
              sheets[sheet.name] = sheetToArray(sheet);
            }
          } else {
            // csv/json — לא נתמך כרגע בפרסור ישיר, דלג
            continue;
          }
          
          // פרסר כל גיליון
          for (const [sheetName, sheetData] of Object.entries(sheets)) {
            const type = detectSheetTypeFromSheet(sheetData);
            let details: CreditDetail[] = [];
            
            if (type === 'credit') {
              details = await parseCreditDetailsFromSheet(sheetData, file.name);
            } else if (type === 'bank') {
              details = await parseBankStatementFromSheet(sheetData as (string | number)[][], file.name, sheetName);
            }
            // else: unknown/empty — דלג
            
            allIncoming.push(...details);
          }
        } catch (err) {
          console.error(`שגיאה בפרסור ${file.name}:`, err);
        }
      }
      
      if (allIncoming.length === 0) {
        setStatus({ type: 'error', message: 'לא נמצאו עסקאות בקבצים שנגררו' });
        setProcessing(false);
        return;
      }
      
      // שלב 2: מצא עסקאות חדשות (לא קיימות באקסלים שבתיקייה)
      const newTransactions = findNewTransactions(allIncoming, existingDetails);
      
      if (newTransactions.length === 0) {
        setStatus({ type: 'info', message: `📋 כל ${allIncoming.length} העסקאות כבר קיימות — אין חדשות` });
        setProcessing(false);
        return;
      }
      
      // שלב 3: טען מאגר קיים וצרף את החדשות
      const existingStore = await loadTransactionStore(dirHandle);
      const storeTransactions = existingStore?.transactions || [];
      
      // מצא חדשות גם ביחס למאגר (למנוע כפילויות גם שם)
      const trulyNew = findNewTransactions(newTransactions, storeTransactions);
      
      if (trulyNew.length === 0) {
        setStatus({ type: 'info', message: `📋 כל העסקאות כבר קיימות — אין חדשות` });
        setProcessing(false);
        return;
      }
      
      // שמור
      await saveTransactionStore(dirHandle, [...storeTransactions, ...trulyNew]);
      
      setStatus({ 
        type: 'success', 
        message: `✅ ${trulyNew.length} עסקאות חדשות נוספו (מתוך ${allIncoming.length} שנקראו)` 
      });
      onFilesAdded?.(trulyNew.length);
    } catch (err) {
      console.error('שגיאה בעיבוד קבצים:', err);
      setStatus({ type: 'error', message: 'שגיאה בעיבוד הקבצים' });
    }

    setProcessing(false);
  }, [dirHandle, existingDetails, onFilesAdded]);

  // Drag & Drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    await saveFiles(files);
  }, [saveFiles]);

  // File input handler
  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await saveFiles(files);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [saveFiles]);

  if (!dirHandle) return null;

  return (
    <div className="update-transactions">
      {/* שלב 1: קישורים לבנקים */}
      <div className="update-transactions__links-section">
        <div className="update-transactions__subtitle">1. הורד עסקאות מהבנק / אשראי:</div>
        <div className="update-transactions__links">
          {BANK_LINKS.map(link => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="update-transactions__link"
              title={`פתח ${link.label}`}
            >
              <span className="update-transactions__link-icon">{link.icon}</span>
              <span className="update-transactions__link-label">{link.label}</span>
            </a>
          ))}
        </div>
      </div>

      {/* שלב 2: Drag & Drop */}
      <div className="update-transactions__drop-section">
        <div className="update-transactions__subtitle">2. גרור את הקבצים לכאן:</div>
        <div
          className={`update-transactions__dropzone ${isDragging ? 'dragging' : ''} ${processing ? 'processing' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {processing ? (
            <span className="update-transactions__dropzone-text">⏳ שומר...</span>
          ) : isDragging ? (
            <span className="update-transactions__dropzone-text">📂 שחרר כאן!</span>
          ) : (
            <span className="update-transactions__dropzone-text">
              📂 גרור קבצים או לחץ לבחירה
              <span className="update-transactions__dropzone-hint">xlsx, xls, csv, json</span>
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv,.json"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
      </div>

      {/* סטטוס */}
      {status && (
        <div className={`update-transactions__status update-transactions__status--${status.type}`}>
          {status.message}
        </div>
      )}

      <div className="update-transactions__tip">
        💡 הקבצים נקראים בזיכרון בלבד — רק עסקאות חדשות נשמרות. קבצי האקסל בתיקייה לא משתנים.
      </div>
    </div>
  );
}
