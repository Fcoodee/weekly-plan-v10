(function(){
"use strict";
const $=(s,r=document)=>r.querySelector(s);
const el=(t,a={},...k)=>{const e=document.createElement(t);for(const[n,v]of Object.entries(a)){if(n==='class')e.className=v;else if(n==='text')e.textContent=v;else if(n.startsWith('on'))e.addEventListener(n.slice(2),v);else if(v!==false&&v!=null)e.setAttribute(n,v===true?'':v)}for(const c of k.flat())if(c!=null)e.append(c.nodeType?c:document.createTextNode(c));return e};
const AR=/[؀-ۿ]/;

/* ---------- reference data ---------- */
const WEEK=10;
const DAYS=[{ar:'الأحد',en:'Sunday',date:'2026-10-25'},{ar:'الاثنين',en:'Monday',date:'2026-10-26'},{ar:'الثلاثاء',en:'Tuesday',date:'2026-10-27'},{ar:'الأربعاء',en:'Wednesday',date:'2026-10-28'},{ar:'الخميس',en:'Thursday',date:'2026-10-29'}];
const SEQ=[{n:1,name:'1st Session',a:'07:45',b:'08:25'},{n:2,name:'2nd Session',a:'08:25',b:'09:05'},{gap:'Break',a:'09:05',b:'09:35'},{n:3,name:'3rd Session',a:'09:35',b:'10:15'},{n:4,name:'4th Session',a:'10:15',b:'10:55'},{n:5,name:'5th Session',a:'10:55',b:'11:35'},{n:6,name:'6th Session',a:'11:35',b:'12:15'},{gap:'Prayer Time',a:'12:15',b:'12:35'},{n:7,name:'7th Session',a:'12:35',b:'13:15'},{n:8,name:'8th Session',a:'13:15',b:'13:50'}];
const SESS=SEQ.filter(s=>s.n);
const GR={'3A':{ar:'الصف الثالث الابتدائي',short:'الثالث',en:'Grade 3 (3A)',label:'Grade 3A',cs:28},'4A':{ar:'الصف الرابع الابتدائي',short:'الرابع',en:'Grade 4 (4A)',label:'Grade 4A',cs:28},'5A':{ar:'الصف الخامس الابتدائي',short:'الخامس',en:'Grade 5 (5A)',label:'Grade 5A',cs:26},'6A':{ar:'الصف السادس الابتدائي',short:'السادس',en:'Grade 6 (6A)',label:'Grade 6A',cs:26}};
const GKEYS=Object.keys(GR);
const dmy=d=>d.split('-').reverse().join(' - ');

/* ---------- state ---------- */
const CFGW=window.WP_CONFIG||{};
const S={grade:'3A',day:0,store:'pending',canWrite:true,locked:false,ready:false,gapSubj:'',role:null,me:null,name:'',dataF:{g:'',s:'',st:''},pv:{g:'3A',p:'cover'},exp:{g:'3A'}};
let LOGOS={};
const DATA={};GKEYS.forEach(g=>{DATA[g]={tt:{0:[],1:[],2:[],3:[],4:[]},rows:{}}});
const cellKey=(g,d,p)=>`${g}_${d}_${p}`;
function cell(g,d,p){const b=DATA[g].rows[`${d}-${p}`];return b?{lesson:b.lesson||'',note:b.note||''}:{lesson:'',note:''}}
const subj=(g,d,p)=>DATA[g].tt[d][p-1]||'';
const filled=(g,d,p)=>cell(g,d,p).lesson.trim().length>0;
function allRows(){const r=[];if(!S.ready)return r;for(const g of GKEYS)for(let d=0;d<5;d++)for(const s of SESS){const c=cell(g,d,s.n);r.push({g,d,p:s.n,subject:subj(g,d,s.n),lesson:c.lesson,note:c.note,status:c.lesson.trim()?'filled':'empty'})}return r}
const gradeCount=g=>{let f=0;for(let d=0;d<5;d++)for(const s of SESS)if(filled(g,d,s.n))f++;return f};
const dayCount=(g,d)=>SESS.filter(s=>filled(g,d,s.n)).length;
const gapsList=()=>allRows().filter(r=>r.status==='empty');
const isAdmin=()=>!!(S.me&&S.me.type==='admin');

/* ---------- الخدمة: Google Apps Script فوق Google Sheets ---------- */
const TKEY='wp10_t',NKEY='wp10_name',POLL_MS=15000;
let TOKEN='',IDTOKEN='',pollTimer=null;
const timers={},inflight={},dirty={};
function ss(){try{return window.sessionStorage}catch(e){return null}}
function setStore(mode,txt){S.store=mode;const c=$('#chipStore');c.className='chip '+(mode==='db'?'ok':mode==='ro'||mode==='warn'?'warn':'');$('span',c).textContent=txt}
function apiError(j){const e=new Error(j.error);e.api=true;return e}
async function apiGet(){
  const u=new URL(CFGW.API_URL);if(IDTOKEN)u.searchParams.set('idToken',IDTOKEN);else u.searchParams.set('t',TOKEN);
  const r=await fetch(u.toString(),{redirect:'follow',cache:'no-store'});const j=await r.json();if(j.error)throw apiError(j);return j}
async function apiPost(body){
  const r=await fetch(CFGW.API_URL,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign(IDTOKEN?{idToken:IDTOKEN}:{token:TOKEN},body))});
  const j=await r.json();if(j.error)throw apiError(j);return j}
