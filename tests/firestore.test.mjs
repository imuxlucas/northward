import {readFile} from 'node:fs/promises';
import {before,after,test} from 'node:test';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,serverTimestamp} from 'firebase/firestore';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-northward',firestore:{host:'127.0.0.1',port:8080,rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});});
after(async()=>{await env?.cleanup();});
const ref=(as,owner='alice')=>doc(as ? env.authenticatedContext(as).firestore():env.unauthenticatedContext().firestore(),'users',owner,'learning','week-one');
test('owner can save, read and undo their own progress',async()=>{
  await assertSucceeds(setDoc(ref('alice'),{read:{1:true},last:1,updatedAt:serverTimestamp()}));
  await assertSucceeds(getDoc(ref('alice')));
  await assertSucceeds(setDoc(ref('alice'),{read:{1:false},updatedAt:serverTimestamp()},{merge:true}));
});
test('signed-out users cannot read or write progress',async()=>{
  await assertFails(getDoc(ref(null))); await assertFails(setDoc(ref(null),{last:2,updatedAt:serverTimestamp()},{merge:true}));
});
test('a different account cannot read or overwrite progress',async()=>{
  await assertFails(getDoc(ref('bob'))); await assertFails(setDoc(ref('bob'),{last:2,updatedAt:serverTimestamp()},{merge:true}));
});
test('notes, unknown days and invalid types cannot be uploaded',async()=>{
  for(const payload of [{notes:{1:'private'}},{read:{8:true}},{read:{1:'true'}},{last:8},{last:1.5}]) {
    await assertFails(setDoc(ref('alice'),{...payload,updatedAt:serverTimestamp()},{merge:true}));
  }
});
test('unscoped documents and forged timestamps are denied',async()=>{
  await assertFails(setDoc(ref('alice'),{last:2,updatedAt:new Date(0)},{merge:true}));
  await assertFails(setDoc(doc(env.authenticatedContext('alice').firestore(),'users','alice'),{admin:true}));
});
