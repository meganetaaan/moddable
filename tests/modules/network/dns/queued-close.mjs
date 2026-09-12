// Run with node --experimental-vm-modules. Uses the actual Resolver with fake UDP datagrams.
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
let task, socket, queryId, reads=0, resolved=0
const Timer={set(fn){task=fn;return 1},repeat(fn){task=fn;return 1},clear(){}}
const DNS={CLASS:{IN:1},RR:{A:1},SECTION:{QUESTION:0},OPCODE:{QUERY:0}}
class Serializer{constructor(options){queryId=options.id}add(){}build(){return new ArrayBuffer(1)}}
class Parser{constructor(){this.id=queryId;this.answers=1}question(){return {qclass:1,qname:['test','example']}}answer(){return {qtype:1,qname:['test','example'],rdata:'192.0.2.1'}}}
class UDP{constructor(options){Object.assign(this,options);socket=this}write(){}read(){if(this.closed)throw new Error('read after close');reads++;return new ArrayBuffer(1)}close(){this.closed=true}}
const module=new vm.SourceTextModule(readFileSync(new URL('../../../../examples/io/udp/dns/dns.js', import.meta.url),'utf8'))
await module.link(async name=>{const value={dns:DNS,'dns/parser':Parser,'dns/serializer':Serializer,timer:Timer}[name];return new vm.SyntheticModule(['default'],function(){this.setExport('default',value)})})
await module.evaluate()
const resolver=new module.namespace.default({servers:['192.0.2.53'],socket:{io:UDP}})
resolver.resolve({host:'test.example',onResolved(){resolved++}});task();socket.onReadable.call(socket,2)
if(reads!==1||resolved!==1||!socket.closed)throw new Error('DNS lifecycle failed')
resolver.close();console.log('DNS queued datagram regression passed')
