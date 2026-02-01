import type { CategoryRule, CreditDetail } from '../types';

const CATEGORY_RULES_FILENAME = 'category-rules.json';
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
      // Match descriptionRegex
      if (c.descriptionRegex) {
        let re: RegExp | null = null;
        try { re = new RegExp(c.descriptionRegex, 'i'); } catch { re = null; }
        if (re && !re.test(d.description)) continue;
      }
      // Amount constraints - השתמש בערך מוחלט כי סכומים יכולים להיות שליליים
      const absAmount = Math.abs(d.amount);
      if (typeof c.minAmount === 'number' && absAmount < c.minAmount) continue;
      if (typeof c.maxAmount === 'number' && absAmount > c.maxAmount) continue;

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
