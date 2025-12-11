# השינוי מ-XLSX לפרסר מינימלי

## סיכום השינויים

האפליקציה כעת **קוראת קבצי XLSX ישירות ללא תלות בספריית XLSX**. כל הפעולות עם קבצי Excel עכשיו מתבצעות באמצעות:
- **JSZip** - לפתיחת קובץ ZIP (שהוא בעצם קובץ XLSX)
- **DOMParser** - לפרסור XML הפנימי
- **Parser מינימלי מותאם** - בקובץ `utils/xlsxMinimal.ts`

## יתרונות

✅ **אין תלות בספריית XLSX כבדה** - טובה יותר ל-bundle size
✅ **קובץ בודד לקריאה** - `utils/xlsxMinimal.ts` עם ~300 שורות ברורות
✅ **זיהוי סוג קובץ דינאמי** - מזהה בנק או אשראי אוטומטית
✅ **תמיכה בערכי עברית** - עקביות בקידוד תווים
✅ **תמיכה בתאריכים ומספרים** - עיבוד נכון של פורמטים Excel

## איך זה עובד

### קריאת קבצי XLSX
```typescript
import { readXLSX, sheetToArray } from './utils/xlsxMinimal';

const arrayBuffer = await file.arrayBuffer();
const workbook = await readXLSX(arrayBuffer);

// עבור על כל הגיליונות
for (const sheet of workbook.sheets) {
  const sheetData = sheetToArray(sheet); // [[row1], [row2], ...]
  // עדכון נתונים...
}
```

### תמיכה בקבצים
עדיין תומכת במלואה:
- ✅ קבצי CSV - פורסור טקסט בסיסי
- ✅ קבצי XLSX - Parser חדש מינימלי
- ✅ קבצי XLS - דרך XLSX

## מחשבות עבור בעתיד

### עדכון קבצי XLSX
כרגע, המערכת **קוראת בלבד** קבצי XLSX. אם תרצה לעדכן קבצים חזרה:
1. זה דורש יכולת **לכתוב XML** בחזרה לקובץ ZIP
2. מסובך יותר - היום מומלץ **להשתמש ב-CSV כ-format הראשי**

### סגנונות וערך עברית
Parser כרגע **תומך בטקסט ומספרים ותאריכים בלבד**:
- ✅ מספרים
- ✅ טקסט עברי
- ✅ תאריכים (סריאלי של Excel)
- ❌ נוסחאות
- ❌ סגנונות (צבעים, גדלים)
- ❌ תרשימים

זה מתאים למושלם לקבצי בנק ואשראי!

## קודים שעדכנו

### utils/xlsxMinimal.ts
- **קובץ חדש** - Parser XLSX מינימלי (~380 שורות)
- פונקציות עיקריות:
  - `readXLSX(arrayBuffer)` - קורא קובץ XLSX מלא
  - `sheetToArray(sheet)` - ממיר גיליון למערך דו-ממדי
  - `excelSerialToDate(serial)` - ממיר תאריך סריאלי לטקסט

### utils/sheetType.ts
- הסרנו import של XLSX
- `detectSheetTypeFromSheet()` - עכשיו קבל מערך בודה לא XLSX sheet
- `ensureSheetType()` - עדכן חתימה לקבל מערך

### utils/bankParser.ts
- הסרנו import של XLSX
- `parseBankStatementFromSheet()` - עכשיו מקבל מערך דו-ממדי ומחזיר Promise
- עדיין תומכת בפורסור CSV כרגע

### src/App.tsx
- הסרנו import של XLSX
- הוספנו import של `xlsxMinimal`
- `handlePickDirectory_Internal()` - עדכנו לקריאת XLSX וקבלת עבודה

## בדיקה

כדי לבדוק שהקוד עובד:
```bash
npm run type-check  # בדיקת TypeScript
npm run dev         # הרצה למחשבה
npm run build       # בניית bundle
```

## המלצות עבור המשתמש

### דרך הטובה ביותר: CSV
1. **ייצא קבצים מהבנק/אשראי ל-CSV**
2. **וודא UTF-8 with BOM** בפעם הראשונה
3. **העלה לאפליקציה**

### דרך חלופית: XLSX ישירות
1. **העלה קבצי XLSX ישירות**
2. **אפליקציה תקרא אוטומטית**
3. ⚠️ זיהוי בנק/אשראי قد יצטרך אישור ידי

## שימוש עתידי

אם בעתיד תרצה:
- **כתיבה חזרה לקבצי XLSX** - נצטרך להרחיב את ה-Parser
- **תמיכה בנוסחאות** - זה בלתי אפשרי ללא סימולציה של Excel
- **עיצוב וסגנונות** - אפשרי אבל לא בדרך מעשית

---

**עודכן:** 10 ביולי 2025
**גרסה:** 2.0 - Parser מינימלי

