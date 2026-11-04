'use strict';
/* ============================================================
   LMS Portal v3 — static, Vercel-ready
   ============================================================ */

/* ---------------- Utils ---------------- */
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const uid = ()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const esc = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nl2br = s=>esc(s||'').replace(/\n/g,'<br>');
const shuffle = a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const fmtDate = ts=>{if(!ts) return '—';const d=new Date(ts),p=n=>String(n).padStart(2,'0');return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;};
const fmtDuration = ms=>{const m=Math.round((ms||0)/60000);if(m<1) return '<1 min';if(m<60) return m+' min';const h=Math.floor(m/60),r=m%60;return h+'h'+(r?' '+r+'m':'');};
function toast(msg){const el=$('#toast');el.textContent=msg;el.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>el.hidden=true,2600);}
function downloadFile(name,content,mime){const b=new Blob([content],{type:mime||'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);}
function setLoading(on){const el=$('#loading');if(el) el.hidden=!on;}

/* ---------------- IndexedDB ---------------- */
const DB_NAME='lms_portal', DB_VER=2;
let _db=null;
function openDB(){
  if(_db) return Promise.resolve(_db);
  return new Promise((res,rej)=>{
    const req=indexedDB.open(DB_NAME,DB_VER);
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      for(const s of ['courses','files','progress','attempts','settings','attendance'])
        if(!db.objectStoreNames.contains(s)) db.createObjectStore(s,{keyPath:'key' in [] ? 'x' : 'id'});
      // fix: attendance has id, others too; settings uses 'key'
      if(!db.objectStoreNames.contains('settings')) db.createObjectStore('settings',{keyPath:'key'});
    };
    req.onsuccess=()=>{_db=req.result;res(_db);};
    req.onerror=()=>rej(req.error);
  });
}
/* Correct the store keyPaths for stores we did not pre-create properly */
(function fixStores(){
  const r=indexedDB.open(DB_NAME,DB_VER);
  r.onupgradeneeded=e=>{
    const db=e.target.result;
    const specs={courses:{keyPath:'id'},files:{keyPath:'id'},progress:{keyPath:'key'},attempts:{keyPath:'id'},settings:{keyPath:'key'},attendance:{keyPath:'id'}};
    for(const [name,opt] of Object.entries(specs)){
      if(!db.objectStoreNames.contains(name)) db.createObjectStore(name,opt);
      else {
        // clear out any wrong-key store created above
        try{ const tx=e.target.transaction; tx.objectStore(name); }catch(_){ db.deleteObjectStore(name); db.createObjectStore(name,opt); }
      }
    }
  };
})();

async function idbAll(store){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(store,'readonly').objectStore(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});}
async function idbGet(store,key){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(store,'readonly').objectStore(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function idbPut(store,val){const db=await openDB();return new Promise((res,rej)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).put(val);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);});}
async function idbDel(store,key){const db=await openDB();return new Promise((res,rej)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).delete(key);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);});}
async function idbClear(store){const db=await openDB();return new Promise((res,rej)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).clear();t.oncomplete=()=>res();t.onerror=()=>rej(t.error);});}

/* ---------------- Auth (PBKDF2) ---------------- */
async function hashPassword(pw, salt){
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:120000,hash:'SHA-256'},key,256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
async function verifyPassword(pw, salt, expectedHash){ return await hashPassword(pw,salt) === expectedHash; }

