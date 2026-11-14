import assert from "node:assert/strict";
import fs from "node:fs";
import DemoState from "./state.js";
let server, periodic; const buttons={};
class GATTServer {
 static properties={read:2,write:8,notify:16};
 constructor(options){this.options=options;server=this;}
 startAdvertising(scan,response){this.advertising=true;this.scan=scan;this.response=response;}
 stopAdvertising(){this.advertising=false;}
}
class Poco {width=466;height=466;begin(){}end(){}makeColor(...c){return c;}fillRectangle(){}}
const Timer={repeat(fn){periodic=fn;}};
const device={peripheral:{button:Object.fromEntries(["A","B"].map(name=>[name,class {constructor(options){buttons[name]={...options,pressed:true};}}]))}};
const source=fs.readFileSync(new URL("./main.js",import.meta.url),"utf8").replace(/^import .*;$/gm,"");
ArrayBuffer.fromString ??= s=>new TextEncoder().encode(s).buffer;
new Function("GATTServer","Poco","Timer","DemoState","device","screen","trace",source)(GATTServer,Poco,Timer,DemoState,device,{},()=>{});
server.options.onReady.call(server);assert.equal(server.advertising,true);assert.equal(server.response.name,"StopWatch Demo");
const [color,state]=server.options.services[1].characteristics;
const sent=[], callbacks=[];const connection={notify(ch,value,done){sent.push([...value]);callbacks.push(done);}};
server.options.onConnect.call(server,connection);assert.equal(server.advertising,false);
state.onSubscribe.call(state,connection);color.onWrite(Uint8Array.of(80,0,0).buffer);assert.equal(sent.length,1);
buttons.A.onPush.call(buttons.A);periodic();assert.equal(sent.length,1);
callbacks.shift()(0);periodic();assert.equal(sent.length,2);assert.equal(sent[1][5],1);
state.onUnsubscribe(connection);callbacks.shift()(0);periodic();assert.equal(sent.length,2);
server.options.onDisconnect.call(server,connection);assert.equal(server.advertising,true);
state.onSubscribe.call(state,connection);buttons.B.onPush.call(buttons.B);assert.equal(sent.at(-1)[6],1);
server.options.onDisconnect.call(server,connection);periodic();assert.equal(sent.length,3);
console.log("BLE demo lifecycle mocks passed");
