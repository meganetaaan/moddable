import {StopWatchClient} from "./client.mjs";
const $ = id => document.getElementById(id);
const supported = isSecureContext && !!navigator.bluetooth;
let running = false;
const client = new StopWatchClient(navigator.bluetooth, {
  onStatus(text) { $("status").textContent = text; update(); },
  onError(error) { $("error").textContent = error.message; },
  onState(state) {
    $("rgb").textContent = `RGB: ${state.rgb.join(", ")}`;
    $("swatch").style.backgroundColor = `rgb(${state.rgb.join(",")})`;
    $("a").textContent = state.a; $("b").textContent = state.b;
    $("sequence").textContent = `更新番号: ${state.sequence}`;
  }
});
function update() {
  $("connect").disabled = !supported || running || client.connected;
  $("disconnect").disabled = !client.session;
  $("controls").disabled = running || !client.connected;
}
async function run(fn) {
  if (running) return;
  running = true; $("error").textContent = ""; update();
  try { await fn(); } catch (error) { $("error").textContent = error.name === "NotFoundError" ? "機器が選択されませんでした。" : error.message; }
  finally { running = false; update(); }
}
$("connect").onclick = () => run(() => client.connect());
$("disconnect").onclick = () => { client.disconnect(); update(); };
$("read").onclick = () => run(() => client.read());
for (const button of document.querySelectorAll("[data-rgb]"))
  button.onclick = () => run(() => client.setColor(button.dataset.rgb.split(",").map(Number)));
addEventListener("pagehide", () => client.disconnect());
if (!supported) $("support").textContent = "このページでは Web Bluetooth を利用できません。Android Chrome で HTTPS または localhost を使ってください。";
update();
