import { it, expect } from 'vitest';
import { estimated1RM, improvement } from './strength';
import type { SetRecord } from './core';
const set=(changes:Partial<SetRecord>={}):SetRecord=>({id:'new',sessionId:'new-session',exerciseId:'bench',exerciseName:'Bench',timestamp:'2026-10-08T10:00:00Z',sequence:1,type:'standard',reps:5,miniReps:0,rir:2,effectiveReps:3,weights:{chest:1},calculationVersion:'1',strength:{load:100,unit:'kg'},...changes});
it('adjusts Epley for RIR and normalizes pounds',()=>{
  expect(estimated1RM(set())).toBeCloseTo(123.3333);
  expect(estimated1RM(set({strength:{load:220.4622622,unit:'lb'}}))).toBeCloseTo(123.3333);
  expect(estimated1RM(set({reps:1,rir:0}))).toBe(100);
});
it('withholds inappropriate estimates',()=>{
  for(const changes of [{strength:undefined},{type:'rest-pause' as const},{reps:12},{rir:6},{reps:0}]) expect(estimated1RM(set(changes))).toBeNull();
});
const old=(changes:Partial<SetRecord>={})=>set({id:'old',sessionId:'old-session',timestamp:'2026-10-07T10:00:00Z',...changes});
it('flags greater load or reps at matched RIR',()=>{
 expect(improvement(set(),[old({strength:{load:95,unit:'kg'}})])).toContain('More load');
 expect(improvement(set({reps:6}),[old()])).toContain('More reps');
});
it('does not flag different RIR, exercises, sessions or units alone',()=>{
 for(const changes of [{rir:3},{exerciseId:'squat'},{sessionId:'new-session'},{strength:{load:220.4622622,unit:'lb' as const}}]) expect(improvement(set(),[old(changes)])).toBeNull();
 expect(improvement(set({type:'rest-pause'}),[old()])).toBeNull();
});
it('uses latest comparable set rather than an older weaker set',()=>{
 expect(improvement(set(),[old({strength:{load:80,unit:'kg'}}),old({id:'later',timestamp:'2026-10-07T11:00:00Z',strength:{load:105,unit:'kg'}})])).toBeNull();
});
