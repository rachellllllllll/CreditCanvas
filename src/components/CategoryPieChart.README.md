# CategoryPieChart - קומפוננטת גרף עוגה משופרת

## סקירה כללית

קומפוננטה מתקדמת להצגת נתוני קטגוריות בגרף עוגה אינטראקטיבי עם תכונות מתקדמות.

## שיפורים שנוספו

### 🎨 עיצוב משופר
- עיצוב מודרני עם צללים וגרדיאנטים
- אנימציות חלקות ומעברי hover
- עיצוב רספונסיבי למכשירי מובייל
- לג'נד מותאם אישית עם אייקונים

### 🚀 תכונות חדשות

#### 1. תמיכה באייקונים וצבעים מותאמים אישית
```tsx
<CategoryPieChart 
  categories={categories}
  categoriesList={categoriesList} // רשימת קטגוריות עם צבעים ואייקונים
/>
```

#### 2. אינטראקטיביות
```tsx
<CategoryPieChart 
  categories={categories}
  onCategoryClick={(categoryName) => {
    console.log('נבחרה קטגוריה:', categoryName);
  }}
/>
```

#### 3. ייצוא גרף
```tsx
<CategoryPieChart 
  categories={categories}
  showExportButton={true} // כפתור ייצוא ל-PNG
/>
```

#### 4. קיבוץ קטגוריות קטנות
```tsx
<CategoryPieChart 
  categories={categories}
  groupSmallCategories={true}
  minPercentageToShow={2} // הסתר קטגוריות מתחת ל-2%
/>
```

#### 5. סטטיסטיקות מפורטות
```tsx
<CategoryPieChart 
  categories={categories}
  showDetailedStats={true} // הצג ניתוח סטטיסטי
/>
```

### ♿ נגישות
- תמיכה במקלדת (Tab, Enter, Space)
- ARIA labels מלאים
- Tooltips אינפורמטיביים
- ניגודיות צבעים משופרת

### 📱 רספונסיבי
- התאמה למסכים קטנים
- לג'נד גמיש
- אייקונים מתכווננים

## API Reference

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `categories` | `Record<string, number>` | **Required** | נתוני הקטגוריות |
| `categoriesList` | `CategoryDef[]` | `undefined` | הגדרות קטגוריות (צבעים, אייקונים) |
| `onCategoryClick` | `(categoryName: string) => void` | `undefined` | פונקציה שמופעלת בלחיצה על קטגוריה |
| `showLegend` | `boolean` | `true` | הצג לג'נד |
| `maxWidth` | `number` | `400` | רוחב מקסימלי |
| `showExportButton` | `boolean` | `false` | הצג כפתור ייצוא |
| `title` | `string` | `'גרף חלוקה לפי קטגוריות'` | כותרת הגרף |
| `minPercentageToShow` | `number` | `1` | אחוז מינימלי להצגה |
| `groupSmallCategories` | `boolean` | `true` | קבץ קטגוריות קטנות |
| `showDetailedStats` | `boolean` | `false` | הצג סטטיסטיקות מפורטות |

### CategoryDef Interface

```typescript
interface CategoryDef {
  name: string;    // שם הקטגוריה
  color: string;   // צבע (hex)
  icon: string;    // אייקון (emoji או unicode)
}
```

## דוגמאות שימוש

### שימוש בסיסי
```tsx
const categories = {
  'אוכל': 5000,
  'תחבורה': 3000,
  'בילויים': 2000
};

<CategoryPieChart categories={categories} />
```

### שימוש מתקדם
```tsx
const categories = {
  'אוכל': 5000,
  'תחבורה': 3000,
  'בילויים': 2000,
  'קניות': 500,
  'בריאות': 300
};

const categoriesList = [
  { name: 'אוכל', color: '#FF6384', icon: '🍕' },
  { name: 'תחבורה', color: '#36A2EB', icon: '🚗' },
  { name: 'בילויים', color: '#FFCE56', icon: '🎬' },
  // ...
];

<CategoryPieChart 
  categories={categories}
  categoriesList={categoriesList}
  onCategoryClick={(cat) => console.log('נבחר:', cat)}
  showExportButton={true}
  showDetailedStats={true}
  groupSmallCategories={true}
  minPercentageToShow={3}
  title="הוצאות חודשיות"
  maxWidth={500}
/>
```

## קבצי CSS

- `CategoryPieChart.css` - עיצוב ראשי
- עיצוב מבוסס CSS Grid ו-Flexbox
- משתנים CSS לקלות התאמה
- אנימציות CSS3

## תמיכה בדפדפנים

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## ביצועים

- מערכת memoization מתקדמת
- עדכונים אופטימליים בלבד
- טעינה lazy של רכיבים כבדים
- זיכרון מנוהל יעיל

## שינויים עתידיים

- [ ] תמיכה בגרפים מרובים
- [ ] אנימציות כניסה ויציאה
- [ ] עריכה ישירה של קטגוריות
- [ ] ייצוא לפורמטים נוספים (SVG, PDF)
- [ ] תמיכה בתבניות צבעים מוגדרות מראש
