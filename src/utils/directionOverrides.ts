import type { CreditDetail } from '../types';

export type DirectionOverrides = Record<string, { direction: 'income' | 'expense'; note?: string; updatedAt: string }>;

const DIRECTION_OVERRIDES_FILE = 'directionOverrides.json';

export async function loadDirectionOverridesFromDir(dirHandle: any): Promise<DirectionOverrides> {
  try {
    const fileHandle = await dirHandle.getFileHandle(DIRECTION_OVERRIDES_FILE);
    const file = await fileHandle.getFile();
    const content = await file.text();
    const data = JSON.parse(content);
    return data ?? {};
  } catch {
    return {};
  }
}

export async function saveDirectionOverridesToDir(dirHandle: any, overrides: DirectionOverrides): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(DIRECTION_OVERRIDES_FILE, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(overrides, null, 2));
  await writable.close();
}

export function applyDirectionOverrides(details: CreditDetail[], overrides: DirectionOverrides): CreditDetail[] {
  return details.map(d => {
    const ov = overrides[d.id];
    if (!ov) return d;
    return {
      ...d,
      directionDetected: d.directionDetected ?? d.direction,
      direction: ov.direction,
      userAdjustedDirection: true,
      userAdjustmentNote: ov.note,
    };
  });
}
