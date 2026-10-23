/* DM-32UV CPS .data byte-preserving editor, layout DM32.NRF.01.049.
 * No dependencies; works in browsers and Node 18+.
 * Unsupported/opaque bytes are never synthesized during ordinary edits.
 * Source: DM32-Protocol-Spec/05-DATA-STRUCTURES.md + 06-ENCODING.md
 * IMPORTANT: CPS disk logical block ID is at last byte of each 4096-byte page.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DM32Core = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const PAGE=4096, CHANNEL_SIZE=48, ZONE_SIZE=145, SCAN_SIZE=57;
  const MAX_CHANNEL=3998, MAX_ZONE=250, MAX_SCAN=32;
  // Updated DM32 reverse engineering: channel byte +0x19 bits 0..5 are the
  // scan-list ID (0=None; 1..32 in CPS). Bits 6/7 are independent flags.
  const SCAN_INDEX_MASK=0x3f;
  const SUPPORTED='DM32.NRF.01.049';
  const CTCSS=[67,69.3,71.9,74.4,77,79.7,82.5,85.4,88.5,91.5,94.8,97.4,100,103.5,107.2,110.9,114.8,118.8,123,127.3,131.8,136.5,141.3,146.2,151.4,156.7,159.8,162.2,165.5,167.9,171.3,173.8,177.3,179.9,183.5,186.2,189.9,192.8,196.6,199.5,203.5,206.5,210.7,218.1,225.7,229.1,233.6,241.8,250.3,254.1];
  const DCS='023 025 026 031 032 036 043 047 051 053 054 065 071 072 073 074 114 115 116 122 125 131 132 134 143 145 152 155 156 162 165 172 174 205 212 223 225 226 243 244 245 246 251 252 255 261 263 265 266 271 274 306 311 315 325 331 332 343 346 351 356 364 365 371 411 412 413 423 431 432 445 446 452 454 455 462 464 465 466 503 506 516 523 526 532 546 565 606 612 624 627 631 632 654 662 664 703 712 723 731 732 734 743 754'.split(' ');
  function invariant(x,m){if(!x)throw Error(m)}
  function readLE(b,p){return b[p]|(b[p+1]<<8)}
  function writeLE(b,p,n){invariant(Number.isInteger(n)&&n>=0&&n<65536,'Invalid 16-bit value');b[p]=n&255;b[p+1]=n>>8}
  function asBytes(input){return input instanceof Uint8Array?new Uint8Array(input):new Uint8Array(input)}
  function str(b,p,length){let s='';for(let i=0;i<length;i++){let v=b[p+i];if(v===0||v===255)break;s+=v>=32&&v<127?String.fromCharCode(v):'�'}return s}
  function setStr(b,p,len,s){invariant(typeof s==='string'&&/^[\x20-\x7E]*$/.test(s),'Names must contain printable ASCII only');invariant(s.length<=len,'Name too long (maximum '+len+' characters)');for(let i=0;i<len;i++) b[p+i]=i<s.length?s.charCodeAt(i):(i===s.length?0:255)}
  function decodeFreq(b,p){if(b.slice(p,p+4).every(x=>x===255))return null;let value=0;for(let i=3;i>=0;i--){let x=b[p+i],hi=x>>4,lo=x&15;invariant(hi<=9&&lo<=9,'Invalid BCD frequency at 0x'+p.toString(16));value=value*100+hi*10+lo;}return value/100000}
  function encodeFreq(b,p,s,allowNone=false){if(s===null||s===''){invariant(allowNone,'RX frequency required');b.fill(255,p,p+4);return}
    let n=typeof s==='number'?Math.round(s*1e5):parseMHz(s); invariant(n>0&&n<=99999999,'Frequency must be between 0 and 999.99999 MHz');
    let digs=String(n).padStart(8,'0');for(let i=0;i<4;i++)b[p+i]=(Number(digs[6-i*2])<<4)|Number(digs[7-i*2]); }
  function parseMHz(v){let s=String(v).trim();invariant(/^\d{1,3}(?:\.\d{1,5})?$/.test(s),'Use a frequency such as 145.50000 (max five decimals)');let [a,d='']=s.split('.');let n=Number(a)*100000+Number(d.padEnd(5,'0'));invariant(n>0&&n<=99999999,'Invalid frequency');return n}
  function decodeTone(b,p){let a=b[p],z=b[p+1];if((a===255&&z===255)||(a===0&&z===0))return 'None';if(z>=0x80){let h=z&15,t=a>>4,o=a&15; if(h>7||t>7||o>7) return 'Unknown';return 'D'+h+t+o+(z>=0xC0?'I':'N')}
    let digits=[z>>4,z&15,a>>4,a&15];if(digits.some(x=>x>9))return 'Unknown';return String(((digits[0]*1000+digits[1]*100+digits[2]*10+digits[3])/10).toFixed(1));}
  function encodeTone(b,p,val){let s=String(val??'None').trim();if(s==='None'){b[p]=255;b[p+1]=255;return}const m=s.match(/^D([0-7]{3})([NI])$/i);if(m){invariant(DCS.includes(m[1]),'Unknown DCS code');b[p]=(Number(m[1][1])<<4)|Number(m[1][2]);b[p+1]=(m[2].toUpperCase()==='I'?0xC0:0x80)|Number(m[1][0]);return}
    invariant(/^\d{2,3}(?:\.\d)?$/.test(s),'Invalid CTCSS tone');const n=Math.round(Number(s)*10);invariant(CTCSS.some(x=>Math.round(x*10)===n),'CTCSS tone not standard');const d=String(n).padStart(4,'0');b[p]=(Number(d[2])<<4)|Number(d[3]);b[p+1]=(Number(d[0])<<4)|Number(d[1]);}
  function bset(b,p,mask,v){b[p]=(b[p]&(~mask&255))|(v&mask)}
  function pageMap(b){const m=new Map();for(let o=0;o<b.length;o+=PAGE){let id=b[o+PAGE-1];if(id===0||id===255)continue;invariant(!m.has(id),'Duplicate logical page ID 0x'+id.toString(16));m.set(id,o)}return m}
  class Codeplug {
    constructor(input){this.original=asBytes(input);this.bytes=this.original.slice();this.audit=[];this.checkLayout()}
    checkLayout(){const b=this.bytes;invariant(b.length===659456,'Unsupported file length '+b.length+' (expected 659456 for this CPS image)');this.firmware=str(b,0x30,32);invariant(this.firmware===SUPPORTED,'Unsupported firmware family: '+this.firmware+' (requires '+SUPPORTED+')');this.pages=pageMap(b);for(const x of [0x11,0x12,0x5c])invariant(this.pages.has(x),'Missing logical block 0x'+x.toString(16));const nc=this.channelCount,nz=this.zoneCount,ns=this.scanCount;invariant(nc>=1&&nc<=MAX_CHANNEL,'Suspicious channel count '+nc);invariant(nz>=0&&nz<=MAX_ZONE,'Suspicious zone count '+nz);invariant(ns>=0&&ns<=MAX_SCAN,'Suspicious scan count '+ns);for(let i=1;i<=nc;i++)this.chOffset(i);for(let i=1;i<=nz;i++)this.zoneOffset(i);for(let i=1;i<=ns;i++)this.scanOffset(i);}
    block(id){let v=this.pages.get(id);invariant(v!==undefined,'Missing block ID 0x'+id.toString(16));return v}
    get channelCount(){return readLE(this.bytes,this.block(0x12))} get zoneCount(){return this.bytes[this.block(0x5c)]} get scanCount(){return this.bytes[this.block(0x11)]}
    chOffset(n){invariant(Number.isInteger(n)&&n>=1&&n<=MAX_CHANNEL,'Bad channel number '+n);let bank,local;if(n<=84){bank=0x12;local=16+(n-1)*48}else{bank=0x13+Math.floor((n-85)/85);local=((n-85)%85)*48}invariant(local+48<=4095,'Channel overlaps page ID');return this.block(bank)+local}
    zoneOffset(n){invariant(Number.isInteger(n)&&n>=1&&n<=MAX_ZONE,'Bad zone number');let bank=0x5c+Math.floor((n-1)/28),index=(n-1)%28,local=(bank===0x5c?16:0)+index*145;invariant(local+145<=4095,'Zone overlaps page ID');return this.block(bank)+local}
    scanOffset(n){invariant(Number.isInteger(n)&&n>=1&&n<=MAX_SCAN,'Bad scan list number');const local=1+(n-1)*57;invariant(local+57<=4095,'Scan overlaps page ID');return this.block(0x11)+local}
    channel(n){invariant(n<=this.channelCount,'Channel not present');const p=this.chOffset(n),b=this.bytes,mode=b[p+24]>>4,digital=!!(mode&1);return {id:n,name:str(b,p,16),rx:decodeFreq(b,p+16),tx:decodeFreq(b,p+20),mode,power:(b[p+24]>>1)&3,txBlocked:!!(b[p+24]&8),bandwidth:(b[p+25]&128)?25:12.5,scanAdd:!!(b[p+25]&64),scanIndex:b[p+25]&SCAN_INDEX_MASK,squelch:b[p+28]>>4,rxTone:decodeTone(b,p+33),txTone:decodeTone(b,p+35),digital,color: digital?(b[p+29]&15):null,timeslot:digital?((b[p+29]&16)?2:1):null,vox:!digital&&!!(b[p+29]&128),scramble:!digital&&!!(b[p+29]&64),compander:!digital&&!!(b[p+29]&32),rxGroup:digital?(b[p+31]&63):null,radioIdIndex:b[p+43],offset:p};}
    zone(n){invariant(n<=this.zoneCount,'Zone missing');const p=this.zoneOffset(n),b=this.bytes;const count=b[p+16];invariant(count<=64,'Invalid zone member count '+count+' in zone '+n);const members=[];for(let i=0;i<count;i++){const v=readLE(b,p+17+i*2);if(v)members.push(v)}return{id:n,name:str(b,p,16),members,offset:p}}
    scan(n){invariant(n<=this.scanCount,'Scan missing');const p=this.scanOffset(n),b=this.bytes,members=[];for(let i=0;i<15;i++){let v=readLE(b,p+26+i*2);if(v&&v!==65535)members.push(v)}return{id:n,name:str(b,p,11),members,countRaw:b[p+11],offset:p,opaque:b.slice(p+21,p+26)}}
    channels(){return Array.from({length:this.channelCount},(_,i)=>this.channel(i+1))}zones(){return Array.from({length:this.zoneCount},(_,i)=>this.zone(i+1))}scans(){return Array.from({length:this.scanCount},(_,i)=>this.scan(i+1))}
    change(note,fn){const before=this.bytes.slice();try{fn();this.validate()}catch(e){this.bytes=before;throw e}let diff=0;for(let i=0;i<this.bytes.length;i++)if(before[i]!==this.bytes[i])diff++;if(diff)this.audit.push({note,bytes:diff});return diff}
    setChannel(n,patch){return this.setChannels([n],patch)}
    // One validated binary transaction for all selected channels. Every target
    // receives only explicitly requested fields; other fields/opaque bytes remain
    // unchanged. If any target is invalid (e.g. DMR vs analog), rollback all.
    setChannels(ids,patch){
      invariant(Array.isArray(ids)&&ids.length>0,'Select at least one channel');
      const unique=[...new Set(ids)];
      for(const n of unique)invariant(Number.isInteger(n)&&n>=1&&n<=this.channelCount,'Channel not present: #'+n);
      invariant(patch&&typeof patch==='object'&&!Array.isArray(patch),'Invalid channel patch');
      if(!Object.keys(patch).length)return 0;
      const needsChange=unique.some(n=>Object.entries(patch).some(([k,v])=>String(this.channel(n)[k])!==String(v)));
      if(!needsChange)return 0;
      return this.change(unique.length===1?'Channel #'+unique[0]:'Bulk edit '+unique.length+' channels ('+Object.keys(patch).join(', ')+')',()=>{
        for(const n of unique)this.writeChannelPatch(n,patch);
      });
    }
    writeChannelPatch(n,patch){const current=this.channel(n);patch=Object.fromEntries(Object.entries(patch).filter(([k,v])=>String(current[k])!==String(v)));const p=this.chOffset(n),b=this.bytes;for(const [field,val] of Object.entries(patch)){
      if(field==='name')setStr(b,p,16,val);
      else if(field==='rx')encodeFreq(b,p+16,val,false);
      else if(field==='tx')encodeFreq(b,p+20,val,true);
      else if(field==='mode'){invariant([0,1,2,3].includes(+val),'Invalid mode');invariant(((b[p+24]>>4)&1)===(+val&1),'Cannot convert analog to DMR or vice versa without updating contact/reference tables');bset(b,p+24,240,(+val)<<4)}
      else if(field==='power'){invariant([0,1,2].includes(+val),'Invalid power');bset(b,p+24,6,(+val)<<1)}
      else if(field==='txBlocked')bset(b,p+24,8,val?8:0);
      else if(field==='bandwidth'){invariant([12.5,25].includes(+val),'Invalid bandwidth');bset(b,p+25,128,(+val===25)?128:0)}
      else if(field==='scanAdd')bset(b,p+25,64,val?64:0);
      else if(field==='scanIndex'){invariant(Number.isInteger(+val)&&+val>=0&&+val<=this.scanCount&&+val<=MAX_SCAN,'Scan list must be None or an existing list (1..'+this.scanCount+')');bset(b,p+25,SCAN_INDEX_MASK,+val)}
      else if(field==='squelch'){invariant(Number.isInteger(+val)&&+val>=0&&+val<=15,'Squelch 0..15');bset(b,p+28,240,(+val)<<4)}
      else if(field==='rxTone'){invariant(!((b[p+24]>>4)&1),'RX tone applies only to analog channels; mixed selection not changed');encodeTone(b,p+33,val)}
      else if(field==='txTone'){invariant(!((b[p+24]>>4)&1),'TX tone applies only to analog channels; mixed selection not changed');encodeTone(b,p+35,val)}
      else if(field==='color'){invariant((b[p+24]>>4)&1,'Color code applies only to digital channels');invariant(Number.isInteger(+val)&&+val>=0&&+val<=15,'Color code 0..15');bset(b,p+29,15,+val)}
      else if(field==='timeslot'){invariant((b[p+24]>>4)&1,'Timeslot applies only to digital channels');invariant([1,2].includes(+val),'Timeslot 1 or 2');bset(b,p+29,16,(+val===2)?16:0)}
      else if(field==='vox'||field==='scramble'||field==='compander'){invariant(!((b[p+24]>>4)&1),'Analog-only flag');const mask={vox:128,scramble:64,compander:32}[field];bset(b,p+29,mask,val?mask:0)}
      else if(field==='rxGroup'){invariant((b[p+24]>>4)&1,'Digital-only field');invariant(Number.isInteger(+val)&&+val>=0&&+val<=63,'RX group index 0..63');bset(b,p+31,63,+val)}
      else throw Error('Unsupported channel field: '+field);
    }}
    setMembers(type,n,members){invariant(type==='zone'||type==='scan','Bad list type');const old=type==='zone'?this.zone(n).members:this.scan(n).members;if(Array.isArray(members)&&old.length===members.length&&old.every((x,i)=>x===members[i]))return 0;return this.change(type+' #'+n+' members',()=>this.writeMembers(type,n,members))}
    writeMembers(type,n,members){const b=this.bytes;let max=type==='zone'?64:15,p=type==='zone'?this.zoneOffset(n):this.scanOffset(n),start=type==='zone'?17:26;invariant(n<=(type==='zone'?this.zoneCount:this.scanCount),'List missing');invariant(Array.isArray(members)&&members.length<=max,'Maximum '+max+' channels per '+type);const seen=new Set();for(const num of members){invariant(Number.isInteger(num)&&num>=1&&num<=this.channelCount,'Invalid channel number '+num);invariant(!seen.has(num),'Duplicate channel #'+num);seen.add(num)}
      if(type==='zone')b[p+16]=members.length;else b[p+11]=members.length+1;
      // Preserve original empty-slot representation where possible.
      const fill=type==='scan'&&readLE(b,p+start+Math.min(max-1,members.length)*2)===65535?65535:0;
      for(let i=0;i<max;i++)writeLE(b,p+start+i*2,i<members.length?members[i]:fill);
    }
    setListName(type,n,name){invariant(type==='zone'||type==='scan','Invalid list type');if((type==='zone'?this.zone(n):this.scan(n)).name===name)return 0;return this.change(type+' #'+n+' name',()=>setStr(this.bytes,type==='zone'?this.zoneOffset(n):this.scanOffset(n),type==='zone'?16:11,name))}
    addChannel(from=1){let newID=this.channelCount+1;this.change('Add analog channel #'+newID,()=>{invariant(newID<=MAX_CHANNEL,'Channel limit reached');const src=this.channel(from);invariant(!src.digital,'Clone an analog channel only; DMR contacts live in a separate block');const b=this.bytes,p=this.chOffset(newID);invariant(b.slice(p,p+CHANNEL_SIZE).every(x=>x===0||x===255),'Next channel slot contains nonempty bytes; refusing overwrite');b.set(b.slice(src.offset,src.offset+CHANNEL_SIZE),p);setStr(b,p,16,'NEW-'+newID);bset(b,p+24,8,8);bset(b,p+25,SCAN_INDEX_MASK,0);writeLE(b,this.block(0x12),newID)});return newID}
    // CPS disk format: channels and their DMR TX-contact selectors are positional.
    // A channel deletion must move BOTH record arrays and remap every reference.
    // Verified against the user's OEM CPS before/after images for deletion of #2.
    contactOffset(n){
      invariant(Number.isInteger(n)&&n>=1&&n<=MAX_CHANNEL,'Bad contact selector slot');
      const perPage=2047, bank=0x42+Math.floor((n-1)/perPage), local=2*((n-1)%perPage);
      invariant(local+2<=4095,'Contact selector overlaps page ID');
      return this.block(bank)+local;
    }
    static shiftedChannel(value,removed){
      return value===removed?0:(value>removed?value-1:value);
    }
    deleteChannel(n){
      invariant(Number.isInteger(n)&&n>=1&&n<=this.channelCount,'Invalid channel number');
      return this.change('Delete channel #'+n+' and compact references',()=>{
        const b=this.bytes, count=this.channelCount;
        // Save referenced arrays before mutating any records.
        const zones=this.zones().map(z=>z.members);
        const scans=this.scans().map(s=>s.members);
        // Move complete 48-byte channel records across 84/85 and 85/86 page seams.
        // Copy the raw bytes, not only the decoded subset: DMR and opaque data belong
        // to the surviving record and must travel with it.
        for(let id=n;id<count;id++)b.set(b.slice(this.chOffset(id+1),this.chOffset(id+1)+CHANNEL_SIZE),this.chOffset(id));
        // OEM CPS maintains a parallel two-byte contact selector per channel in
        // logical block 0x42 (and 0x43 beyond its page capacity).
        for(let id=n;id<count;id++)b.set(b.slice(this.contactOffset(id+1),this.contactOffset(id+1)+2),this.contactOffset(id));
        // Leave empty reusable slots; do not move page headers, IDs or VFO slots.
        b.fill(0,this.chOffset(count),this.chOffset(count)+CHANNEL_SIZE);
        b.fill(255,this.chOffset(count),this.chOffset(count)+16);
        b.fill(0,this.contactOffset(count),this.contactOffset(count)+2);
        writeLE(b,this.block(0x12),count-1);
        // Member numbers are 1-based. The deleted channel is removed, and every
        // larger channel number is decremented while the original order is kept.
        const rebase=items=>items.filter(id=>id!==n).map(id=>id>n?id-1:id);
        zones.forEach((items,i)=>this.writeMembers('zone',i+1,rebase(items)));
        scans.forEach((items,i)=>this.writeMembers('scan',i+1,rebase(items)));
        // Scan list +0x0F/+0x11/+0x13 are channel selectors in this CPS sample.
        // Unlike the opaque +0x15..+0x19 span, keep these alongside their channel.
        for(let i=1;i<=this.scanCount;i++){
          const p=this.scanOffset(i);
          for(const rel of [15,17,19]){
            const v=readLE(b,p+rel);
            if(v>0&&v!==65535&&v<=count)writeLE(b,p+rel,Codeplug.shiftedChannel(v,n));
          }
        }
      });
    }
    deleteList(type,n){
      invariant(type==='zone'||type==='scan','Invalid list type');
      const total=type==='zone'?this.zoneCount:this.scanCount;
      invariant(Number.isInteger(n)&&n>=1&&n<=total,'Invalid '+type+' number');
      return this.change('Delete '+type+' #'+n+' and compact indices',()=>{
        const b=this.bytes, size=type==='zone'?ZONE_SIZE:SCAN_SIZE;
        const offset=id=>type==='zone'?this.zoneOffset(id):this.scanOffset(id);
        // Preserve every surviving list's full record, including scan priorities,
        // opaque flags, and the ordering of member channel numbers.
        for(let id=n;id<total;id++)b.set(b.slice(offset(id+1),offset(id+1)+size),offset(id));
        b.fill(0,offset(total),offset(total)+size);
        b.fill(255,offset(total),offset(total)+(type==='zone'?16:11));
        if(type==='zone'){
          b[this.block(0x5c)]=total-1;
          // Block header byte 1 tracks the selected zone in this image. Keep its
          // logical selection when the table is compacted.
          let selected=b[this.block(0x5c)+1];
          if(selected>=1&&selected<=total){
            if(selected===n)selected=total>1?Math.min(n,total-1):0;
            else if(selected>n)selected--;
            b[this.block(0x5c)+1]=selected;
          }
        }else{
          b[this.block(0x11)]=total-1;
          // Channel byte +0x19 holds a 6-bit 1-based scan list reference.
          // Deleting list N: exact matches -> None, later references -> id - 1.
          // Preserve bits 6 (Auto Scan) and 7 (bandwidth) on every channel.
          for(let id=1;id<=this.channelCount;id++){
            const p=this.chOffset(id)+25,old=b[p]&SCAN_INDEX_MASK;
            if(old>=n){const next=old===n?0:old-1;bset(b,p,SCAN_INDEX_MASK,next)}
          }
        }
      });
    }
    archiveChannel(n){return this.change('Archive channel #'+n,()=>{invariant(n<=this.channelCount,'Channel missing');let p=this.chOffset(n),b=this.bytes;setStr(b,p,16,'UNUSED-'+n);bset(b,p+24,8,8);bset(b,p+25,64,0);for(let i=1;i<=this.zoneCount;i++){let v=this.zone(i).members;if(v.includes(n))this.writeMembers('zone',i,v.filter(x=>x!==n))}for(let i=1;i<=this.scanCount;i++){let v=this.scan(i).members;if(v.includes(n))this.writeMembers('scan',i,v.filter(x=>x!==n))}})}
    addZone(){const id=this.zoneCount+1;this.change('Add zone #'+id,()=>{invariant(id<=MAX_ZONE,'Zone limit reached');const p=this.zoneOffset(id),b=this.bytes;invariant(b.slice(p,p+ZONE_SIZE).every(x=>x===0||x===255),'Zone slot not empty');b.fill(0,p,p+ZONE_SIZE);setStr(b,p,16,'New Zone '+id);b[p+16]=0;b[this.block(0x5c)]=id});return id}
    addScan(){const id=this.scanCount+1;this.change('Add scan list #'+id+' (experimental)',()=>{invariant(id<=MAX_SCAN,'Scan list limit reached');let p=this.scanOffset(id),b=this.bytes;invariant(b.slice(p,p+SCAN_SIZE).every(x=>x===0||x===255),'Scan slot not empty');const sample=this.scan(1),s=b.slice(sample.offset,sample.offset+SCAN_SIZE);b.set(s,p);setStr(b,p,11,'New Scan '+id);b[p+11]=1;b[p+14]=0;for(let i=0;i<15;i++)writeLE(b,p+26+2*i,0);b[this.block(0x11)]=id;});return id}
    removeLast(type){const id=type==='zone'?this.zoneCount:this.scanCount;return this.deleteList(type,id)}
    validate(){const issues=[];for(let i=1;i<=this.channelCount;i++){let c;try{c=this.channel(i)}catch(e){issues.push('Channel #'+i+': '+e.message);continue}if(c.rx===null||c.rx===0)issues.push('Channel #'+i+': missing RX frequency');if(c.scanIndex>this.scanCount)issues.push('Channel #'+i+': scan list #'+c.scanIndex+' does not exist');}
      for(const [type,list] of [['zone',this.zones()],['scan',this.scans()]])for(const item of list){if(!item.name)issues.push(type+' #'+item.id+' has no name');for(const n of item.members){if(n<1||n>this.channelCount)issues.push(type+' #'+item.id+' references missing channel #'+n)}}
      return issues}
    diff(){const a=this.original,b=this.bytes,out=[];let i=0;while(i<b.length){if(a[i]===b[i]){i++;continue}let start=i;while(i<b.length&&a[i]!==b[i])i++;out.push({start,end:i-1,length:i-start,from:a.slice(start,i),to:b.slice(start,i)})}return out}
    changedBytes(){return this.diff().reduce((a,d)=>a+d.length,0)}
    reset(){this.bytes=this.original.slice();this.audit=[]}
    save(){const warnings=this.validate();invariant(warnings.length===0,'Validation: '+warnings.join('; '));return this.bytes.slice()}
    stats(){return {firmware:this.firmware,length:this.bytes.length,channels:this.channelCount,zones:this.zoneCount,scans:this.scanCount,changedBytes:this.changedBytes(),changes:this.audit.length}}
  }
  return {Codeplug,CTCSS,DCS,SCAN_INDEX_MASK,decodeFreq,encodeFreq,decodeTone,encodeTone,readLE,writeLE,SUPPORTED};
});
