# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
## בחירת מקורות (כרטיסי אשראי / חשבון בנק)

נוסף תפריט חדש בראש המסך (`MainView`) בשם "מקורות" המאפשר לבחור איזה כרטיסי אשראי וחשבון בנק יוצגו בניתוח.

### שימוש
1. לחצו על הכפתור "מקורות" בסרגל העליון.
2. סמנו/בטלו סימון לכל כרטיס אשראי (מזוהה לפי 4 ספרות אחרונות) ולחשבון העו"ש.
3. לחיצה על "בחר כל" תבחר את כל הכרטיסים הקיימים. לחיצה על "נקה" תבטל את הצגת כל הכרטיסים (יישארו רק עסקאות בנק אם מסומן) או לא יוצגו כלל כרטיסים אם גם הבנק מבוטל.
4. סגירה באמצעות כפתור "סגור" או לחיצה חוזרת על כפתור "מקורות".

### הערות
* שמות ידידותיים לכרטיסים (למשל "זוז אישי", "מאסטרקרד עסקי") מוגדרים במפה `cardFriendlyNames` בתוך `MainView.tsx` וניתן להרחיבם.
* ברירת המחדל – כל הכרטיסים + חשבון בנק מוצגים.
* הסינון מתבצע בצד הלקוח בלבד על רשימת העסקאות המסוננות שכבר הגיעו ל־`MainView`.

### עריכת שמות כרטיסים ושמירה לקובץ
בתוך חלון "מקורות" ניתן לערוך את שם כל כרטיס בממשק היברידי:
- **מצב קריאה**: מוצג הכינוי (או "שם כרטיס" כברירת מחדל) כטקסט עם אייקון עיפרון.
- **מצב עריכה**: לחיצה על הטקסט או על העיפרון הופכת אותו לשדה אינפוט עם פוקוס אוטומטי.
- **שמירה אוטומטית**: יציאה מהשדה (blur) או Enter שומר; Esc מבטל. אינדיקציית "💾" מוצגת במהלך השמירה ואנימציית flash ירוקה לאחר הצלחה.

אם נבחרה תיקיה (באמצעות File System Access), הכינויים נשמרים בקובץ JSON מקומי בתוך התיקיה: `cards-aliases.json` בפורמט פשוט:

```json
{
  "1234": "זוז אישי",
  "5678": "מאסטרקרד עסקי"
}
```

אם לא נבחרה תיקיה – השמות נשמרים רק בזיכרון (state) עד לרענון.

פורמט הקובץ:
```json
{
  "cards": {
    "1234": "זוז אישי",
    "5678": "מאסטרקרד עסקי"
  }
}
```

API:
* `GET /api/cards-meta` מחזיר `{ cards: Record<string,string> }`.
* `POST /api/cards-meta` עם גוף `{ cards: {"1234": "שם"} }` מעדכן ושומר.

שדות / דפוסים חדשים ב-UI:
* תצוגה היברידית: טקסט ניתן ללחיצה שהופך לאינפוט.
* אייקון עיפרון (✏️) להפעלת מצב עריכה.
* שמירה אוטומטית per-card (ללא כפתור "שמור").
* אנימציות: spinner 💾 בשמירה, flash ירוק אחרי הצלחה.
* ניווט: Enter שומר, Esc מבטל.
* התאמה לתיקיה: כתיבה לקובץ `cards-aliases.json` אם יש dirHandle.


      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
})
```