/* ---------------- i18n ---------------- */
const I18N={
en:{
 'app.name':'LMS Portal','nav.logout':'Log out',
 'login.trainee':'Trainee','login.admin':'Admin','login.fullName':'Full name','login.department':'Department',
 'login.password':'Admin password','login.enter':'Sign in','login.wrongPassword':'Incorrect password',
 'login.nameRequired':'Please enter your full name and department','login.tagline':'Internal learning platform',
 'common.save':'Save','common.cancel':'Cancel','common.delete':'Delete','common.edit':'Edit','common.back':'Back',
 'common.next':'Next','common.prev':'Previous','common.submit':'Submit','common.close':'Close','common.confirm':'Confirm',
 'common.loading':'Loading…','common.add':'Add','common.export':'Export','common.import':'Import','common.all':'All',
 'common.name':'Name','common.department':'Department','common.date':'Date','common.status':'Status',
 'common.score':'Score','common.course':'Course','common.of':'of','common.actions':'Actions',
 'home.title':'My courses','home.empty':'No courses available yet.','home.open':'Open',
 'home.notStarted':'Not started','home.inProgress':'In progress','home.completed':'Completed','home.locked':'Closed',
 'course.abstract':'Abstract','course.introduction':'Introduction','course.objectives':'Objectives','course.contents':'Contents',
 'course.material':'Learning material','course.markComplete':'Mark as complete','course.completedOn':'Completed on {d}',
 'course.quiz':'Quiz','course.passingRate':'Passing rate','course.deadline':'Deadline','course.noDeadline':'No deadline',
 'course.startQuiz':'Start quiz','course.retakeQuiz':'Retake quiz','course.quizLocked':'Quiz locked',
 'course.quizLockedHint':'The deadline has passed. Please contact your trainer.',
 'course.mustCompleteFirst':'Mark the material as complete to unlock the quiz.',
 'course.bestScore':'Best score','course.noQuiz':'No quiz for this course',
 'course.fileMissing':'No file attached','course.download':'Download PDF','course.timeSpent':'Time spent',
 'quiz.title':'Quiz','quiz.question':'Question','quiz.submit':'Submit answers','quiz.confirmSubmit':'Submit your answers now?',
 'quiz.unanswered':'Please answer all questions before submitting.',
 'result.title':'Result','result.passed':'PASSED','result.failed':'NOT PASSED','result.score':'Score',
 'result.passing':'Passing rate','result.timeSpent':'Total learning time','result.completedAt':'Completed at',
 'result.export':'Export result (PDF)','result.exportJson':'Export data (JSON)','result.certificate':'Certificate (PDF)',
 'result.review':'Answer review','result.yourAnswer':'Your answer','result.correctAnswer':'Correct answer',
 'result.retry':'Try again','result.back':'Back to course','result.hidden':'Answer key is shown only after you pass.',
 'cert.title':'Certificate of Completion','cert.awarded':'This certificate is awarded to',
 'cert.for':'for successfully completing','cert.date':'Date','cert.score':'Score','cert.signature':'Trainer / Administrator',
 'admin.dashboard':'Dashboard','admin.courses':'Courses','admin.attendance':'Attendance','admin.settings':'Settings',
 'admin.totalTrainees':'Trainees','admin.totalCourses':'Courses','admin.totalAttempts':'Attempts','admin.passRate':'Pass rate',
 'admin.exportCsv':'Export CSV','admin.exportJson':'Export JSON','admin.importResults':'Import results (JSON)',
 'admin.clearRecords':'Clear all records','admin.clearRecordsConfirm':'Delete all trainee progress and results from this browser? This cannot be undone.',
 'admin.noRecords':'No records yet.','admin.course.new':'New course','admin.course.edit':'Edit course',
 'admin.course.titleEn':'Title (EN)','admin.course.titleTh':'Title (TH)',
 'admin.course.abstract':'Abstract','admin.course.introduction':'Introduction','admin.course.objectives':'Objectives',
 'admin.course.contents':'Contents','admin.course.pdf':'PDF file (max 50 MB)','admin.course.currentFile':'Current file',
 'admin.course.passing':'Passing rate (%)','admin.course.deadline':'Deadline (optional)',
 'admin.course.timer':'Enable quiz timer','admin.course.timerMinutes':'Timer (minutes)','admin.course.published':'Published',
 'admin.course.questions':'Quiz questions','admin.course.addQuestion':'+ Add question',
 'admin.course.question':'Question','admin.course.option':'Option','admin.course.addOption':'+ Option',
 'admin.course.deleteConfirm':'Delete this course and its file?','admin.course.saved':'Course saved',
 'admin.course.fileTooBig':'File exceeds the 50 MB limit','admin.course.noCourses':'No courses yet.',
 'admin.settings.password':'Admin password','admin.settings.passwordSaved':'Password updated',
 'admin.settings.language':'Default language','admin.settings.backup':'Backup & restore',
 'admin.settings.exportAll':'Export full backup (JSON)','admin.settings.importAll':'Restore from backup',
 'admin.settings.importMode':'Import mode','admin.settings.merge':'Merge (upsert)','admin.settings.replace':'Replace all',
 'admin.settings.danger':'Danger zone','admin.settings.wipe':'Wipe all data',
 'admin.settings.wipeConfirm':'Erase ALL data including courses, files, progress and results? This cannot be undone.',
 'admin.publish.title':'Publish content.json',
 'admin.publish.hint':'Download the updated content.json, then commit it to your GitHub repo. Vercel will redeploy automatically.',
 'admin.publish.download':'Download content.json',
 'admin.publish.reload':'Reload from server',
 'att.title':'Attendance','att.who':'Trainee','att.first':'First seen','att.last':'Last seen',
 'att.events':'Events','att.duration':'Active time','att.exportCsv':'Export attendance (CSV)',
 'att.online':'online','att.offline':'offline','att.noRecords':'No attendance records yet.',
 'toast.saved':'Saved','toast.deleted':'Deleted','toast.imported':'Imported','toast.error':'Something went wrong',
},
th:{
 'app.name':'LMS Portal','nav.logout':'ออกจากระบบ',
 'login.trainee':'ผู้เข้าอบรม','login.admin':'ผู้ดูแลระบบ','login.fullName':'ชื่อ-นามสกุล','login.department':'แผนก',
 'login.password':'รหัสผ่านผู้ดูแลระบบ','login.enter':'เข้าสู่ระบบ','login.wrongPassword':'รหัสผ่านไม่ถูกต้อง',
 'login.nameRequired':'กรุณากรอกชื่อ-นามสกุล และแผนก','login.tagline':'ระบบการเรียนรู้ออนไลน์ภายในองค์กร',
 'common.save':'บันทึก','common.cancel':'ยกเลิก','common.delete':'ลบ','common.edit':'แก้ไข','common.back':'ย้อนกลับ',
 'common.next':'ถัดไป','common.prev':'ก่อนหน้า','common.submit':'ส่งคำตอบ','common.close':'ปิด','common.confirm':'ยืนยัน',
 'common.loading':'กำลังโหลด…','common.add':'เพิ่ม','common.export':'ส่งออก','common.import':'นำเข้า','common.all':'ทั้งหมด',
 'common.name':'ชื่อ','common.department':'แผนก','common.date':'วันที่','common.status':'สถานะ',
 'common.score':'คะแนน','common.course':'หลักสูตร','common.of':'จาก','common.actions':'จัดการ',
 'home.title':'หลักสูตรของฉัน','home.empty':'ยังไม่มีหลักสูตร','home.open':'เปิด',
 'home.notStarted':'ยังไม่เริ่ม','home.inProgress':'กำลังเรียน','home.completed':'สำเร็จแล้ว','home.locked':'ปิดรับ',
 'course.abstract':'บทคัดย่อ','course.introduction':'บทนำ','course.objectives':'วัตถุประสงค์','course.contents':'เนื้อหา',
 'course.material':'เอกสารประกอบการเรียน','course.markComplete':'ทำเครื่องหมายว่าเรียนจบ','course.completedOn':'สำเร็จเมื่อ {d}',
 'course.quiz':'แบบทดสอบ','course.passingRate':'เกณฑ์ผ่าน','course.deadline':'กำหนดส่ง','course.noDeadline':'ไม่มีกำหนด',
 'course.startQuiz':'เริ่มทำแบบทดสอบ','course.retakeQuiz':'ทำแบบทดสอบอีกครั้ง','course.quizLocked':'แบบทดสอบถูกล็อก',
 'course.quizLockedHint':'เลยกำหนดส่งแล้ว กรุณาติดต่อผู้ฝึกสอน',
 'course.mustCompleteFirst':'กรุณาทำเครื่องหมายว่าเรียนจบก่อนเริ่มทำแบบทดสอบ',
 'course.bestScore':'คะแนนสูงสุด','course.noQuiz':'หลักสูตรนี้ไม่มีแบบทดสอบ',
 'course.fileMissing':'ไม่มีไฟล์แนบ','course.download':'ดาวน์โหลด PDF','course.timeSpent':'เวลาที่ใช้',
 'quiz.title':'แบบทดสอบ','quiz.question':'ข้อที่','quiz.submit':'ส่งคำตอบ','quiz.confirmSubmit':'ยืนยันการส่งคำตอบ?',
 'quiz.unanswered':'กรุณาตอบทุกข้อก่อนส่ง',
 'result.title':'ผลการทดสอบ','result.passed':'ผ่าน','result.failed':'ไม่ผ่าน','result.score':'คะแนน',
 'result.passing':'เกณฑ์ผ่าน','result.timeSpent':'เวลาเรียนรวม','result.completedAt':'เสร็จสิ้นเมื่อ',
 'result.export':'ส่งออกผล (PDF)','result.exportJson':'ส่งออกข้อมูล (JSON)','result.certificate':'ใบประกาศนียบัตร (PDF)',
 'result.review':'ทบทวนคำตอบ','result.yourAnswer':'คำตอบของคุณ','result.correctAnswer':'คำตอบที่ถูก',
 'result.retry':'ลองอีกครั้ง','result.back':'กลับไปที่หลักสูตร','result.hidden':'เฉลยจะแสดงเมื่อผ่านเกณฑ์เท่านั้น',
 'cert.title':'ใบประกาศนียบัตร','cert.awarded':'ขอมอบใบประกาศนียบัตรนี้ให้แก่',
 'cert.for':'สำหรับการสำเร็จหลักสูตร','cert.date':'วันที่','cert.score':'คะแนน','cert.signature':'ผู้ฝึกสอน / ผู้ดูแลระบบ',
 'admin.dashboard':'แดชบอร์ด','admin.courses':'หลักสูตร','admin.attendance':'การเข้าร่วม','admin.settings':'ตั้งค่า',
 'admin.totalTrainees':'ผู้เข้าอบรม','admin.totalCourses':'หลักสูตร','admin.totalAttempts':'การทำแบบทดสอบ','admin.passRate':'อัตราการผ่าน',
 'admin.exportCsv':'ส่งออก CSV','admin.exportJson':'ส่งออก JSON','admin.importResults':'นำเข้าผลลัพธ์ (JSON)',
 'admin.clearRecords':'ล้างข้อมูลทั้งหมด','admin.clearRecordsConfirm':'ลบความคืบหน้าและผลการทดสอบทั้งหมดในเบราว์เซอร์นี้หรือไม่? ไม่สามารถกู้คืนได้',
 'admin.noRecords':'ยังไม่มีข้อมูล','admin.course.new':'สร้างหลักสูตร','admin.course.edit':'แก้ไขหลักสูตร',
 'admin.course.titleEn':'ชื่อหลักสูตร (EN)','admin.course.titleTh':'ชื่อหลักสูตร (TH)',
 'admin.course.abstract':'บทคัดย่อ','admin.course.introduction':'บทนำ','admin.course.objectives':'วัตถุประสงค์',
 'admin.course.contents':'เนื้อหา','admin.course.pdf':'ไฟล์ PDF (ไม่เกิน 50 MB)','admin.course.currentFile':'ไฟล์ปัจจุบัน',
 'admin.course.passing':'เกณฑ์ผ่าน (%)','admin.course.deadline':'กำหนดส่ง (ไม่บังคับ)',
 'admin.course.timer':'เปิดจับเวลาแบบทดสอบ','admin.course.timerMinutes':'เวลา (นาที)','admin.course.published':'เผยแพร่',
 'admin.course.questions':'คำถามในแบบทดสอบ','admin.course.addQuestion':'+ เพิ่มคำถาม',
 'admin.course.question':'คำถาม','admin.course.option':'ตัวเลือก','admin.course.addOption':'+ ตัวเลือก',
 'admin.course.deleteConfirm':'ลบหลักสูตรนี้และไฟล์แนบหรือไม่?','admin.course.saved':'บันทึกหลักสูตรแล้ว',
 'admin.course.fileTooBig':'ไฟล์มีขนาดเกิน 50 MB','admin.course.noCourses':'ยังไม่มีหลักสูตร',
 'admin.settings.password':'รหัสผ่านผู้ดูแลระบบ','admin.settings.passwordSaved':'อัปเดตรหัสผ่านแล้ว',
 'admin.settings.language':'ภาษาหลัก','admin.settings.backup':'สำรองและกู้คืน',
 'admin.settings.exportAll':'สำรองข้อมูลทั้งหมด (JSON)','admin.settings.importAll':'กู้คืนจากไฟล์สำรอง',
 'admin.settings.importMode':'รูปแบบการนำเข้า','admin.settings.merge':'รวม (อัปเดต)','admin.settings.replace':'แทนที่ทั้งหมด',
 'admin.settings.danger':'พื้นที่อันตราย','admin.settings.wipe':'ล้างข้อมูลทั้งหมด',
 'admin.settings.wipeConfirm':'ลบข้อมูลทั้งหมด รวมถึงหลักสูตร ไฟล์ ความคืบหน้า และผลลัพธ์? ไม่สามารถกู้คืนได้',
 'admin.publish.title':'เผยแพร่ content.json',
 'admin.publish.hint':'ดาวน์โหลด content.json ที่อัปเดต แล้ว commit ไปที่ GitHub repo ของคุณ Vercel จะ deploy อัตโนมัติ',
 'admin.publish.download':'ดาวน์โหลด content.json','admin.publish.reload':'โหลดจากเซิร์ฟเวอร์',
 'att.title':'การเข้าร่วม','att.who':'ผู้เข้าอบรม','att.first':'เข้าใช้ครั้งแรก','att.last':'เข้าใช้ล่าสุด',
 'att.events':'กิจกรรม','att.duration':'เวลาทั้งหมด','att.exportCsv':'ส่งออกการเข้าร่วม (CSV)',
 'att.online':'ออนไลน์','att.offline':'ออฟไลน์','att.noRecords':'ยังไม่มีการบันทึกการเข้าร่วม',
 'toast.saved':'บันทึกแล้ว','toast.deleted':'ลบแล้ว','toast.imported':'นำเข้าแล้ว','toast.error':'เกิดข้อผิดพลาด',
}};
function t(k,vars){let s=(I18N[state.lang]&&I18N[state.lang][k])||I18N.en[k]||k;if(vars) for(const key in vars) s=s.replace(new RegExp('\\{'+key+'\\}','g'),vars[key]);return s;}
function L(obj,base){if(!obj) return '';return (state.lang==='th'&&obj[base+'_th'])?obj[base+'_th']:(obj[base+'_en']||obj[base]||'');}

