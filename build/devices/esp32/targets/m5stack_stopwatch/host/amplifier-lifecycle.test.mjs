import fs from "node:fs";
import assert from "node:assert/strict";
let serial = 0;
async function load(shared, state) {
    function event(name) { state.events.push(name); if (state.fail === name) throw Error(name); }
    class Digital {
        static Output = 1;
        constructor(options) { assert.equal(options.pin,14); assert.equal(options.initialValue,0); event("gpio.new"); }
        write(value) { event(`gpio.${value}`); }
        close() { event("gpio.close"); }
    }
    class Audio {
        constructor() { event("native.new"); }
        start() { event("native.start"); }
        stop() { event("native.stop"); }
        close() { event("native.close"); }
    }
    Audio.prototype[Symbol.dispose] = Audio.prototype.close;
    Audio.Async = class extends Audio {};
    Object.freeze(Audio.Async.prototype); Object.freeze(Audio.Async);
    Object.freeze(Audio.prototype); Object.freeze(Audio);
    class Codec {
        constructor() { event("codec.new"); }
        configure() { event("codec.configure"); }
        start() { event("codec.start"); }
        stop() { event("codec.stop"); }
        close() { event("codec.close"); }
    }
    const Timer = {delay(ms) { event(`delay.${ms}`); }};
    globalThis.ioExpander = {write(pin,value) {event(`ioe.${pin}.${value}`);}};
    globalThis.__ampTest = {Timer, Codec, Audio};
    let source = fs.readFileSync(new URL(shared ? "./audio-provider.js" : "./provider.js", import.meta.url), "utf8").replace(/^import .*;$/gm, "");
    if (!shared) source = fs.readFileSync(new URL("./audio-provider.js", import.meta.url), "utf8").replace(/^import .*;$/gm, "").replace("export default function", "function") + "\n" + source;
    const prelude = "const {Timer,Codec,Audio:AudioInput,Audio:AudioOutput}=globalThis.__ampTest; const CST820=class{},CST9217=class{},BMI270=class{},Button=class{},RTC=class{};\n";
    const module = await import("data:text/javascript;base64," + Buffer.from(prelude + source + `\n//case ${serial++}`).toString("base64"));
    const device = shared ? {i2c:{default:{}},io:{Digital,SMBus:class{}}} : module.default;
    device.io = {Digital,SMBus:class{}};
    return shared ? module.default(()=>device) : device.audio;
}
for (const shared of [false,true]) {
    {
        const state = {events:[]}; const audio = await load(shared,state);
        const input = new audio.Input(); input.start(); input.stop(); input.close();
        assert(!state.events.some(e=>e.startsWith("gpio.")), "Input must not own GPIO14");
        const output = new audio.Output(); state.events.length=0; output.start();
        const high = state.events.indexOf("ioe.10.1");
        assert(high>=0 && state.events[high+1]==="gpio.1" && state.events[high+2]==="delay.10");
        state.events.length=0; output.stop();
        assert.deepEqual(state.events.slice(0,2),["gpio.0","ioe.10.0"]);
        assert(!state.events.includes("gpio.close"), "normal stop preserves restart capability");
        output.start(); output.close(); output.close();
        assert.equal(state.events.filter(e=>e==="gpio.close").length,1);
    }
    for (const [operation, failure] of [["start","ioe.10.1"],["start","gpio.1"],["stop","ioe.10.0"],["stop","native.stop"],["close","ioe.10.0"],["close","gpio.0"],["close","gpio.close"],["close","native.close"],["close","codec.close"]]) {
        const state = {events:[]}; const audio = await load(shared,state);
        const output = new audio.Output();
        if(operation!=="start") output.start();
        state.events.length=0; state.fail=failure;
        assert.throws(()=>output[operation]());
        assert(state.events.includes("gpio.0"), `${shared}/${operation}/${failure}: LOW attempted`);
        assert(state.events.includes("gpio.close"), `${shared}/${operation}/${failure}: pin closed`);
        assert(state.events.includes("native.close"), `${shared}/${operation}/${failure}: native released`);
        const low = state.events.indexOf("gpio.0"), off = state.events.indexOf("ioe.10.0");
        assert(low>=0 && off>low, "GPIO low precedes I2C off even on I2C failure");
        state.fail=undefined;
        const reopened = new audio.Output(); reopened.close();
    }
    {
        const state = {events:[],fail:"gpio.new"}; const audio = await load(shared,state);
        assert.throws(()=>new audio.Output());
        assert(state.events.includes("native.close"));
        assert(!state.events.includes("ioe.10.0"), "failed pin acquisition does not touch another owner's amplifier");
    }
}
console.log("Both amplifier ownership/failure suites passed");
