# Plan: מחיקת ועריכת קטגוריה — טיפול נכון בעסקאות, כללים וכינויים

## Implementation Status: ✅ DONE

All steps implemented and build passes successfully.

## TL;DR

שתי בעיות קשורות:
1. **מחיקת קטגוריה** — מתבצעת בלחיצה אחת, בלי אישור ובלי טיפול בעסקאות/כללים/כינויים. העסקאות נשארות "יתומות".
2. **שינוי שם קטגוריה** — משנה רק את ההגדרה ב-`categories.json`, אבל העסקאות, הכללים, והכינויים נשארים עם השם הישן. בנוסף, כפתור "עריכת קטגוריה" בתפריט ימני בטבלת העסקאות מציג `alert("פיצ'ר בפיתוח")`.

**הפתרון:** פונקציית ליבה אחת `reassignCategory(oldName, newName)` שמטפלת בשניהם:
- **מחיקה** = `reassignCategory` + הסרת ההגדרה
- **שינוי שם** = `reassignCategory` (ההגדרה כבר עודכנה)

שני הפיצ'רים חולקים לוגיקה זהה: העברת עסקאות + כללים + כינויים משם ישן לשם חדש.

---

## Steps

### 1. ✅ יצירת קומפוננטת דיאלוג חדשה `DeleteCategoryDialog.tsx`

דיאלוג מודאלי ב-RTL שמקבל כ-props את שם הקטגוריה, מספר העסקאות המושפעות, מספר הכללים המושפעים, ואת רשימת הקטגוריות הזמינות (בלי הנוכחית). הדיאלוג מציג:

- כותרת: "מחיקת קטגוריה: {שם}"
- אזהרה: "X עסקאות ו-Y כללים יועברו לקטגוריה שתבחר"
- `CategorySelectOrAdd` לבחירת קטגוריה חלופית (חובה) — **עם `forbiddenCategoryName={categoryName}`** כדי למנוע בחירת הקטגוריה שנמחקת
- כפתור "מחק והעבר" (אדום, **מושבת** עד שבוחרים קטגוריה) ו"ביטול"
- **רמז לכפתור מושבת**: להוסיף tooltip: *"בחר קטגוריה יעד להפעלת הכפתור"*

**Edge Case — קטגוריה יחידה:**
אם למשתמש יש רק קטגוריה אחת והוא מנסה למחוק אותה, `CategorySelectOrAdd` יהיה ריק. במקרה זה:
- להציג הודעה: *"אין קטגוריות נוספות. צור קטגוריה חדשה כדי להעביר את העסקאות"*
- המשתמש יכול ליצור קטגוריה חדשה דרך `CategorySelectOrAdd`

**Props נדרשים:**
```ts
interface DeleteCategoryDialogProps {
  categoryName: string;
  transactionsCount: number;
  rulesCount: number;
  categories: CategoryDef[];
  onConfirm: (targetCategory: string) => void;
  onCancel: () => void;
  onAddCategory: (cat: CategoryDef) => void; // להעביר ל-CategorySelectOrAdd
  isLoading?: boolean;
}
```

> **אין אופציה "הסר שיוך"** — חובה לבחור קטגוריה חלופית. זה מונע מצב של עסקאות יתומות ושומר על עקביות בין סשנים (ראה שלב 5).

### 2. ✅ עדכון `handleDelete` ב-`CategoryManager.tsx`

במקום למחוק מיידית:

- **קטגוריה ריקה לחלוטין**: אם `categoriesCount[categoryName] === 0` וגם `rulesCountByCategory[categoryName] === 0` וגם `aliasesCountByCategory[categoryName] === 0` וגם `descMappingsCountByCategory[categoryName] === 0` → לפתוח `ConfirmDeleteEmptyDialog` (דיאלוג אישור פשוט)
- **קטגוריה עם תלויות** → לפתוח את `DeleteCategoryDialog` עם הנתונים הרלוונטיים
- להוסיף state חדש `deleteDialogState: { idx: number; categoryName: string; isEmpty: boolean } | null`

### 2.1 ✅ יצירת קומפוננטת `ConfirmDeleteEmptyDialog.tsx`

דיאלוג אישור פשוט (ללא בחירת קטגוריה יעד):

**Props נדרשים:**
```ts
interface ConfirmDeleteEmptyDialogProps {
  categoryName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean; // למקרה ששמירת categories.json לוקחת זמן
}
```