/* ---------------- State ---------------- */
const state={
  user:null,isAdmin:false,lang:'en',theme:'light',
  settings:{},courses:[],progress:[],attempts:[],attendance:[],
  view:'login',params:{},adminTab:'dashboard',
  courseTimer:null,pdfUrl:null,quiz:null,lastResult:null,editor:null,
  serverFiles:{},contentLoadedFromServer:false,
  attendanceId:null,
};

/* ---------------- Preferences ---------------- */
function applyTheme(){document.documentElement.setAttribute('data-theme',state.theme);localStorage.setItem('lms_theme',state.theme);const b=$('#btnTheme');if(b) b.textContent=state.theme==='dark'?'☀':'☾';}
function applyLang(){document.documentElement.lang=state.lang;localStorage.setItem('lms_lang',state.lang);const b=$('#btnLang');if(b) b.textContent=state.lang==='th'?'TH':'EN';}
async function loadSettings(){
  const rows=await idbAll('settings');
  state.settings={lang:'en',theme:'light'};
  rows.forEach(r=>state.settings[r.key]=r.value);
  if(!state.settings.adminSalt){
    const salt=crypto.getRandomValues(new Uint8Array(16)).reduce((s,b)=>s+b.toString(16).padStart(2,'0'),'');
    const hash=await hashPassword('admin123',salt);
    await saveSetting('adminSalt',salt);
    await saveSetting('adminHash',hash);
  }
}
async function saveSetting(key,value){state.settings[key]=value;await idbPut('settings',{key,value});}

/* ---------------- Data refresh ---------------- */
async function refreshData(){
  if(!state.contentLoadedFromServer) state.courses=(await idbAll('courses')).sort((a,b)=>(a.order||0)-(b.order||0)||a.createdAt-b.createdAt);
  state.progress=await idbAll('progress');
  state.attempts=(await idbAll('attempts')).sort((a,b)=>b.completedAt-a.completedAt);
  state.attendance=(await idbAll('attendance')).sort((a,b)=>b.firstSeen-a.firstSeen);
}
async function refreshProgress(){state.progress=await idbAll('progress');}
async function refreshAttempts(){state.attempts=(await idbAll('attempts')).sort((a,b)=>b.completedAt-a.completedAt);}
async function refreshAttendance(){state.attendance=(await idbAll('attendance')).sort((a,b)=>b.firstSeen-a.firstSeen);}

/* ---------------- Server content ---------------- */
async function loadServerContent(){
  try{
    const r=await fetch('content.json',{cache:'no-store'});
    if(!r.ok) return false;
    const d=await r.json();
    state.courses=d.courses||[];
    state.serverFiles=d.files||{};
    state.contentLoadedFromServer=true;
    return true;
  }catch(e){return false;}
}
async function getCourseBlob(course){
  if(!course.fileId) return null;
  const sf=state.serverFiles[course.fileId];
  if(sf&&sf.data) return await (await fetch(sf.data)).blob();
  const f=await idbGet('files',course.fileId);
  return f?f.blob:null;
}
async function blobToDataURL(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(blob);});}
async function publishContent(){
  const filesOut={};
  for(const c of state.courses){
    if(!c.fileId) continue;
    if(state.serverFiles[c.fileId]) filesOut[c.fileId]=state.serverFiles[c.fileId];
    else { const f=await idbGet('files',c.fileId); if(f) filesOut[c.fileId]={name:f.name,data:await blobToDataURL(f.blob)}; }
  }
  const payload={app:'lms-portal',version:3,publishedAt:Date.now(),courses:state.courses,files:filesOut};
  downloadFile('content.json',JSON.stringify(payload));
  toast('Downloaded content.json — commit to GitHub → Vercel deploys');
}

/* ---------------- Progress helpers ---------------- */
function pKey(name,dept,courseId){return [String(name).trim().toLowerCase(),String(dept).trim().toLowerCase(),courseId].join('|');}
async function getProgress(courseId){if(!state.user) return null;return await idbGet('progress',pKey(state.user.name,state.user.department,courseId));}
function bestAttempt(courseId){
  if(!state.user) return null;
  const list=state.attempts.filter(a=>a.courseId===courseId&&a.userName===state.user.name&&a.department===state.user.department);
  if(!list.length) return null;
  return list.reduce((best,a)=>a.score>best.score?a:best);
}
function courseProgress(course){
  if(!state.user) return {pct:0,materialDone:false,quizPassed:false,best:null,done:false};
  const key=pKey(state.user.name,state.user.department,course.id);
  const prog=state.progress.find(p=>p.key===key);
  const materialDone=!!(prog&&prog.completed);
  const best=bestAttempt(course.id);
  const quizPassed=!!(best&&best.passed);
  const hasQuiz=!!(course.quiz&&course.quiz.questions&&course.quiz.questions.length);
  let pct;
  if(hasQuiz) pct=(materialDone?50:0)+(quizPassed?50:0);
  else pct=materialDone?100:0;
  return {pct,materialDone,quizPassed,best,done:pct===100};
}
function quizLocked(course){if(!course.published) return true;if(!course.deadline) return false;return Date.now()>new Date(course.deadline).getTime();}

/* ---------------- Attendance ---------------- */
async function ensureAttendanceRecord(){
  if(!state.user) return null;
  if(state.attendanceId){
    const rec=await idbGet('attendance',state.attendanceId);
    if(rec) return rec;
  }
  const rec={
    id:uid(),
    userName:state.user.name,
    department:state.user.department,
    firstSeen:Date.now(),
    lastSeen:Date.now(),
    events:[{type:'login',at:Date.now()}],
  };
  await idbPut('attendance',rec);
  state.attendanceId=rec.id;
  await refreshAttendance();
  return rec;
}
async function logAttendanceEvent(type, courseId){
  const rec=await ensureAttendanceRecord();
  if(!rec) return;
  rec.lastSeen=Date.now();
  rec.events.push({type,at:Date.now(),courseId:courseId||null});
  await idbPut('attendance',rec);
  await refreshAttendance();
}
async function closeAttendance(){
  if(!state.attendanceId) return;
  const rec=await idbGet('attendance',state.attendanceId);
  if(rec){rec.lastSeen=Date.now();rec.events.push({type:'logout',at:Date.now()});await idbPut('attendance',rec);}
  state.attendanceId=null;
}

/* ---------------- Router ---------------- */
function revokePdf(){if(state.pdfUrl){URL.revokeObjectURL(state.pdfUrl);state.pdfUrl=null;}}
async function flushCourseTime(){
  const tm=state.courseTimer;if(!tm) return;
  state.courseTimer=null;
  const elapsed=Date.now()-tm.start;if(elapsed<1000) return;
  const rec=(await idbGet('progress',tm.key))||{key:tm.key,userName:state.user.name,department:state.user.department,courseId:tm.courseId,completed:false,timeSpentMs:0};
  rec.timeSpentMs=(rec.timeSpentMs||0)+elapsed;
  await idbPut('progress',rec);
  await refreshProgress();
}
function startCourseTimer(courseId){if(!state.user) return;state.courseTimer={courseId,key:pKey(state.user.name,state.user.department,courseId),start:Date.now()};}
async function go(view,params={}){
  await flushCourseTime();revokePdf();
  state.view=view;state.params=params||{};
  window.scrollTo(0,0);
  await render();updateChrome();
}
function updateChrome(){
  const tb=$('#topbar');
  const loggedIn=!!(state.user||state.isAdmin);
  tb.hidden=!loggedIn;
  $('#whoami').textContent=state.isAdmin?t('login.admin'):(state.user?`${state.user.name} · ${state.user.department}`:'');
  applyLang();applyTheme();
}

/* ---------------- Render root ---------------- */
async function render(){
  const app=$('#app');
  switch(state.view){
    case 'login': app.innerHTML=viewLogin();break;
    case 'home': app.innerHTML=viewHome();break;
    case 'course': return viewCourse();
    case 'quiz': app.innerHTML=viewQuiz();break;
    case 'result': app.innerHTML=viewResult();break;
    case 'admin': return viewAdmin();
    default: app.innerHTML=viewLogin();
  }
}

/* ============================================================
   LOGIN
   ============================================================ */
