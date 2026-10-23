/* Scan-list assignment mapping and deletion regressions. Run using the supplied CPS .data. */
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {Codeplug,SCAN_INDEX_MASK}=require('../src/core.js');
const CSV=require('../src/csv.js');
const fixture=fs.readFileSync(process.argv[2]||process.env.DM32_TEST_CODEPLUG);
const fresh=()=>new Codeplug(fixture);
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name)}
test('Scan index occupies low six bits of byte +0x19; preserve bandwidth and Auto Scan',()=>{
  assert.equal(SCAN_INDEX_MASK,0x3f);
  const c=fresh();c.setChannel(1,{bandwidth:25,scanAdd:true});
  const p=c.chOffset(1)+25,before=c.bytes[p];
  c.setChannel(1,{scanIndex:28});
  assert.equal(c.bytes[p],(before&0xc0)|28);assert.equal(c.channel(1).scanIndex,28);
  assert.equal(c.channel(1).bandwidth,25);assert.equal(c.channel(1).scanAdd,true);
  c.setChannel(1,{scanIndex:0});assert.equal(c.bytes[p],before);
  assert.deepEqual(c.validate(),[]);
});
test('Deleting list #2 makes exact matches None and shifts every larger list, including >15',()=>{
  const c=fresh();for(let n=1;n<=7;n++)c.setChannel(n,{scanIndex:[0,1,2,3,15,16,28][n-1]});
  c.setChannel(3,{scanAdd:true,bandwidth:25});
  const names=Object.fromEntries([1,3,15,16,28].map(x=>[x,c.scan(x).name]));
  const oldRaw=c.bytes[c.chOffset(3)+25];
  c.deleteList('scan',2);
  const expected=[0,1,0,2,14,15,27];
  for(let id=1;id<=7;id++)assert.equal(c.channel(id).scanIndex,expected[id-1],`channel #${id}`);
  assert.equal(c.bytes[c.chOffset(3)+25],oldRaw&0xc0);
  for(const n of [1,3,15,16,28])assert.equal(c.scan(n>2?n-1:n).name,names[n]);
  assert.deepEqual(c.validate(),[]);
});
test('Delete middle and last lists; no dangling assignments, no fake replacement by number',()=>{
  const c=fresh();
  c.setChannel(1,{scanIndex:1});c.setChannel(2,{scanIndex:10});c.setChannel(3,{scanIndex:28});
  c.deleteList('scan',10);
  assert.deepEqual([c.channel(1).scanIndex,c.channel(2).scanIndex,c.channel(3).scanIndex],[1,0,27]);
  c.deleteList('scan',27);
  assert.deepEqual([c.channel(1).scanIndex,c.channel(2).scanIndex,c.channel(3).scanIndex],[1,0,0]);
  assert.equal(c.scanCount,26);
});
test('Supports all 32 list IDs and encodes list #32 without touching flag bits',()=>{
  const c=fresh();for(let id=29;id<=32;id++)assert.equal(c.addScan(),id);
  c.setChannel(1,{scanIndex:32,bandwidth:25,scanAdd:true});
  const p=c.chOffset(1)+25;
  assert.equal(c.bytes[p],0xe0);assert.equal(c.channel(1).scanIndex,32);
  const snapshot=c.save();const reopened=new Codeplug(snapshot);
  assert.equal(reopened.channel(1).scanIndex,32);
  c.deleteList('scan',31);
  assert.equal(c.channel(1).scanIndex,31);
  assert.equal(c.bytes[p],0xdf);
  assert.deepEqual(c.validate(),[]);
});
test('Reject nonexistent scan ID and preserve original bytes on error',()=>{
  const c=fresh();assert.throws(()=>c.setChannel(1,{scanIndex:29}),/must be None or an existing list/);
  assert.deepEqual(Buffer.from(c.save()),fixture);
});
test('Channel CSV Scan List name/index roundtrip and backwards compatibility',()=>{
  const c=fresh();c.setChannel(1,{scanIndex:2});c.setChannel(2,{scanIndex:28});
  const csv=CSV.exportCSV(c,'channels');
  assert.match(csv,/"Scan List"/);assert.match(csv,/#28 · /);
  const unchanged=CSV.prepare(c,'channels',csv);
  assert.equal(unchanged.changedBytes,0);
  const byName=CSV.prepare(c,'channels','Number,Name,RX MHz,Scan List\n1,PMR-01,446.00625,'+c.scan(5).name+'\n');
  assert.equal(new Codeplug(byName.bytes).channel(1).scanIndex,5);
  const byOldIndex=CSV.prepare(c,'channels','Number,Name,RX MHz,Scan index\n1,PMR-01,446.00625,3\n');
  assert.equal(new Codeplug(byOldIndex.bytes).channel(1).scanIndex,3);
  assert.throws(()=>CSV.prepare(c,'channels','Number,Name,RX MHz,Scan List\n1,PMR-01,446.00625,#29\n'),/does not exist/);
});
console.log(`${passed} scan-index tests passed`);
