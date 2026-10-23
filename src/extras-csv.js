/* CSV adapter for v6 DMR lists. Existing CSV formats remain backward-compatible. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./csv.js'):root.DM32CSV,
 typeof module==='object'&&module.exports?require('./core.js'):root.DM32Core);
 if(typeof module==='object'&&module.exports)module.exports=api;else root.DM32CSV=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(csv,core){
'use strict';
const baseExport=csv.exportCSV,basePrepare=csv.prepare;
csv.HEADERS.talkgroups=['Number','Name','DMR ID','Call Type'];
csv.HEADERS.rxgroups=['Number','Name','DMR IDs'];
function assert(c,m){if(!c)throw Error(m)}
function safePositive(v,label){assert(/^\d+$/.test(String(v)),label+' must be a positive integer');const n=Number(v);assert(Number.isSafeInteger(n)&&n>0,label+' invalid');return n}
csv.exportCSV=function(cp,type){if(type==='talkgroups')return csv.stringify([csv.HEADERS.talkgroups,...cp.talkGroups().map(t=>[t.id,t.name,t.dmrId,t.callType===4?'Group':t.callType===3?'Private':'All'])]);
 if(type==='rxgroups')return csv.stringify([csv.HEADERS.rxgroups,...cp.rxGroups().map(g=>[g.id,g.name,g.members.join(';')])]);return baseExport(cp,type)};
csv.prepare=function(cp,type,source){if(type!=='talkgroups'&&type!=='rxgroups')return basePrepare(cp,type,source);
 const parsed=csv.parse(source),required=csv.HEADERS[type].map(s=>s.toLowerCase());for(const col of required)assert(parsed.columns.includes(col),'Missing CSV column '+col);
 assert(parsed.entries.length,'CSV is empty');const trial=new core.Codeplug(cp.bytes),initial=type==='talkgroups'?trial.getTalkCount():trial.rxCount();
 let added=0,changedRecords=0,unchanged=0;const seen=new Set();const items=parsed.entries.map(r=>({row:r.values,line:r.line,n:safePositive(r.values.number,'Row '+r.line+' Number')})).sort((a,b)=>a.n-b.n);
 for(const {row,line,n} of items){assert(!seen.has(n),'Duplicate record #'+n);seen.add(n);
 try{
  if(type==='talkgroups'){
   let typeCode={'private':3,'private call':3,'group':4,'group call':4,'all':5,'all call':5}[row['call type'].toLowerCase()];assert(typeCode!==undefined,'Invalid call type');const val={name:row.name,dmrId:safePositive(row['dmr id'],'DMR ID'),callType:typeCode};
   if(n===trial.getTalkCount()+1){trial.addTalkGroup(val);added++}
   else{assert(n<=trial.getTalkCount(),'Cannot skip Talk Group #'+n);trial.setTalkGroup(n,val)}
  }else{
   const ids=row['dmr ids'].trim()?row['dmr ids'].split(/\s*[;|]\s*/).filter(Boolean).map(x=>safePositive(x,'DMR ID')):[];
   if(n===trial.rxCount()+1){trial.addRxGroup({name:row.name,members:ids});added++}
   else{assert(n<=trial.rxCount(),'Cannot skip RX group #'+n);trial.setRxGroup(n,{name:row.name,members:ids})}
  }
 }catch(err){throw Error('CSV row '+line+': '+err.message)}
 }
 for(const {n}of items){let p,len;if(type==='talkgroups'){p=trial.tgOffset(n);len=24}else{p=trial.rxOffset(n);len=109}if(n>initial||trial.bytes.subarray(p,p+len).some((x,i)=>x!==cp.bytes[p+i]))changedRecords++;else unchanged++}
 const changedBytes=trial.bytes.reduce((count,v,i)=>count+(v!==cp.bytes[i]?1:0),0);
 return {type,rows:items.length,added,changedRecords,unchanged,changedBytes,bytes:trial.bytes};
};return csv
});