function viewLogin(){
  return `
  <div class="login-wrap"><div class="card login-card">
    <h1>${t('app.name')}</h1>
    <p class="muted" style="margin-bottom:0">${t('login.tagline')}</p>
    <div class="tabs">
      <button class="tab active" data-action="login-tab" data-tab="trainee">${t('login.trainee')}</button>
      <button class="tab" data-action="login-tab" data-tab="admin">${t('login.admin')}</button>
    </div>
    <form id="traineeForm" autocomplete="off">
      <label class="field"><span>${t('login.fullName')}</span><input type="text" name="name" required></label>
      <label class="field"><span>${t('login.department')}</span><input type="text" name="department" required></label>
      <button class="btn block" type="submit">${t('login.enter')}</button>
    </form>
    <form id="adminForm" class="hidden" autocomplete="off">
      <label class="field"><span>${t('login.password')}</span><input type="password" name="password" required></label>
      <button class="btn block" type="submit">${t('login.enter')}</button>
    </form>
  </div></div>`;
}

/* ============================================================
   TRAINEE — HOME
   ============================================================ */
function viewHome(){
  const courses=state.courses.filter(c=>c.published);
  if(!courses.length) return `<h1>${t('home.title')}</h1><div class="card"><p class="muted">${t('home.empty')}</p></div>`;
  const cards=courses.map(c=>{
    const p=courseProgress(c);
    const locked=quizLocked(c);
    const badge=p.done?`<span class="badge solid">✓ ${t('home.completed')}</span>`
      :p.pct>0?`<span class="badge">${t('home.inProgress')}</span>`
      :`<span class="badge">${t('home.notStarted')}</span>`;
    return `<div class="card stack" style="gap:10px">
      <div class="spread"><h3 style="margin:0">${esc(L(c,'title'))}</h3>${badge}</div>
      <p class="muted" style="margin:0;font-size:.88rem;min-height:2.6em;overflow:hidden">${esc((L(c,'abstract')||'').slice(0,120))}${(L(c,'abstract')||'').length>120?'…':''}</p>
      <div class="bar"><i style="width:${p.pct}%"></i></div>
      <div class="spread">
        <small class="muted">${p.pct}%</small>
        ${locked&&!p.done?`<span class="badge fail">${t('home.locked')}</span>`:''}
        <button class="btn sm" data-action="open-course" data-id="${c.id}">${t('home.open')}</button>
      </div></div>`;
  }).join('');
  return `<div class="spread" style="margin-bottom:18px"><h1 style="margin:0">${t('home.title')}</h1></div><div class="grid cards">${cards}</div>`;
}

/* ============================================================
   TRAINEE — COURSE
   ============================================================ */
async function viewCourse(){
  const app=$('#app');
  const course=state.courses.find(c=>c.id===state.params.courseId);
  if(!course){await go('home');return;}
  await logAttendanceEvent('course_open',course.id);

  let pdfUrl=null,fileName='';
  if(course.fileId){
    const blob=await getCourseBlob(course);
    if(blob){pdfUrl=URL.createObjectURL(blob);fileName=course.fileName||'material.pdf';state.pdfUrl=pdfUrl;}
  }
  const prog=await getProgress(course.id);
  const materialDone=!!(prog&&prog.completed);
  const timeSpent=(prog&&prog.timeSpentMs)||0;
  const best=bestAttempt(course.id);
  const hasQuiz=!!(course.quiz&&course.quiz.questions&&course.quiz.questions.length);
  const locked=quizLocked(course);
  const p=courseProgress(course);
  startCourseTimer(course.id);

  let quizBlock='';
  if(!hasQuiz){quizBlock=`<p class="muted">${t('course.noQuiz')}</p>`;}
  else{
    const bestTxt=best?`<p style="margin:6px 0"><b>${t('course.bestScore')}:</b> ${best.score}% ${best.passed?'✓':'—'}</p>`:'';
    const dl=course.deadline?`<p style="margin:6px 0"><b>${t('course.deadline')}:</b> ${fmtDate(new Date(course.deadline).getTime())}</p>`:`<p style="margin:6px 0" class="muted">${t('course.noDeadline')}</p>`;
    const pr=`<p style="margin:6px 0"><b>${t('course.passingRate')}:</b> ${course.passingRate}%</p>`;
    let btn;
    if(locked) btn=`<button class="btn block" disabled>${t('course.quizLocked')}</button><p class="muted" style="font-size:.82rem;margin-top:8px">${t('course.quizLockedHint')}</p>`;
    else if(!materialDone) btn=`<button class="btn block" disabled>${t('course.startQuiz')}</button><p class="muted" style="font-size:.82rem;margin-top:8px">${t('course.mustCompleteFirst')}</p>`;
    else btn=`<button class="btn block" data-action="start-quiz" data-id="${course.id}">${best?t('course.retakeQuiz'):t('course.startQuiz')}</button>`;
    quizBlock=`${pr}${dl}${bestTxt}${btn}`;
  }
  const metaBlock=(labelKey,field)=>{const val=L(course,field);if(!val) return '';return `<div class="meta-block"><h3>${t(labelKey)}</h3><div>${nl2br(val)}</div></div>`;};

  app.innerHTML=`
    <div class="spread" style="margin-bottom:14px">
      <button class="btn ghost sm" data-action="go-home">← ${t('common.back')}</button>
      <span class="badge ${p.done?'solid':''}">${p.pct}%</span>
    </div>
    <h1>${esc(L(course,'title'))}</h1>
    <div class="bar" style="margin-bottom:22px"><i style="width:${p.pct}%"></i></div>
    <div class="meta-grid" style="margin-bottom:22px">
      ${metaBlock('course.abstract','abstract')}${metaBlock('course.introduction','introduction')}
      ${metaBlock('course.objectives','objectives')}${metaBlock('course.contents','contents')}
    </div>
    <div class="card stack" style="margin-bottom:18px">
      <div class="spread">
        <h2 style="margin:0">${t('course.material')}</h2>
        ${pdfUrl?`<a class="btn ghost sm" href="${pdfUrl}" download="${esc(fileName)}">${t('course.download')}</a>`:''}
      </div>
      ${pdfUrl?`<iframe class="pdf-frame" src="${pdfUrl}#toolbar=1" title="PDF"></iframe>`:`<p class="muted">${t('course.fileMissing')}</p>`}
      <div class="spread">
        <small class="muted">${t('course.timeSpent')}: ${fmtDuration(timeSpent)}</small>
        ${materialDone?`<span class="badge solid">✓ ${t('course.completedOn',{d:fmtDate(prog.completedAt)})}</span>`
          :`<button class="btn" data-action="mark-complete" data-id="${course.id}">${t('course.markComplete')}</button>`}
      </div>
    </div>
    <div class="card stack"><h2 style="margin:0">${t('course.quiz')}</h2>${quizBlock}</div>`;
}

/* ============================================================
   TRAINEE — QUIZ
   ============================================================ */
