import React, { useState } from 'react';
import CategorySelectOrAdd from './CategorySelectOrAdd';
import type { CategoryDef } from './CategoryManager';
import type { CreditDetail, CategoryRule } from '../types';
import './NewCategoriesTablePrompt.css';

interface NewCategoriesTablePromptProps {
  names: string[];
  categoriesList: CategoryDef[];
  onConfirm: (mapping: Record<string, CategoryDef>) => void;
  onCancel: () => void;
  // הוסף פרופ חדש: כל העסקאות
  allDetails?: CreditDetail[];
  // כללי קטגוריות - לסינון קונפליקטים מכוונים
  categoryRules?: CategoryRule[];
  // callback לקונפליקטים שנפתרו (בית עסק -> קטגוריה שנבחרה)
  onConflictsResolved?: (resolved: Record<string, string>) => void;
}

// קונפליקט של בית עסק בקטגוריות שונות
interface MerchantConflict {
  merchantName: string;
  categories: string[];
  transactionCounts: Record<string, number>;
  totalTransactions: number;
}

// מידע על איחוד שבוצע אוטומטית
interface AutoMergeInfo {
  type: 'identical' | 'similar_name';
  sources: string[];      // קטגוריות מקור
  target: string;         // קטגוריה יעד
  targetDef: CategoryDef; // הגדרת הקטגוריה
}

// הפוך את מיפוי הקבוצות לקבוע גלובלי לשימוש חוזר
const CATEGORY_MAPPINGS: Record<string, { icon: string; color: string; recommendedIcons: string[] }> = {
  'אופנה': { icon: '👗', color: '#00a3ad', recommendedIcons: ['👗', '👔', '👠', '👜', '🧣', '👒'] },
  // 'בידור': { icon: '🎭', color: '#ff7121', recommendedIcons: ['🎭', '🎬', '🎪', '🎨', '🎤', '🎸'] },
  'ביטוח': { icon: '🛡️', color: '#2550ff', recommendedIcons: ['🛡️', '🔒', '📋', '✅', '🏛️', '⚖️', '💼'] },
  'חשמל': { icon: '💡', color: '#ffb300', recommendedIcons: ['💡', '🔌', '⚡', '🌡️', '🔥', '💧'] },
  'כספים': { icon: '💰', color: '#aa82ff', recommendedIcons: ['💰', '💵', '💴', '💶', '🏦', '💳'] },
  'מזון': { icon: '🛒', color: '#ff3f9b', recommendedIcons: ['🛒', '🛍️', '🍎', '🥦', '🍞', '🧴'] },
  'מסעדות': { icon: '🍴', color: '#13e2bf', recommendedIcons: ['🍴', '🍽️', '🍕', '🍔', '🍜', '☕'] },
  // 'ספורט': { icon: '🏅', color: '#ff7121', recommendedIcons: ['🏅', '⚽', '🏀', '🎾', '🏐', '⛳'] },
  'ספרים': { icon: '📚', color: '#8bc34a', recommendedIcons: ['📚', '📖', '📝', '📓', '📒', '📕'] },
  'בית': { icon: '🛋️', color: '#c20017', recommendedIcons: ['🛋️', '🖌️', '🎨', '🏠', '📐', '🖼️'] },
  'עירייה': { icon: '🏛️', color: '#ff6f61', recommendedIcons: ['🏛️', '🏢', '🏙️', '🌆', '📜', '🗳️'] },
  'פנאי': { icon: '🎉', color: '#ff7121', recommendedIcons: ['🎉', '🎊', '🎁', '🎈', '🎪', '🎭'] },
  'קוסמטיקה': { icon: '💄', color: '#ff8dab', recommendedIcons: ['💄', '💅', '🧴', '🪮', '🧼', '✨'] },
  'רפואה': { icon: '💊', color: '#879aff', recommendedIcons: ['💊', '🏥', '⚕️', '🩺', '💉', '🧬'] },
  'שונות': { icon: '🔖', color: '#ecd400', recommendedIcons: ['🔖', '🏷️', '📌', '📍', '🔔', '⚙️'] },
  'תחבורה': { icon: '🚗', color: '#009950', recommendedIcons: ['🚗', '🚙', '🚕', '🛣️', '⛽', '🅿️'] },
  'תקשורת': { icon: '📱', color: '#b6c700', recommendedIcons: ['📱', '📞', '📧', '💬', '📡', '📶'] },
  'תיירות': { icon: '✈️', color: '#4a90d9', recommendedIcons: ['✈️', '🛳️', '🏨', '🧳', '🌍', '📸'] },
  'תרומות': { icon: '💰', color: '#e57373', recommendedIcons: ['💰', '💵', '🎗️', '🤝', '🌍', '💖'] },
  'חינוך': { icon: '🎓', color: '#7b68ee', recommendedIcons: ['🎓', '📚', '🏫', '📝', '📖', '🖊️'] },
  'משרד': { icon: '📋', color: '#607d8b', recommendedIcons: ['📋', '🖊️', '📐', '📂', '🗂️', '📁'] },
  'מזל': { icon: '🎰', color: '#d4af37', recommendedIcons: ['🎰', '🎲', '🃏', '♠️', '♥️', '🎯'] },
  'מזומן': { icon: '💵', color: '#4caf50', recommendedIcons: ['💵', '💰', '💳', '🏦', '🪙', '💸'] },
};

// const getDefaultIconAndColor = (categoryName: string): { icon: string; color: string; recommendedIcons?: string[] } | undefined => {
//   const lowerName = categoryName.toLowerCase();
//   for (const [key, val] of Object.entries(CATEGORY_MAPPINGS)) {
//     if (lowerName.includes(key)) {
//       const randomIndex = Math.floor(Math.random() * val.recommendedIcons.length);
//       const selectedIcon = val.recommendedIcons[randomIndex];
//       const remaining = val.recommendedIcons.filter((_, idx) => idx !== randomIndex);
//       return { icon: selectedIcon, color: val.color, recommendedIcons: remaining };
//     }
//   }
//   return undefined;
// };

// צבע טקסט קריא מעל צבע רקע נתון
const getReadableTextColor = (hex: string): string => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return '#1f2937';
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 160 ? '#1f2937' : '#ffffff';
};

// החזר את מפתח הקבוצה (הארוך ביותר שמתאים)
const getGroupKey = (categoryName: string): string | null => {
  const lowerName = categoryName.toLowerCase();
  let chosen: string | null = null;
  for (const key of Object.keys(CATEGORY_MAPPINGS)) {
    if (lowerName.includes(key)) {
      if (!chosen || key.length > chosen.length) chosen = key;
    }
  }
  return chosen;
};

