/* Bulk channel editing: byte-level patch isolation and all-or-nothing validation. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {Codeplug}=require('../src/core.js');
const raw=fs.readFileSync(process.argv[2]||process.env.DM32_TEST_CODEPLUG);
const fresh=()=>new Codeplug(raw);
let passed=0;
function test(name,run){run();passed++;console.log('PASS '+name)}
function changedOffsets(cp){let a=[];for(let i=0;i<cp.bytes.length;i++)if(cp.bytes[i]!==cp.original[i])a.push(i);return a}
test('No-op bulk edit preserves all bytes; one unchanged save identical',()=>{
 const cp=fresh();const orig=cp.channel(1).power;
 assert.equal(cp.setChannels([1,2,3],{power:orig}),0); // sample channels same power
 assert.deepEqual(Buffer.from(cp.save()),raw);
});
test('Power edit affects only power bits, all three target records, no unrelated bytes',()=>{
 const cp=fresh(), ids=[1,84,85],before=ids.map(n=>cp.channel(n));
 const modified=cp.setChannels(ids,{power:2});
 assert.ok(modified>0);for(const n of ids){const c=cp.channel(n);assert.equal(c.power,2);assert.equal(c.name,before[ids.indexOf(n)].name);}
 assert.equal(cp.channel(86).power,0);
 assert.ok(changedOffsets(cp).every(off=>ids.some(n=>off===cp.chOffset(n)+24)));
 assert.equal(cp.audit.length,1);assert.match(cp.audit[0].note,/Bulk edit 3 channels/);
});
test('Changing scan list on selected channels preserves RX/TX, BW, scan-add and every other byte',()=>{
 const cp=fresh(), ids=[2,3,4];cp.setChannels(ids,{bandwidth:25,scanAdd:true});
 const prev=cp.bytes.slice(),targetBytes=ids.map(n=>cp.chOffset(n)+25);
 cp.setChannels(ids,{scanIndex:28});
 assert.ok(cp.bytes.every((v,off)=>v===prev[off]||targetBytes.includes(off)));
 for(const n of ids){assert.equal(cp.channel(n).scanIndex,28);assert.equal(cp.channel(n).bandwidth,25);assert.equal(cp.channel(n).scanAdd,true)}
 assert.equal(cp.channel(1).scanIndex,0);
});
test('Each field in a bulk edit is applied individually, other per-channel settings are retained',()=>{
 const cp=fresh();cp.setChannel(1,{rx:'145.55000',name:'UNIQUE-A',power:2});cp.setChannel(2,{rx:'433.55000',name:'UNIQUE-B',power:1});
 cp.setChannels([1,2],{txBlocked:false});
 assert.equal(cp.channel(1).name,'UNIQUE-A');assert.equal(cp.channel(2).name,'UNIQUE-B');
 assert.equal(cp.channel(1).rx,145.55);assert.equal(cp.channel(2).rx,433.55);
 assert.equal(cp.channel(1).power,2);assert.equal(cp.channel(2).power,1);
 assert.equal(cp.channel(1).txBlocked,false);assert.equal(cp.channel(2).txBlocked,false);
});
test('Invalid frequency in one request rolls back all selected channels',()=>{
 const cp=fresh(),before=cp.bytes.slice(),audit=cp.audit.length;
 assert.throws(()=>cp.setChannels([1,2,3],{rx:'145.x'}),/frequency/i);
 assert.deepEqual(cp.bytes,before);assert.equal(cp.audit.length,audit);
});
test('Mixed analog/DMR mode/tone bulk editing rejected atomically',()=>{
 const cp=fresh(),digital=cp.channels().find(c=>c.digital),analog=cp.channels().find(c=>!c.digital);
 assert.ok(digital,'Fixture has DMR channels');
 const orig=cp.bytes.slice();
 assert.throws(()=>cp.setChannels([analog.id,digital.id],{rxTone:'123.0'}),/analog/i);
 assert.deepEqual(cp.bytes,orig);
 assert.throws(()=>cp.setChannels([analog.id,digital.id],{mode:0}),/Cannot convert analog to DMR/);
 assert.deepEqual(cp.bytes,orig);
});
test('Duplicate IDs only patched once and bulk changes survive save/reload',()=>{
 const cp=fresh();cp.setChannels([1,1,2,3],{scanIndex:12,power:1});assert.equal(cp.audit.length,1);
 const cp2=new Codeplug(cp.save());for(const n of [1,2,3]){
  assert.equal(cp2.channel(n).scanIndex,12);assert.equal(cp2.channel(n).power,1)
 }
 assert.deepEqual(cp2.validate(),[]);
});
console.log(passed+' bulk tests passed');