function viewQuiz(){
  const s=state.quiz;if(!s) return '';
  const course=state.courses.find(c=>c.id===s.courseId);if(!course) return '';
  const q=s.questions[s.current];
  const total=s.questions.length;
  const answered=s.answers[s.current];
  const isLast=s.current===total-1;
  const timerHtml=s.endsAt?`<span class="timer" id="quizTimer">--:--</span>`:'';
  return `
  <div class="spread" style="margin-bottom:14px">
    <h2 style="margin:0">${esc(L(course,'title'))} — ${t('quiz.title')}</h2>
    <div class="row">${timerHtml}</div>
  </div>
  <div class="card stack">
    <div class="spread">
      <span class="q-count">${t('quiz.question')} ${s.current+1} ${t('common.of')} ${total}</span>
      <span class="q-count">${course.passingRate}% ${t('result.passing').toLowerCase()}</span>
    </div>
    <div class="bar"><i style="width:${((s.current+1)/total)*100}%"></i></div>
    <h3 style="margin-top:8px">${esc(L(q,'q'))}</h3>
    <div>${q.options.map((o,i)=>`<button class="opt ${answered===i?'sel':''}" data-action="pick" data-idx="${i}">${esc(L(o,'text'))}</button>`).join('')}</div>
    <div class="spread">
      <button class="btn ghost" data-action="quiz-prev" ${s.current===0?'disabled':''}>${t('common.prev')}</button>
      ${isLast?`<button class="btn" data-action="quiz-submit" ${answered==null?'disabled':''}>${t('quiz.submit')}</button>`
        :`<button class="btn" data-action="quiz-next" ${answered==null?'disabled':''}>${t('common.next')}</button>`}
    </div>
  </div>`;
}
function buildQuizSession(course){
  const questions=course.quiz.questions.map(q=>{
    const opts=q.options.map((o,i)=>({text_en:o.text_en,text_th:o.text_th,correct:i===q.correct}));
    shuffle(opts);
    return {id:q.id,q_en:q.q_en,q_th:q.q_th,options:opts};
  });
  shuffle(questions);
  return {courseId:course.id,questions,answers:new Array(questions.length).fill(null),current:0,startedAt:Date.now(),
    endsAt:course.timerEnabled?Date.now()+(Number(course.timerMinutes)||10)*60000:null,timerId:null};
}
function startQuizTimer(){
  const s=state.quiz;if(!s||!s.endsAt) return;
  clearInterval(s.timerId);
  s.timerId=setInterval(()=>{
    const left=s.endsAt-Date.now();
    const el=$('#quizTimer');
    if(left<=0){clearInterval(s.timerId);if(el) el.textContent='00:00';submitQuiz(true);return;}
    if(el){const m=Math.floor(left/60000),sec=Math.floor((left%60000)/1000);el.textContent=`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;}
  },250);
}
async function submitQuiz(auto=false){
  const s=state.quiz;if(!s) return;
  clearInterval(s.timerId);
  if(!auto&&s.answers.some(a=>a==null)){toast(t('quiz.unanswered'));return;}
  const course=state.courses.find(c=>c.id===s.courseId);
  const total=s.questions.length;
  let correct=0;
  const detail=s.questions.map((q,i)=>{
    const chosen=s.answers[i];
    const isCorrect=chosen!=null&&q.options[chosen].correct;
    if(isCorrect) correct++;
    return {q_en:q.q_en,q_th:q.q_th,options:q.options.map(o=>({text_en:o.text_en,text_th:o.text_th,correct:o.correct})),chosen,isCorrect};
  });
  const score=total?Math.round((correct/total)*100):0;
  const passed=score>=(course.passingRate||0);
  const prog=await getProgress(course.id);
  const timeSpentMs=(prog&&prog.timeSpentMs)||0;
  const attempt={id:uid(),userName:state.user.name,department:state.user.department,courseId:course.id,
    courseTitleEn:course.title_en,courseTitleTh:course.title_th,score,correct,total,
    passingRate:course.passingRate,passed,startedAt:s.startedAt,completedAt:Date.now(),
    quizDurationMs:Date.now()-s.startedAt,learningTimeMs:timeSpentMs,detail};
  await idbPut('attempts',attempt);
  await refreshAttempts();
  await logAttendanceEvent('quiz_submit',course.id);
  state.lastResult=attempt;state.quiz=null;
  await go('result',{attemptId:attempt.id});
}

/* ============================================================
   TRAINEE — RESULT
   ============================================================ */
function viewResult(){
  const a=state.lastResult;
  if(!a) return `<div class="card"><p class="muted">—</p></div>`;
  const course=state.courses.find(c=>c.id===a.courseId);
  const review=a.passed?`<div class="card stack" style="margin-top:18px">
    <h2 style="margin:0">${t('result.review')}</h2>
    ${a.detail.map((d,i)=>{
      const qObj={q_en:d.q_en,q_th:d.q_th};
      return `<div class="review-item">
        <div><b>${i+1}.</b> ${esc(L(qObj,'q'))}</div>
        ${d.options.map((o,idx)=>`<div class="ans" style="${o.correct?'font-weight:700':''}">
          ${idx===d.chosen?'▸ ':''}${esc(L(o,'text'))}
          ${o.correct?` <span class="badge solid">${t('result.correctAnswer')}</span>`:''}
          ${(idx===d.chosen&&!o.correct)?` <span class="badge fail">${t('result.yourAnswer')}</span>`:''}
        </div>`).join('')}
      </div>`;
    }).join('')}
  </div>`:`<p class="muted" style="margin-top:18px">${t('result.hidden')}</p>`;
  return `
  <div class="card stack" style="max-width:720px;margin:0 auto">
    <h1 style="text-align:center;margin:0">${t('result.title')}</h1>
    <p class="muted" style="text-align:center;margin:0">${esc(L(course||{},'title'))}</p>
    <div class="score-ring"><div style="text-align:center">
      <b>${a.score}%</b><small>${a.correct}/${a.total} · ${t('result.passing')} ${a.passingRate}%</small>
    </div></div>
    <div class="verdict ${a.passed?'':'fail'}">${a.passed?'✓ '+t('result.passed'):'✕ '+t('result.failed')}</div>
    <div class="table-wrap" style="margin-top:8px"><table><tbody>
      <tr><th>${t('common.name')}</th><td>${esc(a.userName)}</td></tr>
      <tr><th>${t('common.department')}</th><td>${esc(a.department)}</td></tr>
      <tr><th>${t('result.timeSpent')}</th><td>${fmtDuration(a.learningTimeMs)}</td></tr>
      <tr><th>${t('result.completedAt')}</th><td>${fmtDate(a.completedAt)}</td></tr>
    </tbody></table></div>
    <div class="row" style="margin-top:8px">
      <button class="btn" data-action="export-pdf">${t('result.export')}</button>
      ${a.passed?`<button class="btn ghost" data-action="export-cert">${t('result.certificate')}</button>`:''}
      <button class="btn ghost sm" data-action="export-result-json">${t('result.exportJson')}</button>
    </div>
    ${review}
    <div class="row" style="margin-top:8px">
      <button class="btn ghost" data-action="back-to-course" data-id="${a.courseId}">${t('result.back')}</button>
      ${!quizLocked(course||{published:true})?`<button class="btn" data-action="start-quiz" data-id="${a.courseId}">${t('result.retry')}</button>`:''}
    </div>
  </div>`;
}

/* ---------------- Print / Export ---------------- */
function printDoc(html){
  const root=$('#printRoot');root.innerHTML=html;
  const done=()=>{root.innerHTML='';window.removeEventListener('afterprint',done);};
  window.addEventListener('afterprint',done);
  setTimeout(()=>window.print(),60);
}
function resultDocHtml(a){
  return `<div class="doc"><h1>${t('app.name')} — ${t('result.title')}</h1><div class="hr"></div>
    <table>
      <tr><th>${t('common.name')}</th><td>${esc(a.userName)}</td></tr>
      <tr><th>${t('common.department')}</th><td>${esc(a.department)}</td></tr>
      <tr><th>${t('common.course')}</th><td>${esc(state.lang==='th'?(a.courseTitleTh||a.courseTitleEn):(a.courseTitleEn||a.courseTitleTh))}</td></tr>
      <tr><th>${t('result.timeSpent')}</th><td>${fmtDuration(a.learningTimeMs)}</td></tr>
      <tr><th>${t('result.score')}</th><td>${a.correct} / ${a.total} &nbsp; (${a.score}%)</td></tr>
      <tr><th>${t('result.passing')}</th><td>${a.passingRate}%</td></tr>
      <tr><th>${t('common.status')}</th><td><b>${a.passed?t('result.passed'):t('result.failed')}</b></td></tr>
      <tr><th>${t('result.completedAt')}</th><td>${fmtDate(a.completedAt)}</td></tr>
    </table><div class="foot">${t('app.name')} · ${fmtDate(Date.now())}</div></div>`;
}
function certDocHtml(a){
  return `<div class="doc cert"><div class="sub">${t('app.name')}</div>
    <h1 style="margin-top:14px">${t('cert.title')}</h1>
    <div class="sub">${t('cert.awarded')}</div>
    <div class="name">${esc(a.userName)}</div>
    <div class="sub">${esc(a.department)}</div>
    <div style="margin-top:26px">${t('cert.for')}</div>
    <div style="font-size:19px;font-weight:700;margin:10px 0">${esc(state.lang==='th'?(a.courseTitleTh||a.courseTitleEn):(a.courseTitleEn||a.courseTitleTh))}</div>
    <div style="margin-top:26px">${t('cert.score')}: <b>${a.score}%</b> &nbsp;&nbsp;|&nbsp;&nbsp; ${t('cert.date')}: <b>${fmtDate(a.completedAt)}</b></div>
    <div style="margin-top:60px">____________________________<br><span class="sub">${t('cert.signature')}</span></div></div>`;
}

/* ============================================================
   ADMIN
   ============================================================ */
async function viewAdmin(){
  const app=$('#app');const tab=state.adminTab;
  const nav=`<nav class="admin-nav">
    <button class="${tab==='dashboard'?'active':''}" data-action="admin-tab" data-tab="dashboard">${t('admin.dashboard')}</button>
    <button class="${tab==='courses'?'active':''}" data-action="admin-tab" data-tab="courses">${t('admin.courses')}</button>
    <button class="${tab==='attendance'?'active':''}" data-action="admin-tab" data-tab="attendance">${t('admin.attendance')}</button>
    <button class="${tab==='settings'?'active':''}" data-action="admin-tab" data-tab="settings">${t('admin.settings')}</button>
  </nav>`;
  let body='';
  if(tab==='dashboard') body=await adminDashboard();
  else if(tab==='courses') body=await adminCourses();
  else if(tab==='course-edit') body=adminCourseEdit();
  else if(tab==='attendance') body=await adminAttendance();
  else body=adminSettings();
  app.innerHTML=`<div class="admin-layout">${nav}<div class="stack">${body}</div></div>`;
}
async function adminDashboard(){
  const attempts=state.attempts;
  const trainees=new Set(attempts.map(a=>a.userName+'|'+a.department));
  const passed=attempts.filter(a=>a.passed).length;
  const passRate=attempts.length?Math.round(passed/attempts.length*100):0;
  const rows=attempts.map(a=>`<tr>
    <td>${esc(a.userName)}</td><td>${esc(a.department)}</td>
    <td>${esc(state.lang==='th'?(a.courseTitleTh||a.courseTitleEn):(a.courseTitleEn||a.courseTitleTh))}</td>
    <td>${a.score}%</td><td>${a.passed?'✓':'✕'}</td>
    <td>${fmtDuration(a.learningTimeMs)}</td><td>${fmtDate(a.completedAt)}</td></tr>`).join('');
  return `<div class="grid stats">
    <div class="stat"><small>${t('admin.totalTrainees')}</small><b>${trainees.size}</b></div>
    <div class="stat"><small>${t('admin.totalCourses')}</small><b>${state.courses.length}</b></div>
    <div class="stat"><small>${t('admin.totalAttempts')}</small><b>${attempts.length}</b></div>
    <div class="stat"><small>${t('admin.passRate')}</small><b>${passRate}%</b></div>
  </div>
  <div class="card stack">
    <div class="spread"><h2 style="margin:0">${t('admin.dashboard')}</h2>
      <div class="row">
        <button class="btn ghost sm" data-action="admin-export-csv">${t('admin.exportCsv')}</button>
        <button class="btn ghost sm" data-action="admin-export-json">${t('admin.exportJson')}</button>
        <label class="btn ghost sm" style="position:relative;overflow:hidden">${t('admin.importResults')}
          <input type="file" accept=".json" data-action="admin-import-results" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
        <button class="btn danger sm" data-action="admin-clear-records">${t('admin.clearRecords')}</button>
      </div>
    </div>
    ${attempts.length?`<div class="table-wrap"><table><thead><tr>
      <th>${t('common.name')}</th><th>${t('common.department')}</th><th>${t('common.course')}</th>
      <th>${t('common.score')}</th><th>${t('common.status')}</th><th>${t('result.timeSpent')}</th><th>${t('common.date')}</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`:`<p class="muted">${t('admin.noRecords')}</p>`}
  </div>`;
}
async function adminCourses(){
  const rows=state.courses.map(c=>{
    const qn=(c.quiz&&c.quiz.questions)?c.quiz.questions.length:0;
    return `<tr><td>${esc(L(c,'title'))}</td><td>${c.published?'✓':'—'}</td>
      <td>${c.passingRate}%</td><td>${qn}</td>
      <td>${c.deadline?fmtDate(new Date(c.deadline).getTime()):'—'}</td>
      <td><button class="btn ghost sm" data-action="edit-course" data-id="${c.id}">${t('common.edit')}</button>
          <button class="btn danger sm" data-action="delete-course" data-id="${c.id}">${t('common.delete')}</button></td></tr>`;
  }).join('');
  return `<div class="spread"><h2 style="margin:0">${t('admin.courses')}</h2>
    <button class="btn" data-action="new-course">+ ${t('admin.course.new')}</button></div>
    <div class="card">${state.courses.length?`<div class="table-wrap"><table><thead><tr>
      <th>${t('common.course')}</th><th>${t('admin.course.published')}</th>
      <th>${t('admin.course.passing')}</th><th>${t('admin.course.questions')}</th>
      <th>${t('admin.course.deadline')}</th><th>${t('common.actions')}</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`:`<p class="muted">${t('admin.course.noCourses')}</p>`}</div>`;
}
function blankCourse(){
  return {id:uid(),title_en:'',title_th:'',abstract_en:'',abstract_th:'',introduction_en:'',introduction_th:'',
    objectives_en:'',objectives_th:'',contents_en:'',contents_th:'',fileId:null,fileName:'',fileSize:0,
    order:state.courses.length,published:true,passingRate:80,deadline:'',timerEnabled:false,timerMinutes:15,
    quiz:{questions:[]},createdAt:Date.now()};
}
function adminCourseEdit(){
  const c=state.editor.course;const isNew=!state.courses.some(x=>x.id===c.id);
  const questionsHtml=c.quiz.questions.map((q,qi)=>`
    <div class="q-item" data-qi="${qi}">
      <div class="spread" style="margin-bottom:10px"><b>${t('admin.course.question')} ${qi+1}</b>
        <button class="btn danger sm" data-action="remove-question" data-qi="${qi}">✕</button></div>
      <label class="field"><span>${t('admin.course.question')} (EN)</span><input type="text" data-qfield="q_en" data-qi="${qi}" value="${esc(q.q_en||'')}"></label>
      <label class="field"><span>${t('admin.course.question')} (TH)</span><input type="text" data-qfield="q_th" data-qi="${qi}" value="${esc(q.q_th||'')}"></label>
      ${q.options.map((o,oi)=>`<div class="opt-row">
        <input type="radio" name="correct-${qi}" data-opt-correct="${qi}" data-oi="${oi}" ${q.correct===oi?'checked':''}>
        <input type="text" data-optfield="text_en" data-qi="${qi}" data-oi="${oi}" placeholder="EN" value="${esc(o.text_en||'')}">
        <input type="text" data-optfield="text_th" data-qi="${qi}" data-oi="${oi}" placeholder="TH" value="${esc(o.text_th||'')}">
        <button class="btn danger sm" data-action="remove-option" data-qi="${qi}" data-oi="${oi}" ${q.options.length<=2?'disabled':''}>✕</button>
      </div>`).join('')}
      <button class="btn ghost sm" data-action="add-option" data-qi="${qi}">${t('admin.course.addOption')}</button>
    </div>`).join('');
  const currentFile=state.editor.existingFileId?`<p class="muted" style="font-size:.83rem">${t('admin.course.currentFile')}: ${esc(state.editor.existingFileName||'')}</p>`:'';
  const fieldRow=(f)=>`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
    <label class="field"><span>${t('admin.course.'+f)} (EN)</span><textarea data-cfield="${f}_en">${esc(c[f+'_en'])}</textarea></label>
    <label class="field"><span>${t('admin.course.'+f)} (TH)</span><textarea data-cfield="${f}_th">${esc(c[f+'_th'])}</textarea></label></div>`;
  return `<div class="spread"><h2 style="margin:0">${isNew?t('admin.course.new'):t('admin.course.edit')}</h2>
    <button class="btn ghost sm" data-action="admin-tab" data-tab="courses">← ${t('common.back')}</button></div>
    <form id="courseForm" class="card stack" style="max-width:none">
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
        <label class="field"><span>${t('admin.course.titleEn')}</span><input type="text" data-cfield="title_en" value="${esc(c.title_en)}"></label>
        <label class="field"><span>${t('admin.course.titleTh')}</span><input type="text" data-cfield="title_th" value="${esc(c.title_th)}"></label>
      </div>
      ${['abstract','introduction','objectives','contents'].map(fieldRow).join('')}
      <label class="field"><span>${t('admin.course.pdf')}</span><input type="file" accept="application/pdf" data-action="course-file"></label>
      ${currentFile}
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
        <label class="field"><span>${t('admin.course.passing')}</span><input type="number" min="0" max="100" data-cfield="passingRate" value="${c.passingRate}"></label>
        <label class="field"><span>${t('admin.course.deadline')}</span><input type="datetime-local" data-cfield="deadline" value="${c.deadline||''}"></label>
        <label class="field"><span>${t('admin.course.timerMinutes')}</span><input type="number" min="1" data-cfield="timerMinutes" value="${c.timerMinutes}"></label>
      </div>
      <label class="check"><input type="checkbox" data-cfield="timerEnabled" ${c.timerEnabled?'checked':''}> ${t('admin.course.timer')}</label>
      <label class="check"><input type="checkbox" data-cfield="published" ${c.published?'checked':''}> ${t('admin.course.published')}</label>
      <hr style="border:0;border-top:1px solid var(--border);margin:8px 0">
      <h3 style="margin:0">${t('admin.course.questions')}</h3>
      <div id="qList">${questionsHtml}</div>
      <button type="button" class="btn ghost" data-action="add-question">${t('admin.course.addQuestion')}</button>
      <div class="row" style="margin-top:10px">
        <button type="submit" class="btn">${t('common.save')}</button>
        <button type="button" class="btn ghost" data-action="admin-tab" data-tab="courses">${t('common.cancel')}</button>
      </div>
    </form>`;
}
async function adminAttendance(){
  const rows=state.attendance.map(a=>{
    const isOnline=(Date.now()-a.lastSeen)<5*60000;
    const duration=a.lastSeen-a.firstSeen;
    return `<tr>
      <td>${esc(a.userName)}</td><td>${esc(a.department)}</td>
      <td>${fmtDate(a.firstSeen)}</td><td>${fmtDate(a.lastSeen)}</td>
      <td>${fmtDuration(duration)}</td><td>${a.events.length}</td>
      <td>${isOnline?`<span class="badge solid">${t('att.online')}</span>`:`<span class="badge">${t('att.offline')}</span>`}</td>
    </tr>`;
  }).join('');
  return `<div class="spread"><h2 style="margin:0">${t('att.title')}</h2>
    <button class="btn ghost sm" data-action="att-export-csv">${t('att.exportCsv')}</button></div>
    <div class="card">${state.attendance.length?`<div class="table-wrap"><table><thead><tr>
      <th>${t('att.who')}</th><th>${t('common.department')}</th>
      <th>${t('att.first')}</th><th>${t('att.last')}</th>
      <th>${t('att.duration')}</th><th>${t('att.events')}</th><th>${t('common.status')}</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`:`<p class="muted">${t('att.noRecords')}</p>`}</div>`;
}
function adminSettings(){
  return `<h2 style="margin:0">${t('admin.settings')}</h2>
  <div class="card stack">
    <h3 style="margin:0">${t('admin.publish.title')}</h3>
    <p class="muted" style="font-size:.85rem;margin:0">${t('admin.publish.hint')}</p>
    <div class="row">
      <button class="btn" data-action="publish-content">${t('admin.publish.download')}</button>
      <button class="btn ghost" data-action="reload-content">${t('admin.publish.reload')}</button>
    </div>
  </div>
  <div class="card stack">
    <h3 style="margin:0">${t('admin.settings.password')}</h3>
    <form id="pwForm" class="row"><input type="password" name="pw" style="max-width:280px" required>
      <button class="btn" type="submit">${t('common.save')}</button></form>
  </div>
  <div class="card stack">
    <h3 style="margin:0">${t('admin.settings.language')}</h3>
    <div class="row">
      <button class="btn ${state.settings.lang==='en'?'':'ghost'}" data-action="set-default-lang" data-lang="en">English</button>
      <button class="btn ${state.settings.lang==='th'?'':'ghost'}" data-action="set-default-lang" data-lang="th">ไทย</button>
    </div>
  </div>
  <div class="card stack">
    <h3 style="margin:0">${t('admin.settings.backup')}</h3>
    <div class="row">
      <button class="btn" data-action="backup-export">${t('admin.settings.exportAll')}</button>
      <label class="btn ghost" style="position:relative;overflow:hidden">${t('admin.settings.importAll')}
        <input type="file" accept=".json" data-action="backup-import" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
      <select id="importMode" style="max-width:220px">
        <option value="merge">${t('admin.settings.merge')}</option>
        <option value="replace">${t('admin.settings.replace')}</option>
      </select>
    </div>
  </div>
  <div class="card stack" style="border-color:var(--danger)">
    <h3 style="margin:0;color:var(--danger)">${t('admin.settings.danger')}</h3>
    <button class="btn danger" data-action="wipe-all">${t('admin.settings.wipe')}</button>
  </div>`;
}

/* ---------------- Backup ---------------- */
async function exportBackup(){
  const filesOut=[];const seen=new Set();
  for(const id in state.serverFiles){filesOut.push({id,name:state.serverFiles[id].name,data:state.serverFiles[id].data});seen.add(id);}
  for(const f of await idbAll('files')){if(seen.has(f.id)) continue;filesOut.push({id:f.id,name:f.name,size:f.size,type:f.type,data:await blobToDataURL(f.blob)});}
  const payload={app:'lms-portal',version:3,exportedAt:Date.now(),courses:state.courses,files:filesOut,
    progress:await idbAll('progress'),attempts:state.attempts,attendance:state.attendance,
    settings:{adminSalt:state.settings.adminSalt,adminHash:state.settings.adminHash,lang:state.settings.lang,theme:state.settings.theme}};
  downloadFile(`lms-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(payload,null,2));
  toast(t('common.export'));
}
async function importBackup(payload,mode){
  if(!payload||!Array.isArray(payload.courses)) throw new Error('bad file');
  if(mode==='replace'){
    for(const s of ['courses','files','progress','attempts','attendance']) await idbClear(s);
    state.serverFiles={};
  }
  for(const c of payload.courses) await idbPut('courses',c);
  if(Array.isArray(payload.files)) for(const f of payload.files) if(f.data) state.serverFiles[f.id]={name:f.name,data:f.data};
  if(Array.isArray(payload.progress)) for(const p of payload.progress) await idbPut('progress',p);
  if(Array.isArray(payload.attempts)) for(const a of payload.attempts) await idbPut('attempts',a);
  if(Array.isArray(payload.attendance)) for(const a of payload.attendance) await idbPut('attendance',a);
  if(payload.settings){
    if(payload.settings.adminSalt) await saveSetting('adminSalt',payload.settings.adminSalt);
    if(payload.settings.adminHash) await saveSetting('adminHash',payload.settings.adminHash);
    if(payload.settings.lang) await saveSetting('lang',payload.settings.lang);
    if(payload.settings.theme) await saveSetting('theme',payload.settings.theme);
  }
  await refreshData();
}

/* ---------------- CSV ---------------- */
function exportCsv(){
  const head=['Name','Department','Course','Score(%)','Correct','Total','PassingRate','Passed','LearningTime(min)','CompletedAt'];
  const lines=[head.join(',')];
  state.attempts.forEach(a=>{
    lines.push([a.userName,a.department,(a.courseTitleEn||a.courseTitleTh||''),a.score,a.correct,a.total,a.passingRate,a.passed?'PASS':'FAIL',
      Math.round((a.learningTimeMs||0)/60000),new Date(a.completedAt).toISOString()]
      .map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(','));
  });
  downloadFile(`lms-results-${new Date().toISOString().slice(0,10)}.csv`,lines.join('\n'),'text/csv');
}
function exportAttendanceCsv(){
  const head=['Name','Department','FirstSeen','LastSeen','DurationMinutes','Events','Online'];
  const lines=[head.join(',')];
  state.attendance.forEach(a=>{
    const isOnline=(Date.now()-a.lastSeen)<5*60000;
    lines.push([a.userName,a.department,new Date(a.firstSeen).toISOString(),new Date(a.lastSeen).toISOString(),
      Math.round((a.lastSeen-a.firstSeen)/60000),a.events.length,isOnline?'YES':'NO']
      .map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(','));
  });
  downloadFile(`lms-attendance-${new Date().toISOString().slice(0,10)}.csv`,lines.join('\n'),'text/csv');
}

/* ============================================================
   EVENT DELEGATION
   ============================================================ */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action]');
  if(!el) return;
  const action=el.dataset.action;

  if(action==='login-tab'){
    $$('.tab').forEach(x=>x.classList.toggle('active',x===el));
    $('#traineeForm').classList.toggle('hidden',el.dataset.tab!=='trainee');
    $('#adminForm').classList.toggle('hidden',el.dataset.tab!=='admin');
    return;
  }
  if(action==='open-course'){await go('course',{courseId:el.dataset.id});return;}
  if(action==='go-home'){await go('home');return;}
  if(action==='back-to-course'){await go('course',{courseId:el.dataset.id});return;}

  if(action==='mark-complete'){
    await flushCourseTime();
    const key=pKey(state.user.name,state.user.department,el.dataset.id);
    const rec=(await idbGet('progress',key))||{key,userName:state.user.name,department:state.user.department,courseId:el.dataset.id,completed:false,timeSpentMs:0};
    rec.completed=true;rec.completedAt=Date.now();
    await idbPut('progress',rec);
    await refreshProgress();
    await logAttendanceEvent('course_complete',el.dataset.id);
    await go('course',{courseId:el.dataset.id});
    return;
  }
  if(action==='start-quiz'){
    await flushCourseTime();
    const course=state.courses.find(c=>c.id===el.dataset.id);
    if(!course) return;
    if(quizLocked(course)){toast(t('course.quizLocked'));return;}
    state.quiz=buildQuizSession(course);
    await logAttendanceEvent('quiz_start',course.id);
    await go('quiz');
    startQuizTimer();
    return;
  }
  if(action==='pick'){state.quiz.answers[state.quiz.current]=Number(el.dataset.idx);await render();return;}
  if(action==='quiz-prev'){if(state.quiz.current>0){state.quiz.current--;await render();}return;}
  if(action==='quiz-next'){
    if(state.quiz.answers[state.quiz.current]==null){toast(t('quiz.unanswered'));return;}
    if(state.quiz.current<state.quiz.questions.length-1){state.quiz.current++;await render();}
    return;
  }
  if(action==='quiz-submit'){if(!confirm(t('quiz.confirmSubmit'))) return;await submitQuiz(false);return;}
  if(action==='export-pdf'){printDoc(resultDocHtml(state.lastResult));return;}
  if(action==='export-cert'){printDoc(certDocHtml(state.lastResult));return;}
  if(action==='export-result-json'){
    const a=state.lastResult;
    downloadFile(`lms-result-${a.userName.replace(/\s+/g,'_')}-${a.id}.json`,JSON.stringify({type:'lms-result',version:3,attempt:a},null,2));
    return;
  }
  if(action==='admin-tab'){state.adminTab=el.dataset.tab;await viewAdmin();return;}
  if(action==='new-course'){state.editor={course:blankCourse(),existingFileId:null,existingFileName:''};state.adminTab='course-edit';await viewAdmin();return;}
  if(action==='edit-course'){
    const c=JSON.parse(JSON.stringify(state.courses.find(x=>x.id===el.dataset.id)));
    if(!c.quiz) c.quiz={questions:[]};
    state.editor={course:c,existingFileId:c.fileId,existingFileName:c.fileName};
    state.adminTab='course-edit';await viewAdmin();return;
  }
  if(action==='delete-course'){
    if(!confirm(t('admin.course.deleteConfirm'))) return;
    const c=state.courses.find(x=>x.id===el.dataset.id);
    if(c&&c.fileId) delete state.serverFiles[c.fileId];
    await idbDel('courses',el.dataset.id);
    await refreshData();toast(t('toast.deleted'));await viewAdmin();return;
  }
  if(action==='add-question'){
    state.editor.course.quiz.questions.push({id:uid(),q_en:'',q_th:'',options:[{text_en:'',text_th:''},{text_en:'',text_th:''}],correct:0});
    await viewAdmin();return;
  }
  if(action==='remove-question'){state.editor.course.quiz.questions.splice(Number(el.dataset.qi),1);await viewAdmin();return;}
  if(action==='add-option'){const q=state.editor.course.quiz.questions[Number(el.dataset.qi)];if(q.options.length>=6) return;q.options.push({text_en:'',text_th:''});await viewAdmin();return;}
  if(action==='remove-option'){
    const q=state.editor.course.quiz.questions[Number(el.dataset.qi)];
    if(q.options.length<=2) return;
    q.options.splice(Number(el.dataset.oi),1);
    if(q.correct>=q.options.length) q.correct=0;
    await viewAdmin();return;
  }
  if(action==='publish-content'){await publishContent();return;}
  if(action==='reload-content'){await loadServerContent();toast('Reloaded');await viewAdmin();return;}
  if(action==='set-default-lang'){await saveSetting('lang',el.dataset.lang);toast(t('toast.saved'));await viewAdmin();return;}
  if(action==='backup-export'){await exportBackup();return;}
  if(action==='wipe-all'){
    if(!confirm(t('admin.settings.wipeConfirm'))) return;
    for(const s of ['courses','files','progress','attempts','attendance']) await idbClear(s);
    state.serverFiles={};await refreshData();toast(t('toast.deleted'));await viewAdmin();return;
  }
  if(action==='admin-clear-records'){
    if(!confirm(t('admin.clearRecordsConfirm'))) return;
    await idbClear('progress');await idbClear('attempts');await idbClear('attendance');
    await refreshData();toast(t('toast.deleted'));await viewAdmin();return;
  }
  if(action==='admin-export-csv'){exportCsv();return;}
  if(action==='admin-export-json'){
    downloadFile(`lms-results-${new Date().toISOString().slice(0,10)}.json`,
      JSON.stringify({type:'lms-results',version:3,attempts:state.attempts},null,2));return;
  }
  if(action==='att-export-csv'){exportAttendanceCsv();return;}
});

