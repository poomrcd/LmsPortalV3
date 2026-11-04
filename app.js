'use strict';
/* ============================================================
   LMS Portal v3.1 — static, single-language, Vercel-ready
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

// Helper to read text (Handles both new single-language data and old multi-language data)
function getText(obj, field) {
  if (!obj) return '';
  return obj[field] || obj[field + '_en'] || obj[field + '_th'] || '';
}

/* ---------------- IndexedDB ---------------- */
const DB_NAME='lms_portal', DB_VER=2;
let _db=null;
function openDB(){
  if(_db) return Promise.resolve(_db);
  return new Promise((res,rej)=>{
    const req=indexedDB.open(DB_NAME,DB_VER);
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      const specs={courses:{keyPath:'id'},files:{keyPath:'id'},progress:{keyPath:'key'},attempts:{keyPath:'id'},settings:{keyPath:'key'},attendance:{keyPath:'id'}};
      for(const [name,opt] of Object.entries(specs)){
        if(!db.objectStoreNames.contains(name)) db.createObjectStore(name,opt);
      }
    };
    req.onsuccess=()=>{_db=req.result;res(_db);};
    req.onerror=()=>rej(req.error);
  });
}
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

/* ---------------- State ---------------- */
const state={
  user:null,isAdmin:false,theme:'light',
  settings:{},courses:[],progress:[],attempts:[],attendance:[],
  view:'login',params:{},adminTab:'dashboard',
  courseTimer:null,pdfUrl:null,quiz:null,lastResult:null,editor:null,
  serverFiles:{},contentLoadedFromServer:false,
  attendanceId:null,
};

/* ---------------- Preferences ---------------- */
function applyTheme(){document.documentElement.setAttribute('data-theme',state.theme);localStorage.setItem('lms_theme',state.theme);const b=$('#btnTheme');if(b) b.textContent=state.theme==='dark'?'☀':'☾';}
async function loadSettings(){
  const rows=await idbAll('settings');
  state.settings={theme:'light'};
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
  // Admin always reads/writes from local IndexedDB workspace
  // Trainees read from content.json (unless it failed, then fallback to IDB)
  if (state.isAdmin || !state.contentLoadedFromServer) {
    state.courses = (await idbAll('courses')).sort((a,b)=>(a.order||0)-(b.order||0)||a.createdAt-b.createdAt);
  }
  state.progress=await idbAll('progress');
  state.attempts=(await idbAll('attempts')).sort((a,b)=>b.completedAt-a.completedAt);
  state.attendance=(await idbAll('attendance')).sort((a,b)=>b.firstSeen-a.firstSeen);
}
async function refreshProgress(){state.progress=await idbAll('progress');}
async function refreshAttempts(){state.attempts=(await idbAll('attempts')).sort((a,b)=>b.completedAt-a.completedAt);}
async function refreshAttendance(){state.attendance=(await idbAll('attendance')).sort((a,b)=>a.firstSeen-b.firstSeen);}

