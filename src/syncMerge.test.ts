import { it, expect } from 'vitest';
import { mergeSnapshots, fingerprint } from './syncMerge';
import { validateBackup, type Backup } from './db';
import { defaults, type SetRecord } from './core';
const date='2026-10-08T10:00:00Z';
function backup():Backup { return {schemaVersion:1,exportedAt:date,sessions:[{id:'w',startedAt:date,createdAt:date,updatedAt:date,completedAt:date,status:'completed'}],sets:[],custom:[],overrides:[],settings:[structuredClone(defaults)]}; }
const set=(id:string):SetRecord=>({id,sessionId:'w',exerciseId:'bench',exerciseName:'Bench',timestamp:date,sequence:1,type:'standard',reps:5,miniReps:0,rir:0,effectiveReps:5,weights:{chest:1},calculationVersion:'1',strength:{load:100,unit:'kg'}});
it('merges independent additions from two devices',()=>{
 const b=backup(), l=structuredClone(b),r=structuredClone(b); l.sets=[set('a')];r.sets=[set('b')];
 expect(mergeSnapshots(b,l,r).sets.map(s=>s.id)).toEqual(['a','b']);
});
it('propagates deletion without resurrection',()=>{
 const b=backup();b.sets=[set('a')];const l=structuredClone(b),r=structuredClone(b);l.sets=[];
 expect(mergeSnapshots(b,l,r).sets).toEqual([]);
});
it('rejects conflicting edits and delete versus edit',()=>{
 const b=backup();b.sets=[set('a')];const l=structuredClone(b),r=structuredClone(b);l.sets[0].strength!.load=110;r.sets[0].strength!.load=120;
 expect(()=>mergeSnapshots(b,l,r)).toThrow('conflict');l.sets=[];
 expect(()=>mergeSnapshots(b,l,r)).toThrow('conflict');
});
it('merges identical changes and ignores harmless session touch timestamps',()=>{
 const b=backup(),l=structuredClone(b),r=structuredClone(b);l.sessions[0].updatedAt='2026-10-08T11:00:00Z';r.sessions[0].updatedAt='2026-10-08T12:00:00Z';
 expect(mergeSnapshots(b,l,r).sessions[0].updatedAt).toBe(r.sessions[0].updatedAt);
});
it('rejects two active workouts after merge',()=>{
 const b=backup(),l=structuredClone(b),r=structuredClone(b);l.sessions.push({...b.sessions[0],id:'a',status:'active',completedAt:null});r.sessions.push({...b.sessions[0],id:'b',status:'active',completedAt:null});
 expect(()=>mergeSnapshots(b,l,r)).toThrow('Multiple active');
});
it('retains legacy backups and rejects malformed new strength fields',()=>{
 const b=backup();b.sets=[set('a')];delete b.sets[0].strength;expect(validateBackup(b)).toBe(b);
 b.sets[0].strength={load:-1,unit:'kg'};expect(()=>validateBackup(b)).toThrow('strength');
});
it('fingerprint ignores export time and record ordering',()=>{
 const b=backup();b.sets=[set('a'),set('b')];const c=structuredClone(b);c.exportedAt='2026-10-08T12:00:00Z';c.sets.reverse();expect(fingerprint(b)).toBe(fingerprint(c));
});