document.addEventListener('change',async e=>{
  const el=e.target;
  if(el.matches('[data-action="course-file"]')){
    const file=el.files[0];if(!file) return;
    if(file.size>50*1024*1024){toast(t('admin.course.fileTooBig'));el.value='';return;}
    state.editor.newFile=file;state.editor.existingFileName=file.name;toast(file.name);return;
  }
  if(el.matches('[data-opt-correct]')){
    const qi=Number(el.dataset.optCorrect),oi=Number(el.dataset.oi);
    state.editor.course.quiz.questions[qi].correct=oi;return;
  }
  if(el.matches('[data-action="backup-import"]')){
    const file=el.files[0];if(!file) return;
    try{
      const payload=JSON.parse(await file.text());
      const mode=$('#importMode')?$('#importMode').value:'merge';
      await importBackup(payload,mode);toast(t('toast.imported'));await viewAdmin();
    }catch(err){console.error(err);toast(t('toast.error'));}
    return;
  }
  if(el.matches('[data-action="admin-import-results"]')){
    const file=el.files[0];if(!file) return;
    try{
      const payload=JSON.parse(await file.text());
      let list=[];
      if(payload.type==='lms-result'&&payload.attempt) list=[payload.attempt];
      else if(Array.isArray(payload.attempts)) list=payload.attempts;
      else if(Array.isArray(payload)) list=payload;
      for(const a of list) if(a&&a.id) await idbPut('attempts',a);
      await refreshAttempts();toast(t('toast.imported'));await viewAdmin();
    }catch(err){console.error(err);toast(t('toast.error'));}
    return;
  }
});

