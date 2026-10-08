import { type Backup, validateBackup } from './db';
const keys = ['sessions','sets','custom','overrides','settings'] as const;
export const fingerprint = (b: Backup) => JSON.stringify(keys.map(k => [...b[k]].sort((a:any,c:any)=>String(a.id || a.exerciseId).localeCompare(String(c.id || c.exerciseId)))));
export function mergeSnapshots(base: Backup | null, local: Backup, remote: Backup): Backup {
  const result = {...local};
  for (const key of keys) {
    const index = (b: Backup | null) => new Map((b?.[key] || []).map((r:any)=>[r.id || r.exerciseId,r]));
    const b=index(base), l=index(local), r=index(remote), merged:any[]=[];
    for (const id of new Set([...b.keys(),...l.keys(),...r.keys()])) {
      const before=b.get(id), here=l.get(id), there=r.get(id);
      const same=(a:unknown,c:unknown)=>JSON.stringify(a)===JSON.stringify(c);
      let value;
      if (same(here,there)) value=here;
      else if (same(here,before)) value=there;
      else if (same(there,before)) value=here;
      else if (key==='sessions' && here && there && same({...here,updatedAt:''},{...there,updatedAt:''})) value={...here,updatedAt:here.updatedAt > there.updatedAt ? here.updatedAt : there.updatedAt};
      else if (!base && key==='settings') value=here;
      else throw new Error(`Sync conflict in ${key}. Export a backup, then resolve in Settings.`);
      if (value) merged.push(value);
    }
    (result as any)[key]=merged;
  }
  try { return validateBackup(result); } catch (e) { throw new Error(`Sync conflict: ${e instanceof Error ? e.message : String(e)}. Export a backup, then resolve in Settings.`); }
}