function applyServer(j){
  let changed=!S.ready;
  S.me=j.me;S.locked=!!j.locked;
  if(j.me&&j.me.type==='role'){const i=j.me.role.lastIndexOf('@');S.role={s:j.me.role.slice(0,i),g:j.me.role.slice(i+1)}}else S.role=null;
  S.canWrite=!S.locked||isAdmin();
  for(const g of GKEYS){for(const r of (j.grades[g]||[])){
    const m=/^(\w+)_(\d)_(\d)$/.exec(r.key);if(!m)continue;const d=+m[2],p=+m[3];
    DATA[g].tt[d][p-1]=r.subject;
    if(timers[r.key]||inflight[r.key])continue;
    const cur=DATA[g].rows[`${d}-${p}`],at=r.at?String(r.at):'';
    if(!cur||cur.lesson!==(r.lesson||'')||cur.note!==(r.note||'')||cur.at!==at){DATA[g].rows[`${d}-${p}`]={lesson:r.lesson||'',note:r.note||'',by:r.by||'',at:at};changed=true}}}
  S.ready=true;return changed}
function queueSave(g,d,p){const k=cellKey(g,d,p);clearTimeout(timers[k]);timers[k]=setTimeout(()=>{delete timers[k];flush(g,d,p)},800);setStore('db','جارٍ الحفظ…')}
async function flush(g,d,p){
  const k=cellKey(g,d,p),row=DATA[g].rows[`${d}-${p}`];if(!row)return;
  if(inflight[k]){dirty[k]=true;return}
  inflight[k]=true;
  try{const r=await apiPost({key:k,lesson:row.lesson||'',note:row.note||'',name:S.name});row.at=r.at;row.by=r.by;setStore('db','تم الحفظ في الشيت')}
  catch(e){if(e.api){setStore('ro','لم يُحفظ: '+e.message);toast(e.message);if(/مقفل/.test(e.message)){S.canWrite=false;renderGrid()}}else{setStore('warn','تعذّر الاتصال · سنعيد المحاولة');setTimeout(()=>flush(g,d,p),8000)}}
  finally{inflight[k]=false;if(dirty[k]){dirty[k]=false;flush(g,d,p)}}
}
async function poll(){
  if(document.hidden||Object.keys(timers).length||Object.keys(inflight).some(k=>inflight[k]))return;
  try{const j=await apiGet();const ch=applyServer(j);const ae=document.activeElement;
    if(ch){renderTabs();if(!ae||ae.tagName!=='TEXTAREA')renderGrid();refreshAll()}
    if(S.store!=='ro')setStore('db','متصل · '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}))
  }catch(e){if(e.api){stopPoll();showLogin(e.message)}else setStore('warn','انقطع الاتصال · محاولة لاحقة')}
}
function startPoll(){stopPoll();pollTimer=setInterval(poll,POLL_MS)}
function stopPoll(){clearInterval(pollTimer)}
addEventListener('beforeunload',e=>{if(Object.keys(timers).length||Object.keys(inflight).some(k=>inflight[k])){e.preventDefault();e.returnValue=''}});

/* ---------- الأدوار: الصلاحية الفعلية يفرضها الخادم؛ الواجهة تعكسها فقط ---------- */
const roleKey=r=>r.s+'@'+r.g;
function canEditCell(g,sub){if(!S.canWrite)return false;return !S.role||(S.role.g===g&&S.role.s===sub)}
function renderRole(){const c=$('#chipRole');c.className='chip '+(S.me?'ok':'');$('span',c).textContent=!S.me?'غير متصل':S.role?`دور: ${roleKey(S.role)}`:'دور: مسؤول (الكل)'+(S.locked?' · الأسبوع مقفل':'')}
function roleCells(r){let n=0;for(let d=0;d<5;d++)for(const s of SESS)if(subj(r.g,d,s.n)===r.s)n++;return n}