document.addEventListener('input',e=>{
  const el=e.target;if(!state.editor) return;const c=state.editor.course;
  if(el.matches('[data-cfield]')){
    const f=el.dataset.cfield;
    if(el.type==='checkbox') c[f]=el.checked;
    else if(el.type==='number') c[f]=Number(el.value);
    else c[f]=el.value;
    return;
  }
  if(el.matches('[data-qfield]')){c.quiz.questions[Number(el.dataset.qi)][el.dataset.qfield]=el.value;return;}
  if(el.matches('[data-optfield]')){const qi=Number(el.dataset.qi),oi=Number(el.dataset.oi);c.quiz.questions[qi].options[oi][el.dataset.optfield]=el.value;return;}
});

document.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.target;

  if(form.id==='traineeForm'){
    const name=form.name.value.trim(),department=form.department.value.trim();
    if(!name||!department){toast(t('login.nameRequired'));return;}
    state.user={name,department};state.isAdmin=false;
    localStorage.setItem('lms_session',JSON.stringify({user:state.user,isAdmin:false}));
    await refreshData();
    await ensureAttendanceRecord();
    await go('home');
    return;
  }
  if(form.id==='adminForm'){
    const pw=form.password.value;
    const ok=await verifyPassword(pw,state.settings.adminSalt,state.settings.adminHash);
    if(!ok){toast(t('login.wrongPassword'));return;}
    state.isAdmin=true;state.user=null;
    localStorage.setItem('lms_session',JSON.stringify({user:null,isAdmin:true}));
    await refreshData();state.adminTab='dashboard';await go('admin');
    return;
  }
  if(form.id==='pwForm'){
    const salt=crypto.getRandomValues(new Uint8Array(16)).reduce((s,b)=>s+b.toString(16).padStart(2,'0'),'');
    await saveSetting('adminSalt',salt);
    await saveSetting('adminHash',await hashPassword(form.pw.value,salt));
    form.reset();toast(t('admin.settings.passwordSaved'));return;
  }
  if(form.id==='courseForm'){
    const c=state.editor.course;
    if(!c.title_en.trim()&&!c.title_th.trim()){toast(t('admin.course.titleEn'));return;}
    if(state.editor.newFile){
      const file=state.editor.newFile;const fileId=uid();
      state.serverFiles[fileId]={name:file.name,data:await blobToDataURL(file)};
      c.fileId=fileId;c.fileName=file.name;c.fileSize=file.size;
      state.editor.newFile=null;
    }
    c.deadline=c.deadline?c.deadline:'';
    c.quiz.questions.forEach(q=>{if(q.correct==null) q.correct=0;});
    await idbPut('courses',c);await refreshData();
    state.editor=null;state.adminTab='courses';
    toast(t('admin.course.saved'));await viewAdmin();return;
  }
});

