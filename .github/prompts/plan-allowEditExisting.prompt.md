# Plan: Hide icon/color pickers for existing categories in EditCategoryDialog

**TL;DR** — כשמשתמש בוחר קטגוריה קיימת מהדרופדאון ב-EditCategoryDialog, ה-chip ילחץ חזרה לתצוגת input/dropdown בלבד — ללא בוחר אייקון/צבע. בוחרי האייקון והצבע יופיעו **רק** כשהמשתמש מקליד שם חדש שלא קיים ברשימה.

## Steps

1. **הוסף prop חדש `allowEditExisting`** ב-`CategorySelectOrAdd.tsx` ב-interface (סביב שורה 20):
   - `allowEditExisting?: boolean` — ברירת מחדל `true` (שומר על התנהגות קיימת בכל המקומות האחרים)
   - Destructure עם ברירת מחדל בחתימת הקומפוננטה: `allowEditExisting = true`

2. **עדכן את תנאי הצגת ה-pickers** ב-`CategorySelectOrAdd.tsx` (סביב שורה 400):
   - **⚠️ לא לשנות את ה-chip click** — ה-chip חייב להפעיל `editingMode(true)` כדי שה-input יוצג (אחרת `shouldShowChip` נשאר `true` והמשתמש תקוע)
   - במקום זה, לשנות את **תנאי ה-pickers**:
     ```diff
     - allowAdd && trimmed && (!exists || editingMode) && (editingMode || !shouldShowChip)
     + allowAdd && trimmed && (!exists || (editingMode && allowEditExisting)) && (editingMode || !shouldShowChip)
     ```
   - כך: לחיצה על chip → `editingMode=true` → input מופיע + dropdown, אבל pickers **לא** מוצגים כי `exists=true` ו-`allowEditExisting=false`

3. **תקן `onDraftChange` שלא ידווח טיוטה מיותרת** ב-`CategorySelectOrAdd.tsx` (סביב שורה 128):
   - כש-`allowEditExisting=false` ולחצו על chip קיים, `editingMode=true` לבד גורם ל-`touched=true` ודיווח draft מיותר
   - תיקון:
     ```diff
     - const touched = editingMode || isNameEdited || isIconEdited || isColorEdited;
     + const touched = (editingMode && allowEditExisting) || isNameEdited || isIconEdited || isColorEdited;
     ```

4. **עדכן `aria-label` של ה-chip** ב-`CategorySelectOrAdd.tsx` (סביב שורה 387):
   - כש-`allowEditExisting=false`: שנה מ-`"לחץ לעריכה"` ל-`"לחץ לשינוי"`
     ```tsx
     aria-label={`קטגוריה: ${label}. ${allowEditExisting ? 'לחץ לעריכה' : 'לחץ לשינוי'}`}
     ```

5. **העבר `allowEditExisting={false}`** בשימוש ב-`EditCategoryDialog.tsx`:
   - הוסף את ה-prop לקריאה הקיימת של `<CategorySelectOrAdd>`

6. **עדכן SKILL.md** ב-`.github/skills/categoryselectoradd/SKILL.md`:
   - הוסף את `allowEditExisting` לטבלת ה-props

7. **אין צורך לשנות קובץ CSS** — שום סגנון חדש לא נדרש, רק הסתרת/הצגת אלמנטים קיימים לפי הלוגיקה.

## Verification

- פתח את EditCategoryDialog, בחר קטגוריה קיימת מהדרופדאון → verify: chip מוצג, לחיצה עליו חוזרת ל-input **בלי** אייקונים/צבעים/כפתור עדכן
- הקלד שם קטגוריה חדשה שלא קיימת → verify: בוחר אייקון + צבע + כפתור "הוסף" מופיעים
- ודא שבשאר המקומות שמשתמשים ב-`CategorySelectOrAdd` (ללא ה-prop החדש) — ההתנהגות לא השתנתה (ברירת מחדל `true`)
- ודא שה-`aria-label` של ה-chip משתנה לפי ה-prop

---

## Execution Status (2026-02-26)

| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| 1 | הוסף prop `allowEditExisting` ל-interface | ✅ בוצע | הוסף ל-`CategorySelectOrAddProps` עם `allowEditExisting?: boolean` |
| 2 | עדכן תנאי הצגת pickers | ✅ בוצע | שונה ל-`(!exists \|\| (editingMode && allowEditExisting))` |
| 3 | תקן `onDraftChange` touched | ✅ בוצע | שונה ל-`(editingMode && allowEditExisting) \|\| ...` + הוסף `allowEditExisting` ל-deps |
| 4 | עדכן chip aria-label | ✅ בוצע | `'לחץ לעריכה'` / `'לחץ לשינוי'` לפי ה-prop |
| 5 | העבר `allowEditExisting={false}` ב-EditCategoryDialog | ✅ בוצע | נוסף ל-`<CategorySelectOrAdd>` בקומפוננטה |
| 6 | עדכן SKILL.md | ✅ כבר קיים | ה-prop כבר תועד ב-SKILL.md |
| 7 | Build | ✅ עבר | `vite build` הצליח ללא שגיאות |

**סיכום**: כל הצעדים בוצעו בהצלחה, ה-build עובר. נדרש בדיקה ידנית ב-UI.

## Decisions

- **prop חדש vs שינוי גלובלי**: בחרנו ב-prop כדי לא לשבור שימושים אחרים בקומפוננטה (6 מקומות שונים לפי ה-SKILL)
- **שם ה-prop**: `allowEditExisting` (ברור וקונסיסטנטי עם `allowAdd` הקיים)
- **שינוי בתנאי pickers (לא ב-chip click)**: `shouldShowChip` תלוי ב-`!editingMode`, לכן ה-chip click חייב להפעיל `editingMode` כדי שה-input יוצג. השינוי הוא רק בתנאי הצגת ה-icon/color/כפתור
- **תיקון `onDraftChange`**: `editingMode` לבד לא צריך לגרום לדיווח טיוטה כש-`allowEditExisting=false`, כי המשתמש רק מחליף קטגוריה ולא עורך אייקון/צבע
