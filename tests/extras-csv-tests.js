const assert=require('assert/strict'),fs=require('fs'),{Codeplug}=require('../src/core.js');require('../src/extras.js');const csv=require('../src/extras-csv.js');
let original=fs.readFileSync('/mnt/data/DMR-10-22-26-new.data');let cp=new Codeplug(original);
for(const type of ['talkgroups','rxgroups']){let exported=csv.exportCSV(cp,type);let result=csv.prepare(cp,type,exported);assert.equal(result.changedBytes,0);assert.deepEqual(result.bytes,cp.bytes);console.log('PASS roundtrip',type)}
const data=csv.exportCSV(cp,'talkgroups').replace('"TG268-PT"','"NEW-TG"');let prep=csv.prepare(cp,'talkgroups',data);let changed=new Codeplug(prep.bytes);assert.equal(changed.talkGroup(2).name,'NEW-TG');console.log('PASS TG CSV import');
const rxcsv=csv.exportCSV(cp,'rxgroups').replace('"268;9"','"268;9;226"');let prep2=csv.prepare(cp,'rxgroups',rxcsv);let updated=new Codeplug(prep2.bytes);assert.deepEqual(updated.rxGroup(1).members,[268,9,226]);console.log('PASS RX CSV import');
assert.throws(()=>csv.prepare(cp,'talkgroups',data.replace('"NEW-TG"','"TG226-RO"').replace('"268"','"226"')));console.log('PASS atomic validation');
