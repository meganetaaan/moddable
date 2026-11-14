export const SERVICE = "f14d0001-5b63-4f40-9b19-080000000018";
export const COLOR = "f14d0002-5b63-4f40-9b19-080000000018";
export const STATE = "f14d0003-5b63-4f40-9b19-080000000018";
export function decodeState(value) {
  if (!(value instanceof DataView) || value.byteLength !== 7 || value.getUint8(0) !== 1)
    throw new Error("未対応の状態データです（version 1 / 7 bytes が必要）。");
  const b = Array.from({length: 7}, (_, i) => value.getUint8(i));
  return {sequence: b[1], rgb: b.slice(2, 5), a: b[5], b: b[6]};
}
export class StopWatchClient {
  constructor(bluetooth, {onState = () => {}, onStatus = () => {}, onError = () => {}} = {}) {
    Object.assign(this, {bluetooth, onState, onStatus, onError});
    this.session = undefined; this.connecting = false; this.busy = false;
  }
  get connected() { return !!this.session?.ready && !!this.session.device.gatt?.connected; }
  check(s) { if (this.session !== s) throw new Error("接続が終了しました。"); }
  dispose(s) {
    s.state?.removeEventListener("characteristicvaluechanged", s.changed);
    s.device?.removeEventListener("gattserverdisconnected", s.disconnected);
    s.device?.gatt?.disconnect();
  }
  disconnect() {
    const s = this.session;
    this.session = undefined;
    if (s) this.dispose(s);
    this.onStatus("未接続");
  }
  async connect() {
    if (this.connecting || this.busy) throw new Error("処理の完了を待ってください。");
    if (!this.bluetooth) throw new Error("Web Bluetooth 対応ブラウザーが必要です。");
    this.disconnect();
    this.connecting = true;
    const s = {}; this.session = s;
    this.onStatus("接続中…");
    try {
      // Exact name filter also works when a 128-bit service is absent from advertising.
      s.device = await this.bluetooth.requestDevice({filters: [{name: "StopWatch Demo"}], optionalServices: [SERVICE]});
      this.check(s);
      if (!s.device.gatt) throw new Error("GATT が利用できません。");
      s.disconnected = () => { if (this.session === s) this.disconnect(); };
      s.device.addEventListener("gattserverdisconnected", s.disconnected);
      const server = await s.device.gatt.connect(); this.check(s);
      const service = await server.getPrimaryService(SERVICE); this.check(s);
      s.color = await service.getCharacteristic(COLOR); this.check(s);
      s.state = await service.getCharacteristic(STATE); this.check(s);
      s.changed = event => {
        if (this.session !== s) return;
        try { this.onState(decodeState(event.target.value)); } catch (error) { this.onError(error); }
      };
      s.state.addEventListener("characteristicvaluechanged", s.changed);
      await s.state.startNotifications(); this.check(s);
      const value = await s.state.readValue(); this.check(s);
      this.onState(decodeState(value));
      s.ready = true; this.onStatus("接続済み・通知受信中");
    } catch (error) {
      if (this.session === s) this.disconnect();
      else this.dispose(s);
      throw error;
    } finally { this.connecting = false; }
  }
  async operation(fn) {
    if (!this.connected) throw new Error("先に接続してください。");
    if (this.busy || this.connecting) throw new Error("処理の完了を待ってください。");
    const s = this.session; this.busy = true;
    try { const value = await fn(s); this.check(s); return value; }
    finally { this.busy = false; }
  }
  async read() {
    const value = await this.operation(s => s.state.readValue());
    this.onState(decodeState(value));
  }
  async setColor(rgb) {
    if (!Array.isArray(rgb) || rgb.length !== 3 || rgb.some(v => !Number.isInteger(v) || v < 0 || v > 255))
      throw new Error("RGB は 0〜255 の整数で指定してください。");
    await this.operation(async s => {
      await s.color.writeValueWithResponse(Uint8Array.from(rgb)); this.check(s);
      const value = await s.state.readValue(); this.check(s);
      this.onState(decodeState(value));
    });
  }
}
