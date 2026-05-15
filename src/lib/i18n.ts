import az from '@/locales/az.json';

type DeepRecord = { [k: string]: string | string[] | DeepRecord };

function get(obj: DeepRecord, path: string): string {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return path;
    cur = (cur as DeepRecord)[p];
  }
  return typeof cur === 'string' ? cur : path;
}

export function t(key: string): string {
  return get(az as unknown as DeepRecord, key);
}

export const locale = az;
