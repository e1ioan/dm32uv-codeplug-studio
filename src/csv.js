/* CSV interchange for DM-32UV Codeplug Studio.
 * All imports operate on a temporary Codeplug and return patched bytes only after
 * every row is checked. No omitted rows are deleted, IDs are never renumbered.
 */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.DM32Core);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DM32CSV=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(core){
  'use strict';
  const HEADERS={
    channels:['Number','Name','RX MHz','TX MHz','Mode','Power','TX blocked','Bandwidth kHz','RX CTCSS/DCS','TX CTCSS/DCS','Squelch','Color code','Timeslot','Scan flag','Scan List'],
    zones:['Number','Name','Channels'],scans:['Number','Name','Channels']
  };
  const modeNames=['Analog','DMR','Fixed analog','Fixed DMR'];
  const powerNames=['Low','Medium','High'];
  function assert(v,m){if(!v)throw Error(m)}
  function quote(value){return '"'+String(value??'').replace(/"/g,'""')+'"'}
  function stringify(rows){return '\ufeff'+rows.map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n'}
  function parse(input){
    let source=String(input??'').replace(/^\ufeff/,'');
    let rows=[],row=[],field='',inQuote=false,closed=false;
    for(let i=0;i<source.length;i++){
      const c=source[i];
      if(inQuote){if(c==='"'&&source[i+1]==='"'){field+='"';i++}else if(c==='"'){inQuote=false;closed=true}else field+=c;continue}
      if(c==='"'){
        assert(!closed&&!field.trim(),'Unexpected quote at position '+i);
        inQuote=true;
      }else if(c===','){row.push(field);field='';closed=false}
      else if(c==='\r'||c==='\n'){
        if(c==='\r'&&source[i+1]==='\n')i++;
        row.push(field);field='';closed=false;
        if(row.some(x=>x.trim()))rows.push(row);
        row=[];
      }else{assert(!closed||/\s/.test(c),'Unexpected text after closing quote');field+=c}
    }
    assert(!inQuote,'Unterminated quoted CSV field');
    row.push(field);if(row.some(x=>x.trim()))rows.push(row);
    assert(rows.length>0,'CSV is empty');
    const cols=rows[0].map(s=>s.trim().toLowerCase());
    assert(new Set(cols).size===cols.length,'Duplicate CSV header');
    const entries=[];
    for(let i=1;i<rows.length;i++){
      const r=rows[i];assert(r.length<=cols.length,'Row '+(i+1)+': extra columns');
      const o={};cols.forEach((c,j)=>o[c]=(r[j]??'').trim());entries.push({line:i+1,values:o});
    }
    return{columns:cols,entries};
  }
  function exportCSV(cp,type){
    assert(HEADERS[type],'Unknown CSV type');
    let rows=[HEADERS[type]];
    if(type==='channels'){
      for(const c of cp.channels())rows.push([c.id,c.name,c.rx?.toFixed(5)??'',c.tx?.toFixed(5)??'',modeNames[c.mode],powerNames[c.power]??c.power,c.txBlocked,c.bandwidth,c.digital?'':c.rxTone,c.digital?'':c.txTone,c.squelch,c.color??'',c.timeslot??'',c.scanAdd,c.scanIndex===0?'None':`#${c.scanIndex} · ${cp.scan(c.scanIndex).name}`]);
    }else for(const l of (type==='zones'?cp.zones():cp.scans()))rows.push([l.id,l.name,l.members.join(';')]);
    return stringify(rows);
  }
  function strictId(v,line){assert(/^\d+$/.test(v),'Row '+line+': Number must be a positive integer');let n=Number(v);assert(Number.isSafeInteger(n)&&n>0,'Row '+line+': invalid number');return n}
  function parseChoice(v,options,label){let i=options.findIndex(x=>x.toLowerCase()===v.toLowerCase());assert(i>=0,label+': invalid value "'+v+'" (use '+options.join(', ')+')');return i}
  function bool(v,label){let s=v.toLowerCase();if(['true','yes','1','on'].includes(s))return true;if(['false','no','0','off'].includes(s))return false;throw Error(label+': expected true or false')}
  function numeric(v,label){assert(/^\d+(?:\.\d+)?$/.test(v),label+': expected a number');return Number(v)}
  function members(v,line){if(!v)return [];const parts=v.split(/[;|\s]+/).filter(Boolean),nums=parts.map(s=>strictId(s,line));assert(new Set(nums).size===nums.length,'Row '+line+': duplicate channel number');return nums}
  function has(row,name){return Object.prototype.hasOwnProperty.call(row,name.toLowerCase())}
  function value(row,name){return row[name.toLowerCase()]}
  function parseScanList(v,cp,line){
    const raw=String(v).trim();
    if(!raw||/^(?:none|off|0)$/i.test(raw))return 0;
    const match=raw.match(/^#?(\d+)(?:\s*[·:–-]\s*.*)?$/);
    let id;
    if(match)id=Number(match[1]);
    else{
      const matches=cp.scans().filter(s=>s.name.toLowerCase()===raw.toLowerCase());
      assert(matches.length===1,'Row '+line+': scan-list name "'+raw+'" must match exactly one existing list');
      id=matches[0].id;
    }
    assert(Number.isInteger(id)&&id>=0&&id<=cp.scanCount,'Row '+line+': scan list #'+id+' does not exist');
    return id;
  }
  function makePatch(row,current,line,cp){
    let p={},set=(name,field,fn=(v)=>v)=>{if(has(row,name))p[field]=fn(value(row,name))};
    set('Name','name');set('RX MHz','rx');set('TX MHz','tx',v=>v||'');
    set('Mode','mode',v=>parseChoice(v,modeNames,'Row '+line+' mode'));
    set('Power','power',v=>parseChoice(v,powerNames,'Row '+line+' power'));
    set('TX blocked','txBlocked',v=>bool(v,'Row '+line+' transmit'));
    set('Bandwidth kHz','bandwidth',v=>numeric(v,'Row '+line+' bandwidth'));
    set('Squelch','squelch',v=>numeric(v,'Row '+line+' squelch'));
    set('Scan flag','scanAdd',v=>bool(v,'Row '+line+' scan flag'));
    if(has(row,'Scan List'))set('Scan List','scanIndex',v=>parseScanList(v,cp,line));
    else set('Scan index','scanIndex',v=>numeric(v,'Row '+line+' scan index')); // v3 CSV compatibility
    if(current.digital){
      set('Color code','color',v=>v?numeric(v,'Row '+line+' color code'):current.color);
      set('Timeslot','timeslot',v=>v?numeric(v,'Row '+line+' timeslot'):current.timeslot);
      if(has(row,'RX CTCSS/DCS')&&value(row,'RX CTCSS/DCS'))throw Error('Row '+line+': DMR channel cannot have an analog RX tone');
      if(has(row,'TX CTCSS/DCS')&&value(row,'TX CTCSS/DCS'))throw Error('Row '+line+': DMR channel cannot have an analog TX tone');
    }else{
      set('RX CTCSS/DCS','rxTone',v=>v||'None');
      set('TX CTCSS/DCS','txTone',v=>v||'None');
      if(has(row,'Color code')&&value(row,'Color code'))throw Error('Row '+line+': analog channel cannot have a DMR color code');
      if(has(row,'Timeslot')&&value(row,'Timeslot'))throw Error('Row '+line+': analog channel cannot have a DMR timeslot');
    }
    return p;
  }
  function prepare(cp,type,text){
    assert(HEADERS[type],'Unknown CSV type');
    const parsed=parse(text),cols=parsed.columns;
    for(const required of type==='channels'?['Number','Name','RX MHz']:['Number','Name','Channels'])assert(cols.includes(required.toLowerCase()),'Missing CSV header: '+required+' (use this app’s CSV export as a template)');
    assert(parsed.entries.length,'CSV contains no data rows');
    const trial=new core.Codeplug(cp.bytes),ids=new Set();
    let changedRecords=0,added=0,unchanged=0;
    // Import existing records first, then append new records by consecutive ID.
    const items=parsed.entries.map(x=>({...x,id:strictId(value(x.values,'Number'),x.line)}));
    for(const x of items){assert(!ids.has(x.id),'Row '+x.line+': duplicate Number '+x.id);ids.add(x.id)}
    items.sort((a,b)=>a.id-b.id);
    const initial=type==='channels'?trial.channelCount:type==='zones'?trial.zoneCount:trial.scanCount;
    for(const entry of items){
      const {id,line,values:row}=entry;
      const beforeCount=type==='channels'?trial.channelCount:type==='zones'?trial.zoneCount:trial.scanCount;
      assert(id<=beforeCount+1,'Row '+line+': cannot skip record numbers; next available is '+(beforeCount+1));
      try{
        if(id===beforeCount+1){
          if(type==='channels'){
            assert(!has(row,'Mode')||['analog','fixed analog'].includes(value(row,'Mode').toLowerCase()),'New DMR channels cannot be created via CSV (unknown contact pointers)');
            const donor=trial.channels().find(c=>!c.digital&&!c.name.startsWith('UNUSED-'));
            assert(donor,'No analog template available');
            trial.addChannel(donor.id);
          }else if(type==='zones')trial.addZone();else trial.addScan();
          added++;
        }
        if(type==='channels'){
          const current=trial.channel(id);
          const patch=makePatch(row,current,line,trial);
          assert(!('name'in patch)||patch.name,'Channel name cannot be blank');
          if(id>initial)assert('name'in patch&&'rx'in patch&&patch.rx,'New channel requires Name and RX MHz');
          trial.setChannel(id,patch);
        }else{
          const kind=type==='zones'?'zone':'scan';
          const current=kind==='zone'?trial.zone(id):trial.scan(id);
          assert(value(row,'Name'),'List name cannot be blank');
          trial.setListName(kind,id,value(row,'Name'));
          trial.setMembers(kind,id,members(value(row,'Channels'),line));
        }
      }catch(err){throw Error('Row '+line+' (#'+id+'): '+err.message)}
    }
    for(const item of items){
      const id=item.id;
      let before,after,p,len;
      if(type==='channels'){p=trial.chOffset(id);len=48}
      else if(type==='zones'){p=trial.zoneOffset(id);len=145}
      else{p=trial.scanOffset(id);len=57}
      before=cp.bytes.subarray(p,p+len);after=trial.bytes.subarray(p,p+len);
      if(id>initial||before.some((x,i)=>x!==after[i]))changedRecords++;else unchanged++;
    }
    const diff=trial.bytes.reduce((acc,v,i)=>acc+(v!==cp.bytes[i]?1:0),0);
    return{type,rows:items.length,added,changedRecords,unchanged,changedBytes:diff,bytes:trial.bytes};
  }
  return{HEADERS,parse,stringify,exportCSV,prepare};
});