// חילוץ שם בית עסק מתיאור העסקה (מילים ראשונות לפני מספרים/תאריכים)
const extractMerchantName = (description: string): string => {
  if (!description) return '';
  // הסר מספרים, תאריכים, סימנים מיוחדים מהסוף
  const cleaned = description
    .replace(/\d{1,2}[/\-.]\d{1,2}([/\-.]\d{2,4})?/g, '') // תאריכים
    .replace(/\d{4,}/g, '') // מספרים ארוכים (כרטיס, אסמכתא)
    .replace(/[*#\-_]+/g, ' ')
    .trim();
  // קח רק 2-3 מילים ראשונות (שם בית העסק)
  const words = cleaned.split(/\s+/).filter(w => w.length > 1);
  return words.slice(0, 3).join(' ').toLowerCase();
};

// חישוב אחוז חפיפה בין שתי קבוצות של בתי עסק
const calculateMerchantOverlap = (
  merchants1: Set<string>,
  merchants2: Set<string>
): { overlap: number; shared: string[] } => {
  if (merchants1.size === 0 || merchants2.size === 0) {
    return { overlap: 0, shared: [] };
  }
  const shared: string[] = [];
  for (const m of merchants1) {
    if (merchants2.has(m)) {
      shared.push(m);
    }
  }
  // Jaccard similarity: intersection / union
  const union = new Set([...merchants1, ...merchants2]);
  const overlap = union.size > 0 ? shared.length / union.size : 0;
  return { overlap, shared };
};

// איחוד קטגוריות זהות (case-insensitive) מחברות אשראי שונות
// וגם קטגוריות דומות עם מילת מפתח משותפת (למשל: מזון וצריכה, מזון ומשקאות)
const findIdenticalCategories = (
  names: string[],
  existingCategories: CategoryDef[],
  transactionCounts: Record<string, number> = {} // ספירת עסקאות לכל קטגוריה
): { filteredNames: string[]; autoMerges: AutoMergeInfo[]; mergeMapping: Record<string, string> } => {
  const autoMerges: AutoMergeInfo[] = [];
  const mergeMapping: Record<string, string> = {}; // מקור -> יעד

  // בנה מפתח לקטגוריות קיימות (lowercase)
  const existingByLower = new Map<string, CategoryDef>();
  for (const cat of existingCategories) {
    existingByLower.set(cat.name.toLowerCase().trim(), cat);
  }

  // קבץ קטגוריות חדשות לפי שם (lowercase)
  const newByLower = new Map<string, string[]>();
  for (const name of names) {
    const key = name.toLowerCase().trim();
    if (!newByLower.has(key)) newByLower.set(key, []);
    newByLower.get(key)!.push(name);
  }

  const toRemove = new Set<string>();
  const alreadyMerged = new Set<string>(); // מניעת איחוד כפול

  // שלב 1: עבור כל קבוצת שמות זהים
  for (const [lowerKey, variants] of newByLower.entries()) {
    // בדוק אם קיים ב-JSON
    const existingCat = existingByLower.get(lowerKey);

    if (existingCat) {
      // סנן רק וריאנטים ששונים מהיעד (אין טעם לאחד קטגוריה עם עצמה)
      const sourcesToMerge = variants.filter(v => v !== existingCat.name);
      if (sourcesToMerge.length > 0) {
        autoMerges.push({
          type: 'identical',
          sources: sourcesToMerge,
          target: existingCat.name,
          targetDef: existingCat
        });
        for (const v of sourcesToMerge) {
          mergeMapping[v] = existingCat.name;
          toRemove.add(v);
          alreadyMerged.add(v);
        }
      }
      // סמן את כל הווריאנטים כ"כבר טופלו" (כולל את היעד עצמו)
      // וגם הסר אותם מהרשימה - אין צורך להגדיר קטגוריה שכבר קיימת
      for (const v of variants) {
        alreadyMerged.add(v);
        toRemove.add(v); // הוסף גם ל-toRemove כדי שלא יוצג בטבלה
      }
    } else if (variants.length > 1) {
      // כמה קטגוריות חדשות עם אותו שם (case-insensitive) - אחד אותן
      // בחר את הקטגוריה עם הכי הרבה עסקאות (או השם הקצר ביותר אם שווים)
      const target = variants.reduce((a, b) => {
        const countA = transactionCounts[a] || 0;
        const countB = transactionCounts[b] || 0;
        if (countA !== countB) return countA > countB ? a : b;
        return a.length <= b.length ? a : b;
      });
      const sources = variants.filter(v => v !== target);
      if (sources.length > 0) {
        autoMerges.push({
          type: 'identical',
          sources: sources,
          target: target,
          targetDef: { name: target, icon: '', color: '' } // ימולא אחר כך
        });
        for (const s of sources) {
          mergeMapping[s] = target;
          toRemove.add(s);
          alreadyMerged.add(s);
        }
        alreadyMerged.add(target);
      }
    }
  }

  // שלב 2: איחוד קטגוריות דומות לפי מילת מפתח (מזון, תחבורה וכו')
  // קבץ את הקטגוריות שנותרו לפי groupKey
  const remainingNames = names.filter(n => !alreadyMerged.has(n));
  const byGroupKey = new Map<string, string[]>();

  for (const name of remainingNames) {
    const groupKey = getGroupKey(name);
    if (!groupKey) continue;
    if (!byGroupKey.has(groupKey)) byGroupKey.set(groupKey, []);
    byGroupKey.get(groupKey)!.push(name);
  }

  // לכל קבוצה עם 2+ חברים או התאמה לקטגוריה קיימת
  for (const [groupKey, members] of byGroupKey.entries()) {
    // חפש קטגוריה קיימת ב-JSON שמכילה את המפתח
    let existingTarget: CategoryDef | null = null;
    for (const cat of existingCategories) {
      if (cat.name.toLowerCase().includes(groupKey.toLowerCase())) {
        existingTarget = cat;
        break;
      }
    }

    if (existingTarget) {
      // אחד כל החברים לקטגוריה הקיימת
      const sources = members.filter(m => m !== existingTarget!.name);
      if (sources.length > 0) {
        autoMerges.push({
          type: 'similar_name',
          sources: sources,
          target: existingTarget.name,
          targetDef: existingTarget
        });
        for (const s of sources) {
          mergeMapping[s] = existingTarget.name;
          toRemove.add(s);
        }
      }
    } else if (members.length >= 2) {
      // אחד בין הקטגוריות החדשות - בחר את זו עם הכי הרבה עסקאות
      const target = members.reduce((a, b) => {
        const countA = transactionCounts[a] || 0;
        const countB = transactionCounts[b] || 0;
        if (countA !== countB) return countA > countB ? a : b;
        return a.length <= b.length ? a : b;
      });
      const sources = members.filter(m => m !== target);
      if (sources.length > 0) {
        autoMerges.push({
          type: 'similar_name',
          sources: sources,
          target: target,
          targetDef: { name: target, icon: '', color: '' } // ימולא אחר כך
        });
        for (const s of sources) {
          mergeMapping[s] = target;
          toRemove.add(s);
        }
      }
    }
  }

  const filteredNames = names.filter(n => !toRemove.has(n));
  return { filteredNames, autoMerges, mergeMapping };
};

// בדוק אם עסקה מכוסה על ידי כלל קטגוריה (המשתמש החליט על הסיווג)
const isTransactionCoveredByRule = (tx: CreditDetail, rules: CategoryRule[]): boolean => {
  for (const rule of rules) {
    if (!rule.active) continue;
    const c = rule.conditions;

    // בדוק התאמה לתיאור
    if (c.descriptionEquals && tx.description === c.descriptionEquals) return true;
    if (c.descriptionRegex) {
      try {
        const regex = new RegExp(c.descriptionRegex, 'i');
        if (regex.test(tx.description)) return true;
      } catch { /* regex invalid */ }
    }

    // בדוק התאמה לסכום (אם יש)
    if (c.minAmount !== undefined || c.maxAmount !== undefined) {
      const amount = Math.abs(tx.amount);
      const matchesAmount =
        (c.minAmount === undefined || amount >= c.minAmount) &&
        (c.maxAmount === undefined || amount <= c.maxAmount);
      if (matchesAmount && (c.descriptionEquals || c.descriptionRegex)) {
        return true;
      }
    }
  }
  return false;
};

const NewCategoriesTablePrompt: React.FC<NewCategoriesTablePromptProps> = ({ names, categoriesList, onConfirm, onCancel, allDetails = [], categoryRules = [], onConflictsResolved }) => {
  // חשב ספירת עסקאות לכל קטגוריה (נדרש לפני findIdenticalCategories)
  const initialTransactionCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    const nameSet = new Set(names);
    for (const d of allDetails) {
      const cat = d.category ?? '';
      if (cat && nameSet.has(cat)) {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }
    return counts;
  }, [names, allDetails]);

  // שלב 1: חשב איחודים אוטומטיים של קטגוריות זהות
  const { filteredNames, autoMerges } = React.useMemo(() =>
    findIdenticalCategories(names, categoriesList, initialTransactionCounts),
    [names, categoriesList, initialTransactionCounts]
  );

  // State לשמירת איחודים שבוצעו (עם אפשרות ביטול)
  const [autoMergedGroups] = useState<AutoMergeInfo[]>(autoMerges);
  const [cancelledMerges, setCancelledMerges] = useState<Set<string>>(new Set());

  // מצב תצוגה: 'summary' | 'table' | 'conflicts'
  const [viewMode, setViewMode] = useState<'summary' | 'table' | 'conflicts'>('summary');

  // State לפתרון קונפליקטים (מוגדר כאן כדי שיהיה זמין ל-useEffect)
  const [resolvedConflicts, setResolvedConflicts] = useState<Record<string, string>>({});

  // שמור את הקטגוריות המקוריות משמורה בנפרד - בשביל הבדיקה אם קטגוריה כבר קיימת בקובץ JSON
  const originalCategoriesRef = React.useRef<Set<string>>(new Set(categoriesList.map(c => c.name)));

  // חשב את רשימת השמות בפועל (אחרי ביטולי איחודים והסרת קטגוריות שנפתרו בקונפליקטים)
  const activeNames = React.useMemo(() => {
    const result = [...filteredNames];
    // הוסף בחזרה קטגוריות שהמשתמש ביטל את האיחוד שלהן
    for (const merge of autoMergedGroups) {
      if (cancelledMerges.has(merge.target)) {
        result.push(...merge.sources);
      }
    }

    // הסר קטגוריות חדשות שהמשתמש בחר נגדן בקונפליקטים
    // למשל: "ביגוד" מעולם לא נבחרה כיעד, וסוחרים שלה הועברו ל"אופנה" → מיותרת
    if (Object.keys(resolvedConflicts).length > 0) {
      // אילו קטגוריות נבחרו כיעד בקונפליקטים?
      const chosenTargets = new Set(Object.values(resolvedConflicts));

      return result.filter(name => {
        // קטגוריות שכבר קיימות בקובץ — לא מסוננות
        if (originalCategoriesRef.current.has(name)) return true;

        // אם הקטגוריה נבחרה כיעד בלפחות קונפליקט אחד — המשתמש רוצה אותה
        if (chosenTargets.has(name)) return true;

        // בדוק אם יש סוחרים של הקטגוריה שהועברו לקטגוריות אחרות
        const txs = allDetails.filter(d => d.category === name);
        if (txs.length === 0) return true;

        const hasResolvedAwayMerchants = txs.some(tx => {
          const merchant = extractMerchantName(tx.description);
          const resolvedTo = resolvedConflicts[merchant];
          return resolvedTo && resolvedTo !== name;
        });

        // אם המשתמש אף פעם לא בחר קטגוריה זו, וסוחרים שלה הועברו → מיותרת
        if (hasResolvedAwayMerchants) return false;

        return true;
      });
    }

    return result;
  }, [filteredNames, autoMergedGroups, cancelledMerges, resolvedConflicts, allDetails]);

  const [selectedCats, setSelectedCats] = useState<Record<string, CategoryDef | null>>(() => Object.fromEntries(names.map(n => [n, null])));
  const [localCategories, setLocalCategories] = useState<CategoryDef[]>([...categoriesList]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, CategoryDef | null>>(() => Object.fromEntries(names.map(n => [n, null])));

  // Clean up expanded state when activeNames changes to prevent stale DOM entries
  React.useEffect(() => {
    console.debug('[NewCategoriesTablePrompt] activeNames changed:', activeNames);
    setExpanded(prev => {
      const activeSet = new Set(activeNames);
      const cleaned: Record<string, boolean> = {};
      for (const [name, isExpanded] of Object.entries(prev)) {
        if (activeSet.has(name)) {
          cleaned[name] = isExpanded;
        }
      }
      if (Object.keys(cleaned).length !== Object.keys(prev).length) {
        console.debug('[NewCategoriesTablePrompt] Cleaned expanded state:', prev, '→', cleaned);
        return cleaned;
      }
      return prev;
    });
  }, [activeNames]);

  // חשב ברירות מחדל לכל קטגוריה חדשה (פעם אחת בלבד)
  const defaultIconsAndColors = React.useMemo(() => {
    const result: Record<string, { icon: string; color: string; recommendedIcons?: string[] }> = {};
    names.forEach(name => {
      const lowerName = name.toLowerCase();
      let found = false;
      for (const [key, val] of Object.entries(CATEGORY_MAPPINGS)) {
        if (lowerName.includes(key)) {
          // בחר איקון קבוע (הראשון) במקום רנדומלי
          const selectedIcon = val.recommendedIcons[0];
          const remaining = val.recommendedIcons.slice(1);
          result[name] = { icon: selectedIcon, color: val.color, recommendedIcons: remaining };
          found = true;
          break;
        }
      }
      if (!found) {
        result[name] = { icon: '', color: '', recommendedIcons: [] };
      }
    });
    return result;
  }, [names]);

  // הוסף אוטומטית קטגוריות עם ברירת מחדל ל-localCategories וסמן אותן כנבחרות
  const defaultsAppliedRef = React.useRef(false);

  React.useEffect(() => {
    if (defaultsAppliedRef.current) return; // הרץ רק פעם אחת
    defaultsAppliedRef.current = true;

    const categoriesToAdd: CategoryDef[] = [];
    const selectionsToUpdate: Record<string, CategoryDef> = {};

    names.forEach(name => {
      const defaults = defaultIconsAndColors[name];
      if (defaults?.icon && defaults?.color) {
        const newCat: CategoryDef = { name, icon: defaults.icon, color: defaults.color };

        // הוסף לרשימת הקטגוריות החדשות
        categoriesToAdd.push(newCat);

        // סמן כנבחרת
        selectionsToUpdate[name] = newCat;
      }
    });

    if (categoriesToAdd.length > 0) {
      setLocalCategories(prev => {
        // הוסף רק קטגוריות שעדיין לא קיימות
        const newCats = categoriesToAdd.filter(cat => !prev.some(c => c.name === cat.name));
        return [...prev, ...newCats];
      });
    }

    if (Object.keys(selectionsToUpdate).length > 0) {
      setSelectedCats(prev => {
        // עדכן רק אם עדיין לא נבחרה קטגוריה
        const updates: Record<string, CategoryDef> = {};
        for (const [name, cat] of Object.entries(selectionsToUpdate)) {
          if (!prev[name]) updates[name] = cat;
        }
        return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
      });
    }
  }, [names, defaultIconsAndColors]); // useRef לא גורם לרנדר מחדש

  const handleCategoryChange = (name: string, catName: string) => {
    const found = localCategories.find(c => c.name === catName);
    if (found) {
      setSelectedCats(prev => ({ ...prev, [name]: found }));
    }
  };
  const handleAddCategory = (name: string, cat: CategoryDef) => {
    setLocalCategories(prev => {
      const idx = prev.findIndex(c => c.name === cat.name);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = cat;
        return copy;
      }
      return [...prev, cat];
    });
    setSelectedCats(prev => ({ ...prev, [name]: cat }));
  };

  const handleConfirm = async () => {
    console.debug('[NewCategoriesTablePrompt] handleConfirm called with activeNames:', activeNames);
    const mapping: Record<string, CategoryDef> = {};
    const activeSet = new Set(activeNames);

    names.forEach(n => {
      // דלג על קטגוריות שהוסרו (נפתרו בקונפליקטים לקטגוריה אחרת)
      if (!activeSet.has(n) && !originalCategoriesRef.current.has(n)) return;

      const chosen = selectedCats[n] || drafts[n];
      if (chosen) {
        mapping[n] = chosen;
      } else {
        // בדוק אם הקטגוריה אוחדה אוטומטית (ולא בוטלה) — השתמש ביעד האיחוד במקום identity
        const activeMerge = autoMergedGroups.find(m => !cancelledMerges.has(m.target) && m.sources.includes(n));
        if (activeMerge) {
          const targetDef = localCategories.find(c => c.name === activeMerge.target)
            || categoriesList.find(c => c.name === activeMerge.target)
            || activeMerge.targetDef;
          mapping[n] = targetDef;
        } else {
          const defaults = defaultIconsAndColors[n];
          mapping[n] = { name: n, icon: defaults?.icon, color: defaults?.color };
        }
      }
    });

    // עבור קטגוריות שהוסרו כי נפתרו בקונפליקטים - מפה אותן לקטגוריה הדומיננטית (כ-alias)
    if (Object.keys(resolvedConflicts).length > 0) {
      for (const name of names) {
        if (activeSet.has(name)) continue; // עדיין פעילה בטבלה — לא לגעת
        if (originalCategoriesRef.current.has(name)) continue; // כבר קיימת בקובץ
        if (mapping[name]) continue; // כבר טופלה

        // חפש את הקטגוריה שקיבלה הכי הרבה סוחרים מהקטגוריה הזו
        const txs = allDetails.filter(d => d.category === name);
        const targetCounts: Record<string, number> = {};
        for (const tx of txs) {
          const merchant = extractMerchantName(tx.description);
          const target = resolvedConflicts[merchant];
          if (target && target !== name) {
            targetCounts[target] = (targetCounts[target] || 0) + 1;
          }
        }
        const entries = Object.entries(targetCounts);
        if (entries.length > 0) {
          const dominantTarget = entries.sort((a, b) => b[1] - a[1])[0][0];
          const catDef = localCategories.find(c => c.name === dominantTarget)
            || categoriesList.find(c => c.name === dominantTarget);
          if (catDef) {
            mapping[name] = catDef; // יגרום ליצירת alias: name → dominantTarget
          }
        }
      }
    }

    // שלח את הקונפליקטים שנפתרו (בית עסק -> קטגוריה שנבחרה)
    // חשוב: ממתינים לסיום השמירה לפני סגירת הדיאלוג כדי שהכללים יישמרו לדיסק
    // סנן סוחרים שה-alias כבר מטפל בהם — אין צורך בכלל סוחר כפול
    if (onConflictsResolved && Object.keys(resolvedConflicts).length > 0) {
      // בנה מפת alias: קטגוריית מקור → קטגוריית יעד
      const aliasResolution: Record<string, string> = {};
      for (const [excelName, catDef] of Object.entries(mapping)) {
        if (excelName !== catDef.name) {
          aliasResolution[excelName] = catDef.name;
        }
      }

      // סנן: שמור רק סוחרים שה-alias לא מכסה
      // לכל סוחר, בדוק את כל הקטגוריות שהוא מופיע בהן
      const filteredConflicts: Record<string, string> = {};
      for (const [merchant, target] of Object.entries(resolvedConflicts)) {
        // מצא את כל הקטגוריות של הסוחר הזה
        const merchantCategories = new Set<string>();
        for (const d of allDetails) {
          if (d.category && extractMerchantName(d.description) === merchant) {
            merchantCategories.add(d.category);
          }
        }

        // בדוק אם כל הקטגוריות של הסוחר מגיעות ליעד דרך alias או שהן כבר היעד
        let aliasCoversAll = true;
        for (const cat of merchantCategories) {
          const resolved = aliasResolution[cat] || cat; // החל alias אם קיים
          if (resolved !== target) {
            aliasCoversAll = false;
            break;
          }
        }

        if (!aliasCoversAll) {
          filteredConflicts[merchant] = target; // ה-alias לא מכסה — צריך כלל סוחר
        }
      }

      if (Object.keys(filteredConflicts).length > 0) {
        await onConflictsResolved(filteredConflicts);
      }
    }

    onConfirm(mapping);
  };

  // נטרל כפתור אישור אם יש טיוטות פתוחות או קטגוריה ללא ברירת מחדל שלא אושרה
  // בודק רק activeNames — קטגוריות שסוננו (נפתרו בקונפליקטים) לא חוסמות
  const disableConfirm = React.useMemo(() => {
    // בדוק רק טיוטות שלא נבחרה להן קטגוריה סופית
    const hasPendingDrafts = activeNames.some(n => {
      // אם יש קטגוריה נבחרת, הטיוטה לא רלוונטית
      if (selectedCats[n]) return false;
      return !!drafts[n];
    });
    const hasBlockingNoDefaults = activeNames.some(n => {
      // קטגוריות שכבר קיימות בקובץ לא צריכות דיפולט
      if (originalCategoriesRef.current.has(n)) return false;
      const d = defaultIconsAndColors[n];
      const hasDefaults = !!(d?.icon && d?.color);
      return !hasDefaults && !selectedCats[n];
    });
    return hasPendingDrafts || hasBlockingNoDefaults;
  }, [activeNames, drafts, defaultIconsAndColors, selectedCats]);

  // מונה חסימות: כמה פריטים דורשים אישור (טיוטות + ללא דיפולט)
  const blockingInfo = React.useMemo(() => {
    let draftCount = 0;
    let noDefaultCount = 0;
    activeNames.forEach(n => {
      // אם יש קטגוריה נבחרת, לא צריך לספור כחוסם
      if (selectedCats[n]) return;
      // קטגוריות שכבר קיימות בקובץ לא צריכות דיפולט
      if (originalCategoriesRef.current.has(n)) return;

      if (drafts[n]) draftCount += 1;
      const d = defaultIconsAndColors[n];
      const hasDefaults = !!(d?.icon && d?.color);
      if (!hasDefaults) noDefaultCount += 1;
    });
    return { draftCount, noDefaultCount, total: draftCount + noDefaultCount };
  }, [activeNames, drafts, defaultIconsAndColors, selectedCats]);

  // אינדקס עסקאות לפי שם קטגוריה (יעיל יותר מ-filter פר רנדר)
  const detailsByName = React.useMemo(() => {
    const map: Record<string, CreditDetail[]> = {};
    for (const n of names) map[n] = [];
    const nameSet = new Set(names);
    for (const d of allDetails || []) {
      const cat = d.category ?? '';
      if (cat && nameSet.has(cat)) {
        (map[cat] ||= []).push(d);
      }
    }
    return map;
  }, [names, allDetails]);

  // חשב כמות עסקאות לכל קטגוריה מהאינדקס
  const categoryTransactionCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    names.forEach(name => {
      counts[name] = (detailsByName[name]?.length) || 0;
    });
    return counts;
  }, [names, detailsByName]);

  // חילוץ בתי עסק ייחודיים לכל קטגוריה
  const merchantsByCategory = React.useMemo(() => {
    const result: Record<string, Set<string>> = {};
    for (const name of names) {
      const merchants = new Set<string>();
      for (const tx of detailsByName[name] || []) {
        const merchant = extractMerchantName(tx.description);
        if (merchant && merchant.length > 2) {
          merchants.add(merchant);
        }
      }
      result[name] = merchants;
    }
    return result;
  }, [names, detailsByName]);

  // חישוב הצעות איחוד מבוססות חפיפת בתי עסק (בין כל זוגות הקטגוריות)
  const merchantOverlapSuggestions = React.useMemo(() => {
    const OVERLAP_THRESHOLD = 0.25; // סף חפיפה מינימלי (25%)
    const suggestions: Record<string, { target: string; overlap: number; sharedMerchants: string[] }> = {};

    // בדוק כל זוג קטגוריות
    for (let i = 0; i < names.length; i++) {
      const cat1 = names[i];
      const merchants1 = merchantsByCategory[cat1];
      if (merchants1.size < 2) continue; // צריך לפחות 2 בתי עסק

      let bestMatch: { target: string; overlap: number; sharedMerchants: string[] } | null = null;

      // בדוק מול קטגוריות אחרות ברשימה
      for (let j = 0; j < names.length; j++) {
        if (i === j) continue;
        const cat2 = names[j];
        const merchants2 = merchantsByCategory[cat2];
        if (merchants2.size < 2) continue;

        const { overlap, shared } = calculateMerchantOverlap(merchants1, merchants2);

        if (overlap >= OVERLAP_THRESHOLD && shared.length >= 2) {
          // העדף את הקטגוריה עם יותר עסקאות כיעד
          const count1 = categoryTransactionCounts[cat1] || 0;
          const count2 = categoryTransactionCounts[cat2] || 0;

          if (count2 > count1 || (count2 === count1 && cat2.length < cat1.length)) {
            if (!bestMatch || overlap > bestMatch.overlap) {
              bestMatch = { target: cat2, overlap, sharedMerchants: shared };
            }
          }
        }
      }

      // בדוק גם מול קטגוריות קיימות (מ-JSON)
      for (const existingCat of categoriesList) {
        if (names.includes(existingCat.name)) continue; // כבר בדקנו

        // חשב בתי עסק לקטגוריה הקיימת
        const existingMerchants = new Set<string>();
        for (const tx of allDetails) {
          if (tx.category === existingCat.name) {
            const merchant = extractMerchantName(tx.description);
            if (merchant && merchant.length > 2) {
              existingMerchants.add(merchant);
            }
          }
        }

        if (existingMerchants.size < 2) continue;

        const { overlap, shared } = calculateMerchantOverlap(merchants1, existingMerchants);

        if (overlap >= OVERLAP_THRESHOLD && shared.length >= 2) {
          if (!bestMatch || overlap > bestMatch.overlap) {
            bestMatch = { target: existingCat.name, overlap, sharedMerchants: shared };
          }
        }
      }

      if (bestMatch) {
        suggestions[cat1] = bestMatch;
      }
    }

    return suggestions;
  }, [names, merchantsByCategory, categoryTransactionCounts, categoriesList, allDetails]);

  // מיפוי שם->מפתח קבוצה לפי getDefaultIconAndColor
  const nameGroupKeyMap = React.useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const n of names) m[n] = getGroupKey(n);
    return m;
  }, [names]);

  // קיבוץ שמות לאותה קבוצה
  const groupsByKey = React.useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const n of names) {
      const key = nameGroupKeyMap[n];
      if (!key) continue;
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    }
    return groups;
  }, [names, nameGroupKeyMap]);

  // הצעת יעד מיזוג לכל קבוצה: 
  // 1. קטגוריה קיימת בקובץ JSON שמכילה את המפתח (אפילו אם רק קטגוריה אחת!)
  // 2. אחרת: השם עם רוב העסקאות (כל עוד יש 2+ קטגוריות חדשות)
  const groupSuggestedTargets = React.useMemo(() => {
    const suggestions: Record<string, string> = {};
    for (const [key, members] of Object.entries(groupsByKey)) {
      // חפש קטגוריה קיימת בקובץ JSON (מקורית, לא חדשה) - זה תמיד יציע מיזוג
      const existingCandidates = Array.from(originalCategoriesRef.current)
        .filter(n => n.toLowerCase().includes(key.toLowerCase()));
      if (existingCandidates.length > 0) {
        suggestions[key] = existingCandidates[0];
        continue;
      }

      // אם אין קטגוריה משמורת, בחר מבין החברים רק אם יש 2+ קטגוריות חדשות בקבוצה
      if (members.length < 2) continue; // רק קבוצות עם 2+ חברים חדשים

      let best = '';
      let bestCount = -1;
      for (const m of members) {
        const cnt = categoryTransactionCounts[m] || 0;
        if (cnt > bestCount || (cnt === bestCount && m.length < best.length)) {
          best = m; bestCount = cnt;
        }
      }

      suggestions[key] = best;
    }
    return suggestions;
  }, [groupsByKey, categoryTransactionCounts]);

  const LOW_COUNT_THRESHOLD = 2;

  // סדר תצוגה: קיבוץ שמות דומים יחד כדי שיופיעו בסמיכות
  const orderedNames = React.useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    // הצג קודם קבוצות עם לפחות 2 פריטים, ממוין לפי סכום עסקאות יורד
    const groupKeys = Object.keys(groupsByKey)
      .filter(k => groupsByKey[k].length > 1)
      .sort((a, b) => {
        const sumA = groupsByKey[a].reduce((s, n) => s + (categoryTransactionCounts[n] || 0), 0);
        const sumB = groupsByKey[b].reduce((s, n) => s + (categoryTransactionCounts[n] || 0), 0);
        return sumB - sumA;
      });
    for (const k of groupKeys) {
      const members = [...groupsByKey[k]].sort((x, y) => (categoryTransactionCounts[y] || 0) - (categoryTransactionCounts[x] || 0));
      for (const m of members) {
        if (!seen.has(m)) { order.push(m); seen.add(m); }
      }
    }
    // ואז את כל היתר בשמירה על הסדר המקורי
    for (const n of names) if (!seen.has(n)) { order.push(n); seen.add(n); }
    console.debug('[NewCategoriesTablePrompt] orderedNames computed:', order);
    return order;
  }, [names, groupsByKey, categoryTransactionCounts]);

  // זיהוי קונפליקטים: בתי עסק שמופיעים בקטגוריות שונות
  // סינון: 
  // 1. אם כל הקטגוריות שייכות לאותה קבוצה (יתאחדו ממילא) - זה לא קונפליקט אמיתי
  // 2. אם העסקה מכוסה על ידי כלל קטגוריה - המשתמש החליט על הסיווג
  const merchantConflicts = React.useMemo(() => {
    const merchantToCategories = new Map<string, Map<string, number>>(); // merchant -> category -> count

    for (const tx of allDetails) {
      // דלג על עסקאות שיש להן כלל קטגוריה - המשתמש החליט על הסיווג
      if (isTransactionCoveredByRule(tx, categoryRules)) continue;

      const merchant = extractMerchantName(tx.description);
      const category = tx.category || '';
      if (!merchant || merchant.length <= 2 || !category) continue;

      if (!merchantToCategories.has(merchant)) {
        merchantToCategories.set(merchant, new Map());
      }
      const catMap = merchantToCategories.get(merchant)!;
      catMap.set(category, (catMap.get(category) || 0) + 1);
    }

    const conflicts: MerchantConflict[] = [];
    for (const [merchant, catMap] of merchantToCategories.entries()) {
      if (catMap.size <= 1) continue; // אין קונפליקט

      const categories = Array.from(catMap.keys());

      // בדוק אם כל הקטגוריות שייכות לאותה קבוצה (יתאחדו ממילא)
      // אבל רק אם אין קטגוריה שאוחדה אוטומטית - אחרת המשתמש צריך לראות את הקונפליקט
      const groupKeys = categories.map(c => getGroupKey(c));
      const uniqueGroups = new Set(groupKeys.filter(k => k !== null));
      if (uniqueGroups.size === 1 && groupKeys.filter(k => k !== null).length === categories.length) {
        // בדוק אם אחת הקטגוריות אוחדה אוטומטית - אם כן, הצג קונפליקט
        const hasAutoMergedCategory = categories.some(c =>
          autoMergedGroups.some(m => !cancelledMerges.has(m.target) && m.sources.includes(c))
        );
        if (!hasAutoMergedCategory) {
          continue; // דלג - הקטגוריות יתאחדו ממילא ואין עניין
        }
      }

      const transactionCounts: Record<string, number> = {};
      let total = 0;
      for (const [cat, count] of catMap.entries()) {
        transactionCounts[cat] = count;
        total += count;
      }

      // רק קונפליקטים עם לפחות 3 עסקאות בסך הכל
      if (total >= 3) {
        conflicts.push({
          merchantName: merchant,
          categories,
          transactionCounts,
          totalTransactions: total
        });
      }
    }

    // מיין לפי סה"כ עסקאות
    conflicts.sort((a, b) => b.totalTransactions - a.totalTransactions);
    return conflicts;
  }, [allDetails, categoryRules, autoMergedGroups, cancelledMerges]);

  // סטטיסטיקות לסיכום
  const summaryStats = React.useMemo(() => {
    const totalTransactions = allDetails.length;
    const recognizedCategories = names.filter(n => originalCategoriesRef.current.has(n)).length;
    const autoMergedCount = autoMergedGroups.filter(m => !cancelledMerges.has(m.target)).length;
    const conflictsCount = merchantConflicts.filter(c => !resolvedConflicts[c.merchantName]).length;
    const newCategories = activeNames.filter(n => !originalCategoriesRef.current.has(n)).length;

    return {
      totalTransactions,
      recognizedCategories,
      autoMergedCount,
      conflictsCount,
      newCategories,
      totalNewFromExcel: names.length
    };
  }, [names, allDetails, autoMergedGroups, cancelledMerges, merchantConflicts, resolvedConflicts, activeNames]);

  // פונקציה לביטול איחוד
  const handleUndoMerge = (merge: AutoMergeInfo) => {
    setCancelledMerges(prev => new Set([...prev, merge.target]));
  };

  // פונקציה לפתרון קונפליקט - בחירת קטגוריה לבית העסק
  const handleResolveConflict = (merchantName: string, targetCategory: string) => {
    console.debug('[NewCategoriesTablePrompt] Resolving conflict:', merchantName, '→', targetCategory);
    setResolvedConflicts(prev => ({ ...prev, [merchantName]: targetCategory }));
  };

  // מסך סיכום בכניסה ראשונה
  // אם אין קונפליקטים ואין קטגוריות חדשות להגדרה — אין מה להציג, סגור אוטומטית
  const hasNothingToShow = summaryStats.conflictsCount === 0 && summaryStats.newCategories === 0 && activeNames.length === 0;
  const autoConfirmedRef = React.useRef(false);
  React.useEffect(() => {
    if (hasNothingToShow && !autoConfirmedRef.current) {
      autoConfirmedRef.current = true;
      handleConfirm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNothingToShow]);

  // Create a stable mapping of names to consistent indices to prevent DOM reconciliation issues
  const stableIndices = React.useMemo(() => {
    const map = new Map<string, number>();
    names.forEach((name, index) => {
      if (!map.has(name)) map.set(name, index);
    });
    console.debug('[NewCategoriesTablePrompt] stableIndices computed:', map);
    return map;
  }, [names]);

  if (viewMode === 'summary') {
    return (
      <div className="new-cats-overlay">
        <div className="new-cats-dialog new-cats-summary">
          <div className="progress-indicator">
            <div className="progress-step-wrapper">
              <div className="progress-step active">1</div>
              <span className="progress-label">סיכום</span>
            </div>
            <div className={`progress-line ${summaryStats.conflictsCount === 0 ? 'completed' : ''}`}></div>
            <div className="progress-step-wrapper">
              <div
                className={`progress-step ${summaryStats.conflictsCount === 0 ? 'completed' : ''}`}
                onClick={() => summaryStats.conflictsCount > 0 && setViewMode('conflicts')}
                style={{ cursor: summaryStats.conflictsCount > 0 ? 'pointer' : 'default' }}
                title={summaryStats.conflictsCount > 0 ? 'עבור לפתרון קונפליקטים' : 'אין קונפליקטים'}
              >
                {summaryStats.conflictsCount === 0 ? '✓' : '2'}
              </div>
              <span className="progress-label">קונפליקטים</span>
            </div>
            <div className="progress-line"></div>
            <div className="progress-step-wrapper">
              <div
                className="progress-step"
                onClick={() => activeNames.length > 0 && setViewMode('table')}
                style={{ cursor: activeNames.length > 0 ? 'pointer' : 'default' }}
                title={activeNames.length > 0 ? 'עבור להגדרת קטגוריות' : ''}
              >
                3
              </div>
              <span className="progress-label">הגדרה</span>
            </div>
          </div>
          <h3 className="new-cats-title">
            ברוכים הבאים! 👋
          </h3>
          <p className="new-cats-subtitle">
            נמצאו <strong>{summaryStats.totalTransactions}</strong> עסקאות בקבצי האשראי
          </p>

          <div className="summary-steps">
            <div className="summary-step completed">
              <span className="step-icon">✅</span>
              <div className="step-content">
                <div className="step-title">שלב 1: זיהוי קטגוריות</div>
                <ul className="step-details">
                  <li>📦 {summaryStats.totalNewFromExcel} קטגוריות מהאקסל</li>
                  {summaryStats.autoMergedCount > 0 && (
                    <li>🔄 {summaryStats.autoMergedCount} קטגוריות אוחדו אוטומטית</li>
                  )}
                  {summaryStats.newCategories > 0 && (
                    <li>✨ {summaryStats.newCategories} קטגוריות חדשות להגדרה</li>
                  )}
                </ul>
              </div>
            </div>

            {summaryStats.conflictsCount > 0 && (
              <div className="summary-step warning">
                <span className="step-icon">⚠️</span>
                <div className="step-content">
                  <div className="step-title">נמצאו {summaryStats.conflictsCount} חוסר עקביות</div>
                  <p className="step-desc">בתי עסק שמופיעים בקטגוריות שונות</p>
                </div>
              </div>
            )}
          </div>

          {/* באנר איחודים אוטומטיים */}
          {autoMergedGroups.length > 0 && (
            <div className="auto-merge-banner">
              <div className="banner-header">
                <span className="banner-icon">ℹ️</span>
                <span className="banner-title">איחדנו אוטומטית {autoMergedGroups.filter(m => !cancelledMerges.has(m.target)).length} קטגוריות:</span>
              </div>
              <ul className="merge-list">
                {autoMergedGroups.filter(m => !cancelledMerges.has(m.target)).map((merge, idx) => (
                  <li key={idx} className={`merge-item ${merge.type === 'similar_name' ? 'similar' : ''}`}>
                    <span className="merge-type-badge">
                      {merge.type === 'identical' ? '=' : '≈'}
                    </span>
                    <span className="merge-sources">{merge.sources.join(', ')}</span>
                    <span className="merge-arrow">→</span>
                    <span className="merge-target">{merge.target}</span>
                    <button
                      className="undo-merge-btn"
                      onClick={() => handleUndoMerge(merge)}
                      title={merge.type === 'identical' ? 'בטל איחוד (שמות זהים)' : 'בטל איחוד (שמות דומים)'}
                    >
                      ↩️
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="summary-actions">
            {summaryStats.conflictsCount > 0 ? (
              <button
                className="new-cats-confirm-btn"
                onClick={() => setViewMode('conflicts')}
              >
                המשך לפתרון {summaryStats.conflictsCount} קונפליקטים
              </button>
            ) : activeNames.length > 0 ? (
              <button
                className="new-cats-confirm-btn"
                onClick={() => setViewMode('table')}
              >
                המשך להגדרת {activeNames.length} קטגוריות
              </button>
            ) : (
              <button
                className="new-cats-confirm-btn"
                onClick={handleConfirm}
              >
                סיום ✓
              </button>
            )}
            <button className="new-cats-cancel-btn" onClick={onCancel}>דלג לעכשיו</button>
          </div>

          <p className="summary-tip">
            ⚡ טיפ: תמיד תוכל לשנות קטגוריות אחר כך
          </p>
        </div>
      </div>
    );
  }

  // מסך קונפליקטים של בתי עסק
  if (viewMode === 'conflicts' && merchantConflicts.length > 0) {
    const unresolvedConflicts = merchantConflicts.filter(c => !resolvedConflicts[c.merchantName]);

    // אם כל הקונפליקטים נפתרו - הצג הודעה וכפתור המשך
    if (unresolvedConflicts.length === 0) {
      return (
        <div className="new-cats-overlay">
          <div className="new-cats-dialog new-cats-conflicts">
            <h3 className="new-cats-title">✅ כל הקונפליקטים נפתרו!</h3>
            <div className="summary-actions">
              {activeNames.length > 0 ? (
                <button
                  className="new-cats-confirm-btn"
                  onClick={() => setViewMode('table')}
                >
                  המשך להגדרת {activeNames.length} קטגוריות
                </button>
              ) : (
                <button
                  className="new-cats-confirm-btn"
                  onClick={handleConfirm}
                >
                  סיום ✓
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="new-cats-overlay">
        <div className="new-cats-dialog new-cats-conflicts">
          <div className="progress-indicator">
            <div className="progress-step-wrapper">
              <div
                className="progress-step completed"
                onClick={() => setViewMode('summary')}
                style={{ cursor: 'pointer' }}
                title="חזור לסיכום"
              >✓</div>
              <span className="progress-label">סיכום</span>
            </div>
            <div className="progress-line completed"></div>
            <div className="progress-step-wrapper">
              <div className="progress-step active">2</div>
              <span className="progress-label">קונפליקטים</span>
            </div>
            <div className="progress-line"></div>
            <div className="progress-step-wrapper">
              <div
                className="progress-step"
                onClick={() => setViewMode('table')}
                style={{ cursor: 'pointer' }}
                title="עבור להגדרת קטגוריות"
              >3</div>
              <span className="progress-label">הגדרה</span>
            </div>
          </div>
          <h3 className="new-cats-title">
            ⚠️ נמצאו חוסר עקביות
          </h3>
          <p className="new-cats-subtitle">
            בתי העסק הבאים מופיעים בקטגוריות שונות. בחר לאיזו קטגוריה לשייך כל אחד:
          </p>

          <div className="conflicts-list">
            {unresolvedConflicts.map((conflict) => (
              <div key={conflict.merchantName} className="conflict-card">
                <div className="conflict-header">
                  <span className="conflict-merchant">🏪 {conflict.merchantName}</span>
                  <span className="conflict-count">({conflict.totalTransactions} עסקאות)</span>
                </div>
                <p className="conflict-desc">מופיע ב-{conflict.categories.length} קטגוריות:</p>
                <div className="conflict-options">
                  {conflict.categories.map(cat => {
                    const catDef = localCategories.find(c => c.name === cat) || categoriesList.find(c => c.name === cat);
                    const textColor = getReadableTextColor(catDef?.color || '#e5e7eb');
                    return (
                      <button
                        key={cat}
                        className="conflict-option-btn"
                        style={{
                          backgroundColor: catDef?.color || '#e5e7eb',
                          color: textColor
                        }}
                        onClick={() => handleResolveConflict(conflict.merchantName, cat)}
                      >
                        {catDef?.icon || '📁'} {cat}
                        <span className="option-count">({conflict.transactionCounts[cat]})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="new-cats-btns-row">
            <button className="new-cats-cancel-btn" onClick={() => setViewMode('summary')}>חזור</button>
            {activeNames.length > 0 ? (
              <button
                className="new-cats-confirm-btn"
                onClick={() => setViewMode('table')}
              >
                המשך להגדרת קטגוריות ({activeNames.length})
              </button>
            ) : (
              <button
                className="new-cats-confirm-btn"
                onClick={handleConfirm}
              >
                סיום ✓
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // מסך טבלה - הקוד המקורי (רק אם יש קטגוריות להגדרה)
  // אם הגענו לכאן בטעות בלי קטגוריות - הצג כפתור סיום
  if (activeNames.length === 0) {
    return (
      <div className="new-cats-overlay">
        <div className="new-cats-dialog">
          <h3 className="new-cats-title">✅ אין קטגוריות חדשות להגדרה</h3>
          <div className="summary-actions">
            <button
              className="new-cats-confirm-btn"
              onClick={handleConfirm}
            >
              סיום ✓
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="new-cats-overlay" key={`dialog-${viewMode}-${activeNames.length}`}>
      <div className="new-cats-dialog">
        <div className="progress-indicator">
          <div className="progress-step-wrapper">
            <div
              className="progress-step completed"
              onClick={() => setViewMode('summary')}
              style={{ cursor: 'pointer' }}
              title="חזור לסיכום"
            >✓</div>
            <span className="progress-label">סיכום</span>
          </div>
          <div className="progress-line completed"></div>
          <div className="progress-step-wrapper">
            <div
              className="progress-step completed"
              onClick={() => summaryStats.conflictsCount > 0 && setViewMode('conflicts')}
              style={{ cursor: summaryStats.conflictsCount > 0 ? 'pointer' : 'default' }}
              title={summaryStats.conflictsCount > 0 ? 'חזור לקונפליקטים' : 'אין קונפליקטים'}
            >✓</div>
            <span className="progress-label">קונפליקטים</span>
          </div>
          <div className="progress-line completed"></div>
          <div className="progress-step-wrapper">
            <div className="progress-step active">3</div>
            <span className="progress-label">הגדרה</span>
          </div>
        </div>
        <h3 className="new-cats-title">
          הגדרת קטגוריות חדשות
        </h3>
        <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '16px' }}>
          {activeNames.length} קטגוריות להגדרה. בחר קטגוריה קיימת או צור חדשה עם אייקון וצבע.
        </p>

        <div className="new-cats-table-outer-wrapper">
          <table className="new-cats-table" key={`table-${activeNames.join('-')}`}>
            <thead>
              <tr>
                <th>קטגוריה מ-Excel</th>
                <th>כמות עסקאות</th>
                <th>בחר או צור קטגוריה</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orderedNames.filter(name => activeNames.includes(name)).flatMap((name) => {
                const stableIndex = stableIndices.get(name) ?? 0;
                const stableKey = `${name}-${stableIndex}`;
                const rows: React.ReactNode[] = [];
                
                // Debug: log table row generation
                console.debug('[NewCategoriesTablePrompt] Rendering row for:', name, 'stableKey:', stableKey, 'expanded:', !!expanded[name]);
                
                rows.push(
                  <tr key={`row-${stableKey}`}>
                      <td className="new-cats-table-name">{name}</td>
                      <td className="new-cats-table-count">
                        <span className="transaction-count-badge">{categoryTransactionCounts[name] || 0}</span>
                        {(categoryTransactionCounts[name] || 0) <= LOW_COUNT_THRESHOLD && (
                          <span className="chip chip-warning" title="מספר עסקאות נמוך – מומלץ לשקול מיזוג">מעט עסקאות</span>
                        )}
                      </td>
                      <td className="new-cats-table-select">
                        <div className="selector-and-suggest">
                          <CategorySelectOrAdd
                            key={`category-select-${stableKey}`}
                            categories={localCategories}
                            value={selectedCats[name]?.name || name}
                            onChange={catName => handleCategoryChange(name, catName)}
                            onAddCategory={cat => handleAddCategory(name, cat)}
                            allowAdd={true}
                            placeholder={name}
                            defaultIcon={defaultIconsAndColors[name]?.icon}
                            defaultColor={defaultIconsAndColors[name]?.color}
                            recommendedIcons={defaultIconsAndColors[name]?.recommendedIcons}
                            previewVisibility="afterAdd"
                            showDefaultChipIfProvided={Boolean(defaultIconsAndColors[name]?.icon || defaultIconsAndColors[name]?.color)}
                            onDraftChange={d => setDrafts(prev => ({ ...prev, [name]: d ? { name: d.name, icon: d.icon, color: d.color } : null }))}
                          />
                          {(() => {
                            const key = nameGroupKeyMap[name];
                            const members = key ? groupsByKey[key] : undefined;
                            // הצג הצעה גם אם יש רק חבר אחד, כאשר קיימת התאמה לקטגוריה משמורת (JSON)
                            if (!key || !members) return null;
                            const suggested = groupSuggestedTargets[key];
                            if (!suggested) return null;
                            // אל תציע מיזוג לעצמו
                            if (suggested === name) return null;
                            const isFromOriginalJson = originalCategoriesRef.current.has(suggested);
                            // אם אין התאמה לקטגוריה משמורת, דרוש לפחות 2 חברים בקבוצה כדי להציע יצירה/איחוד
                            if (!isFromOriginalJson && members.length < 2) return null;
                            const alreadySelected = selectedCats[name]?.name === suggested;

                            // אם הציעור קטגוריה משמורת (מ-JSON) - הציע מיזוג
                            // אם הציעור קטגוריה חדשה - הציע יצירה וברירה
                            return (
                              <div className="merge-suggestion" aria-live="polite">
                                <span className="merge-label">דומה ל:</span>
                                {(() => {
                                  // מצא הגדרה להצגת שבב של היעד המוצע
                                  // קודם חפש ב-localCategories (שמכילה עדכונים שהמשתמש עשה), אחר כך ב-categoriesList, ורק בסוף השתמש ב-defaults
                                  const existingInLocal = localCategories.find(c => c.name === suggested);
                                  const existingInOriginal = categoriesList.find(c => c.name === suggested);
                                  const defaults = defaultIconsAndColors[suggested];
                                  const srcCat = existingInLocal
                                    || existingInOriginal
                                    || (defaults?.icon ? { name: suggested, icon: defaults.icon, color: defaults.color } : { name: suggested, icon: '📁', color: '#e5e7eb' });
                                  const textColor = getReadableTextColor(srcCat.color || '#e5e7eb');
                                  return (
                                    <span
                                      className="CategorySelectOrAdd-chip final disabled"
                                      style={{ backgroundColor: srcCat.color, color: textColor }}
                                      title={`יעד מוצע: ${suggested}`}
                                      aria-disabled="true"
                                    >
                                      <span className="CategorySelectOrAdd-chip-icon">{srcCat.icon}</span>
                                      <span className="CategorySelectOrAdd-chip-label">{suggested}</span>
                                    </span>
                                  );
                                })()}
                                <button
                                  className="merge-btn"
                                  disabled={alreadySelected}
                                  onClick={() => {
                                    if (isFromOriginalJson) {
                                      handleCategoryChange(name, suggested);
                                    } else {
                                      // קודם חפש ב-localCategories (שמכילה עדכונים שהמשתמש עשה), אחר כך השתמש ב-defaults
                                      const existingInLocal = localCategories.find(c => c.name === suggested);
                                      const defaults = defaultIconsAndColors[suggested];
                                      const icon = existingInLocal?.icon || defaults?.icon || '';
                                      const color = existingInLocal?.color || defaults?.color || '';
                                      handleAddCategory(name, { name: suggested, icon, color });
                                    }
                                  }}
                                  title={isFromOriginalJson ? `מזג ל־"${suggested}" (קיימת בקובץ)` : `צור את "${suggested}" ובחר`}
                                  aria-label={isFromOriginalJson ? `מזג ל־${suggested}` : `צור ${suggested} ובחר`}
                                >
                                  {isFromOriginalJson ? 'אחד' : 'צור ובחר'}
                                </button>
                              </div>
                            );
                          })()}
                          {/* הצעת איחוד מבוססת חפיפת בתי עסק */}
                          {(() => {
                            const merchantSuggestion = merchantOverlapSuggestions[name];
                            if (!merchantSuggestion) return null;
                            // אל תציג אם כבר יש הצעה מבוססת שם זהה
                            const nameSuggested = nameGroupKeyMap[name] ? groupSuggestedTargets[nameGroupKeyMap[name]!] : null;
                            if (nameSuggested === merchantSuggestion.target) return null;
                            // אל תציג אם כבר נבחרה הקטגוריה המוצעת
                            if (selectedCats[name]?.name === merchantSuggestion.target) return null;

                            const isFromOriginalJson = originalCategoriesRef.current.has(merchantSuggestion.target);
                            const overlapPercent = Math.round(merchantSuggestion.overlap * 100);

                            // קודם חפש ב-localCategories (שמכילה עדכונים שהמשתמש עשה), אחר כך ב-categoriesList, ורק בסוף השתמש ב-defaults
                            const existingInLocal = localCategories.find(c => c.name === merchantSuggestion.target);
                            const existingInOriginal = categoriesList.find(c => c.name === merchantSuggestion.target);
                            const defaults = defaultIconsAndColors[merchantSuggestion.target];
                            const srcCat = existingInLocal
                              || existingInOriginal
                              || (defaults?.icon
                                ? { name: merchantSuggestion.target, icon: defaults.icon, color: defaults.color }
                                : { name: merchantSuggestion.target, icon: '📁', color: '#e5e7eb' });
                            const textColor = getReadableTextColor(srcCat.color || '#e5e7eb');

                            return (
                              <div className="merge-suggestion merchant-based" aria-live="polite">
                                <span className="merge-label" title={`בתי עסק משותפים: ${merchantSuggestion.sharedMerchants.slice(0, 5).join(', ')}`}>
                                  🏪 {overlapPercent}% חפיפה:
                                </span>
                                <span
                                  className="CategorySelectOrAdd-chip final disabled"
                                  style={{ backgroundColor: srcCat.color, color: textColor }}
                                  title={`יעד מוצע: ${merchantSuggestion.target} (${merchantSuggestion.sharedMerchants.length} בתי עסק משותפים)`}
                                  aria-disabled="true"
                                >
                                  <span className="CategorySelectOrAdd-chip-icon">{srcCat.icon}</span>
                                  <span className="CategorySelectOrAdd-chip-label">{merchantSuggestion.target}</span>
                                </span>
                                <button
                                  className="merge-btn"
                                  onClick={() => {
                                    if (isFromOriginalJson) {
                                      handleCategoryChange(name, merchantSuggestion.target);
                                    } else {
                                      // קודם חפש ב-localCategories (שמכילה עדכונים שהמשתמש עשה), אחר כך השתמש ב-defaults
                                      const icon = existingInLocal?.icon || defaults?.icon || '';
                                      const color = existingInLocal?.color || defaults?.color || '';
                                      handleAddCategory(name, { name: merchantSuggestion.target, icon, color });
                                    }
                                  }}
                                  title={`${merchantSuggestion.sharedMerchants.slice(0, 5).join(', ')}${merchantSuggestion.sharedMerchants.length > 5 ? '...' : ''}`}
                                  aria-label={`מזג ל־${merchantSuggestion.target} (${overlapPercent}% חפיפה בבתי עסק)`}
                                >
                                  אחד
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="new-cats-table-expand">
                        <button className="new-cats-table-expand-btn" onClick={() => setExpanded(e => ({ ...e, [name]: !e[name] }))}>
                          {expanded[name] ? '▲' : '▼'}
                        </button>
                      </td>
                    </tr>
                );
                
                if (expanded[name]) {
                  rows.push(
                    <tr key={`expanded-${stableKey}`}>
                        <td colSpan={4} className="new-cats-table-details-cell">
                          <div className="new-cats-table-details-wrapper">
                            <table className="new-cats-table-details">
                              <thead>
                                <tr>
                                  <th>תאריך</th>
                                  <th>תיאור</th>
                                  <th>סכום</th>
                                </tr>
                              </thead>
                              <tbody>
                                {((detailsByName[name] || []).slice(0, 10)).map((tx, idx) => (
                                  <tr key={tx.id + idx}>
                                    <td>{tx.date}</td>
                                    <td>{tx.description}</td>
                                    <td>₪{tx.amount.toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {(() => {
                              const key = nameGroupKeyMap[name];
                              const members = key ? groupsByKey[key] : undefined;
                              if (!key || !members || members.length < 2) return null;
                              const cols = members.slice(0, 3); // הגבלה ל-3 עמודות להשוואה מהירה
                              return (
                                <div className="group-compare" aria-label="השוואת עסקאות בקבוצה">
                                  {cols.map(colName => (
                                    <div key={colName} className="group-compare-col">
                                      <div className="group-compare-title">
                                        {colName} <span className="group-compare-count">({categoryTransactionCounts[colName] || 0})</span>
                                      </div>
                                      <ul className="group-compare-list">
                                        {(detailsByName[colName] || []).slice(0, 5).map((tx, idx) => (
                                          <li key={tx.id + idx}>
                                            <span className="date">{tx.date}</span>
                                            <span className="desc">{tx.description}</span>
                                            <span className="amt">₪{tx.amount.toLocaleString()}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                            {categoryTransactionCounts[name] > 10 && (
                              <div className="details-more">
                                ועוד {categoryTransactionCounts[name] - 10} עסקאות...
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                }
                
                return rows;
              })}
            </tbody>
          </table>
        </div>
        <div className="new-cats-btns-row">
          {disableConfirm && blockingInfo.total > 0 && (
            <div className="new-cats-blocking-count" aria-live="polite">
              יש {blockingInfo.total} פריטים שדורשים אישור
            </div>
          )}
          <button className="new-cats-cancel-btn" onClick={onCancel}>דלג לעכשיו</button>
          <button className="new-cats-confirm-btn" onClick={handleConfirm} disabled={disableConfirm} title={disableConfirm ? 'יש שינויים שלא אושרו או קטגוריות ללא ברירת מחדל' : undefined}>אישור והמשך</button>
        </div>
      </div>
    </div>
  );
};

export default NewCategoriesTablePrompt;
