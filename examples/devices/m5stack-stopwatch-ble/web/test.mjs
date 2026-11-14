import assert from "node:assert/strict";
import {StopWatchClient, decodeState, SERVICE, COLOR} from "./client.mjs";
const value = () => new DataView(Uint8Array.from([1,255,10,20,30,254,255]).buffer);
class Events {
  listeners = new Map();
  addEventListener(n, f) { this.listeners.set(n, f); }
  removeEventListener(n, f) { if(this.listeners.get(n) === f) this.listeners.delete(n); }
}
function fixture() {
  const color = {writeValueWithResponse: async bytes => { color.last = [...bytes]; }};
  const state = new Events(); state.startNotifications = async () => {}; state.readValue = async () => value();
  const device = new Events();
  device.gatt = {connected: false, connect: async () => { device.gatt.connected = true; return {getPrimaryService: async id => { assert.equal(id,SERVICE); return {getCharacteristic: async id => id === COLOR ? color : state}; }}; }, disconnect() {this.connected = false;}};
  let requests = 0;
  const bluetooth = {requestDevice: async options => { requests++; assert.deepEqual(options.optionalServices,[SERVICE]); return device; }};
  const seen = [], errors = [];
  const client = new StopWatchClient(bluetooth,{onState: s => seen.push(s),onError:e=>errors.push(e)});
  return {client, bluetooth,device,state,color,seen,errors,requests:()=>requests};
}
assert.throws(()=>decodeState(new DataView(new ArrayBuffer(6))));
assert.throws(()=>decodeState(new DataView(Uint8Array.from([2,0,0,0,0,0,0]).buffer)));
{
  const f=fixture(); assert.equal(f.requests(),0); await f.client.connect();
  assert.equal(f.client.connected,true); assert.equal(f.seen[0].a,254);
  await f.client.setColor([255,0,7]); assert.deepEqual(f.color.last,[255,0,7]);
  await assert.rejects(f.client.setColor([256,0,0]));
  const callback=f.state.listeners.get("characteristicvaluechanged");
  callback({target:{value:new DataView(new ArrayBuffer(2))}}); assert.equal(f.errors.length,1);
  f.client.disconnect(); assert.equal(f.state.listeners.size,0); assert.equal(f.device.listeners.size,0);
  const count=f.seen.length; callback({target:{value:value()}}); assert.equal(f.seen.length,count);
  await assert.rejects(f.client.read());
  await f.client.connect(); f.device.listeners.get("gattserverdisconnected")(); assert.equal(f.client.connected,false);
}
{
  const f=fixture(); let resolve;
  f.state.startNotifications=()=>new Promise(r=>resolve=r);
  const pending=f.client.connect();
  while(!resolve) await new Promise(r=>setTimeout(r,0));
  f.client.disconnect(); await assert.rejects(f.client.connect());
  resolve(); await assert.rejects(pending); assert.equal(f.state.listeners.size,0); assert.equal(f.client.connected,false);
}
{
  const f=fixture(); await f.client.connect(); let resolve;
  f.state.readValue=()=>new Promise(r=>resolve=r);
  const pending=f.client.read(); await assert.rejects(f.client.read());
  const count=f.seen.length; f.client.disconnect(); resolve(value()); await assert.rejects(pending); assert.equal(f.seen.length,count);
}
{
  const f=fixture(); f.state.startNotifications=async()=>{throw new Error("notification denied");};
  await assert.rejects(f.client.connect()); assert.equal(f.device.gatt.connected,false); assert.equal(f.state.listeners.size,0);
}
console.log("BLE client mock tests passed: payload, color, cancellation, stale callbacks, serialization, cleanup.");
