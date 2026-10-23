/* DM32.NRF.01.049 add-on: key configuration, active TX talk groups and DMR RX groups.
 * No external dependencies. Writes are span-precise and preserve unknown bytes.
 * NOTE: the CPS disk's active-TG index page at 0x1b000 has no logical-page ID;
 * never infer that by scanning for page ID 0x0B. This is gated to this fixture.
 */
(function(root, factory) {
  const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.DM32Core);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.DM32Extras=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(core){
'use strict';
const {Codeplug,readLE,writeLE}=core, P=Codeplug.prototype;
const FUN=['None','Power Select','Volt','Talkaround','Digital Encrypt','Call','VOX','V/M','Alarm',
 'One Touch Call 1','One Touch Call 2','One Touch Call 3','One Touch Call 4','One Touch Call 5','SMS',
 'CSV Contacts','Zone Up','Zone Down','Scan','Record Switch','Previous Record','Next Record','FM Radio',
 'FM Search','GPS Information','Monitor','Switch Main Channel','Lone Work','Keypad Lock',
 'Nuisance Channel Delete','TBST Send','APRS Send','Channel Type','Display Mode','CTC Scan',
 'CTC Setting','Silent Tone','Roaming','Sub-PTT','Analog Scramble Switch','One Key Scan Freq',
 'Flashlight','Man Down Alarm'];
const KEY_FIELDS={sk1Short:0x87,sk1Long:0x88,sk2Short:0x89,sk2Long:0x8a,p1Short:0x8d,p1Long:0x8e,p2Short:0x8f,p2Long:0x90};
const assert=(cond,message)=>{if(!cond)throw Error(message)};
const u24=(b,p)=>b[p]+b[p+1]*256+b[p+2]*65536;
const put24=(b,p,n)=>{assert(Number.isInteger(n)&&n>=0&&n<=0xffffff,'DMR ID must fit 24 bits');b[p]=n&255;b[p+1]=n>>8&255;b[p+2]=n>>16&255};
function text(b,p,len){let s='';for(let i=0;i<len;i++){let x=b[p+i];if(x===0||x===255)break;s+=x>=32&&x<127?String.fromCharCode(x):'�'}return s}
function name(b,p,len,s){assert(typeof s==='string'&&s.length>0&&s.length<=len&&/^[\x20-\x7E]+$/.test(s),'Name must be 1–'+len+' printable ASCII characters');const before=text(b,p,len);if(before===s)return;for(let i=0;i<len;i++)b[p+i]=i<s.length?s.charCodeAt(i):i===s.length?0:b[p+i]===0?0:255}
function unchanged(a,b){return Object.entries(b).every(([k,v])=>String(a[k])===String(v))}
P.keys=function(){const b=this.bytes,p=this.block(0x04),flags=b[p+0x85],result={lockKey:!!(flags&1),knobLock:!!(flags&2),sideKeyLock:!!(flags&4),lockDelay:b[p+0x86],longPress:b[p+0x93]+1};for(const [key,rel]of Object.entries(KEY_FIELDS))result[key]=b[p+rel];return result};
P.setKeys=function(patch){assert(patch&&typeof patch==='object','Invalid keys');if(unchanged(this.keys(),patch))return 0;return this.change('Key and lock settings',()=>{const b=this.bytes,p=this.block(0x04);for(const [k,v]of Object.entries(patch)){
  if(['lockKey','knobLock','sideKeyLock'].includes(k)){assert(typeof v==='boolean','Expected a boolean for '+k);let bit={lockKey:1,knobLock:2,sideKeyLock:4}[k];b[p+0x85]=(b[p+0x85]&~bit)|(v?bit:0)}
  else if(k==='lockDelay'){assert(Number.isInteger(v)&&v>=5&&v<=60,'Keypad lock delay must be 5–60 seconds');b[p+0x86]=v}
  else if(k==='longPress'){assert(Number.isInteger(v)&&v>=1&&v<=5,'Long press time is 1–5');b[p+0x93]=v-1}
  else if(Object.hasOwn(KEY_FIELDS,k)){assert(Number.isInteger(v)&&v>=0&&v<FUN.length,'Unsupported key function');b[p+KEY_FIELDS[k]]=v}
  else throw Error('Unknown key setting '+k)
}})};
// Only the four TGs from the OEM CPS index are active in the supplied file;
// entries 5–10 are unindexed factory templates. Page 0x1B000 is untagged.
P.tgIndexBase=function(){const p=this.block(0x44)-4096,b=this.bytes;
 assert(p>=0&&b[p+0x10]!==undefined&&readLE(b,p)<=128,'Active talk-group index unavailable');
 const count=readLE(b,p);assert(count<=10,'Talk-group index needs additional layout verification');
 assert(count===0||(b[p+0x100]>=1&&b[p+0x100]<=count),'Unexpected talk-group index layout')
 return p;
};
P.getTalkCount=function(){return readLE(this.bytes,this.tgIndexBase())};
P.tgOffset=function(n){assert(Number.isInteger(n)&&n>=1&&n<=10,'Talk-group physical slot outside verified range');return this.block(0x44)+1+(n-1)*24};
P.talkGroup=function(n){assert(n<=this.getTalkCount(),'Talk group missing');const b=this.bytes,p=this.tgOffset(n);return {id:n,name:text(b,p+1,16),dmrId:u24(b,p+18),callType:b[p+21],offset:p}};
P.talkGroups=function(){return Array.from({length:this.getTalkCount()},(_,i)=>this.talkGroup(i+1))};
P.rebuildTalkIndex=function(){const b=this.bytes,base=this.tgIndexBase(),items=this.talkGroups(),n=items.length;
 writeLE(b,base,n);writeLE(b,base+2,items.filter(x=>x.callType===4).length);
 // Byte +4 is explicitly undocumented: preserve. Only active slot bits are changed.
 for(let i=0;i<10;i++){let o=base+0x10+(i>>3),mask=1<<(i%8);b[o]=i<n?(b[o]&~mask):(b[o]|mask)}
 const type=x=>x.callType<<4;
 const tables=[{start:0x100,sorted:[...items].sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'variant'})||a.id-b.id)},
  {start:0x740,sorted:[...items].sort((a,b)=>a.dmrId-b.dmrId||a.id-b.id)}];
 for(const {start,sorted}of tables)for(let i=0;i<10;i++){
   const off=base+start+i*2;
   if(i<n){b[off]=sorted[i].id;b[off+1]=type(sorted[i])}
   else if(i===n){b[off]=255;b[off+1]=255} // first inactive entry only
 }
};
P.replaceRxMemberId=function(oldId,newId){for(const g of this.rxGroups())if(g.members.includes(oldId))this.writeRxMembers(g.id,g.members.flatMap(v=>v===oldId?(newId?[newId]:[]):[v]))};
P.setTalkGroup=function(n,patch){const before=this.talkGroup(n);if(unchanged(before,patch))return 0;
 return this.change('Talk group #'+n,()=>{let p=this.tgOffset(n),b=this.bytes;
  if(Object.hasOwn(patch,'name'))name(b,p+1,16,patch.name);
  if(Object.hasOwn(patch,'dmrId')){const v=Number(patch.dmrId);assert(Number.isInteger(v)&&v>0&&v<=0xffffff,'Invalid DMR ID');put24(b,p+18,v);if(v!==before.dmrId)this.replaceRxMemberId(before.dmrId,v)}
  if(Object.hasOwn(patch,'callType')){assert([3,4,5].includes(Number(patch.callType)),'Call type must be Private / Group / All');b[p+21]=Number(patch.callType)}
  assert(this.talkGroups().every((t,i,a)=>t.name&&t.dmrId>0&&a.findIndex(v=>v.dmrId===t.dmrId)===i),'Talk groups must have unique DMR IDs and nonempty names');
  this.rebuildTalkIndex();
 })};
