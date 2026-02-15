import type { CategoryRule, CreditDetail } from '../types';

const CATEGORY_RULES_FILENAME = 'category-rules.json';

// ניקוי תיאור עסקה מסימנים מיוחדים להשוואה (זהה ל-extractMerchantName)
function cleanDescription(description: string): string {
  if (!description) return '';
  return description
    .replace(/\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?/g, '') // תאריכים
    .replace(/\d{4,}/g, '') // מספרים ארוכים
    .replace(/[*#\-_]+/g, ' ') // סימנים מיוחדים → רווח
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
const LEGACY_DESC_MAP_FILENAME = 'description-categories.json';

// Load existing rules. If legacy mapping file exists and no rules file yet, migrate entries.
export async function loadCategoryRules(dirHandle: FileSystemDirectoryHandle): Promise<CategoryRule[]> {
  if (!dirHandle) return [];
  let rules: CategoryRule[] = [];
  try {
    const fh = await dirHandle.getFileHandle(CATEGORY_RULES_FILENAME);
    const file = await fh.getFile();
    const txt = await file.text();
    const data = JSON.parse(txt);
    if (Array.isArray(data)) {
      rules = data.filter(r => r && typeof r === 'object');
    }
  } catch {
    // No rules file yet – attempt migration from legacy mapping
    try {
      const legacyFh = await dirHandle.getFileHandle(LEGACY_DESC_MAP_FILENAME);
      const legacyFile = await legacyFh.getFile();
      const legacyTxt = await legacyFile.text();
      const legacyMap = JSON.parse(legacyTxt);
      if (legacyMap && typeof legacyMap === 'object' && !Array.isArray(legacyMap)) {
        rules = Object.entries(legacyMap).map(([description, category]) => createRule({
          category: String(category),
          conditions: { descriptionEquals: description },
          source: 'migration'
        }));
      }
    } catch {
      // no legacy file either – start empty
      rules = [];
    }
    // Persist migrated rules if any
    if (rules.length) {
      await saveCategoryRules(dirHandle, rules);
    }
  }
  return rules;
}

export async function saveCategoryRules(dirHandle: FileSystemDirectoryHandle, rules: CategoryRule[]): Promise<void> {
  if (!dirHandle) return;
  const fh = await dirHandle.getFileHandle(CATEGORY_RULES_FILENAME, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(rules, null, 2));
  await writable.close();
}

// Factory: create a new rule with auto id & timestamp
export function createRule(partial: Pick<CategoryRule, 'category' | 'conditions'> & { source?: CategoryRule['source'] }): CategoryRule {
  return {
    id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    category: partial.category,
    active: true,
    createdAt: new Date().toISOString(),
    source: partial.source || 'user',
    conditions: partial.conditions,
  };
}

// Add (append) a new rule and persist
export async function addCategoryRule(dirHandle: FileSystemDirectoryHandle, rule: CategoryRule): Promise<void> {
  if (!dirHandle) return;
  const rules = await loadCategoryRules(dirHandle);
  rules.push(rule);
  await saveCategoryRules(dirHandle, rules);
}

// Apply rules to details. First-match wins. Rules are filtered by active.
// כללי transactionId מקבלים עדיפות על פני כללי תיאור
export function applyCategoryRules(details: CreditDetail[], rules: CategoryRule[]): CreditDetail[] {
  if (!rules.length) return details;
  const activeRules = rules.filter(r => r.active);
  // הפרד כללי עסקה בודדת (עדיפות גבוהה) מכללי תיאור
  const idRules = activeRules.filter(r => r.conditions.transactionId);
  const descRules = activeRules.filter(r => !r.conditions.transactionId);
  
  // מיין כללי תיאור: כללים עם מגבלות סכום קודם (יותר ספציפיים)
  const sortedDescRules = [...descRules].sort((a, b) => {
    const aHasAmount = a.conditions.minAmount !== undefined || a.conditions.maxAmount !== undefined;
    const bHasAmount = b.conditions.minAmount !== undefined || b.conditions.maxAmount !== undefined;
    if (aHasAmount && !bHasAmount) return -1; // a קודם
    if (!aHasAmount && bHasAmount) return 1;  // b קודם
    return 0;
  });

  return details.map(d => {
    // שלב 1: בדוק כללי עסקה בודדת (עדיפות גבוהה)
    for (const rule of idRules) {
      if (rule.conditions.transactionId === d.id) {
        return { ...d, category: rule.category };
      }
    }
    // שלב 2: כללי תיאור (ממוינים - כללים עם סכום קודם)
    for (const rule of sortedDescRules) {
      const c = rule.conditions;
      // Match descriptionEquals
      if (c.descriptionEquals && c.descriptionEquals !== d.description) continue;
      // Match descriptionContains (מילות מפתח מנוקות מסימנים)
      if (c.descriptionContains) {
        const cleaned = cleanDescription(d.description);
        if (!cleaned.includes(c.descriptionContains.toLowerCase())) continue;
      }
      // Match descriptionRegex
      if (c.descriptionRegex) {
        let re: RegExp | null = null;
        try { re = new RegExp(c.descriptionRegex, 'i'); } catch { re = null; }
        if (re && !re.test(d.description)) continue;
      }
      // Amount constraints - השתמש בערך מוחלט כי סכומים יכולים להיות שליליים
      const absAmount = Math.abs(d.amount);
      // תמיכה גם ב-string וגם ב-number (נתונים יכולים להישמר כ-string ב-JSON)
      if (c.minAmount !== undefined && c.minAmount !== null) {
        const minAmt = Number(c.minAmount);
        if (!isNaN(minAmt) && absAmount < minAmt) continue;
      }
      if (c.maxAmount !== undefined && c.maxAmount !== null) {
        const maxAmt = Number(c.maxAmount);
        if (!isNaN(maxAmt) && absAmount > maxAmt) continue;
      }
      
      // Source constraint (credit/bank)
      if (c.source && d.source !== c.source) continue;
      
      // Direction constraint (income/expense)
      if (c.direction && d.direction !== c.direction) continue;
      
      // Date constraints (YYYY-MM-DD format)
      if (c.dateFrom || c.dateTo) {
        // Parse transaction date (DD/MM/YYYY or DD/MM/YY)
        const parts = d.date.split('/');
        if (parts.length >= 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          let year = parseInt(parts[2], 10);
          if (year < 100) year += 2000;
          const txDate = new Date(year, month, day);
          
          if (c.dateFrom) {
            const fromDate = new Date(c.dateFrom);
            if (txDate < fromDate) continue;
          }
          if (c.dateTo) {
            const toDate = new Date(c.dateTo);
            if (txDate > toDate) continue;
          }
        }
      }

      // If reached here – rule matches. Override category.
      if (rule.category) {
        return { ...d, category: rule.category };
      }
    }
    return d;
  });
}

// Helper to add simple descriptionEquals rule (used when user applies category to all with same description)
export async function addDescriptionEqualsRule(dirHandle: FileSystemDirectoryHandle, description: string, category: string): Promise<void> {
  if (!dirHandle || !description || !category) return;
  // Load existing rules to avoid duplicates
  const rules = await loadCategoryRules(dirHandle);
  const exists = rules.some(r => r.conditions.descriptionEquals === description && r.category === category);
  if (exists) return;
  const rule = createRule({ category, conditions: { descriptionEquals: description } });
  rules.push(rule);
  await saveCategoryRules(dirHandle, rules);
}

// Helper to add single transaction category override rule
export async function addTransactionCategoryRule(dirHandle: FileSystemDirectoryHandle, transactionId: string, category: string): Promise<void> {
  if (!dirHandle || !transactionId || !category) return;
  const rules = await loadCategoryRules(dirHandle);
  // Remove existing rule for this transactionId (only one override per transaction)
  const filteredRules = rules.filter(r => r.conditions.transactionId !== transactionId);
  const rule = createRule({ category, conditions: { transactionId } });
  filteredRules.push(rule);
  await saveCategoryRules(dirHandle, filteredRules);
}

// Helper to add rule with amount constraints
export async function addRuleWithAmountRange(
  dirHandle: FileSystemDirectoryHandle,
  description: string,
  category: string,
  minAmount?: number,
  maxAmount?: number
): Promise<void> {
  if (!dirHandle || !description || !category) return;
  const rules = await loadCategoryRules(dirHandle);
  
  // Build conditions object
  const conditions: CategoryRule['conditions'] = { descriptionEquals: description };
  if (typeof minAmount === 'number' && Number.isFinite(minAmount)) {
    conditions.minAmount = minAmount;
  }
  if (typeof maxAmount === 'number' && Number.isFinite(maxAmount)) {
    conditions.maxAmount = maxAmount;
  }
  
  const rule = createRule({ category, conditions });
  rules.push(rule);
  await saveCategoryRules(dirHandle, rules);
}

// Legacy function for backwards compatibility
export async function addRuleWithAmount(dirHandle: FileSystemDirectoryHandle, description: string, minAmount: number, category: string): Promise<void> {
  return addRuleWithAmountRange(dirHandle, description, category, minAmount, undefined);
}

// Helper to add a rule that matches descriptions CONTAINING a search term (regex-based)
export async function addDescriptionContainsRule(dirHandle: FileSystemDirectoryHandle, searchTerm: string, category: string): Promise<void> {
  if (!dirHandle || !searchTerm || !category) return;
  const rules = await loadCategoryRules(dirHandle);
  
  // Escape special regex characters in the search term
  const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexPattern = escapedTerm; // Simple contains match (case-insensitive is applied in matching)
  
  // Check if similar rule already exists
  const exists = rules.some(r => r.conditions.descriptionRegex === regexPattern && r.category === category);
  if (exists) return;
  
  const rule = createRule({ 
    category, 
    conditions: { descriptionRegex: regexPattern },
    source: 'user'
  });
  rules.push(rule);
  await saveCategoryRules(dirHandle, rules);
}

// פילטרים מחיפוש גלובלי
interface SearchFiltersForRule {
  text: string;
  minAmount?: number;
  maxAmount?: number;
  dateFrom?: string;
  dateTo?: string;
}

// Helper to add advanced rule from global search filters
export async function addAdvancedRule(
  dirHandle: FileSystemDirectoryHandle,
  filters: SearchFiltersForRule,
  category: string,
  includeDatesInRule?: boolean
): Promise<void> {
  if (!dirHandle || !category) return;
  
  const rules = await loadCategoryRules(dirHandle);
  
  // Build conditions object from filters
  const conditions: CategoryRule['conditions'] = {};
  
  // Text filter -> descriptionRegex (contains)
  if (filters.text) {
    const escapedTerm = filters.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    conditions.descriptionRegex = escapedTerm;
  }
  
  // Amount filter
  if (typeof filters.minAmount === 'number' && Number.isFinite(filters.minAmount)) {
    conditions.minAmount = filters.minAmount;
  }
  if (typeof filters.maxAmount === 'number' && Number.isFinite(filters.maxAmount)) {
    conditions.maxAmount = filters.maxAmount;
  }
  
  // Date filter (optional - only if user chose to include)
  if (includeDatesInRule) {
    if (filters.dateFrom) {
      conditions.dateFrom = filters.dateFrom;
    }
    if (filters.dateTo) {
      conditions.dateTo = filters.dateTo;
    }
  }
  
  // Don't add empty rule
  if (Object.keys(conditions).length === 0) return;
  
  const rule = createRule({ 
    category, 
    conditions,
    source: 'user'
  });
  rules.push(rule);
  await saveCategoryRules(dirHandle, rules);
}

// Update an existing rule by ID
export async function updateCategoryRule(
  dirHandle: FileSystemDirectoryHandle,
  ruleId: string,
  filters: SearchFiltersForRule,
  category: string,
  includeDatesInRule?: boolean
): Promise<void> {
  if (!dirHandle || !ruleId || !category) return;
  
  const rules = await loadCategoryRules(dirHandle);
  const ruleIndex = rules.findIndex(r => r.id === ruleId);
  if (ruleIndex === -1) return;
  
  // Build new conditions object from filters
  const conditions: CategoryRule['conditions'] = {};
  
  // Text filter -> descriptionRegex (contains)
  if (filters.text) {
    const escapedTerm = filters.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    conditions.descriptionRegex = escapedTerm;
  }
  
  // Amount filter
  if (typeof filters.minAmount === 'number' && Number.isFinite(filters.minAmount)) {
    conditions.minAmount = filters.minAmount;
  }
  if (typeof filters.maxAmount === 'number' && Number.isFinite(filters.maxAmount)) {
    conditions.maxAmount = filters.maxAmount;
  }
  
  // Date filter (optional)
  if (includeDatesInRule) {
    if (filters.dateFrom) {
      conditions.dateFrom = filters.dateFrom;
    }
    if (filters.dateTo) {
      conditions.dateTo = filters.dateTo;
    }
  }
  
  // Don't save empty rule
  if (Object.keys(conditions).length === 0) return;
  
  // Update the rule in place
  rules[ruleIndex] = {
    ...rules[ruleIndex],
    category,
    conditions,
    updatedAt: new Date().toISOString(),
  };
  
  await saveCategoryRules(dirHandle, rules);
}