/* ---------- main workspace ---------- */
function renderTop(){
  $('#logoSchool').src='data:image/png;base64,'+LOGOS.school;
  $('#sub').textContent=`المرحلة الابتدائية · الأسبوع ${WEEK} · ${DAYS[0].date} إلى ${DAYS[4].date}`;
}
function renderTabs(){
  const g=$('#grades');g.replaceChildren(...GKEYS.map(k=>{const f=gradeCount(k);return el('button',{class:'gbtn',role:'tab','aria-selected':String(k===S.grade),onclick:()=>{S.grade=k;S.pv.g=k;S.exp.g=k;renderTabs();renderGrid();refreshAll()}},el('b',{text:GR[k].ar}),el('small',{text:`Grade ${k} · ${f} من 40 حصة مكتملة`}),el('div',{class:'bar'},el('span',{style:`width:${f/40*100}%`})))}));
  const d=$('#days');d.replaceChildren(...DAYS.map((x,i)=>el('button',{class:'dbtn',role:'tab','aria-selected':String(i===S.day),onclick:()=>{S.day=i;renderTabs();renderGrid();refreshAll()}},el('b',{text:x.ar}),el('small',{text:x.en}),el('div',{class:'segs'},...SESS.map(s=>el('s',{class:filled(S.grade,i,s.n)?'f':'',title:`${s.name}: ${filled(S.grade,i,s.n)?'مكتملة':'فارغة'}`}))))));
}
function autosize(t){t.style.height='auto';t.style.height=Math.max(42,t.scrollHeight+2)+'px'}
function renderGrid(){
  const g=S.grade,d=S.day,D=DAYS[d];
  $('#dayTitle').textContent=`${D.ar} · ${D.en}`;
  $('#dayMeta').textContent=`${D.date} · ${GR[g].label} · ${dayCount(g,d)} من 8 حصص مكتملة`;
  const grid=$('#grid');grid.replaceChildren();
  if(!S.ready){grid.append(el('p',{class:'note',style:'padding:16px',text:'جارٍ تحميل الخطة من الشيت…'}));return}
  grid.append(el('div',{class:'gr h',role:'row'},...[['الفترة الزمنية','Time Period'],['المادة','Subject'],['الصف','Grade'],['عنوان الدرس','Lesson Title'],['ملاحظات','Notes']].map(h=>el('div',{role:'columnheader'},h[0],el('small',{text:h[1]})))));
  for(const s of SEQ){
    if(s.gap){grid.append(el('div',{class:'gr gap'},el('div',{class:'per'},el('b',{text:s.gap}),el('small',{text:`${s.a} - ${s.b}`}))));continue}
    const c=cell(g,d,s.n),k=cellKey(g,d,s.n),ro=!S.canWrite||!canEditCell(g,subj(g,d,s.n));
    const mk=(f,ph)=>{const t=el('textarea',{rows:1,dir:'auto','data-k':k,'data-f':f,placeholder:ph,'aria-label':(f==='lesson'?'عنوان الدرس':'ملاحظات')+` · ${subj(g,d,s.n)} · ${s.name}`,readonly:ro});t.value=c[f];t.addEventListener('input',()=>{const rw=DATA[g].rows[`${d}-${s.n}`]||(DATA[g].rows[`${d}-${s.n}`]={lesson:'',note:'',by:'',at:''});rw[f]=t.value;autosize(t);if(f==='lesson')row.classList.toggle('empty',!rw.lesson.trim());queueSave(g,d,s.n);refreshAll(true)});return t};
    const row=el('div',{class:'gr'+(c.lesson.trim()?'':' empty')+(ro?' ro':''),role:'row'},
      el('div',{class:'per'},el('b',{text:s.name}),el('small',{text:`${s.a} - ${s.b}`})),
      el('div',{class:'sub',text:subj(g,d,s.n)}),
      el('div',{class:'gd',text:GR[g].label}),
      el('div',{class:'lesson'},mk('lesson','لا يوجد موضوع درس بعد')),
      el('div',{class:'notes'},mk('note','ملاحظات')));
    grid.append(row);
  }
  grid.querySelectorAll('textarea').forEach(autosize);
  requestAnimationFrame(()=>grid.querySelectorAll('textarea').forEach(autosize));
}
function goTo(g,d,p){S.grade=g;S.day=d;renderTabs();renderGrid();refreshAll();const t=$(`textarea[data-k="${cellKey(g,d,p)}"][data-f="lesson"]`);if(t){t.scrollIntoView({block:'center',behavior:'smooth'});setTimeout(()=>t.focus({preventScroll:true}),250)}}