/* ---------------- Server content ---------------- */
async function loadServerContent(){
  try{
    const r=await fetch('content.json',{cache:'no-store'});
    if(!r.ok) return false;
    const d=await r.json();
    state.serverFiles = d.files || {};
    
    // Seed local IndexedDB if it's empty (e.g. fresh Admin browser)
    const local = await idbAll('courses');
    if (local.length === 0 && d.courses && d.courses.length > 0) {
      for (const c of d.courses) await idbPut('courses', c);
    }

    // Only replace state.courses directly for Trainees. Admin always uses local DB.
    if (!state.isAdmin) {
      state.courses = d.courses || [];
      state.contentLoadedFromServer = true;
    }
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
  $('#whoami').textContent=state.isAdmin?'Admin':(state.user?`${state.user.name} · ${state.user.department}`:'');
  applyTheme();
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
    <h1>LMS Portal</h1>
    <p class="muted" style="margin-bottom:0">Internal learning platform</p>
    <div class="tabs">
      <button class="tab active" data-action="login-tab" data-tab="trainee">Trainee</button>
      <button class="tab" data-action="login-tab" data-tab="admin">Admin</button>
    </div>
    <form id="traineeForm" autocomplete="off">
      <label class="field"><span>Full name</span><input type="text" name="name" required></label>
      <label class="field"><span>Department</span><input type="text" name="department" required></label>
      <button class="btn block" type="submit">Sign in</button>
    </form>
    <form id="adminForm" class="hidden" autocomplete="off">
      <label class="field"><span>Admin password</span><input type="password" name="password" required></label>
      <button class="btn block" type="submit">Sign in</button>
    </form>
  </div></div>`;
}

/* ============================================================
   TRAINEE — HOME
   ============================================================ */
function viewHome(){
  const courses=state.courses.filter(c=>c.published);
  if(!courses.length) return `<h1>My courses</h1><div class="card"><p class="muted">No courses available yet.</p></div>`;
  const cards=courses.map(c=>{
    const p=courseProgress(c);
    const locked=quizLocked(c);
    const titleText = getText(c, 'title');
    const abstractText = getText(c, 'abstract') || '';
    const badge=p.done?`<span class="badge solid">✓ Completed</span>`
      :p.pct>0?`<span class="badge">In progress</span>`
      :`<span class="badge">Not started</span>`;
    return `<div class="card stack" style="gap:10px">
      <div class="spread"><h3 style="margin:0">${esc(titleText)}</h3>${badge}</div>
      <p class="muted" style="margin:0;font-size:.88rem;min-height:2.6em;overflow:hidden">${esc(abstractText.slice(0,120))}${abstractText.length>120?'…':''}</p>
      <div class="bar"><i style="width:${p.pct}%"></i></div>
      <div class="spread">
        <small class="muted">${p.pct}%</small>
        ${locked&&!p.done?`<span class="badge fail">Closed</span>`:''}
        <button class="btn sm" data-action="open-course" data-id="${c.id}">Open</button>
      </div></div>`;
  }).join('');
  return `<div class="spread" style="margin-bottom:18px"><h1 style="margin:0">My courses</h1></div><div class="grid cards">${cards}</div>`;
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
  if(!hasQuiz){quizBlock=`<p class="muted">No quiz for this course</p>`;}
  else{
    const bestTxt=best?`<p style="margin:6px 0"><b>Best score:</b> ${best.score}% ${best.passed?'✓':'—'}</p>`:'';
    const dl=course.deadline?`<p style="margin:6px 0"><b>Deadline:</b> ${fmtDate(new Date(course.deadline).getTime())}</p>`:`<p style="margin:6px 0" class="muted">No deadline</p>`;
    const pr=`<p style="margin:6px 0"><b>Passing rate:</b> ${course.passingRate}%</p>`;
    let btn;
    if(locked) btn=`<button class="btn block" disabled>Quiz locked</button><p class="muted" style="font-size:.82rem;margin-top:8px">The deadline has passed. Please contact your trainer.</p>`;
    else if(!materialDone) btn=`<button class="btn block" disabled>Start quiz</button><p class="muted" style="font-size:.82rem;margin-top:8px">Mark the material as complete to unlock the quiz.</p>`;
    else btn=`<button class="btn block" data-action="start-quiz" data-id="${course.id}">${best?'Retake quiz':'Start quiz'}</button>`;
    quizBlock=`${pr}${dl}${bestTxt}${btn}`;
  }
  const metaBlock=(labelKey,field)=>{const val=getText(course, field);if(!val) return '';return `<div class="meta-block"><h3>${labelKey}</h3><div>${nl2br(val)}</div></div>`;};

  app.innerHTML=`
    <div class="spread" style="margin-bottom:14px">
      <button class="btn ghost sm" data-action="go-home">← Back</button>
      <span class="badge ${p.done?'solid':''}">${p.pct}%</span>
    </div>
    <h1>${esc(getText(course, 'title'))}</h1>
    <div class="bar" style="margin-bottom:22px"><i style="width:${p.pct}%"></i></div>
    <div class="meta-grid" style="margin-bottom:22px">
      ${metaBlock('Abstract','abstract')}${metaBlock('Introduction','introduction')}
      ${metaBlock('Objectives','objectives')}${metaBlock('Contents','contents')}
    </div>
    <div class="card stack" style="margin-bottom:18px">
      <div class="spread">
        <h2 style="margin:0">Learning material</h2>
        ${pdfUrl?`<a class="btn ghost sm" href="${pdfUrl}" download="${esc(fileName)}">Download PDF</a>`:''}
      </div>
      ${pdfUrl?`<iframe class="pdf-frame" src="${pdfUrl}#toolbar=1" title="PDF"></iframe>`:`<p class="muted">No file attached</p>`}
      <div class="spread">
        <small class="muted">Time spent: ${fmtDuration(timeSpent)}</small>
        ${materialDone?`<span class="badge solid">✓ Completed on ${fmtDate(prog.completedAt)}</span>`
          :`<button class="btn" data-action="mark-complete" data-id="${course.id}">Mark as complete</button>`}
      </div>
    </div>
    <div class="card stack"><h2 style="margin:0">Quiz</h2>${quizBlock}</div>`;
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
    <h2 style="margin:0">${esc(getText(course, 'title'))} — Quiz</h2>
    <div class="row">${timerHtml}</div>
  </div>
  <div class="card stack">
    <div class="spread">
      <span class="q-count">Question ${s.current+1} of ${total}</span>
      <span class="q-count">${course.passingRate}% passing</span>
    </div>
    <div class="bar"><i style="width:${((s.current+1)/total)*100}%"></i></div>
    <h3 style="margin-top:8px">${esc(getText(q, 'q'))}</h3>
    <div>${q.options.map((o,i)=>`<button class="opt ${answered===i?'sel':''}" data-action="pick" data-idx="${i}">${esc(getText(o, 'text'))}</button>`).join('')}</div>
    <div class="spread">
      <button class="btn ghost" data-action="quiz-prev" ${s.current===0?'disabled':''}>Previous</button>
      ${isLast?`<button class="btn" data-action="quiz-submit" ${answered==null?'disabled':''}>Submit answers</button>`
        :`<button class="btn" data-action="quiz-next" ${answered==null?'disabled':''}>Next</button>`}
    </div>
  </div>`;
}
function buildQuizSession(course){
  const questions=course.quiz.questions.map(q=>{
    const opts=q.options.map((o,i)=>({text:getText(o, 'text'),correct:i===q.correct}));
    shuffle(opts);
    return {id:q.id,q:getText(q, 'q'),options:opts};
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
  if(!auto&&s.answers.some(a=>a==null)){toast('Please answer all questions before submitting.');return;}
  const course=state.courses.find(c=>c.id===s.courseId);
  const total=s.questions.length;
  let correct=0;
  const detail=s.questions.map((q,i)=>{
    const chosen=s.answers[i];
    const isCorrect=chosen!=null&&q.options[chosen].correct;
    if(isCorrect) correct++;
    return {q:q.q,options:q.options.map(o=>({text:o.text,correct:o.correct})),chosen,isCorrect};
  });
  const score=total?Math.round((correct/total)*100):0;
  const passed=score>=(course.passingRate||0);
  const prog=await getProgress(course.id);
  const timeSpentMs=(prog&&prog.timeSpentMs)||0;
  const attempt={id:uid(),userName:state.user.name,department:state.user.department,courseId:course.id,
    courseTitle:getText(course, 'title'),score,correct,total,
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
    <h2 style="margin:0">Answer review</h2>
    ${a.detail.map((d,i)=>{
      return `<div class="review-item">
        <div><b>${i+1}.</b> ${esc(d.q)}</div>
        ${d.options.map((o,idx)=>`<div class="ans" style="${o.correct?'font-weight:700':''}">
          ${idx===d.chosen?'▸ ':''}${esc(o.text)}
          ${o.correct?` <span class="badge solid">Correct answer</span>`:''}
          ${(idx===d.chosen&&!o.correct)?` <span class="badge fail">Your answer</span>`:''}
        </div>`).join('')}
      </div>`;
    }).join('')}
  </div>`:`<p class="muted" style="margin-top:18px">Answer key is shown only after you pass.</p>`;
  return `
  <div class="card stack" style="max-width:720px;margin:0 auto">
    <h1 style="text-align:center;margin:0">Result</h1>
    <p class="muted" style="text-align:center;margin:0">${esc(a.courseTitle)}</p>
    <div class="score-ring"><div style="text-align:center">
      <b>${a.score}%</b><small>${a.correct}/${a.total} · Passing ${a.passingRate}%</small>
    </div></div>
    <div class="verdict ${a.passed?'':'fail'}">${a.passed?'✓ PASSED':'✕ NOT PASSED'}</div>
    <div class="table-wrap" style="margin-top:8px"><table><tbody>
      <tr><th>Name</th><td>${esc(a.userName)}</td></tr>
      <tr><th>Department</th><td>${esc(a.department)}</td></tr>
      <tr><th>Total learning time</th><td>${fmtDuration(a.learningTimeMs)}</td></tr>
      <tr><th>Completed at</th><td>${fmtDate(a.completedAt)}</td></tr>
    </tbody></table></div>
    <div class="row" style="margin-top:8px">
      <button class="btn" data-action="export-pdf">Export result (PDF)</button>
      ${a.passed?`<button class="btn ghost" data-action="export-cert">Certificate (PDF)</button>`:''}
      <button class="btn ghost sm" data-action="export-result-json">Export data (JSON)</button>
    </div>
    ${review}
    <div class="row" style="margin-top:8px">
      <button class="btn ghost" data-action="back-to-course" data-id="${a.courseId}">Back to course</button>
      ${!quizLocked(course||{published:true})?`<button class="btn" data-action="start-quiz" data-id="${a.courseId}">Try again</button>`:''}
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
  return `<div class="doc"><h1>LMS Portal — Result</h1><div class="hr"></div>
    <table>
      <tr><th>Name</th><td>${esc(a.userName)}</td></tr>
      <tr><th>Department</th><td>${esc(a.department)}</td></tr>
      <tr><th>Course</th><td>${esc(a.courseTitle)}</td></tr>
      <tr><th>Total learning time</th><td>${fmtDuration(a.learningTimeMs)}</td></tr>
      <tr><th>Score</th><td>${a.correct} / ${a.total} &nbsp; (${a.score}%)</td></tr>
      <tr><th>Passing rate</th><td>${a.passingRate}%</td></tr>
      <tr><th>Status</th><td><b>${a.passed?'PASSED':'NOT PASSED'}</b></td></tr>
      <tr><th>Completed at</th><td>${fmtDate(a.completedAt)}</td></tr>
    </table><div class="foot">LMS Portal · ${fmtDate(Date.now())}</div></div>`;
}
function certDocHtml(a){
  return `<div class="doc cert"><div class="sub">LMS Portal</div>
    <h1 style="margin-top:14px">Certificate of Completion</h1>
    <div class="sub">This certificate is awarded to</div>
    <div class="name">${esc(a.userName)}</div>
    <div class="sub">${esc(a.department)}</div>
    <div style="margin-top:26px">for successfully completing</div>
    <div style="font-size:19px;font-weight:700;margin:10px 0">${esc(a.courseTitle)}</div>
    <div style="margin-top:26px">Score: <b>${a.score}%</b> &nbsp;&nbsp;|&nbsp;&nbsp; Date: <b>${fmtDate(a.completedAt)}</b></div>
    <div style="margin-top:60px">____________________________<br><span class="sub">Trainer / Administrator</span></div></div>`;
}

/* ============================================================
   ADMIN
   ============================================================ */
async function viewAdmin(){
  const app=$('#app');const tab=state.adminTab;
  const nav=`<nav class="admin-nav">
    <button class="${tab==='dashboard'?'active':''}" data-action="admin-tab" data-tab="dashboard">Dashboard</button>
    <button class="${tab==='courses'?'active':''}" data-action="admin-tab" data-tab="courses">Courses</button>
    <button class="${tab==='attendance'?'active':''}" data-action="admin-tab" data-tab="attendance">Attendance</button>
    <button class="${tab==='settings'?'active':''}" data-action="admin-tab" data-tab="settings">Settings</button>
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
    <td>${esc(a.courseTitle || '—')}</td>
    <td>${a.score}%</td><td>${a.passed?'✓':'✕'}</td>
    <td>${fmtDuration(a.learningTimeMs)}</td><td>${fmtDate(a.completedAt)}</td></tr>`).join('');
  return `<div class="grid stats">
    <div class="stat"><small>Trainees</small><b>${trainees.size}</b></div>
    <div class="stat"><small>Courses</small><b>${state.courses.length}</b></div>
    <div class="stat"><small>Attempts</small><b>${attempts.length}</b></div>
    <div class="stat"><small>Pass rate</small><b>${passRate}%</b></div>
  </div>
  <div class="card stack">
    <div class="spread"><h2 style="margin:0">Dashboard</h2>
      <div class="row">
        <button class="btn ghost sm" data-action="admin-export-csv">Export CSV</button>
        <button class="btn ghost sm" data-action="admin-export-json">Export JSON</button>
        <label class="btn ghost sm" style="position:relative;overflow:hidden">Import results (JSON)
          <input type="file" accept=".json" data-action="admin-import-results" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
        <button class="btn danger sm" data-action="admin-clear-records">Clear all records</button>
      </div>
    </div>
    ${attempts.length?`<div class="table-wrap"><table><thead><tr>
      <th>Name</th><th>Department</th><th>Course</th>
      <th>Score</th><th>Status</th><th>Time spent</th><th>Date</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`:`<p class="muted">No records yet.</p>`}
  </div>`;
}
async function adminCourses(){
  const rows=state.courses.map(c=>{
    const qn=(c.quiz&&c.quiz.questions)?c.quiz.questions.length:0;
    return `<tr><td>${esc(getText(c, 'title'))}</td><td>${c.published?'✓':'—'}</td>
      <td>${c.passingRate}%</td><td>${qn}</td>
      <td>${c.deadline?fmtDate(new Date(c.deadline).getTime()):'—'}</td>
      <td><button class="btn ghost sm" data-action="edit-course" data-id="${c.id}">Edit</button>
          <button class="btn danger sm" data-action="delete-course" data-id="${c.id}">Delete</button></td></tr>`;
  }).join('');
  return `<div class="spread"><h2 style="margin:0">Courses</h2>
    <button class="btn" data-action="new-course">+ New course</button></div>
    <div class="card">${state.courses.length?`<div class="table-wrap"><table><thead><tr>
      <th>Course</th><th>Published</th>
      <th>Passing rate</th><th>Questions</th>
      <th>Deadline</th><th>Actions</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`:`<p class="muted">No courses yet.</p>`}</div>`;
}
function blankCourse(){
  return {id:uid(),title:'',abstract:'',introduction:'',objectives:'',contents:'',
    fileId:null,fileName:'',fileSize:0,
    order:state.courses.length,published:true,passingRate:80,deadline:'',timerEnabled:false,timerMinutes:15,
    quiz:{questions:[]},createdAt:Date.now()};
}
function adminCourseEdit(){
  const c=state.editor.course;const isNew=!state.courses.some(x=>x.id===c.id);
  
  const questionsHtml=c.quiz.questions.map((q,qi)=>`
    <div class="q-item" data-qi="${qi}">
      <div class="spread" style="margin-bottom:10px"><b>Question ${qi+1}</b>
        <button class="btn danger sm" data-action="remove-question" data-qi="${qi}">✕</button></div>
      <label class="field"><span>Question Text</span><input type="text" data-qfield="q" data-qi="${qi}" value="${esc(getText(q,'q'))}"></label>
      ${q.options.map((o,oi)=>`<div class="opt-row">
        <input type="radio" name="correct-${qi}" data-opt-correct="${qi}" data-oi="${oi}" ${q.correct===oi?'checked':''}>
        <input type="text" data-optfield="text" data-qi="${qi}" data-oi="${oi}" placeholder="Option Text" value="${esc(getText(o,'text'))}">
        <button class="btn danger sm" data-action="remove-option" data-qi="${qi}" data-oi="${oi}" ${q.options.length<=2?'disabled':''}>✕</button>
      </div>`).join('')}
      <button class="btn ghost sm" data-action="add-option" data-qi="${qi}">+ Option</button>
    </div>`).join('');
    
  const currentFile=state.editor.existingFileId?`<p class="muted" style="font-size:.83rem">Current file: ${esc(state.editor.existingFileName||'')}</p>`:'';
  
  return `<div class="spread"><h2 style="margin:0">${isNew?'New course':'Edit course'}</h2>
    <button class="btn ghost sm" data-action="admin-tab" data-tab="courses">← Back</button></div>
    <form id="courseForm" class="card stack" style="max-width:none">
      <label class="field"><span>Course Title</span><input type="text" data-cfield="title" value="${esc(getText(c,'title'))}"></label>
      ${['abstract','introduction','objectives','contents'].map(f=>`
        <label class="field"><span>${f.charAt(0).toUpperCase()+f.slice(1)}</span><textarea data-cfield="${f}">${esc(getText(c,f))}</textarea></label>
      `).join('')}
      <label class="field"><span>PDF File (max 50 MB)</span><input type="file" accept="application/pdf" data-action="course-file"></label>
      ${currentFile}
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">
        <label class="field"><span>Passing rate (%)</span><input type="number" min="0" max="100" data-cfield="passingRate" value="${c.passingRate}"></label>
        <label class="field"><span>Deadline (optional)</span><input type="datetime-local" data-cfield="deadline" value="${c.deadline||''}"></label>
        <label class="field"><span>Timer (minutes)</span><input type="number" min="1" data-cfield="timerMinutes" value="${c.timerMinutes}"></label>
      </div>
      <label class="check"><input type="checkbox" data-cfield="timerEnabled" ${c.timerEnabled?'checked':''}> Enable quiz timer</label>
      <label class="check"><input type="checkbox" data-cfield="published" ${c.published?'checked':''}> Published</label>
      <hr style="border:0;border-top:1px solid var(--border);margin:8px 0">
      <h3 style="margin:0">Quiz questions</h3>
      <div id="qList">${questionsHtml}</div>
      <button type="button" class="btn ghost" data-action="add-question">+ Add question</button>
      <div class="row" style="margin-top:10px">
        <button type="submit" class="btn">Save</button>
        <button type="button" class="btn ghost" data-action="admin-tab" data-tab="courses">Cancel</button>
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
      <td>${isOnline?`<span class="badge solid">online</span>`:`<span class="badge">offline</span>`}</td>
    </tr>`;
  }).join('');
  return `<div class="spread"><h2 style="margin:0">Attendance</h2>
    <button class="btn ghost sm" data-action="att-export-csv">Export CSV</button></div>
    <div class="card">${state.attendance.length?`<div class="table-wrap"><table><thead><tr>
      <th>Trainee</th><th>Department</th>
      <th>First seen</th><th>Last seen</th>
      <th>Active time</th><th>Events</th><th>Status</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`:`<p class="muted">No attendance records yet.</p>`}</div>`;
}
function adminSettings(){
  return `<h2 style="margin:0">Settings</h2>
  <div class="card stack">
    <h3 style="margin:0">Publish content.json</h3>
    <p class="muted" style="font-size:.85rem;margin:0">Download the updated content.json, then commit it to your GitHub repo. Vercel will redeploy automatically.</p>
    <div class="row">
      <button class="btn" data-action="publish-content">Download content.json</button>
      <button class="btn ghost" data-action="reload-content">Reload from server</button>
    </div>
  </div>
  <div class="card stack">
    <h3 style="margin:0">Admin password</h3>
    <form id="pwForm" class="row"><input type="password" name="pw" style="max-width:280px" required>
      <button class="btn" type="submit">Save</button></form>
  </div>
  <div class="card stack">
    <h3 style="margin:0">Backup & restore</h3>
    <div class="row">
      <button class="btn" data-action="backup-export">Export full backup (JSON)</button>
      <label class="btn ghost" style="position:relative;overflow:hidden">Restore from backup
        <input type="file" accept=".json" data-action="backup-import" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
      <select id="importMode" style="max-width:220px">
        <option value="merge">Merge (upsert)</option>
        <option value="replace">Replace all</option>
      </select>
    </div>
  </div>
  <div class="card stack" style="border-color:var(--danger)">
    <h3 style="margin:0;color:var(--danger)">Danger zone</h3>
    <button class="btn danger" data-action="wipe-all">Wipe all data</button>
  </div>`;
}

/* ---------------- Backup ---------------- */
async function exportBackup(){
  const filesOut=[];const seen=new Set();
  for(const id in state.serverFiles){filesOut.push({id,name:state.serverFiles[id].name,data:state.serverFiles[id].data});seen.add(id);}
  for(const f of await idbAll('files')){if(seen.has(f.id)) continue;filesOut.push({id:f.id,name:f.name,size:f.size,type:f.type,data:await blobToDataURL(f.blob)});}
  const payload={app:'lms-portal',version:3,exportedAt:Date.now(),courses:state.courses,files:filesOut,
    progress:await idbAll('progress'),attempts:state.attempts,attendance:state.attendance,
    settings:{adminSalt:state.settings.adminSalt,adminHash:state.settings.adminHash,theme:state.settings.theme}};
  downloadFile(`lms-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(payload,null,2));
  toast('Exported');
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
    if(payload.settings.theme) await saveSetting('theme',payload.settings.theme);
  }
  await refreshData();
}

/* ---------------- CSV ---------------- */
function exportCsv(){
  const head=['Name','Department','Course','Score(%)','Correct','Total','PassingRate','Passed','LearningTime(min)','CompletedAt'];
  const lines=[head.join(',')];
  state.attempts.forEach(a=>{
    lines.push([a.userName,a.department,(a.courseTitle||''),a.score,a.correct,a.total,a.passingRate,a.passed?'PASS':'FAIL',
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
    if(quizLocked(course)){toast('Quiz is locked');return;}
    state.quiz=buildQuizSession(course);
    await logAttendanceEvent('quiz_start',course.id);
    await go('quiz');
    startQuizTimer();
    return;
  }
  if(action==='pick'){state.quiz.answers[state.quiz.current]=Number(el.dataset.idx);await render();return;}
  if(action==='quiz-prev'){if(state.quiz.current>0){state.quiz.current--;await render();}return;}
  if(action==='quiz-next'){
    if(state.quiz.answers[state.quiz.current]==null){toast('Please answer to continue');return;}
    if(state.quiz.current<state.quiz.questions.length-1){state.quiz.current++;await render();}
    return;
  }
  if(action==='quiz-submit'){if(!confirm('Submit your answers now?')) return;await submitQuiz(false);return;}
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
    if(!confirm('Delete this course and its file?')) return;
    const c=state.courses.find(x=>x.id===el.dataset.id);
    if(c&&c.fileId) delete state.serverFiles[c.fileId];
    await idbDel('courses',el.dataset.id);
    await refreshData();toast('Deleted');await viewAdmin();return;
  }
  if(action==='add-question'){
    state.editor.course.quiz.questions.push({id:uid(),q:'',options:[{text:''},{text:''}],correct:0});
    await viewAdmin();return;
  }
  if(action==='remove-question'){state.editor.course.quiz.questions.splice(Number(el.dataset.qi),1);await viewAdmin();return;}
  if(action==='add-option'){const q=state.editor.course.quiz.questions[Number(el.dataset.qi)];if(q.options.length>=6) return;q.options.push({text:''});await viewAdmin();return;}
  if(action==='remove-option'){
    const q=state.editor.course.quiz.questions[Number(el.dataset.qi)];
    if(q.options.length<=2) return;
    q.options.splice(Number(el.dataset.oi),1);
    if(q.correct>=q.options.length) q.correct=0;
    await viewAdmin();return;
  }
  if(action==='publish-content'){await publishContent();return;}
  if(action==='reload-content'){
    const r = await fetch('content.json', {cache:'no-store'});
    if(r.ok) {
      const d = await r.json();
      state.serverFiles = d.files || {};
      await idbClear('courses');
      if(d.courses) for(const c of d.courses) await idbPut('courses', c);
      await refreshData();
      toast('Reloaded from server');
      await viewAdmin();
    }
    return;
  }
  if(action==='backup-export'){await exportBackup();return;}
  if(action==='wipe-all'){
    if(!confirm('Erase ALL data including courses, files, progress and results? This cannot be undone.')) return;
    for(const s of ['courses','files','progress','attempts','attendance']) await idbClear(s);
    state.serverFiles={};await refreshData();toast('Wiped all data');await viewAdmin();return;
  }
  if(action==='admin-clear-records'){
    if(!confirm('Delete all trainee progress and results from this browser? This cannot be undone.')) return;
    await idbClear('progress');await idbClear('attempts');await idbClear('attendance');
    await refreshData();toast('Records cleared');await viewAdmin();return;
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
    if(file.size>50*1024*1024){toast('File exceeds the 50 MB limit');el.value='';return;}
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
      await importBackup(payload,mode);toast('Imported');await viewAdmin();
    }catch(err){console.error(err);toast('Something went wrong');}
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
      await refreshAttempts();toast('Imported');await viewAdmin();
    }catch(err){console.error(err);toast('Something went wrong');}
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
    if(!name||!department){toast('Please enter your full name and department');return;}
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
    if(!ok){toast('Incorrect password');return;}
    state.isAdmin=true;state.user=null;
    localStorage.setItem('lms_session',JSON.stringify({user:null,isAdmin:true}));
    await refreshData();state.adminTab='dashboard';await go('admin');
    return;
  }
  if(form.id==='pwForm'){
    const salt=crypto.getRandomValues(new Uint8Array(16)).reduce((s,b)=>s+b.toString(16).padStart(2,'0'),'');
    await saveSetting('adminSalt',salt);
    await saveSetting('adminHash',await hashPassword(form.pw.value,salt));
    form.reset();toast('Password updated');return;
  }
  if(form.id==='courseForm'){
    const c=state.editor.course;
    if(!c.title.trim()){toast('Course Title is required');return;}
    if(state.editor.newFile){
      const file=state.editor.newFile;const fileId=uid();
      state.serverFiles[fileId]={name:file.name,data:await blobToDataURL(file)};
      c.fileId=fileId;c.fileName=file.name;c.fileSize=file.size;
      state.editor.newFile=null;
    }
    c.deadline=c.deadline?c.deadline:'';
    
    // Clean up legacy multi-language fields if they exist
    delete c.title_en; delete c.title_th;
    delete c.abstract_en; delete c.abstract_th;
    delete c.introduction_en; delete c.introduction_th;
    delete c.objectives_en; delete c.objectives_th;
    delete c.contents_en; delete c.contents_th;
    c.quiz.questions.forEach(q => {
      delete q.q_en; delete q.q_th;
      q.options.forEach(o => { delete o.text_en; delete o.text_th; });
    });

    await idbPut('courses',c);await refreshData();
    state.editor=null;state.adminTab='courses';
    toast('Course saved');await viewAdmin();return;
  }
});

/* ---------------- Header buttons ---------------- */
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
    state.theme=localStorage.getItem('lms_theme')||'light';
    applyTheme();
    await loadSettings();
    if(!localStorage.getItem('lms_theme')){state.theme=state.settings.theme||'light';applyTheme();}
    
    // 1. Fetch content.json first
    await loadServerContent();
    
    // 2. Restore session BEFORE refreshing data
    const sess=JSON.parse(localStorage.getItem('lms_session')||'null');
    if(sess&&sess.isAdmin) {
      state.isAdmin=true;
      state.adminTab='dashboard';
    } else if(sess&&sess.user) {
      state.user=sess.user;
    }

    // 3. Now refresh data (it knows if you are Admin, so it reads from the correct database)
    await refreshData();

    // 4. Route to the correct view
    if(state.isAdmin) {
      await go('admin');
    } else if(state.user) {
      await ensureAttendanceRecord();
      await go('home');
    } else {
      await go('login');
    }
    
    updateChrome();
  }catch(err){
    console.error(err);
    document.getElementById('app').innerHTML=`<div class="card"><h2>Initialization error</h2><pre>${esc(err.message)}</pre></div>`;
  }
})();