P.addTalkGroup=function(data){const n=this.getTalkCount()+1;assert(n<=10,'Cannot add beyond the 10 verified physical slots in this CPS image');
 return this.change('Add talk group #'+n,()=>{const b=this.bytes,p=this.tgOffset(n);assert(b[p+21]>=0&&b[p+21]<=5,'Next talk-group slot contains unfamiliar data');
 const v=Number(data.dmrId),call=Number(data.callType);assert(Number.isInteger(v)&&v>=1&&v<=0xffffff,'Invalid DMR ID');assert([3,4,5].includes(call),'Invalid call type');
 name(b,p+1,16,data.name);put24(b,p+18,v);b[p+21]=call;writeLE(b,this.tgIndexBase(),n);
 assert(this.talkGroups().every((t,i,a)=>t.name&&a.findIndex(z=>z.dmrId===t.dmrId)===i),'Duplicate DMR ID');this.rebuildTalkIndex();return n})};
P.deleteTalkGroup=function(n){assert(n>=1&&n<=this.getTalkCount(),'Bad talk group');
 return this.change('Delete talk group #'+n,()=>{const b=this.bytes,count=this.getTalkCount(),removed=this.talkGroup(n);assert(count>1,'Keep at least one talk group');
 for(let i=n;i<count;i++)b.set(b.slice(this.tgOffset(i+1),this.tgOffset(i+1)+24),this.tgOffset(i));
 // Do not destroy the now-unindexed physical entry (CPS leaves template records).
 writeLE(b,this.tgIndexBase(),count-1);
 for(let ch=1;ch<=this.channelCount;ch++){
  const at=this.contactOffset(ch),old=((b[at]>>4)<<8)|b[at+1];
  const next=old===n?0:(old>n&&old<=count?old-1:old);
  if(old!==next){b[at]=(b[at]&15)|((next>>8)<<4);b[at+1]=next&255}
 }
 if(!this.talkGroups().some(g=>g.dmrId===removed.dmrId))this.replaceRxMemberId(removed.dmrId,0);
 this.rebuildTalkIndex();})};
