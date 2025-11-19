import type { CategoryRule, CreditDetail } from '../types';

const CATEGORY_RULES_FILENAME = 'category-rules.json';
const LEGACY_DESC_MAP_FILENAME = 'description-categories.json';

// Load existing rules. If legacy mapping file exists and no rules file yet, migrate entries.
export async function loadCategoryRules(dirHandle: any): Promise<CategoryRule[]> {
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

export async function saveCategoryRules(dirHandle: any, rules: CategoryRule[]): Promise<void> {
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
export async function addCategoryRule(dirHandle: any, rule: CategoryRule): Promise<void> {
  if (!dirHandle) return;
  const rules = await loadCategoryRules(dirHandle);
  rules.push(rule);
  await saveCategoryRules(dirHandle, rules);
}

// Apply rules to details. First-match wins. Rules are filtered by active.
export function applyCategoryRules(details: CreditDetail[], rules: CategoryRule[]): CreditDetail[] {
  if (!rules.length) return details;
  const activeRules = rules.filter(r => r.active);

  return details.map(d => {
    // Skip if already has category (we still allow override; could change policy)
    for (const rule of activeRules) {
      const c = rule.conditions;
      // Match descriptionEquals
      if (c.descriptionEquals && c.descriptionEquals !== d.description) continue;
      // Match descriptionRegex
      if (c.descriptionRegex) {
        let re: RegExp | null = null;
        try { re = new RegExp(c.descriptionRegex, 'i'); } catch { re = null; }
        if (re && !re.test(d.description)) continue;
      }
      // Amount constraints
      if (typeof c.minAmount === 'number' && d.amount < c.minAmount) continue;
      if (typeof c.maxAmount === 'number' && d.amount > c.maxAmount) continue;

      // If reached here – rule matches. Override category.
      if (rule.category && rule.category !== d.category) {
        return { ...d, category: rule.category };
      }
    }
    return d;
  });
}

// Helper to add simple descriptionEquals rule (used when user applies category to all with same description)
export async function addDescriptionEqualsRule(dirHandle: any, description: string, category: string): Promise<void> {
  if (!dirHandle || !description || !category) return;
  // Load existing rules to avoid duplicates
  const rules = await loadCategoryRules(dirHandle);
  const exists = rules.some(r => r.conditions.descriptionEquals === description && r.category === category);
  if (exists) return;
  const rule = createRule({ category, conditions: { descriptionEquals: description } });
  rules.push(rule);
  await saveCategoryRules(dirHandle, rules);
}

// OPTIONAL: future extension placeholder – addRuleWithAmount(dirHandle, description, minAmount, category)
export async function addRuleWithAmount(dirHandle: any, description: string, minAmount: number, category: string): Promise<void> {
  if (!dirHandle || !description || !category || !Number.isFinite(minAmount)) return;
  const rules = await loadCategoryRules(dirHandle);
  const rule = createRule({ category, conditions: { descriptionEquals: description, minAmount } });
  rules.push(rule);
  await saveCategoryRules(dirHandle, rules);
}
// Placeholder for category rules
export const categoryRules: Record<string, any> = {};