**תוכן הדיאלוג:**
- כותרת: "מחיקת קטגוריה"
- טקסט: "למחוק את הקטגוריה '{שם}'?"
- כפתורים: "מחק" (אדום, disabled בזמן loading) ו"ביטול"
- **משתמש ב-CSS של `EditCategoryDialog.css`** — לשמירה על UI אחיד
- **תמיכה ב-Escape key** — סגירה בלחיצה על Escape (חוץ מבזמן loading)

> **למה לא `window.confirm`?** — דיאלוג מותאם שומר על עקביות UI עם שאר האפליקציה. `window.confirm` נראה שונה לגמרי ותלוי בדפדפן.

### 3. ✅ פונקציית ליבה `reassignCategory(oldName, newName)` ב-`App.tsx`

פונקציה משותפת למחיקה ולשינוי שם:

**עדכון קבצים:**
- **כללים**: טוענת `category-rules.json`, מעדכנת כל כלל שה-`category` שלו === `oldName` → מחליפה ל-`newName`, ושומרת
- **כינויים**: מעדכנת `categories-aliases.json` — מחליפה כל alias שמפנה ל-`oldName` → מפנה ל-`newName`
- **מיפוי תיאור→קטגוריה**: מעדכנת `description-categories.json` — מחליפה כל ערך שמפנה ל-`oldName` → מפנה ל-`newName`

**עדכון React States:**
| State | Setter | מה לעדכן |
|---|---|---|
| `analysis` | `setAnalysis` | `details[].category === oldName` → `newName` |
| `categoryRules` | `setCategoryRules` | `rule.category === oldName` → `newName` |
| `categoryAliases` | `setCategoryAliases` | `aliases[key] === oldName` → `newName` |
| `descToCategory` | `setDescToCategory` | `descToCategory[key] === oldName` → `newName` |

**טיפול בשגיאות:**
```ts
async function reassignCategory(oldName: string, newName: string): Promise<boolean> {
  try {
    // ... עדכון קבצים ו-states
    showFeedback('success', `הקטגוריה "${oldName}" הועברה ל-"${newName}"`);
    return true;
  } catch (error) {
    console.error('Failed to reassign category:', error);
    showFeedback('error', 'שגיאה בשמירת השינויים. נסה שוב.');
    return false;
  }
}
```