/* ---------- toast + clipboard + files ---------- */
let tt;function toast(m){const s=$('#toast span');s.textContent=m;s.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>s.classList.remove('on'),2600)}
async function copyText(t){try{await navigator.clipboard.writeText(t);toast('تم النسخ')}catch(e){const a=el('textarea',{style:'position:fixed;opacity:0'});a.value=t;document.body.append(a);a.select();let ok=false;try{ok=document.execCommand('copy')}catch(_){}a.remove();toast(ok?'تم النسخ':'تعذّر النسخ، حدّد النص يدوياً')}}
async function saveFile(name,data){
  try{const u=URL.createObjectURL(data instanceof Blob?data:new Blob([data]));const a=el('a',{href:u,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);toast('تم التنزيل');return true}catch(e){toast('تعذّر التنزيل');return false}
}

/* ---------- document model shared by Word, preview and PDF ---------- */
function dayRows(g,d){
  const out=[];
  for(const s of SEQ){
    if(s.gap){out.push({gap:true,per:[s.gap,`${s.a} - ${s.b}`],subj:'',grade:'',lesson:'',note:''});continue}
    const c=cell(g,d,s.n);
    out.push({gap:false,per:[s.name,`${s.a} - ${s.b}`],subj:subj(g,d,s.n),grade:GR[g].label,lesson:c.lesson.trim().replace(/\s*\n\s*/g,' '),note:c.note.trim().replace(/\s*\n\s*/g,' ')});
  }
  return out;
}
function coverText(g){const G=GR[g];return{
  t1:`الخطة الأسبوعية ( الأسبوع ${WEEK} )`,t2:`Weekly Plan ( Week ${WEEK} )`,
  s1:`المرحلة الابتدائية - ${G.ar.replace('الصف ','الصف ')} ${G.label}`,s2:`Primary School - ${G.en.replace(' (',' (')}`,
  d1:`من ${DAYS[0].ar} ${dmy(DAYS[0].date)} إلى ${DAYS[4].ar} ${dmy(DAYS[4].date)}`,
  d2:`From ${DAYS[0].en} ${dmy(DAYS[0].date)} to ${DAYS[4].en} ${dmy(DAYS[4].date)}`}}

/* ---------- Word (.docx) generated into the approved template ---------- */
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const FONT='<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/>';
function run(t,sz,bold,color,rtl){return `<w:r><w:rPr>${FONT}${bold?'<w:b/><w:bCs/>':''}${color?`<w:color w:val="${color}"/>`:''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>${rtl?'<w:rtl/>':''}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`}
function par(t,{sz=20,bold=false,color='0B2A33',after=0,before=0,keep=false,jc='center'}={}){const ar=AR.test(t);return `<w:p><w:pPr>${keep?'<w:keepNext/>':''}<w:bidi w:val="${ar?1:0}"/><w:spacing w:before="${before}" w:after="${after}"/><w:jc w:val="${jc}"/></w:pPr>${t?run(t,sz,bold,color,ar):''}</w:p>`}
function rule(){return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="18" w:space="1" w:color="07BCCF"/></w:pBdr><w:spacing w:before="80" w:after="280"/><w:jc w:val="center"/></w:pPr>${run('',8,false,null,false)}</w:p>`}
const W=[1500,1900,1900,1150,5458,2050];
function tc(w,lines,{fill,bold=false,sz=19,merge=null,keep=false}={}){
  const ps=(lines.length?lines:['']).map(l=>par(l,{sz,bold,keep}));
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${merge?(merge==='r'?'<w:vMerge w:val="restart"/>':'<w:vMerge/>'):''}${fill?`<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`:''}<w:tcMar><w:top w:w="30" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr>${ps.join('')}</w:tc>`}
function dayTable(g,d,band){
  const D=DAYS[d],rows=dayRows(g,d);
  const b=['single','top','left','bottom','right','insideH','insideV'].slice(1).map(s=>`<w:${s} w:val="single" w:sz="4" w:space="0" w:color="7F9AA0"/>`).join('');
  let x=`<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:bidiVisual/><w:tblW w:w="${W.reduce((a,c)=>a+c)}" w:type="dxa"/><w:tblBorders>${b}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${W.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const hd=[['اليوم','Day'],['المادة','Subject'],['الفترة الزمنية','Time Period'],['الصف','Grade'],['عنوان الدرس','Lesson Title'],['ملاحظات','Notes']];
  x+=`<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${hd.map((h,i)=>tc(W[i],h,{fill:'07BCCF',bold:true,sz:21,keep:true})).join('')}</w:tr>`;
  rows.forEach((r,i)=>{
    const f=r.gap?'E6E6E6':(band?'EAF8FA':'FFFFFF'),last=i===rows.length-1;
    x+=`<w:tr><w:trPr><w:cantSplit/></w:trPr>${tc(W[0],i===0?[D.ar,D.en,D.date]:[''],{fill:'BFEFF5',bold:true,sz:20,merge:i===0?'r':'c',keep:!last})}${tc(W[1],[r.subj],{fill:f,bold:true,keep:!last})}${tc(W[2],r.per,{fill:f,sz:18,keep:!last})}${tc(W[3],[r.grade],{fill:f,keep:!last})}${tc(W[4],[r.lesson],{fill:f,keep:!last})}${tc(W[5],[r.note],{fill:f,keep:!last})}</w:tr>`;
  });
  return x+'</w:tbl>';
}
async function makeDocx(g){
  const tr=await fetch('template/weekly_plan_template.docx');if(!tr.ok)throw new Error('تعذّر تحميل القالب');const zip=await JSZip.loadAsync(await tr.arrayBuffer());
  let xml=await zip.file('word/document.xml').async('string');
  const sect=xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)[0];
  const coverSect=sect.replace(/<w:pgNumType[^>]*\/>/,'').replace(/<w:docGrid/,'<w:vAlign w:val="center"/><w:docGrid');
  const C=coverText(g),G=GR[g];
  let b='';
  b+=par(C.t1,{sz:92,bold:true,after:80})+par(C.t2,{sz:68,bold:true,color:'1B5E68',after:80})+rule();
  b+=par(C.s1,{sz:G.cs*2,bold:true,after:40})+par(C.s2,{sz:48,bold:true,color:'1B5E68',after:280})+rule();
  b+=par(C.d1,{sz:56,bold:true,after:80})+par(C.d2,{sz:48,bold:true,color:'1B5E68',after:0});
  b+=`<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${coverSect}</w:pPr></w:p>`;
  for(let d=0;d<5;d++){
    if(d>0)b+='<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>';
    b+=dayTable(g,d,d%2===0);
  }
  b+='<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>';
  xml=xml.replace(/(<w:body>)[\s\S]*(<\/w:body>)/,`$1${b}${sect}$2`);
  zip.file('word/document.xml',xml);
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
}

/* ---------- paper pages (preview + PDF) ---------- */
const HEAD_AR=['المملكة العربية السعودية','وزارة التعليم (280)','مكتب التعليم الأهلي بمحافظة جدة','إدارة المدارس الأجنبية والبرامج الدولية','مدارس دار الفرسان','ترخيص رقم 5202815','المنهج المرخص: الأمريكي - جهة الاعتماد AIAA'];
const HEAD_EN=['Kingdom of Saudi Arabia','Ministry of Education (280)','Private Education Department in Jeddah','Dar Al Forsan Schools','Management of Foreign and International Programs','License No 5202815','Authorized Curriculum: American - Accredited by: AIAA'];
function paper(g,which){
  const pg=el('div',{class:'pg'+(which==='cover'?' cover':'')});
  const img=(k,h)=>el('img',{src:'data:image/png;base64,'+LOGOS[k],alt:''});
  pg.append(
    el('div',{class:'hd'},el('div',{class:'t'},...HEAD_EN.map((t,i)=>el('div',{text:t,style:i===3?'font-weight:700':''}))),el('div',{class:'lg'},img('school'),img('diploma')),el('div',{class:'t a'},...HEAD_AR.map(t=>el('div',{text:t})))),
    el('div',{class:'bar',style:'top:106px;left:0;width:90px'}),
    el('div',{class:'ft'},img('aiasc'),el('div',{style:'flex:1;max-width:520px'},el('b',{text:'Vision'}),': "Our vision is to develop a society empowered by education that promotes critical thinking, fosters creativity and innovation, and inspires individuals to take initiative in shaping a progressive and sustainable future" ',el('br'),el('b',{text:'Mission'}),': We build a generation that possesses life skills in a safe and inspiring educational environment with distinguished human competencies and international standards within the framework of authentic values ',el('br'),el('b',{text:'Values'}),': Respect, Responsibility, Professionalism, Innovation, Learning for life')),
    el('div',{class:'bar',style:'bottom:0;right:0;width:90px'}));
  const body=el('div',{class:'body'});pg.append(body);
  if(which==='cover'){
    const C=coverText(g),G=GR[g],P=(t,sz,col,mb)=>el('div',{text:t,style:`font-weight:700;font-size:${sz}px;color:${col||'var(--paper-ink)'};margin-bottom:${mb||6}px;line-height:1.25`,dir:AR.test(t)?'rtl':'ltr'});
    body.append(P(C.t1,56,'',4),P(C.t2,40,'var(--paper-sub)',4),el('div',{class:'rule'}),P(C.s1,G.cs*1.35,'',2),P(C.s2,28,'var(--paper-sub)',10),el('div',{class:'rule'}),P(C.d1,32,'',4),P(C.d2,27,'var(--paper-sub)',0));
  }else{
    const d=+which,D=DAYS[d],rows=dayRows(g,d),t=el('table');
    t.append(el('colgroup',{},...W.map(w=>el('col',{style:`width:${w/W.reduce((a,c)=>a+c)*100}%`}))));
    t.append(el('tr',{},...[['اليوم','Day'],['المادة','Subject'],['الفترة الزمنية','Time Period'],['الصف','Grade'],['عنوان الدرس','Lesson Title'],['ملاحظات','Notes']].map(h=>el('th',{},h[0],el('small',{text:h[1]})))));
    rows.forEach((r,i)=>{const tr=el('tr',{class:(r.gap?'gp ':'')+(d%2===0?'b1':'')});
      if(i===0)tr.append(el('td',{class:'dy',rowspan:rows.length},D.ar,el('br'),D.en,el('br'),D.date));
      tr.append(el('td',{style:'font-weight:700',text:r.subj}),el('td',{style:'font-size:9.5px'},r.per[0],el('br'),r.per[1]),el('td',{text:r.grade}),el('td',{text:r.lesson,dir:'auto'}),el('td',{text:r.note,dir:'auto'}));
      t.append(tr)});
    body.append(t);
  }
  return pg;
}
function printPdf(g){
  const host=el('div',{id:'printRoot'});['cover',0,1,2,3,4].forEach(w=>host.append(paper(g,w)));document.body.append(host);
  const done=()=>{host.remove();removeEventListener('afterprint',done)};addEventListener('afterprint',done);
  setTimeout(()=>window.print(),200);
}

/* ---------- reports ---------- */
function gapGroups(){
  const m={};for(const r of gapsList()){((m[r.subject]??={})[r.g]??=[]).push(r.d)}
  return Object.entries(m).sort((a,b)=>Object.values(b[1]).flat().length-Object.values(a[1]).flat().length||a[0].localeCompare(b[0]));
}
function dayLabel(list){const c={};list.forEach(d=>c[d]=(c[d]||0)+1);return Object.keys(c).sort((a,b)=>a-b).map(d=>DAYS[d].ar+(c[d]>1?` (${c[d]===2?'حصتان':c[d]+' حصص'})`:'')).join('، ')}
function reportText(){return gapGroups().map(([s,gs])=>`▪ ${s}\n`+Object.entries(gs).map(([g,l])=>`- ${GR[g].label}: ${dayLabel(l)}`).join('\n')).join('\n\n')}
function teacherMsg(){return `السلام عليكم ورحمة الله وبركاته،\n\nمعلمي المرحلة الابتدائية (Grade 3 – Grade 6) الأفاضل،\n\nأتقدم لكم بخالص الشكر والتقدير على تعاونكم في إعادة إدخال الفترات الزمنية إثر الخطأ التقني الذي حدث في المنصة، ونقدّر حرصكم وسرعة استجابتكم.\n\nأرجو التكرّم بالدخول على رابط Drive التالي للاطلاع على الخطة الأسبوعية للمرحلة الابتدائية (الأسبوع ${WEEK}: من الأحد ${dmy(DAYS[0].date)} إلى الخميس ${dmy(DAYS[4].date)}):\n\n[ضع رابط Drive هنا]\n\nوحيث إن بعض الحصص ما زالت بانتظار مواضيع الدروس، يسعدني أن يتفضّل كل معلم بمراجعة مادته وإكمالها في ملف الصف المعني (عنوان الدرس والملاحظات) في الحصص الموضحة أدناه، مع التأكد من أن فتراتها مُدخلة في المنصة (Manage Timetable) وفق جدولكم الحضوري:\n\n${reportText()}\n\nوإن أمكن الإنجاز قبل: [الموعد]\n\nأشكر لكم حسن تعاونكم وحرصكم، وجزاكم الله خيرًا وبارك في جهودكم.`}
const csvEsc=v=>'"'+String(v).replace(/"/g,'""')+'"';
function toCsv(){const h=['week','grade','day','period','subject','lesson','note','status'];return '﻿'+[h.join(',')].concat(allRows().map(r=>[WEEK,GR[r.g].label,DAYS[r.d].en,SESS[r.p-1].name,r.subject,r.lesson,r.note,r.status].map(csvEsc).join(','))).join('\r\n')}

/* ---------- windows ---------- */
const WINS={};let zTop=10;
const narrow=()=>matchMedia('(max-width:720px)').matches;
const ICON={roles:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>',gaps:'<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',data:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>',pv:'<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/></svg>',ex:'<svg viewBox="0 0 24 24"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>'};
const DEF={
  gaps:{title:'تقرير النواقص',x:24,y:150,w:430,h:520,render:renderGaps},
  data:{title:'قاعدة البيانات',x:60,y:110,w:900,h:480,render:renderData},
  pv:{title:'معاينة المستند',x:140,y:90,w:640,h:470,render:renderPv},
  roles:{title:'دوري',x:120,y:120,w:420,h:480,render:renderRoles},
  ex:{title:'التصدير',x:200,y:130,w:420,h:420,render:renderEx}
};
function openWin(id){
  if(WINS[id]){focusWin(id);return}
  const d=DEF[id],vw=innerWidth,w=Math.min(d.w,vw-16);
  const root=el('section',{class:'win',role:'dialog','aria-label':d.title,style:`left:${Math.max(8,Math.min(d.x,vw-w-8))}px;top:${d.y}px;width:${w}px;height:${d.h}px`});
  const body=el('div',{class:'wb'});
  const bMin=el('button',{'aria-label':'تصغير',title:'تصغير',onclick:()=>root.classList.toggle('col')},el('span',{text:'–'}));
  const bClose=el('button',{'aria-label':'إغلاق',title:'إغلاق',onclick:()=>closeWin(id)},el('span',{text:'×'}));
  const bar=el('div',{class:'wt'},el('h3',{text:d.title}),bMin,bClose);
  root.append(bar,body);$('#layer').append(root);
  WINS[id]={root,body,def:d};
  root.addEventListener('pointerdown',()=>focusWin(id));
  bar.addEventListener('pointerdown',ev=>{if(ev.target.closest('button')||narrow())return;const r=root.getBoundingClientRect(),dx=ev.clientX-r.left,dy=ev.clientY-r.top;bar.setPointerCapture(ev.pointerId);bar.style.cursor='grabbing';
    const mv=e=>{root.style.left=Math.max(0,Math.min(innerWidth-60,e.clientX-dx))+'px';root.style.top=Math.max(0,Math.min(innerHeight-40,e.clientY-dy))+'px'};
    const up=()=>{bar.style.cursor='';bar.removeEventListener('pointermove',mv);bar.removeEventListener('pointerup',up)};bar.addEventListener('pointermove',mv);bar.addEventListener('pointerup',up)});
  d.render(body);focusWin(id);renderDock();
}
function closeWin(id){const w=WINS[id];if(!w)return;w.root.remove();delete WINS[id];renderDock()}
function focusWin(id){const w=WINS[id];if(w)w.root.style.zIndex=++zTop}
function refreshAll(light){renderChips();renderRole();renderDock();for(const id in WINS){if(light&&id==='pv')continue;WINS[id].def.render(WINS[id].body)}}
function renderChips(){const n=gapsList().length;$('span',$('#chipGaps')).textContent=n?`${n} حصة بلا موضوع درس`:'كل الحصص مكتملة';$('#chipGaps').className='chip '+(n?'warn':'ok')}
function renderDock(){
  const n=gapsList().length,d=$('#dock');
  d.replaceChildren(...Object.keys(DEF).map(id=>{const b=el('button',{class:'dk','aria-pressed':String(!!WINS[id]),onclick:()=>WINS[id]?closeWin(id):openWin(id)});b.innerHTML=ICON[id]+'<span></span>';$('span',b).textContent=DEF[id].title;if(id==='gaps'&&n)b.append(el('span',{class:'bd',text:String(n)}));return b}));
}

function renderGaps(body){
  const keepScroll=body.scrollTop,groups=gapGroups();
  const subs=groups.map(g=>g[0]);
  const sel=el('select',{id:'gapSel','aria-label':'تصفية بالمادة',onchange:e=>{S.gapSubj=e.target.value;renderGaps(body)}},el('option',{value:'',text:'كل المواد'}),...subs.map(s=>el('option',{value:s,text:s,selected:s===S.gapSubj})));
  const list=el('ul',{class:'gsub'});
  const shown=groups.filter(g=>!S.gapSubj||g[0]===S.gapSubj);
  if(!shown.length)list.append(el('li',{text:'لا توجد حصص فارغة.'}));
  for(const [s,gs] of shown){
    const tot=Object.values(gs).flat().length;
    list.append(el('li',{},el('h4',{},s,el('span',{text:`${tot} حصة`})),...Object.entries(gs).map(([g,ds])=>el('div',{class:'gline'},el('em',{text:GR[g].label}),...[...new Set(ds)].sort((a,b)=>a-b).map(d=>{const cnt=ds.filter(x=>x===d).length;const per=SESS.find(p=>!filled(g,d,p.n)&&subj(g,d,p.n)===s);return el('button',{class:'pill',title:'الانتقال إلى الحصة',onclick:()=>goTo(g,d,per?per.n:1)},DAYS[d].ar+(cnt>1?` ×${cnt}`:''))})))));
  }
  body.replaceChildren(el('div',{class:'row2',style:'margin-bottom:12px'},sel,el('button',{class:'btn',onclick:()=>copyText(reportText())},'نسخ التقرير'),(isAdmin()?el('button',{class:'btn p',onclick:()=>copyText(teacherMsg())},'نسخ رسالة المعلمين'):null)),list,el('p',{class:'note',text:'يتحدث التقرير فور تعبئة أي حصة. اضغط على اليوم للانتقال إلى الحصة.'}));
  body.scrollTop=keepScroll;
}
const SHEET_URL=CFGW.SHEET_URL||'';
function renderData(body){
  const g=S.dataF.g||S.grade,keep=body.scrollTop;
  const tabs=el('div',{class:'row2',role:'tablist','aria-label':'تبويبات الشيت',style:'margin-bottom:10px;gap:4px'},...GKEYS.map(k=>el('button',{class:'btn',role:'tab','aria-selected':String(k===g),style:k===g?'border-color:var(--teal);box-shadow:inset 0 -3px 0 var(--teal);font-weight:600':'',onclick:()=>{S.dataF.g=k;renderData(body)}},'Grade'+k)),el('span',{class:'chip '+(S.store==='db'?'ok':'warn')},el('i'),S.store==='db'?'متصل بالشيت':'غير متصل'));
  const H=['key','اليوم Day','الفترة Period','الوقت Time','المادة Subject','الصف Grade','عنوان الدرس Lesson Title','ملاحظات Notes','status','updated_by','updated_at'];
  const rows=[];for(let d=0;d<5;d++)for(const s of SESS){const c=cell(g,d,s.n),o=DATA[g].rows[`${d}-${s.n}`],ok=c.lesson.trim();rows.push([`${g}_${d}_${s.n}`,`${DAYS[d].ar} ${DAYS[d].en}`,s.name,`${s.a} - ${s.b}`,subj(g,d,s.n),'Grade '+g,c.lesson,c.note,ok?'filled':'empty',o&&o.by||'—',o&&o.at?new Date(o.at).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'}):'—',d,s.n])}
  const t=el('table',{class:'dt'},el('thead',{},el('tr',{},...H.map(h=>el('th',{text:h})))),el('tbody',{},...rows.map(r=>el('tr',{onclick:()=>goTo(g,r[11],r[12]),title:'الانتقال إلى الحصة'},...r.slice(0,11).map((v,i)=>i===8?el('td',{},el('span',{class:'st '+(v==='empty'?'e':'f'),text:v})):el('td',{class:i===6||i===7?'l':'',text:v,dir:i>4?'auto':null}))))));
  body.replaceChildren(tabs,el('div',{class:'tw'},t),(isAdmin()&&SHEET_URL?el('div',{class:'row2',style:'margin-top:10px'},el('a',{class:'btn',href:SHEET_URL,target:'_blank',rel:'noopener'},'فتح الشيت في Google Sheets')):null),el('p',{class:'note',text:'مرآة مباشرة لتبويب الصف في الشيت بالأعمدة نفسها. تُحدَّث كل 15 ثانية.'}));
  body.scrollTop=keep;
}
function renderRoles(body){
  const nm=el('input',{type:'text',id:'roleName',placeholder:'اسمك (يُسجَّل مع كل تعديل)',value:S.name,maxlength:'60','aria-label':'اسم المحرّر',style:'padding:8px 10px;border-radius:9px;border:1px solid var(--line);background:var(--surface);min-width:0;width:100%',oninput:e=>{S.name=e.target.value;try{localStorage.setItem(NKEY,S.name)}catch(_){}}});
  const info=!S.me?el('p',{class:'note',text:'غير متصل.'}):S.role?el('p',{text:`دورك: معلم مادة ${S.role.s} · Grade ${S.role.g}. يُفتح لك ${roleCells(S.role)} حصة فقط، وبقية الحصص للقراءة.`}):el('p',{text:'دورك: مسؤول. تعدّل كل الحصص وتقفل الأسبوع.'});
  const lk=isAdmin()?el('button',{class:'btn',onclick:async()=>{try{await apiPost({action:'lock',locked:!S.locked});S.locked=!S.locked;S.canWrite=!S.locked||isAdmin();toast(S.locked?'تم قفل الأسبوع':'تم فتح الأسبوع');renderRole();renderRoles(body);renderGrid()}catch(e){toast(e.message)}}},S.locked?'فتح الأسبوع':'قفل الأسبوع'):null;
  body.replaceChildren(el('div',{style:'display:grid;gap:12px'},el('label',{for:'roleName',text:'الاسم'}),nm,info,lk,S.locked?el('p',{class:'note',text:'الأسبوع مقفل: التعديل متاح للمسؤول فقط.'}):null),el('p',{class:'note',text:'الصلاحية يفرضها الخادم برمز الدور. الاسم المُدخل غير موثّق ويظهر في سجل التعديلات.'}));
}
function renderPv(body){
  const g=S.pv.g,which=S.pv.p;
  const sg=el('select',{'aria-label':'الصف',onchange:e=>{S.pv.g=e.target.value;renderPv(body)}},...GKEYS.map(k=>el('option',{value:k,text:GR[k].label,selected:g===k})));
  const sp=el('select',{'aria-label':'الصفحة',onchange:e=>{S.pv.p=e.target.value;renderPv(body)}},el('option',{value:'cover',text:'الغلاف',selected:which==='cover'}),...DAYS.map((d,i)=>el('option',{value:String(i),text:d.ar,selected:String(which)===String(i)})));
  const box=el('div',{class:'pvbox'}),pg=paper(g,which);box.append(pg);
  body.replaceChildren(el('div',{class:'row2',style:'margin-bottom:10px'},sg,sp),box);
  const fit=()=>{const w=box.clientWidth||600,k=w/1123;pg.style.transform=`scale(${k})`;box.style.height=(794*k)+'px'};fit();requestAnimationFrame(fit);
  if(!box._ro){box._ro=new ResizeObserver(fit);box._ro.observe(box)}
}
function renderEx(body){
  const g=S.exp.g,msg=el('p',{class:'note',id:'exMsg',role:'status'});
  const sg=el('select',{'aria-label':'الصف',onchange:e=>{S.exp.g=e.target.value}},...GKEYS.map(k=>el('option',{value:k,text:GR[k].label,selected:g===k})));
  const busy=async(b,txt,fn)=>{const o=b.textContent;b.disabled=true;b.textContent=txt;msg.textContent='';try{await fn()}catch(e){msg.textContent='تعذّر إنشاء الملف: '+(e&&e.message||'خطأ غير معروف')}finally{b.disabled=false;b.textContent=o}};
  const nm=ext=>`${GR[S.exp.g].label.replace(' ','')}-WP-${WEEK}.${ext}`;
  const bW=el('button',{class:'btn p'},'تنزيل Word من القالب المعتمد'),bP=el('button',{class:'btn'},'حفظ PDF (نص حقيقي)'),bC=el('button',{class:'btn'},'CSV لجداول Google'),bJ=el('button',{class:'btn'},'JSON');
  bW.onclick=()=>busy(bW,'جارٍ الإنشاء…',async()=>{await saveFile(nm('docx'),await makeDocx(S.exp.g))});
  bP.onclick=()=>printPdf(S.exp.g);
  bC.onclick=()=>saveFile(`weekly-plan-week${WEEK}.csv`,new Blob([toCsv()],{type:'text/csv'}));
  bJ.onclick=()=>saveFile(`weekly-plan-week${WEEK}.json`,new Blob([JSON.stringify(allRows(),null,1)],{type:'application/json'}));
  body.replaceChildren(el('div',{class:'row2',style:'margin-bottom:14px'},el('label',{for:'exg',text:'الصف'}),Object.assign(sg,{id:'exg'})),el('div',{style:'display:grid;gap:10px'},bW,bP),el('p',{class:'note',text:'Word يُبنى داخل قالبك المعتمد (الترويسة والتذييل كما هما). PDF: تفتح نافذة الطباعة، اختر «Save as PDF» والاتجاه أفقي (Landscape) وأوقف «Headers and footers».'}),(isAdmin()?el('div',{class:'row2',style:'margin-top:14px'},bC,bJ):null),msg);
}

/* ---------- boot + login ---------- */
function showLogin(msg){
  const L=$('#login');L.hidden=false;$('#loginMsg').textContent=msg||'';
  const inp=$('#loginCode');inp.value='';setTimeout(()=>inp.focus(),50);
  $('#loginGo').onclick=async()=>{const v=inp.value.replace(/\s+/g,'');if(!v){$('#loginMsg').textContent='أدخل رمز الدور';return}TOKEN=v;IDTOKEN='';await connect()};
  inp.onkeydown=e=>{if(e.key==='Enter')$('#loginGo').click()};
  const gb=$('#loginGoogle');
  if(CFGW.CLIENT_ID&&!gb.dataset.on){gb.hidden=false;gb.dataset.on='1';gb.onclick=()=>{
    const go=()=>{google.accounts.id.initialize({client_id:CFGW.CLIENT_ID,callback:r=>{IDTOKEN=r.credential;TOKEN='';connect()}});google.accounts.id.prompt()};
    if(window.google&&google.accounts)go();else{const sc=el('script',{src:'https://accounts.google.com/gsi/client',async:true});sc.onload=go;document.head.append(sc)}}}
}
async function connect(){
  setStore('pending','جارٍ الاتصال…');
  try{const j=await apiGet();applyServer(j);
    if(TOKEN){const st=ss();if(st)try{st.setItem(TKEY,TOKEN)}catch(_){}}
    $('#login').hidden=true;renderTabs();renderGrid();refreshAll();setStore('db','متصل بالشيت');startPoll()
  }catch(e){if(e.api){const st=ss();if(st)try{st.removeItem(TKEY)}catch(_){}showLogin(e.message)}else{setStore('warn','تعذّر الاتصال بالخدمة');showLogin('تعذّر الاتصال. تحقق من الشبكة ثم أعد المحاولة.')}}
}
async function boot(){
  try{S.name=localStorage.getItem(NKEY)||''}catch(e){}
  try{LOGOS=await (await fetch('data/logos.json')).json()}catch(e){LOGOS={school:'',diploma:'',aiasc:''}}
  renderTop();renderRole();renderTabs();renderGrid();renderChips();renderDock();
  if(!CFGW.API_URL){setStore('warn','لم يُضبط رابط الخدمة');showLogin('لم يُضبط API_URL في js/config.js');return}
  const qs=new URLSearchParams(location.search),t=qs.get('t');
  if(t){const st=ss();if(st)try{st.setItem(TKEY,t)}catch(_){}history.replaceState(null,'',location.pathname+location.hash)}
  const st=ss();TOKEN=(t||(st&&st.getItem(TKEY))||'').replace(/\s+/g,'');
  if(!TOKEN){showLogin();return}
  await connect();
  if(location.hash==='#gaps')openWin('gaps');
}
boot();
})();
