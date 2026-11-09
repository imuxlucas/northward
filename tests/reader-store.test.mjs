import test from 'node:test';
import assert from 'node:assert/strict';
import {ReaderStore, sanitize, cloudPatch} from '../reader-store.js';
const storage = () => { const entries=new Map(); return {getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v)}; };
const store = (disk=storage()) => { let revision=0; return new ReaderStore(disk,()=>String(++revision)); };

test('legacy guest progress and notes survive migration',()=>{
  const disk=storage(); disk.setItem('northward-week-one-v1',JSON.stringify({read:[1,3],notes:{1:'old note'},last:3}));
  const reader=store(disk);
  assert.deepEqual(reader.state.read,[1,3]); assert.equal(reader.state.notes[1],'old note');
  assert.equal(reader.hasPending(),false);
});
test('accounts never inherit another account or guest notes',()=>{
  const reader=store(); reader.setRead(1,true); reader.setNote(1,'guest');
  reader.switchOwner('alice'); assert.deepEqual(reader.state.read,[]); assert.deepEqual(reader.state.notes,{});
  reader.setRead(2,true); reader.setNote(2,'alice');
  reader.switchOwner('bob'); assert.deepEqual(reader.state.read,[]); assert.deepEqual(reader.state.notes,{});
  reader.switchOwner('alice'); assert.deepEqual(reader.state.read,[2]); assert.equal(reader.state.notes[2],'alice');
  reader.switchOwner(null); assert.deepEqual(reader.state.read,[1]); assert.equal(reader.state.notes[1],'guest');
});
test('offline undo survives remote snapshots and a reload',()=>{
  const disk=storage(); let reader=store(disk); reader.switchOwner('alice');
  reader.applyRemote({read:{1:true,2:true},last:2}); reader.setRead(1,false); reader.setLast(4);
  reader=store(disk); reader.switchOwner('alice'); reader.applyRemote({read:{1:true,3:true},last:3});
  assert.deepEqual(reader.state.read,[3]); assert.equal(reader.state.last,4); assert.equal(reader.hasPending(),true);
});
test('an acknowledgement cannot erase a newer toggle, including ABA changes',()=>{
  const reader=store(); reader.switchOwner('alice'); reader.setRead(1,true); const first=reader.pending();
  reader.setRead(1,false); reader.setRead(1,true); reader.acknowledge('alice',first);
  assert.equal(reader.hasPending(),true);
  reader.acknowledge('alice',reader.pending()); assert.equal(reader.hasPending(),false);
});
test('late acknowledgement is confined to the account that wrote it',()=>{
  const reader=store(); reader.switchOwner('alice'); reader.setRead(1,true); const pending=reader.pending();
  reader.switchOwner('bob'); reader.setRead(2,true); reader.acknowledge('alice',pending);
  assert.deepEqual(reader.state.read,[2]); assert.equal(reader.hasPending(),true);
  reader.switchOwner('alice'); assert.equal(reader.hasPending(),false);
});
test('cloud payload excludes private notes and unrelated day state',()=>{
  const reader=store(); reader.switchOwner('alice'); reader.applyRemote({read:{1:true}});
  reader.setNote(1,'private'); reader.setRead(2,true); reader.setLast(3);
  assert.deepEqual(cloudPatch(reader.pending()),{read:{2:true},last:3});
});
test('guest import is explicit, additive and consumed once per account',()=>{
  const reader=store(); reader.setRead(1,true); reader.setNote(1,'private guest note'); reader.switchOwner('alice');
  reader.applyRemote({read:{2:true}}); assert.equal(reader.canImportGuest(),true);
  reader.importGuest(); assert.deepEqual([...reader.state.read].sort(),[1,2]); assert.deepEqual(reader.state.notes,{});
  reader.setRead(1,false); reader.importGuest(); assert.deepEqual(reader.state.read,[2]);
});
test('malformed storage cannot introduce unknown days or unbounded notes',()=>{
  const state=sanitize({read:[1,1,9,'2'],last:100,notes:{1:'x'.repeat(6000),8:'invalid'},pending:{days:{9:{value:true,token:'x'},1:{value:'true',token:'x'}}}});
  assert.deepEqual(state.read,[1]); assert.equal(state.last,1); assert.equal(state.notes[1].length,5000);
  assert.equal(state.notes[8],undefined); assert.deepEqual(state.pending.days,{});
});
test('denied local storage reports failure without stopping reading',()=>{
  const reader=store({getItem(){throw new Error();},setItem(){throw new Error();}});
  reader.setRead(1,true); assert.deepEqual(reader.state.read,[1]); assert.equal(reader.available,false);
});
