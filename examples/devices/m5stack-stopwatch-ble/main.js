import {GATTServer} from "embedded:io/bluetoothle/peripheral";
import Poco from "commodetto/Poco";
import Timer from "timer";
import DemoState from "state";

const serviceUUID = "f14d0001-5b63-4f40-9b19-080000000018";
const colorUUID = "f14d0002-5b63-4f40-9b19-080000000018";
const stateUUID = "f14d0003-5b63-4f40-9b19-080000000018";
const state = new DemoState();
const render = new Poco(screen);
let subscriber, stateCharacteristic, pending = false;
function paint() {
  const c=state.color; render.begin();
  render.fillRectangle(render.makeColor(...c),0,0,render.width,render.height); render.end();
}
function publish() {
  if (!subscriber || !stateCharacteristic || pending) return;
  const connection=subscriber;
  pending=true;
  try { connection.notify(stateCharacteristic,state.packet(),error=> {
    if (subscriber === connection) pending=false;
    if (error) trace("BLE DEMO: notification error\n");
  }); } catch { pending=false; trace("BLE DEMO: notification unavailable\n"); }
}
const server = new GATTServer({
  mtu: 23,
  services: [
    {uuid:"1800", characteristics:[{uuid:"2a00",properties:GATTServer.properties.read,value:ArrayBuffer.fromString("StopWatch Demo")}]},
    {uuid:serviceUUID,characteristics:[
      {uuid:colorUUID,properties:GATTServer.properties.read|GATTServer.properties.write,
       onRead(){return state.color;},
       onWrite(buffer){try {state.write(buffer);paint();publish();trace("BLE DEMO: RGB updated\n");}catch {trace("BLE DEMO: rejected RGB length\n");}}},
      {uuid:stateUUID,properties:GATTServer.properties.read|GATTServer.properties.notify,
       onRead(){return state.packet();},
       onSubscribe(connection){subscriber=connection;stateCharacteristic=this;pending=false;trace("BLE DEMO: subscribed\n");},
       onUnsubscribe(connection){if(subscriber===connection){subscriber=undefined;stateCharacteristic=undefined;pending=false;}trace("BLE DEMO: unsubscribed\n");}}
    ]}
  ],
  onReady(){this.startAdvertising({flags:6,services:[serviceUUID]},{name:"StopWatch Demo"});trace("BLE DEMO: advertising ready\n");},
  onConnect(){this.stopAdvertising();trace("BLE DEMO: connected\n");},
  onDisconnect(connection){
    if(subscriber===connection){subscriber=undefined;stateCharacteristic=undefined;pending=false;}
    this.startAdvertising({flags:6,services:[serviceUUID]},{name:"StopWatch Demo"});trace("BLE DEMO: disconnected; advertising\n");
  },
  onWarning(){trace("BLE DEMO: warning\n");}
});
const buttons = ["A","B"].map(name=>new device.peripheral.button[name]({onPush(){if(this.pressed){state.press(name);publish();trace("BLE DEMO: button "+name+"\n");}}}));
paint();
Timer.repeat(publish,1000);
trace("BLE DEMO: color write/read and A/B notifications; no bonding or Wi-Fi credentials\n");