P.rxMask=function(){const b=this.bytes,p=this.block(0x0f);return (b[p]|b[p+1]<<8|b[p+2]<<16|b[p+3]<<24)>>>0};
P.rxCount=function(){let m=this.rxMask(),n=0;while(m){n++;m=Math.floor(m/2)}return n};
P.rxOffset=function(n){assert(Number.isInteger(n)&&n>=1&&n<=32,'Invalid RX group slot');return this.block(0x0f)+0x11+(n-1)*109};
P.rxGroup=function(n){assert(n<=this.rxCount()&&(this.rxMask()&(2**(n-1)))!==0,'RX group slot not active');const b=this.bytes,p=this.rxOffset(n),members=[];for(let i=0;i<32;i++){let v=u24(b,p+11+i*3);if(v===0||v===0xffffff)break;members.push(v)}return {id:n,name:text(b,p,11),members,offset:p}};
P.rxGroups=function(){return Array.from({length:this.rxCount()},(_,i)=>i+1).filter(n=>(this.rxMask()&(2**(n-1)))!==0).map(n=>this.rxGroup(n))};
P.writeRxMembers=function(n,members){assert(Array.isArray(members)&&members.length<=32,'RX group capacity is 32 DMR IDs');const b=this.bytes,p=this.rxOffset(n),seen=new Set();for(let i=0;i<32;i++){
  const v=i<members.length?Number(members[i]):0;
  assert(Number.isInteger(v)&&v>=0&&v<=0xffffff&&(i>=members.length||v>0&&v<0xffffff),'Invalid RX group DMR ID');
  if(i<members.length){assert(!seen.has(v),'Duplicate RX group ID');seen.add(v)}put24(b,p+11+i*3,v)
 }};
