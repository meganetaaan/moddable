import Timer from "timer";
trace("DUPLEX module entered\n");
const audio = device.audio;
trace("DUPLEX factory ready\n");
let reads = 0, samples = 0, writes = 0, peak = 0, phase = 0;
const wave = new Int16Array(400);
for (let i = 0; i < wave.length; i++) wave[i] = Math.round(Math.sin(i * 2 * Math.PI * 11 / 400) * 32767);
let previousReportTime = Date.now(), previousSamples = 0;
function input() {
    trace("DUPLEX input constructing\n");
    const value = new audio.Input({onReadable(bytes) {
        const pcm = new Int16Array(this.read(bytes));
        for (const sample of pcm) peak = Math.max(peak, Math.abs(sample));
        reads++; samples += pcm.length;
    }});
    trace("DUPLEX input constructed; starting\n");
    try { value.start(); } catch (error) { value.close(); throw error; }
    trace("DUPLEX input started\n"); return value;
}
function output() {
    trace("DUPLEX output constructing\n");
    const value = new audio.Output({onWritable(bytes) {
        const pcm = new Int16Array(bytes >> 1);
        for (let i = 0; i < pcm.length;) {
            const offset = phase % wave.length;
            const count = Math.min(pcm.length - i, wave.length - offset);
            pcm.set(wave.subarray(offset, offset + count), i);
            i += count; phase += count;
        }
        this.write(pcm.buffer); writes++;
    }});
    value.volume = 0.5;
    trace("DUPLEX output constructed; starting\n");
    try { value.start(); } catch (error) { value.close(); throw error; }
    trace("DUPLEX output started\n"); return value;
}
function report(phase) {
    const now = Date.now(), interval = now - previousReportTime;
    trace(`DUPLEX ${phase}: reads=${reads} samples=${samples} writes=${writes} peak=${peak} intervalMs=${interval} intervalSamples=${samples-previousSamples} samplesPerSecond=${Math.round((samples-previousSamples)*1000/interval)}\n`);
    previousReportTime = now; previousSamples = samples;
}
let mic, speaker;
try {
mic = input(); speaker = output();
previousReportTime = Date.now(); previousSamples = samples;
Timer.set(() => { report("both"); mic.stop(); }, 2000);
Timer.set(() => { report("input stopped"); mic.close(); }, 4000);
Timer.set(() => { report("input closed"); mic = input(); }, 6000);
Timer.set(() => { report("input reopened"); speaker.stop(); }, 8000);
Timer.set(() => { report("output stopped"); speaker.close(); }, 10000);
Timer.set(() => { report("output closed"); speaker = output(); }, 12000);
Timer.set(() => { report("output reopened"); speaker.close(); mic.close(); }, 14000);
Timer.set(() => { report("all closed"); }, 16000);

Timer.set(() => {
    let remaining = 8;
    function reopen() {
        const value = new audio.Input({onReadable(bytes) {
            this.read(bytes);
            this.close();
            trace(`DUPLEX callback-close remaining=${--remaining}\n`);
            if (remaining) Timer.set(reopen, 100);
        }});
        value.start();
    }
    reopen();
}, 17000);

} catch (error) {
    trace(`DUPLEX startup error: ${error}\n${error.stack ?? ""}\n`);
    try { speaker?.close(); } catch (cleanupError) { trace(`DUPLEX output cleanup: ${cleanupError}\n`); }
    try { mic?.close(); } catch (cleanupError) { trace(`DUPLEX input cleanup: ${cleanupError}\n`); }
}
