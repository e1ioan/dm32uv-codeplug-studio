/* OEM CPS deletion regression (user-supplied before/after codeplugs).
 * The OEM output is an oracle for record order/IDs, not for undocumented
 * residual bytes. CPS leaves dirty string padding and one anomalous PMR scan
 * membership, neither of which we reproduce.
 */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {Codeplug}=require('../src/core.js');
const BEFORE=process.argv[2]||process.env.DM32_TEST_CODEPLUG;
const AFTER=process.argv[3]||'/mnt/data/DMR-10-22-26-delete.data';
const original=fs.readFileSync(BEFORE),official=new Codeplug(fs.readFileSync(AFTER));
const fresh=()=>new Codeplug(original);
const check=(name,fn)=>{fn(); console.log('PASS '+name)};
let cp=fresh();cp.deleteChannel(2);cp.deleteList('zone',2);cp.deleteList('scan',2);
check('CPS record counts after deletion',()=>{assert.equal(cp.channelCount,215);assert.equal(cp.zoneCount,25);assert.equal(cp.scanCount,27);assert.equal(cp.bytes.length,659456);assert.deepEqual(cp.validate(),[])});
check('All 215 channel names, frequencies, modes, power, tones and settings match CPS',()=>{
 for(let i=1;i<=215;i++){
 const actual=cp.channel(i),expected=official.channel(i);
 for(const field of ['name','rx','tx','mode','power','txBlocked','bandwidth','scanAdd','scanIndex','rxTone','txTone','digital','color','timeslot','rxGroup','radioIdIndex'])
   assert.deepEqual(actual[field],expected[field],`channel #${i} field ${field}`);
 }
});
check('All 25 zones match CPS including exact order of member numbers',()=>{
 for(let i=1;i<=25;i++){
  const a=cp.zone(i),b=official.zone(i);
  assert.equal(a.name,b.name,`zone #${i}`);
  assert.deepEqual(a.members,b.members,`zone #${i}`);
 }
});
check('All 27 scan-list names match CPS; 26 of 27 member arrays identical',()=>{
 let exceptions=[];
 for(let i=1;i<=27;i++){
  const a=cp.scan(i),b=official.scan(i);
  assert.equal(a.name,b.name,`scan #${i}`);
  if(JSON.stringify(a.members)!==JSON.stringify(b.members))exceptions.push({index:i,editor:a.members,cps:b.members});
 }
 assert.deepEqual(exceptions,[{index:3,editor:[1,2,3,4,5,6,7],cps:[1,2,3,4,5,6,7,8]}]);
});
check('DMR TX selectors correctly move with channel records over all 215 slots',()=>{
 const pre=fresh();for(let i=2;i<=215;i++){
  const j=pre.contactOffset(i+1),k=cp.contactOffset(i);
  assert.deepEqual([...cp.bytes.slice(k,k+2)],[...pre.bytes.slice(j,j+2)],`contact selector #${i}`);
 }
 assert.equal(cp.contactOffset(212),0xf1a6);
});
check('Only known metadata/channel/zone/scan/contact pages differ',()=>{
 const allowed=new Set([8,15,17,33,34,35]);
 for(let i=0;i<cp.bytes.length;i++) if(cp.bytes[i]!==original[i])
  assert(allowed.has(Math.floor(i/4096)),`unexpected modified page at 0x${i.toString(16)}`);
});
check('Mismatches with CPS are restricted to known edited pages',()=>{
 let mismatches=0;
 for(let i=0;i<cp.bytes.length;i++) if(cp.bytes[i]!==official.bytes[i]){
  mismatches++;
  assert([8,15,17,33,34,35].includes(Math.floor(i/4096)),`unexpected mismatch at ${i}`);
 }
 assert(mismatches<300,`too many binary differences: ${mismatches}`);
 console.log(`  ${mismatches} differing bytes of ${cp.bytes.length}; CPS leaves some stale/opaque fields`);
});
check('Delete middle channel across page 84/85 and re-add to vacant slot',()=>{
 const p=fresh(),c85=p.channel(85),c86=p.channel(86),dmr=p.channel(216);
 p.deleteChannel(84);
 assert.equal(p.channel(84).name,c85.name);
 assert.equal(p.channel(85).name,c86.name);
 assert.equal(p.channel(215).name,dmr.name);
 const idx=p.addChannel(1);assert.equal(idx,216);
 assert.equal(p.channel(216).name,'NEW-216');assert.deepEqual(p.validate(),[]);
});
check('Deleting first and last channel is safe, restores appendability',()=>{
 const p=fresh();const last=p.channel(216).name;
 p.deleteChannel(1);assert.equal(p.channel(1).name,'PMR-02');
 p.deleteChannel(215);assert.equal(p.channelCount,214);assert.notEqual(p.channel(214).name,last);
 assert.equal(p.addChannel(1),215);assert.deepEqual(p.validate(),[]);
});
check('Deleting scan #2 clears that channel scan index and compacts later ones',()=>{
 const p=fresh();p.setChannel(1,{scanIndex:2});p.setChannel(2,{scanIndex:3});p.setChannel(3,{scanIndex:1});
 p.deleteList('scan',2);
 assert.equal(p.channel(1).scanIndex,0);assert.equal(p.channel(2).scanIndex,2);assert.equal(p.channel(3).scanIndex,1);
});
check('Deleting a middle zone preserves next name and contents; add again',()=>{
 const p=fresh(),next=p.zone(3);
 p.deleteList('zone',2);assert.equal(p.zone(2).name,next.name);assert.deepEqual(p.zone(2).members,next.members);
 assert.equal(p.addZone(),26);assert.deepEqual(p.validate(),[]);
});
check('Deleting a middle scan preserves next name/priority bytes; add again',()=>{
 const p=fresh(),next=p.scan(3),raw=p.bytes.slice(next.offset+11,next.offset+26);
 p.deleteList('scan',2);assert.equal(p.scan(2).name,next.name);
 assert.deepEqual([...p.bytes.slice(p.scanOffset(2)+11,p.scanOffset(2)+26)],[...raw]);
 assert.equal(p.addScan(),28);assert.deepEqual(p.validate(),[]);
});
check('Bad indices rejected and leave image unchanged',()=>{
 let p=fresh();assert.throws(()=>p.deleteChannel(0));assert.throws(()=>p.deleteChannel(217));
 assert.throws(()=>p.deleteList('zone',0));assert.throws(()=>p.deleteList('scan',29));
 assert.deepEqual([...p.save()],[...original]);
});
console.log('All CPS deletion regression tests passed.');
