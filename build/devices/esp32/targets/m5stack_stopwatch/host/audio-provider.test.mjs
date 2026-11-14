import fs from "node:fs";
import assert from "node:assert/strict";
const operations = [];
class Base {
    start() { operations.push("start"); }
    stop() { operations.push("stop"); }
    close() { operations.push("close"); }
}
Base.prototype[Symbol.dispose] = Base.prototype.close;
Object.freeze(Base.prototype);
Object.freeze(Base);
class Output extends Base {}
Output.Async = class extends Output {};
Object.freeze(Output.Async.prototype);
Object.freeze(Output.Async);
Object.freeze(Output.prototype);
Object.freeze(Output);
class Codec {
    constructor() { operations.push("codec-create"); }
    configure(options) { assert.deepEqual(options, {input:true, output:true}); }
    start() { operations.push("codec-start"); }
    close() { operations.push("codec-close"); }
}
let preload = false;
class RuntimeSet extends Set { constructor() { assert.equal(preload, false, "mutable Set must not be allocated during provider preload"); super(); } }
globalThis.__testAudio = {RuntimeSet, Timer:{delay(){}}, Codec, AudioInput:Base, AudioOutput:Output};
globalThis.ioExpander = {write(pin,value) { operations.push(`pin:${pin}:${value}`); }};
const source = fs.readFileSync(new URL("./audio-provider.js", import.meta.url), "utf8")
    .replace(/^import .*;$/gm, "");
const {default:create} = await import("data:text/javascript;base64," + Buffer.from("const {Timer,Codec,AudioInput,AudioOutput,RuntimeSet:Set}=globalThis.__testAudio;\n" + source).toString("base64"));
for (const first of ["Input", "Output"]) {
    operations.length = 0;
    const device = {i2c:{default:{}}, io:{SMBus:class {}, Digital:class {static Output = 1; write() {} close() {}}}};
    preload = true;
    const audio = create(()=>device);
    preload = false;
    const a = new audio[first]();
    const b = new audio[first === "Input" ? "Output" : "Input"]();
    assert.equal(operations.filter(x=>x === "codec-create").length, 1);
    assert.throws(()=>new audio[first](), /already/);
    a.start(); b.start();
    assert.equal(operations.filter(x=>x === "codec-start").length, 1);
    a.stop();
    assert.equal(operations.includes("codec-close"), false);
    a.close(); assert.equal(operations.includes("codec-close"), false);
    const c = new audio[first](); c.start(); b.close();
    assert.equal(operations.includes("codec-close"), false);
    c.close(); c.close();
    assert.equal(operations.filter(x=>x === "codec-close").length, 1);
    assert.throws(()=>c.start(), /closed/);
    assert.throws(()=>new audio.Input({sampleRate:8000}), /16 kHz/);
    const out = new audio.Output.Async(); out.start(); out[Symbol.dispose]();
    assert.equal(operations.filter(x=>x === "codec-close").length, 2);
}
console.log("Duplex provider lifecycle tests passed");
