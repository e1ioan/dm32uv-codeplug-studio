const assert=require('node:assert/strict');
const fs=require('node:fs');
const {Codeplug}=require('../src/core.js'), CSV=require('../src/csv.js');
const source=fs.readFileSync(process.argv[2]||process.env.DM32_TEST_CODEPLUG);
let count=0;const test=(name,fn)=>{fn();console.log('PASS',name);count++};
const original=()=>new Codeplug(source);
const changed=(data)=>new Codeplug(data);
test('Exports and reimports all three tables, byte for byte',()=>{
 for(const type of ['channels','zones','scans']){const cp=original();let txt=CSV.exportCSV(cp,type);let out=CSV.prepare(cp,type,txt);assert.equal(out.changedBytes,0,type);assert.deepEqual(Buffer.from(out.bytes),source,type);}
});
test('CSV parser reads BOM, quoted commas, line breaks, escaped quotes',()=>{
 const p=CSV.parse('\ufeff"Number","Name","Channels"\r\n"1","T, A","1;2"\r\n"2","a ""quote""\nsecond","3"\r\n');
 assert.equal(p.entries.length,2);assert.equal(p.entries[0].values.name,'T, A');assert.equal(p.entries[1].values.name,'a "quote"\nsecond');
});
test('Update one channel name only; field bytes only',()=>{
 const cp=original(),csv=CSV.exportCSV(cp,'channels').replace('"PMR-01"','"TESTCSV"');const p=CSV.prepare(cp,'channels',csv);
 assert.equal(p.changedRecords,1);const a=changed(p.bytes);assert.equal(a.channel(1).name,'TESTCSV');
 for(let i=0;i<source.length;i++)if(source[i]!==p.bytes[i])assert(i>=cp.chOffset(1)&&i<cp.chOffset(1)+16);
});
test('Zones membership imports ordered channel IDs without affecting scans',()=>{
 const cp=original(),csv='Number,Name,Channels\n1,PT-EMERGENCY,1;85;216\n';const p=CSV.prepare(cp,'zones',csv),x=changed(p.bytes);
 assert.deepEqual(x.zone(1).members,[1,85,216]);assert.deepEqual(x.scan(1).members,cp.scan(1).members);assert.equal(p.changedRecords,1);
});
test('Scan lists CSV imports and adds a new list without altering undocumented records',()=>{
 const cp=original(),raw=cp.bytes.slice(cp.scanOffset(1)+21,cp.scanOffset(1)+26);
 const p=CSV.prepare(cp,'scans','Number,Name,Channels\r\n1,PT-QUICK,1;2;3\r\n29,NEW-SCAN,100;85\r\n');const x=changed(p.bytes);
 assert.equal(x.scanCount,29);assert.equal(x.scan(29).name,'NEW-SCAN');assert.deepEqual(x.scan(29).members,[100,85]);assert.deepEqual(p.bytes.slice(cp.scanOffset(1)+21,cp.scanOffset(1)+26),raw);
});
test('Reject invalid row atomically, original not modified',()=>{
 const cp=original();assert.throws(()=>CSV.prepare(cp,'zones','Number,Name,Channels\n1,Valid,1;2\n2,Bad,99999\n'),/Row 3/);assert.deepEqual(Buffer.from(cp.bytes),source);
});
test('Reject missing numbering and unsupported DMR append',()=>{
 assert.throws(()=>CSV.prepare(original(),'zones','Number,Name,Channels\n28,Jump,1\n'),/cannot skip/);
 assert.throws(()=>CSV.prepare(original(),'channels','Number,Name,RX MHz,Mode\n217,NewDMR,446.1,DMR\n'),/New DMR/);
});
test('Append new analog channel from CSV and preserve original channels',()=>{
 const cp=original(),p=CSV.prepare(cp,'channels','Number,Name,RX MHz,TX MHz,Mode,TX blocked\n217,NEWCHANNEL,446.12345,446.12345,Analog,true\n'),x=changed(p.bytes);
 assert.equal(x.channelCount,217);assert.equal(x.channel(217).name,'NEWCHANNEL');assert.equal(x.channel(217).rx,446.12345);assert.equal(x.channel(216).name,cp.channel(216).name);
});
test('Reject duplicate numbers and members',()=>{
 assert.throws(()=>CSV.prepare(original(),'zones','Number,Name,Channels\n1,TEST,1;2\n1,ANOTHER,4\n'),/duplicate Number/);
 assert.throws(()=>CSV.prepare(original(),'scans','Number,Name,Channels\n1,PT-QUICK,1;1\n'),/duplicate channel/);
});
console.log(count+' CSV tests passed');
