import assert from "node:assert/strict";
import State from "./state.js";
const s=new State();assert.deepEqual([...s.packet()],[1,0,0,30,70,0,0]);
s.write(Uint8Array.of(80,40,0).buffer);assert.deepEqual([...s.color],[80,40,0]);
for(const size of [0,1,2,4,20]) assert.throws(()=>s.write(new ArrayBuffer(size)),RangeError);
assert.deepEqual([...s.color],[80,40,0]);s.press("A");s.press("B");assert.deepEqual([...s.packet()],[1,3,80,40,0,1,1]);
assert.throws(()=>s.press("C"),RangeError);for(let i=0;i<255;i++)s.press("A");assert.equal(s.packet()[5],0);
console.log("BLE demo state tests passed");