/* ---------------- Header buttons ---------------- */
$('#btnLang').addEventListener('click',async()=>{
  state.lang=state.lang==='en'?'th':'en';applyLang();await render();updateChrome();
  if(state.view==='admin') await viewAdmin();
});
$('#btnTheme').addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark';applyTheme();});
$('#btnLogout').addEventListener('click',async()=>{
  await flushCourseTime();
  await closeAttendance();
  revokePdf();
  localStorage.removeItem('lms_session');
  state.user=null;state.isAdmin=false;state.quiz=null;state.lastResult=null;state.attendanceId=null;
  await go('login');
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){flushCourseTime();}});
window.addEventListener('beforeunload',()=>{flushCourseTime();closeAttendance();});

/* ---------------- Init ---------------- */
(async function init(){
  try{
    state.lang=localStorage.getItem('lms_lang')||'en';
    state.theme=localStorage.getItem('lms_theme')||'light';
    applyLang();applyTheme();
    await loadSettings();
    if(!localStorage.getItem('lms_lang')){state.lang=state.settings.lang||'en';applyLang();}
    if(!localStorage.getItem('lms_theme')){state.theme=state.settings.theme||'light';applyTheme();}
    await loadServerContent();
    await refreshData();
    const sess=JSON.parse(localStorage.getItem('lms_session')||'null');
    if(sess&&sess.isAdmin){state.isAdmin=true;state.adminTab='dashboard';await go('admin');}
    else if(sess&&sess.user){state.user=sess.user;await ensureAttendanceRecord();await go('home');}
    else await go('login');
    updateChrome();
  }catch(err){
    console.error(err);
    document.getElementById('app').innerHTML=`<div class="card"><h2>Initialization error</h2><pre>${esc(err.message)}</pre></div>`;
  }
})();