P.setRxGroup=function(n,patch){const existing=this.rxGroup(n);if((!Object.hasOwn(patch,'members')||JSON.stringify(existing.members)===JSON.stringify(patch.members))&&unchanged(existing,Object.fromEntries(Object.entries(patch).filter(([k])=>k!=='members'))))return 0;
 return this.change('RX group #'+n,()=>{const p=this.rxOffset(n);if(Object.hasOwn(patch,'name'))name(this.bytes,p,10,patch.name);if(Object.hasOwn(patch,'members'))this.writeRxMembers(n,patch.members)})};
P.addRxGroup=function(data){const n=this.rxCount()+1;assert(n<=32,'Maximum 32 RX groups');assert(this.rxMask()===2**(n-1)-1,'Sparse RX group mask; refusing to compact');
 return this.change('Add RX group #'+n,()=>{let p=this.rxOffset(n),b=this.bytes;
  name(b,p,10,data.name||('RX-'+n));this.writeRxMembers(n,data.members||[]);
  const m=(this.rxMask()|2**(n-1))>>>0,base=this.block(0x0f);
  for(let i=0;i<4;i++)b[base+i]=(m>>>(8*i))&255;
 })};
P.deleteRxGroup=function(n){assert(n<=this.rxCount(),'Invalid RX group');return this.change('Delete RX group #'+n,()=>{let count=this.rxCount(),b=this.bytes,base=this.block(0x0f);assert(this.rxMask()===2**count-1,'Sparse RX group mask; refusing to compact');
 for(let i=n;i<count;i++)b.set(b.slice(this.rxOffset(i+1),this.rxOffset(i+1)+109),this.rxOffset(i));
 let m=count-1===0?0:(2**(count-1)-1)>>>0;for(let i=0;i<4;i++)b[base+i]=(m>>>(i*8))&255;
 for(let i=1;i<=this.channelCount;i++){const c=this.channel(i);if(c.digital&&c.rxGroup>=n){const p=this.chOffset(i)+31,old=b[p]&63,now=old===n?0:old-1;b[p]=(b[p]&~63)|now}}
 })};
P.txTalkIndex=function(n){const b=this.bytes,p=this.contactOffset(n);return ((b[p]>>4)<<8)|b[p+1]};
const channel=P.channel;P.channel=function(n){let c=channel.call(this,n);c.txContact=c.digital?this.txTalkIndex(n):null;return c};
const patchChannel=P.writeChannelPatch;P.writeChannelPatch=function(n,patch){if(Object.hasOwn(patch,'txContact')){
 const value=Number(patch.txContact),c=this.channel(n);
 assert(c.digital,'TX talk group assignment applies to DMR channels only');
 assert(Number.isInteger(value)&&value>=0&&value<=this.getTalkCount(),'Unknown talk group assignment #'+value);
 const p=this.contactOffset(n),b=this.bytes;b[p]=(b[p]&15)|((value>>8)<<4);b[p+1]=value&255;
 patch={...patch};delete patch.txContact;
 }if(Object.keys(patch).length)patchChannel.call(this,n,patch)
};
const validate=P.validate;P.validate=function(){const issues=validate.call(this);try{
 const rx=this.rxGroups(),tgs=this.talkGroups(),rxIds=new Set(rx.map(x=>x.id));
 for(let ch=1;ch<=this.channelCount;ch++){const c=this.channel(ch);if(c.digital){if(c.rxGroup&&!rxIds.has(c.rxGroup))issues.push('DMR channel #'+ch+' references missing RX group #'+c.rxGroup);if(c.txContact>tgs.length)issues.push('DMR channel #'+ch+' references missing TX talk group #'+c.txContact)}}
 for(const g of rx)if(g.members.length>32)issues.push('RX group #'+g.id+' exceeds 32 IDs');
 }catch(e){issues.push('DMR group validation: '+e.message)}return issues
};
return {FUN,KEY_FIELDS};
});