שימושים:
- **מחיקה**: `reassignCategory(deletedName, targetName)` ואז הסרת ההגדרה מ-`categoriesList` + שמירה ל-`categories.json` (**דרך `handleCategoriesChange` הקיים**)
- **שינוי שם**: `reassignCategory(oldName, newName)` (ההגדרה כבר עודכנה ע"י `handleCategoryUpdate`)

### 4. ✅ הוספת props חדשים ל-`CategoryManager` ו-`SettingsMenu`

Props חדשים ל-`CategoryManager`:
- `onDeleteCategory: (categoryName: string, targetCategory?: string) => void` — קורא ל-`reassignCategory` (אם יש targetCategory) + מוחק את ההגדרה. לקטגוריה ריקה — רק מוחק את ההגדרה (בלי reassign)
- `onRenameCategory: (oldName: string, newName: string) => void` — קורא ל-`reassignCategory` בלבד
- `rulesCountByCategory: Record<string, number>` — ספירת כללים לפי קטגוריה
- `aliasesCountByCategory: Record<string, number>` — ספירת aliases שמפנים לכל קטגוריה
- `descMappingsCountByCategory: Record<string, number>` — ספירת description-to-category שמפנים לכל קטגוריה

**עדכון `SettingsMenuProps`:** מאחר ש-`CategoryManager` מוטמע בתוך `SettingsMenu`, צריך להעביר את ה-props החדשים דרכו:
1. להוסיף ל-`SettingsMenuProps`: `onDeleteCategory`, `onRenameCategory`, `rulesCountByCategory`, `aliasesCountByCategory`, `descMappingsCountByCategory`, `isReassigning`
2. ב-`SettingsMenu.tsx` — להעביר את ה-props ל-`CategoryManager`

**Props נוספים ל-`CategoryManager`:**
- `isLoading?: boolean` — להעביר לדיאלוגים שנפתחים מתוכו (`DeleteCategoryDialog`, `ConfirmDeleteEmptyDialog`)

### 5. ✅ תיקון שינוי שם ב-`CategoryManager.tsx`

ב-`handleCategoryUpdate` — אם **השם השתנה** (לא רק אייקון/צבע):
1. לזהות שהשם החדש שונה מהישן: `cats[idx].name !== updatedCat.name`
2. **אם השם החדש הוא קטגוריה קיימת אחרת** → זה בעצם **מיזוג קטגוריות**:
   - אם יש קטגוריה קיימת עם השם `newName` → להציג אזהרה: "הקטגוריה '{newName}' כבר קיימת. לאחד את שתי הקטגוריות?"
   - אם המשתמש מאשר → `reassignCategory(oldName, newName)` + **מחיקת** ההגדרה הישנה (לא יצירת כפילות)
   - אם ביטל → לא לעשות כלום
3. **אם השם החדש הוא שם חדש לגמרי** → `onRenameCategory(oldName, newName)` + עדכון ההגדרה
4. לעדכן את ההגדרה ברשימה כרגיל

בנוסף — לתקן את `onChange` ב-`CategorySelectOrAdd` שכרגע הוא **no-op** `() => {}`

### 6. ✅ חיבור "עריכת קטגוריה" מתפריט ימני בטבלה

ב-`TransactionsTable.tsx` [שורות 749-750](src/components/TransactionsTable.tsx#L749-L750) יש כרגע:
```ts
alert(`עריכת קטגוריה "${categoryName}" - פיצ'ר בפיתוח`);
```

**הפתרון:** לפתוח דיאלוג עריכה עצמאי (lightweight) לקטגוריה:
1. להוסיף state חדש ב-`App.tsx`: `editCategoryDefDialog: { categoryName: string } | null`
2. כשלוחצים "עריכת קטגוריה" מתפריט ימני → `onEditCategoryDefinition(categoryName)` → מעדכן את ה-state
3. להציג `EditCategoryDefDialog` (קומפוננטה חדשה קלת משקל) שמאפשרת לערוך שם/אייקון/צבע
4. בשמירה → קורא ל-`onRenameCategory` אם השם השתנה

**שרשרת Props ל-`onEditCategoryDefinition`:**
- `App.tsx` → `MainView` → `TransactionsTable`
- להוסיף `onEditCategoryDefinition: (categoryName: string) => void` ל-`MainViewProps` ול-`TransactionsTableProps`

**Props ל-`EditCategoryDefDialog`:**
```ts
interface EditCategoryDefDialogProps {
  categoryName: string;
  categoryDef: CategoryDef; // { name, icon, color }
  categories: CategoryDef[]; // לבדיקת שם כפול
  onSave: (oldName: string, newDef: CategoryDef) => void;
  onCancel: () => void;
  isLoading?: boolean;
}
```

**לוגיקת מיזוג:**
ב-`EditCategoryDefDialog` — אותה לוגיקה כמו בשלב 5:
- אם השם החדש שווה לשם של קטגוריה **קיימת אחרת** → להציג אזהרת מיזוג
- אם המשתמש מאשר → `reassignCategory(oldName, newName)` + מחיקת ההגדרה הישנה
- אם ביטל → לא לעשות כלום

> **למה דיאלוג עצמאי ולא פתיחת SettingsMenu?** — פתיחת SettingsMenu רק כדי לערוך קטגוריה אחת זה UX כבד מדי. דיאלוג ייעודי הוא ממוקד ומהיר יותר.

### 7. ✅ ספירת כללים, aliases ו-description-mappings לפי קטגוריה

ב-`App.tsx`, להוסיף שלושה חישובי `useMemo` (בדומה ל-`categoriesCount`):

```ts
// ספירת כללים לפי קטגוריה
const rulesCountByCategory = useMemo(() => {
  const counts: Record<string, number> = {};
  for (const rule of categoryRules) {
    counts[rule.category] = (counts[rule.category] || 0) + 1;
  }
  return counts;
}, [categoryRules]);

// ספירת aliases לפי קטגוריה
const aliasesCountByCategory = useMemo(() => {
  const counts: Record<string, number> = {};
  for (const targetCategory of Object.values(categoryAliases)) {
    counts[targetCategory] = (counts[targetCategory] || 0) + 1;
  }
  return counts;
}, [categoryAliases]);

// ספירת description-to-category mappings לפי קטגוריה
const descMappingsCountByCategory = useMemo(() => {
  const counts: Record<string, number> = {};
  for (const targetCategory of Object.values(descToCategory)) {
    counts[targetCategory] = (counts[targetCategory] || 0) + 1;
  }
  return counts;
}, [descToCategory]);
```

להעביר את שלושתם כ-props ל-`SettingsMenu` ומשם ל-`CategoryManager`

### 8. ✅ עדכון העסקאות בזיכרון (ללא שינוי באקסל)

> **ארכיטקטורה חשובה:** קבצי האקסל הם **read-only** — האפליקציה אף פעם לא כותבת אליהם בחזרה. העמודה `ענף` נקראת מהאקסל, אבל `applyCategoryRules()` **דורסת** אותה בהתאם ל-`category-rules.json`. לכן, `category-rules.json` הוא ה-source of truth האמיתי לקטגוריות.

**מה צריך לעשות:**
- **בזיכרון**: לעדכן את `analysis.details` — להחליף `category` מהישנה לחדשה
- **כללים**: לעדכן `category-rules.json` — להחליף את שם הקטגוריה בכל כלל שמפנה אליה
- **כינויים**: לעדכן `categories-aliases.json` — להחליף את שם הקטגוריה בכל alias שמפנה אליה
- **מיפוי תיאור→קטגוריה**: לעדכן `description-categories.json` — להחליף את שם הקטגוריה בכל entry שמפנה אליה
- **אין צורך לגעת בקבצי האקסל** — בטעינה מחדש, הכללים המעודכנים ידרסו את הערך מהאקסל

**התנהגות אחרי reload:**
- הכללים מצביעים על הקטגוריה החדשה → העסקאות מקבלות את הקטגוריה החדשה → **עקביות מלאה**

### 9. ✅ CSS והתנהגות לדיאלוגים

**`DeleteCategoryDialog`** — להשתמש ב-classes הקיימים של `EditCategoryDialog.css` עם תוספות קלות:
- להוסיף class `.delete-btn-danger` לכפתור האדום
- לייבא `EditCategoryDialog.css` ולא ליצור קובץ CSS נפרד

**`ConfirmDeleteEmptyDialog`** — אותו דבר, לשתף את ה-CSS של `EditCategoryDialog.css`

**`EditCategoryDefDialog`** (הדיאלוג החדש לעריכה מתפריט ימני) — אותו דבר, לשתף את ה-CSS של `EditCategoryDialog.css`

**תמיכה ב-Escape Key:**
- **שלושת הדיאלוגים** (`DeleteCategoryDialog`, `ConfirmDeleteEmptyDialog`, `EditCategoryDefDialog`) צריכים להיסגר בלחיצה על Escape (כמו `EditCategoryDialog`)
- להוסיף `useEffect` עם `keydown` listener:
```ts
useEffect(() => {
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !isLoading) onCancel();
  };
  document.addEventListener('keydown', handleEscape);
  return () => document.removeEventListener('keydown', handleEscape);
}, [onCancel, isLoading]);
```
- **לא לסגור ב-Escape אם `isLoading`** — למנוע סגירה בזמן שמירה

### 10. ✅ Loading State ו-Feedback למשתמש

**Loading State:**
- להוסיף state `isReassigning: boolean` ב-`App.tsx`
- בזמן `reassignCategory` → `setIsReassigning(true)` → להשבית כפתורים בדיאלוג
- להעביר `isLoading={isReassigning}` ל**שלושת הדיאלוגים**: `DeleteCategoryDialog`, `ConfirmDeleteEmptyDialog`, `EditCategoryDefDialog`
- בדיאלוגים: להציג spinner/disabled state על כפתור השמירה

**Feedback (Toast):**
- להשתמש ב-`useFeedbackPopup` הקיים
- הודעות:
  - הצלחה: `"הקטגוריה נמחקה והעסקאות הועברו"` / `"שם הקטגוריה עודכן"`
  - שגיאה: `"שגיאה בשמירת השינויים. נסה שוב."`

---

## Verification

### מחיקה
- בדיקה: ליצור קטגוריה, לשייך אליה עסקאות וכלל אוטומטי, ללחוץ מחק → לוודא שהדיאלוג נפתח עם המספרים הנכונים
- בדיקה: לוודא שכפתור "מחק והעבר" מושבת עד שבוחרים קטגוריה חלופית
- בדיקה: לבחור קטגוריה חלופית ולאשר → לוודא שכל העסקאות, הכללים, והכינויים הועברו
- בדיקה: לעשות reload → לוודא שהעסקאות עדיין בקטגוריה החדשה (עקביות)
- בדיקה: למחוק קטגוריה ריקה (0 עסקאות, 0 כללים, 0 aliases, 0 desc-mappings) → לוודא ש-`ConfirmDeleteEmptyDialog` נפתח ואחרי אישור הקטגוריה נמחקת
- בדיקה: ללחוץ "ביטול" → לוודא שלא קרה כלום

### שינוי שם
- בדיקה: לשנות שם קטגוריה ב-CategoryManager → לוודא שכל העסקאות, הכללים, והכינויים עודכנו לשם החדש
- בדיקה: לעשות reload → לוודא שהעסקאות עדיין בקטגוריה עם השם החדש
- בדיקה: לשנות רק אייקון/צבע (בלי שינוי שם) → לוודא ש-`reassignCategory` לא נקראת
- בדיקה: ללחוץ "עריכת קטגוריה" מתפריט ימני בטבלה → לוודא שנפתח דיאלוג עריכה ולא alert

### מיזוג קטגוריות
- בדיקה: לשנות שם קטגוריה לשם של קטגוריה **קיימת** → לוודא שמופיעה אזהרת מיזוג
- בדיקה: לאשר מיזוג → לוודא שכל העסקאות עברו לקטגוריה היעד וההגדרה הישנה נמחקה
- בדיקה: לבטל מיזוג → לוודא שלא קרה כלום

### Loading ו-Feedback
- בדיקה: ללחוץ "מחק והעבר" → לוודא שמופיע loading state וכפתורים מושבתים
- בדיקה: אחרי פעולה מוצלחת → לוודא שמופיעה הודעת הצלחה (toast)
- בדיקה: לסמלץ שגיאת שמירה (ניתוק רשת) → לוודא שמופיעה הודעת שגיאה והמצב לא השתנה

### UX Edge Cases
- בדיקה: לנסות למחוק את **הקטגוריה היחידה** → לוודא שמופיעה הודעה "אין קטגוריות נוספות..."
- בדיקה: ליצור קטגוריה חדשה מתוך הדיאלוג → לוודא שהיא נוספת לרשימה וניתן לבחור בה
- בדיקה: ללחוץ Escape → לוודא שהדיאלוג נסגר (בלי loading)
- בדיקה: ללחוץ Escape **בזמן loading** → לוודא שהדיאלוג לא נסגר
- בדיקה: לוודא שמופיע רמז לכפתור מושבת ("בחר קטגוריה יעד...")

---

## Decisions

- **פונקציית ליבה משותפת `reassignCategory`** — מחיקה ושינוי שם חולקים לוגיקה זהה, אז מספיקה פונקציה אחת
- **חובה לבחור קטגוריה חלופית (מחיקה)** — מונע עסקאות יתומות ושומר על עקביות בין סשנים. תבנית מוכרת (Trello, Gmail, Jira)
- **דיאלוג מותאם (לא `window.confirm`)** — כדי לאפשר בחירת קטגוריה חלופית עם `CategorySelectOrAdd`, ולשמור על UI אחיד בכל האפליקציה
- **אישור מחיקה גם לקטגוריה ריקה** — `ConfirmDeleteEmptyDialog` מונע מחיקה בטעות, עם UI זהה לשאר הדיאלוגים
- **העברת כללים (לא מחיקה)** — הכללים מועברים לקטגוריה החדשה, כך שאחרי reload התוצאה זהה
- **שימוש ב-`CategorySelectOrAdd` הקיים** — לבחירת קטגוריה יעד, כדי לשמור על עקביות UI ולאפשר גם יצירת קטגוריה חדשה תוך כדי
- **העברת aliases** — כמו כללים, aliases מועברים לקטגוריה החדשה
- **עדכון description-categories.json** — גם מיפויי תיאור→קטגוריה מועברים לקטגוריה החדשה
- **מיזוג קטגוריות עם אזהרה** — כשמשנים שם לקטגוריה קיימת, מציגים אזהרה ומאפשרים למשתמש לבטל
- **דיאלוג עריכה עצמאי מתפריט ימני** — קל ומהיר יותר מפתיחת SettingsMenu לעריכת קטגוריה אחת
- **תיקון no-op onChange** — ב-CategoryManager, הפיכת `onChange` מ-no-op לפונקציה שמטפלת בשינוי שם
- **Loading state + Feedback** — שימוש ב-`useFeedbackPopup` הקיים לטוסטים, loading state בדיאלוגים למניעת לחיצות כפולות
- **Error handling עם rollback** — אם שמירה נכשלת, להציג הודעת שגיאה ולא לעדכן states (המצב נשאר כמו לפני)
- **תמיכה ב-Escape key** — סגירת דיאלוג ב-Escape (חוץ מבזמן loading) — תבנית UX סטנדרטית
- **טיפול בקטגוריה יחידה** — הודעה ברורה והפנייה ליצירת קטגוריה חדשה
- **רמז לכפתור מושבת** — tooltip שמסביר למה הכפתור מושבת ומה צריך לעשות
