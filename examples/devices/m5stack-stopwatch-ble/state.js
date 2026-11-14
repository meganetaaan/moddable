export default class DemoState {
  #rgb = [0, 30, 70];
  #seq = 0; #a = 0; #b = 0;
  get color() { return Uint8Array.from(this.#rgb); }
  write(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length !== 3) throw new RangeError("RGB requires 3 bytes");
    this.#rgb = Array.from(bytes); this.#seq = (this.#seq + 1) & 255;
  }
  press(button) {
    if (button === "A") this.#a = (this.#a + 1) & 255;
    else if (button === "B") this.#b = (this.#b + 1) & 255;
    else throw new RangeError("unknown button");
    this.#seq = (this.#seq + 1) & 255;
  }
  packet() { return Uint8Array.of(1,this.#seq,...this.#rgb,this.#a,this.#b); }
}
