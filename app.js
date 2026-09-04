
"use strict";
const DB_NAME="registro_acp_escolar_db", DB_VERSION=2, STORE="registros", DOC_STORE="documentosCentro";
const PREF="registro_acp_escolar_prefs";
let currentCodeInputTarget=null;
let db=null, currentEditId=null, pendingReviewAction=null, listMode="all", unlocked=false;
let lastSavedRecordId=null;
let deferredInstallPrompt=null;
const PWA_FLAG="registro_acp_pwa_instalada";
const CONSENT_VERSION="2026-09-04-v3";

const OPT={
contexto:["aula ordinaria","aula de apoyo/específica","patio","pasillo","comedor","transporte","entrada/salida","Educación Física","recreo","cambio de clase","actividad grupal","actividad individual","evaluación/examen","otro"],
factores:["ruido","mucha gente","iluminación intensa","temperatura/molestia física","espera","cambio inesperado","demanda difícil","tarea poco clara","interacción social/conflicto","transición","ausencia de apoyo visual","comunicación no comprendida","falta de descanso","hambre","sed","sueño","dolor/malestar","cambio de profesional","otro"],
antecedente:["inicio de clase","fin de clase","transición","espera","cambio imprevisto","corrección","retirada de móvil/dispositivo","tarea difícil","tarea poco clara","examen","trabajo en grupo","interacción con iguales","conflicto","ruido/sobrecarga sensorial","falta de anticipación","hambre/sueño/dolor","cambio de profesional","otro"],
conducta:["grita/eleva la voz","llora","insulta","amenaza verbal","golpea a una persona","golpea objetos","lanza objetos","se autolesiona","sale/abandona el espacio","no inicia/se niega","se bloquea/permanece inmóvil","se tapa oídos/ojos","movimientos repetitivos intensos","busca aislamiento","se tumba/sienta en el suelo","rompe material","otra"],
consecuencia:["demanda reducida/retirada","atención adulta","atención de iguales","acceso a objeto/actividad","salida del espacio","descanso","cambio de tarea","ayuda recibida","demanda mantenida con apoyo","protocolo de crisis activado","otro"],
hipotesis:["escapar/evitar una situación o demanda","obtener atención","acceder a objeto/actividad","regulación sensorial/emocional","comunicar dolor/malestar","necesidad de predictibilidad/control","comunicar incomprensión","solicitar ayuda","interacción social","todavía no clara / datos insuficientes","otra"],
apoyos:["anticipación","apoyo visual","elección entre opciones","reducción temporal de demanda","fragmentar tarea","tiempo de procesamiento","pausa/espacio tranquilo","ajuste sensorial","comunicación aumentativa/alternativa","apoyo individual","co-regulación","cambio de adulto/interlocutor","refuerzo positivo","otro"],
proxima:["anticipar transición","clarificar instrucciones","ajustar dificultad","ofrecer elección","reducir estímulos","aumentar tiempo de procesamiento","enseñar petición de ayuda","enseñar petición de pausa","preparar apoyo visual","planificar descanso","otro"]
};
const INCLUSION=["entornoPredecible","infoAccesible","tiempoProcesamiento","alternativaSensorial","pudoPedir","dignidad","participacion","demandaAjustada"];
const INCLUSION_LABELS={
entornoPredecible:"¿El entorno era predecible?",infoAccesible:"¿La información era comprensible y accesible?",
tiempoProcesamiento:"¿Se ofreció tiempo suficiente de procesamiento?",alternativaSensorial:"¿Existía una alternativa sensorial o espacial?",
pudoPedir:"¿La persona pudo pedir ayuda, descanso o aclaración?",dignidad:"¿Se mantuvo su dignidad?",
participacion:"¿Se favoreció su participación?",demandaAjustada:"¿Se ajustó la demanda a sus necesidades de apoyo?"
};

function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function prefs(){try{return {...{accepted:false,retention:"30",pinEnabled:false,pinHash:"",pinSalt:"",codeFormat:"01A",codePrefix:"",centerDisplayName:"",centerLocalNote:""},...JSON.parse(localStorage.getItem(PREF)||"{}")}}catch{return {accepted:false}}}
function savePrefs(p){localStorage.setItem(PREF,JSON.stringify({...prefs(),...p}))}
function toast(msg){const t=document.querySelector("#toast");t.textContent=msg;t.classList.remove("hidden");setTimeout(()=>t.classList.add("hidden"),2600)}
function nowLocal(){const d=new Date(),z=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`}
function dateOnly(v){return (v||"").slice(0,10)}
function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function arrayVal(fd,name){return fd.getAll(name)}
function one(fd,name){return (fd.get(name)||"").toString().trim()}
function selectedFirst(a){return Array.isArray(a)&&a.length?a[0]:"—"}
function chips(name, options, selected=[], otherKey=null, otherValue=""){
  const isOther=x=>["otro","otra","otros","similar","no incluido"].includes(x.toLowerCase());
  let h=`<div class="chips" data-chip-group="${esc(name)}">`;
  for(const o of options){const checked=selected.includes(o)?"checked":"";h+=`<label class="chip"><input type="checkbox" name="${esc(name)}" value="${esc(o)}" ${checked}><span>${esc(o)}</span></label>`}
  h+=`</div>`;
  if(otherKey){const has=options.some(o=>isOther(o)&&selected.includes(o));h+=`<div class="spec ${has?"":"hidden"}" data-spec-for="${esc(name)}"><label>Especificar<input type="text" name="${esc(otherKey)}" value="${esc(otherValue)}"></label><p class="hint">El texto se conserva durante esta edición aunque desmarques temporalmente “Otro/a”.</p></div>`}
  return h;
}
function inclusionFields(data={}){
 return INCLUSION.map(k=>`<label>${INCLUSION_LABELS[k]}<select name="inc_${k}"><option value="">Selecciona</option>${["Sí","Parcial","No","No aplica"].map(v=>`<option ${data[k]===v?"selected":""}>${v}</option>`).join("")}</select></label>`).join("");
}
async function openDB(){
 return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE)){const s=d.createObjectStore(STORE,{keyPath:"id"});s.createIndex("fechaHora","fechaHora");s.createIndex("codigo","codigo");s.createIndex("riesgo","riesgo")}if(!d.objectStoreNames.contains(DOC_STORE)){d.createObjectStore(DOC_STORE,{keyPath:"id"})}};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
}



async function replaceExistingRecordExactly(existing,incoming){
  if(!existing?.id)throw new Error("REPLACE_NO_EXISTING_ID");
  const replacement={
    ...incoming,
    id:existing.id,
    duplicado:false,
    duplicadoDe:null,
    createdAt:existing.createdAt||incoming.createdAt||new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };

  // Remove any accidental duplicate copy with a different id but same code + minute
  const all=await allRecords();
  const sameMinute=all.filter(r=>
    r.id!==existing.id &&
    String(r.codigo||"").trim()===String(existing.codigo||"").trim() &&
    minuteKey(r.fechaHora)===minuteKey(existing.fechaHora)
  );

  for(const r of sameMinute){
    await deleteRecord(r.id);
  }

  // Overwrite the canonical existing record.
  await putRecord(replacement);

  // Verify exactly one remains for that code+minute.
  const verify=(await allRecords()).filter(r=>
    String(r.codigo||"").trim()===String(replacement.codigo||"").trim() &&
    minuteKey(r.fechaHora)===minuteKey(replacement.fechaHora)
  );
  if(verify.length!==1 || verify[0].id!==replacement.id){
    throw new Error("REPLACE_VERIFY_FAILED");
  }
  return replacement;
}

async function resolveManualSaveConflict(record){
  const all=await allRecords();
  const match=all.find(r=>
    r.id!==record.id &&
    String(r.codigo||"").trim()===String(record.codigo||"").trim() &&
    minuteKey(r.fechaHora)===minuteKey(record.fechaHora)
  );
  if(!match)return {action:"save",record,match:null};

  const action=await askCsvConflict(match,record,[]);
  if(action==="cancel")return {action:"cancel",record:null,match};

  if(action==="both"){
    const copy={...record,id:uid(),duplicado:true,duplicadoDe:match.id,updatedAt:new Date().toISOString()};
    copy.createdAt=copy.createdAt||copy.updatedAt;
    return {action:"both",record:copy,match};
  }

  if(action==="replace"){
    return {action:"replace",record,match};
  }
  return {action:"cancel",record:null,match};
}

async function finishSavedRecord(record){
  const resolved=await resolveManualSaveConflict(record);
  if(resolved.action==="cancel"){
    toast("Guardado cancelado");
    return false;
  }

  let saved;
  if(resolved.action==="replace"){
    saved=await replaceExistingRecordExactly(resolved.match,resolved.record);
  }else{
    const toSave=resolved.record;
    await putRecord(toSave);
    saved=await getRecord(toSave.id);
    if(!saved)throw new Error("SAVE_VERIFY_FAILED");
  }

  lastSavedRecordId=saved.id;
  currentEditId=null;

  if(resolved.action==="both")toast("Registro guardado como duplicado");
  else if(resolved.action==="replace")toast("Registro reemplazado");
  else toast("Registro guardado");

  announceA11y(
    resolved.action==="both" ? "Registro guardado como duplicado." :
    resolved.action==="replace" ? "Registro reemplazado correctamente." :
    "Registro guardado correctamente."
  );

  await renderList("all");
  show("list");

  setTimeout(()=>{
    const item=document.querySelector(`#recordList [data-id="${CSS.escape(saved.id)}"]`);
    if(item){
      item.classList.add("just-saved");
      item.scrollIntoView({behavior:"smooth",block:"center"});
      setTimeout(()=>item.classList.remove("just-saved"),2500);
    }
  },120);

  return true;
}
async function putRecord(rec){return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(rec);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function getRecord(id){return new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}


async function deleteDemoRecords(){
  const rs=await allRecords(), demos=rs.filter(r=>r.demo);
  for(const r of demos) await deleteRecord(r.id);
  return demos.length;
}

async function addDemoRecords(){
  const codes=await usedCodes();
  const code=nextMaskedCode(codes);
  const now=new Date();
  const samples=[
    {mins:0,contexto:["Aula"],antecedente:["Cambio de actividad"],conducta:["Protesta verbal"],consecuencia:["Pausa breve"],riesgo:"sin riesgo",intensidad:2},
    {mins:35,contexto:["Aula"],antecedente:["Tarea difícil"],conducta:["Se levanta del asiento"],consecuencia:["Apoyo visual"],riesgo:"sin riesgo",intensidad:2},
    {mins:90,contexto:["Comedor"],antecedente:["Ruido ambiental"],conducta:["Se tapa los oídos"],consecuencia:["Cambio de espacio"],riesgo:"leve",intensidad:3}
  ];
  for(const s of samples){
    const d=new Date(now.getTime()-s.mins*60000);
    await putRecord({
      id:uid(),demo:true,fechaHora:d.toISOString().slice(0,16),codigo:code,grupo:"DEMO",profesional:"",
      contexto:s.contexto,contextoOtro:"",factores:[],factoresOtro:"",
      antecedente:s.antecedente,antecedenteOtro:"",antecedenteDesc:"",
      conducta:s.conducta,conductaOtro:"",conductaDesc:"",
      duracionValor:20,duracionUnidad:"segundos",frecuencia:1,intensidad:s.intensidad,riesgo:s.riesgo,
      consecuencia:s.consecuencia,consecuenciaOtro:"",consecuenciaDesc:"",
      hipotesis:["Acceso a apoyo / regulación"],hipotesisOtro:"",
      apoyos:["Apoyo visual"],apoyosOtro:"",apoyoValoracion:"Sí",
      proxima:["Anticipar"],proximaOtro:"",proximaTexto:"",
      inclusion:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),quick:false
    });
  }
  return {code,count:samples.length};
}

async function allRecords(){return new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>res(r.result.sort((a,b)=>(b.fechaHora||"").localeCompare(a.fechaHora||"")));r.onerror=()=>rej(r.error)})}
async function deleteRecord(id){return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function deleteRecords(ids){
 const unique=[...new Set(ids)].filter(Boolean);
 if(!unique.length)return;
 return new Promise((res,rej)=>{
  const tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE);
  unique.forEach(id=>store.delete(id));
  tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)
 })
}
async function clearRecords(){return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}







function browserInstallInfo(){
  const ua=navigator.userAgent||"";
  const ios=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  const android=/Android/i.test(ua);
  const chromeIOS=/CriOS/i.test(ua);
  const firefoxIOS=/FxiOS/i.test(ua);
  const edgeIOS=/EdgiOS/i.test(ua);
  const safariIOS=ios&&!chromeIOS&&!firefoxIOS&&!edgeIOS;
  return {ios,android,chromeIOS,safariIOS};
}
function openInstallHelp(){
  const b=browserInstallInfo();
  if(b.ios){
    const browser=b.chromeIOS?"Chrome":"Safari";
    quickHelp("Añadir al iPhone",`<div class="install-steps"><b>1</b><span>Abre esta página en <strong>${browser}</strong>.</span><b>2</b><span>Pulsa <strong>Compartir</strong> ⬆️.</span><b>3</b><span>Elige <strong>Añadir a pantalla de inicio</strong>.</span><b>4</b><span>Pulsa <strong>Añadir</strong>.</span></div><p class="hint">Después se abrirá desde su propio icono.</p>`);
    return;
  }
  if(deferredInstallPrompt){triggerInstall();return}
  quickHelp("Instalar app",`<p>Usa la opción <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong> de tu navegador.</p>`);
}
function refreshInstallUI(){
  const info=platformInfo(), b=browserInstallInfo();
  const homeBtn=document.querySelector("#homeInstallBtn");
  const card=homeBtn?.closest(".install-card");
  if(info.standalone){
    card?.classList.add("hidden");
    return;
  }
  card?.classList.remove("hidden");
  if(homeBtn) homeBtn.textContent=b.ios?"Añadir al iPhone":"Instalar app";
}

function platformInfo(){
  const ua=navigator.userAgent||"";
  const isIOS=/iPad|iPhone|iPod/.test(ua) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
  const isAndroid=/Android/i.test(ua);
  const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone===true;
  return {isIOS,isAndroid,standalone};
}
function installHelpText(){
  const {isIOS,isAndroid,standalone}=platformInfo();
  if(standalone) return `<p><strong>Ya está instalada.</strong></p>`;
  if(isIOS) return `<p><strong>Instalar en iPhone</strong></p><ol class="install-steps"><li>Abre esta página en <strong>Safari</strong>.</li><li>Pulsa <strong>Compartir</strong> ⬆️.</li><li>Elige <strong>Añadir a pantalla de inicio</strong>.</li></ol><p class="hint">Después aparecerá como una app con su propio icono.</p>`;
  if(isAndroid) return deferredInstallPrompt ? `<p>Pulsa <strong>Instalar ahora</strong>.</p>` : `<p>En Chrome: menú ⋮ → <strong>Instalar aplicación</strong>.</p>`;
  return deferredInstallPrompt ? `<p>Pulsa <strong>Instalar ahora</strong>.</p>` : `<p>Usa la opción <strong>Instalar</strong> de tu navegador.</p>`;
}
async function openInstallDialog(){
  const d=document.querySelector("#installDialog");
  const body=document.querySelector("#installDialogBody");
  const btn=document.querySelector("#installNowBtn");
  if(!d||!body||!btn)return;
  body.innerHTML=installHelpText();
  const {standalone,isIOS}=platformInfo();
  btn.classList.toggle("hidden",standalone||isIOS||!deferredInstallPrompt);
  d.showModal();
}
async function triggerInstall(){
  if(!deferredInstallPrompt){openInstallDialog();return}
  deferredInstallPrompt.prompt();
  const choice=await deferredInstallPrompt.userChoice.catch(()=>null);
  deferredInstallPrompt=null;
  if(choice?.outcome==="accepted")toast("Instalación iniciada");
  else toast("Instalación no realizada");
  document.querySelector("#installDialog")?.close();
}


function openReportsChooser(){
  document.querySelector("#reportsChooserDialog")?.showModal();
}
function quickHelp(title,html){
  const d=document.querySelector("#quickHelpDialog");
  if(!d)return;
  document.querySelector("#quickHelpTitle").textContent=title;
  document.querySelector("#quickHelpBody").innerHTML=html;
  d.showModal();
}
function helpButton(title,html,label="Ayuda"){
  return `<button type="button" class="help-dot" aria-label="${esc(label)}" title="${esc(label)}" data-help-title="${esc(title)}" data-help-body="${encodeURIComponent(html)}">?</button>`;
}
function bindHelpButtons(root=document){
  if(!root || typeof root.querySelectorAll!=="function") return;
  root.querySelectorAll("[data-help-title]").forEach(b=>{
    if(b.dataset.helpBound==="1") return;
    b.dataset.helpBound="1";
    b.addEventListener("click",()=>{
      let body=b.dataset.helpBody||"";
      try{body=decodeURIComponent(body)}catch{}
      quickHelp(b.dataset.helpTitle||"Ayuda",body);
    });
  });
}



function validateCustomCode(v,existing=[]){
  const code=String(v||"").trim().toUpperCase();
  const problems=[];
  if(!/^[A-Z0-9-]{3,14}$/.test(code)) problems.push("usa solo letras, números y guion (3–14 caracteres)");
  if(existing.some(x=>String(x).toUpperCase()===code)) problems.push("ese código ya existe");
  if(/\b\d{8}[A-Z]\b/.test(code)) problems.push("parece un identificador personal");
  if(/^[A-ZÁÉÍÓÚÑ]{2,4}$/.test(code)) problems.push("evita iniciales personales");
  return {code,problems};
}

function normalizePrefix(v){
  return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);
}
function indexToLetters(n){
  let s=""; n=Math.max(0,n);
  do{s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)-1}while(n>=0);
  return s;
}
function nextMaskedCode(existing=[]){
  const p=prefs(), fmt=p.codeFormat||"01A", prefix=normalizePrefix(p.codePrefix||"");
  const used=new Set(existing.map(x=>String(x).toUpperCase()));
  for(let i=0;i<10000;i++){
    let base="";
    if(fmt==="A001") base=`${indexToLetters(Math.floor(i/999))}${String((i%999)+1).padStart(3,"0")}`;
    else if(fmt==="ACP001") base=`${prefix||"ACP"}${String(i+1).padStart(3,"0")}`;
    else base=`${String(Math.floor(i/26)+1).padStart(2,"0")}${indexToLetters(i%26)}`;
    const code=(fmt==="ACP001"?base:(prefix?`${prefix}-${base}`:base));
    if(!used.has(code.toUpperCase())) return code;
  }
  return `${prefix||"ACP"}-${Date.now().toString().slice(-6)}`;
}
async function usedCodes(){
  const rs=await allRecords();
  return [...new Set(rs.map(r=>r.codigo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
}

function syncVisibleCodeInputs(value){
  value=String(value||"").trim();
  if(!value)return;
  const candidates=[
    "#quickCodigo","#codigoQuick","#qCodigo","#quickCode",
    "#fullCodigo","#codigo","#recordCodigo"
  ];
  candidates.forEach(sel=>{
    const el=document.querySelector(sel);
    if(el && el.offsetParent!==null){el.value=value;el.dataset.selectedCode=value;el.dispatchEvent(new Event("change",{bubbles:true}));}
  });
  if(currentCodeInputTarget && document.contains(currentCodeInputTarget)){
    currentCodeInputTarget.value=value;
    currentCodeInputTarget.dataset.selectedCode=value;
    currentCodeInputTarget.dispatchEvent(new Event("change",{bubbles:true}));
  }
}

async function openCodeManager(targetInput){
  currentCodeInputTarget=targetInput||null;
  const d=document.querySelector("#codeManagerDialog");
  const sel=document.querySelector("#existingCodeSelect");
  const prev=document.querySelector("#newCodePreview");
  const custom=document.querySelector("#customCodeInput");
  const warning=document.querySelector("#customCodeWarning");
  const save=document.querySelector("#saveCodeChoiceBtn");
  const codes=await usedCodes();
  sel.innerHTML='<option value="">Seleccionar código…</option>'+codes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
  prev.textContent=nextMaskedCode(codes);
  custom.value="";
  warning.textContent="";warning.classList.add("hidden");
  save.disabled=true;
  d.querySelectorAll('input[name="codeChoice"]').forEach(r=>r.checked=false);
  d.dataset.targetName=targetInput?.name||"codigo";
  d.showModal();
}
function currentCodeTarget(){
  const d=document.querySelector("#codeManagerDialog");
  const name=d?.dataset.targetName||"codigo";
  return document.querySelector(`[name="${CSS.escape(name)}"]`);
}
function probableIdentifiers(text){
  const t=String(text||"").trim(); if(!t)return [];
  const hits=[];
  if(/\b\d{8}[A-HJ-NP-TV-Z]\b/i.test(t)) hits.push("posible DNI/NIE");
  if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(t)) hits.push("posible dirección electrónica");
  if(/(?:\+34[\s.-]?)?(?:[6789]\d{2}[\s.-]?\d{3}[\s.-]?\d{3})\b/.test(t.replace(/\s+/g," "))) hits.push("teléfono");
  if(/\b(?:calle|c\/|avenida|av\.?|plaza|paseo)\s+[A-ZÁÉÍÓÚÑ][\p{L}ÁÉÍÓÚÑáéíóúñ-]+/iu.test(t)) hits.push("dirección");
  // Conservative name heuristic: two adjacent capitalized words, excluding sentence/common educational terms.
  const common=new Set(["Registro","Conducta","Antecedente","Consecuencia","Apoyo","Apoyos","Aula","Educación","Física","Sí","No","Parcialmente","Otro","Otra","Centro","Madrid","ACP"]);
  const re=/\b([A-ZÁÉÍÓÚÑ][a-záéíóúñü-]{2,})\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñü-]{2,})\b/g;
  let m; while((m=re.exec(t))){if(!common.has(m[1])&&!common.has(m[2])){hits.push(`posible nombre propio: ${m[1]} ${m[2]}`);break}}
  return [...new Set(hits)];
}
function attachPrivacyScanner(root=document){
  if(!root)return;
  const selector='textarea,input[type="text"]:not([readonly])';
  root.querySelectorAll(selector).forEach(el=>{
    if(el.dataset.scanBound==="1")return;
    el.dataset.scanBound="1";
    let box=el.parentElement?.querySelector(".privacy-scan");
    if(!box){box=document.createElement("div");box.className="privacy-scan hidden";box.setAttribute("role","alert");el.insertAdjacentElement("afterend",box)}
    const scan=()=>{
      const hits=probableIdentifiers(el.value);
      if(hits.length){
        box.classList.remove("hidden");
        box.innerHTML=`⚠ Revisa: ${esc(hits.join(", "))}. Puede ser correcto, pero confirma que no estás introduciendo datos identificativos innecesarios.`;
        el.classList.add("privacy-flag");
      }else{
        box.classList.add("hidden");box.textContent="";el.classList.remove("privacy-flag");
      }
    };
    el.addEventListener("input",scan);el.addEventListener("blur",scan);scan();
  });
}
async function putCenterDoc(file){
  const max=5*1024*1024;if(file.size>max)throw new Error("TOO_LARGE");
  const data=await file.arrayBuffer();
  const doc={id:uid(),name:file.name,type:file.type||"application/octet-stream",size:file.size,createdAt:new Date().toISOString(),data};
  return new Promise((res,rej)=>{const tx=db.transaction(DOC_STORE,"readwrite");tx.objectStore(DOC_STORE).put(doc);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})
}
async function allCenterDocs(){
  return new Promise((res,rej)=>{const r=db.transaction(DOC_STORE).objectStore(DOC_STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})
}
async function deleteCenterDoc(id){
  return new Promise((res,rej)=>{const tx=db.transaction(DOC_STORE,"readwrite");tx.objectStore(DOC_STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})
}
async function openCenterDoc(doc){
  const blob=new Blob([doc.data],{type:doc.type});const url=URL.createObjectURL(blob);window.open(url,"_blank");setTimeout(()=>URL.revokeObjectURL(url),30000)
}
async function renderCenterDocs(){
  const list=document.querySelector("#centerDocsList");if(!list)return;
  const docs=await allCenterDocs();
  list.innerHTML=docs.length?docs.map(d=>`<div class="doc-row"><div><strong>${esc(d.name)}</strong><small>${Math.round(d.size/1024)} KB</small></div><div><button type="button" class="secondary small" data-open-doc="${esc(d.id)}">Abrir</button><button type="button" class="danger small" data-del-doc="${esc(d.id)}">Eliminar</button></div></div>`).join(""):'<p class="hint">No hay documentos locales.</p>';
  list.querySelectorAll("[data-open-doc]").forEach(b=>b.onclick=async()=>{const docs=await allCenterDocs();const d=docs.find(x=>x.id===b.dataset.openDoc);if(d)openCenterDoc(d)});
  list.querySelectorAll("[data-del-doc]").forEach(b=>b.onclick=async()=>{if(confirm("¿Eliminar este documento local?")){await deleteCenterDoc(b.dataset.delDoc);renderCenterDocs()}});
}


async function ensureHomeVisible(){
  if(!prefs().accepted || prefs().acceptedVersion!==CONSENT_VERSION) return;
  const home=document.querySelector("#screen-home");
  const anyVisible=[...document.querySelectorAll(".screen")].some(s=>!s.classList.contains("hidden"));
  if(!anyVisible || !home || home.innerHTML.trim()===""){
    await renderHome();
    show("home");
  }
}



async function goHomeSafe(){
  try{
    await renderHome();
    show("home");
    document.querySelector("#settingsMenu")?.classList.add("hidden");
    document.querySelector("#headerSettingsBtn")?.setAttribute("aria-expanded","false");
  }catch(err){
    console.error("No se pudo volver a Inicio:",err);
    document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));
    document.querySelector("#screen-home")?.classList.remove("hidden");
  }
}

function screenCloseButton(){
  return `<button type="button" class="screen-close" aria-label="Cerrar" title="Cerrar">×</button>`;
}
function bindScreenClose(root){
  root?.querySelector(".screen-close")?.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();goHomeSafe()});
}



function accordionBar(title,helpTitle="",helpBody=""){
  return `<div class="accordion-bar">
    ${helpTitle?`<button type="button" class="help-dot accordion-help" aria-label="Ayuda: ${esc(title)}" data-help-title="${esc(helpTitle)}" data-help-body="${encodeURIComponent(helpBody)}">?</button>`:`<span class="accordion-help-spacer" aria-hidden="true"></span>`}
    <button type="button" class="accordion-toggle" aria-expanded="false">
      <span class="accordion-title">${esc(title)}</span>
      <span class="accordion-chevron" aria-hidden="true">⌄</span>
    </button>
  </div>`;
}
function accordionSection(slug,title,body,helpTitle="",helpBody=""){
  return `<section class="collapsible-field" data-section="${esc(slug)}">${accordionBar(title,helpTitle,helpBody)}<div class="collapsible-body">${body}</div></section>`;
}
function bindCollapsibleFieldsets(root){
  if(!root)return;
  root.querySelectorAll(".collapsible-field").forEach(box=>{
    const toggle=box.querySelector(".accordion-toggle,.collapsible-head");
    const body=box.querySelector(".collapsible-body");
    if(!toggle||!body||toggle.dataset.collapseBound==="1")return;
    toggle.dataset.collapseBound="1";
    if(!body.id)body.id=`accordion-${Math.random().toString(36).slice(2,9)}`;
    toggle.setAttribute("aria-controls",body.id);
    body.setAttribute("role","region");
    toggle.addEventListener("click",()=>{
      const open=!box.classList.contains("open");
      box.classList.toggle("open",open);
      toggle.setAttribute("aria-expanded",String(open));
    });
  });
}

function ensureHypothesisOtherReveal(root){
  if(!root)return;
  const hip=root.querySelector('[data-section="hipotesis"]');
  if(!hip)return;
  const other=hip.querySelector('[name="hipotesisOtro"]');
  if(!other)return;
  const refresh=()=>{
    const on=[...hip.querySelectorAll('input[type="checkbox"],input[type="radio"]')]
      .some(i=>i.checked&&/otro|otra/i.test(i.value||""));
    other.classList.toggle("hidden",!on);
  };
  hip.addEventListener("change",refresh);
  refresh();
}

function bindOtherReveal(root){
  if(!root)return;
  root.querySelectorAll("[data-other-target]").forEach(container=>{
    const targetSel=container.dataset.otherTarget;
    const target=root.querySelector(targetSel);
    if(!target)return;
    const refresh=()=>{
      const checked=[...container.querySelectorAll('input[type="checkbox"],input[type="radio"]')].some(i=>i.checked && /otro|otra/i.test(i.value||i.dataset.label||""));
      target.classList.toggle("hidden",!checked);
    };
    container.addEventListener("change",refresh);refresh();
  });
}


function ensureScreenClose(id){
  if(id==="home")return;
  const screen=document.querySelector(`#screen-${id}`);
  if(!screen)return;
  const host=screen.querySelector(".card")||screen;
  if(host.querySelector(":scope > .screen-close"))return;
  host.classList.add("screen-card");
  const btn=document.createElement("button");
  btn.type="button";btn.className="screen-close";btn.setAttribute("aria-label","Cerrar");btn.title="Cerrar";
  btn.textContent="×";
  btn.addEventListener("click",async()=>{await renderHome();show("home")});
  host.prepend(btn);
}


function announceA11y(msg){
  const live=document.querySelector("#a11yLive");
  if(live){live.textContent="";setTimeout(()=>live.textContent=msg,20)}
}
function showRequiredFieldError(field,message){
  if(!field)return false;
  const section=field.closest(".collapsible-field");
  if(section){
    section.classList.add("open");
    section.querySelector(".collapsible-head")?.setAttribute("aria-expanded","true");
  }
  field.setAttribute("aria-invalid","true");
  field.classList.add("field-error");
  const msg=message||"Completa este campo obligatorio.";
  toast(msg);announceA11y(msg);
  setTimeout(()=>{
    field.scrollIntoView({behavior:"smooth",block:"center"});
    try{field.focus({preventScroll:true})}catch(e){field.focus()}
  },80);
  const clear=()=>{field.removeAttribute("aria-invalid");field.classList.remove("field-error");field.removeEventListener("input",clear);field.removeEventListener("change",clear)};
  field.addEventListener("input",clear);field.addEventListener("change",clear);
  return false;
}
function validateRequiredRecordFields(form){
  if(!form)return true;
  const code=form.querySelector('[name="codigo"]');
  if(code && !String(code.value||"").trim()) return showRequiredFieldError(code,"Falta el código pseudónimo. Selecciona o genera uno antes de guardar.");
  const required=[...form.querySelectorAll("[required]")];
  for(const field of required){
    if(field===code)continue;
    if(!field.checkValidity()){
      const label=field.closest("label")?.childNodes?.[0]?.textContent?.trim()||"campo obligatorio";
      return showRequiredFieldError(field,`Revisa ${label}. Es obligatorio para guardar.`);
    }
  }
  return true;
}

function show(id){
 document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));
 const el=document.querySelector(`#screen-${id}`);el.classList.remove("hidden");el.scrollIntoView({block:"start"});document.querySelector("#main").focus();setTimeout(()=>{bindHelpButtons(el);attachPrivacyScanner(el);bindScreenClose(el);bindCollapsibleFieldsets(el);bindOtherReveal(el)},0);setTimeout(()=>bindHelpButtons(el),0);
  setTimeout(()=>ensureScreenClose(id),0);
}
function requirePin(next){
 const p=prefs(); if(!p.pinEnabled||unlocked){next();return}
 const d=document.querySelector("#pinDialog");document.querySelector("#unlockPin").value="";document.querySelector("#pinError").classList.add("hidden");
 d.showModal(); d.dataset.next="1"; pinNext=next;
}
let pinNext=null;
async function hashPin(pin,salt){
 const data=new TextEncoder().encode(`${salt}:${pin}`);const hash=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("")
}
function renderConsent(){
 document.querySelector("#screen-consent").innerHTML=`<div class="card hero"><h2>Privacidad y autorización de uso</h2>
 <p>Esta aplicación emplea códigos pseudónimos y no solicita el nombre del alumnado. El autor no recibe, consulta ni controla los registros, que se almacenan localmente en el dispositivo.</p>
 <p><strong>El uso de un código no garantiza que la información sea anónima.</strong> Los registros seguirán siendo datos personales cuando la persona usuaria o el centro puedan relacionarlos directa o indirectamente con un alumno mediante una tabla, un documento, el conocimiento del contexto o la combinación de fecha, grupo, conducta y otros detalles.</p>
 <p>No introduzcas nombres, iniciales, números de expediente, diagnósticos, información clínica ni detalles innecesarios que permitan identificar al alumnado. Cualquier relación entre códigos e identidades deberá conservarse fuera de la aplicación, separada y protegida conforme a las instrucciones del centro.</p>
 <p><strong>Aplicación en España:</strong> antes de utilizar datos reales, la persona usuaria debe comprobar que la finalidad, la aplicación y el dispositivo están autorizados por su centro, entidad titular y Administración educativa competente. Debe aplicar el RGPD, la normativa española y las instrucciones específicas de su comunidad autónoma. Cuando corresponda, deberá consultar al delegado o delegada de protección de datos.</p>
 <p>Esta aplicación no ha sido homologada, certificada ni autorizada para uso institucional por la AEPD, el Ministerio de Educación, las consejerías autonómicas ni ningún centro educativo. Puede utilizarse con casos completamente ficticios para demostración o formación.</p>
 <p><strong>Comunidad de Madrid:</strong> sus instrucciones publicadas establecen restricciones expresas para las herramientas externas destinadas al registro o valoración de conductas. En otras comunidades deben comprobarse sus propias instrucciones.</p>
 <p>Los datos almacenados localmente pueden permanecer en este dispositivo hasta que sean eliminados. Se recomienda activar el PIN y aplicar las medidas de seguridad del centro. El PIN limita el acceso desde la interfaz, pero no cifra el almacenamiento ni los archivos exportados.</p>
 <p>La persona usuaria es responsable de la legitimidad, confidencialidad, conservación, exportación, envío y eliminación de la información que introduce, así como del cumplimiento de la normativa y los protocolos aplicables.</p>
 <label class="checkline"><input id="acceptUse" type="checkbox"> He leído esta advertencia. Comprendo que los códigos no convierten automáticamente los registros en datos anónimos y confirmo que no utilizaré datos reales sin la autorización institucional y las medidas de protección que correspondan.</label>
 <div class="actions"><button id="continueConsent" disabled>Continuar</button></div></div>`;
 document.querySelector("#acceptUse").addEventListener("change",e=>document.querySelector("#continueConsent").disabled=!e.target.checked);
 document.querySelector("#continueConsent").addEventListener("click",()=>{savePrefs({accepted:true,acceptedVersion:CONSENT_VERSION,acceptedAt:new Date().toISOString()});renderHome();show("home")})
}
async function renderHome(){
  const rs=await allRecords(), old=oldCount(rs);
  const el=document.querySelector("#screen-home");
  const retention=old?`<div class="compact-note"><strong>${old} registro(s) para revisar</strong><button type="button" class="help-dot" data-help-title="Revisión de datos" data-help-body="Revisa si sigue siendo necesario conservar estos registros. La aplicación no borra automáticamente.">?</button></div>`:"";
  el.innerHTML=`
    ${retention}

    <section class="home-section register-zone" aria-labelledby="home-registro-title">
      <div class="home-section-head centered"><h2 id="home-registro-title">Registro</h2></div>
      <div class="record-actions centered-records">
        <button class="record-main" data-nav="form" type="button">
          <span class="record-symbol">＋</span><strong>Nuevo</strong><small>Completo</small>
        </button>
        <button class="record-main" data-nav="quick" type="button">
          <span class="record-symbol">⚡</span><strong>Rápido</strong><small>Lo esencial</small>
        </button>
      </div>
    </section>

    <section class="home-section reports-zone">
      <button id="homeReportsBtn" class="report-main-btn" type="button">
        <span>▤</span><strong>Informes</strong><small>Estadísticas o alumnado</small><i>›</i>
      </button>
    </section>

    <div class="home-utility-row csv-only">
      <button id="homeCsvImportBtn" class="utility-btn" type="button">↑ Importar CSV</button>
    </div>

    <div class="install-card compact-install">
      <div class="install-icon">＋</div>
      <div><section class="collapsible-field" data-section="hipotesis">
  <button type="button" class="collapsible-head" aria-expanded="false">
    <span><h3>Instalar app</h3><p>Acceso rápido desde este dispositivo.</p></div>
      <button id="homeInstallBtn" class="secondary" type="button">Instalar app</button>
    </div>`;

  el.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>b.dataset.nav==="reports"?openReportsChooser():navigate(b.dataset.nav)));
  el.querySelector("#homeReportsBtn")?.addEventListener("click",openReportsChooser);
  el.querySelector("#homeCsvImportBtn")?.addEventListener("click",openImportDialog);
  el.querySelector("#homeInstallBtn")?.addEventListener("click",openInstallHelp);
  refreshInstallUI();bindHelpButtons(el);
}
function formTemplate(d={}){
 const inc=d.inclusion||{};
 return `<form id="recordForm">
  <div class="card screen-card">${screenCloseButton()}
    <div class="section-title-row"><h2>${currentEditId?"Editar registro":"Nuevo registro"}</h2></div>
    <p class="hint">El código pseudónimo es imprescindible. El resto puede completarse progresivamente.</p>
    <div class="two">
      <label class="required">Código pseudónimo
        <div class="code-row"><input name="codigo" required readonly aria-readonly="true" value="${esc(d.codigo||"")}"><button type="button" class="secondary code-pick" id="chooseCodeBtn">Elegir / crear</button></div>
      </label>
      <label>Fecha y hora<input name="fechaHora" type="datetime-local" value="${esc(d.fechaHora||nowLocal())}"></label>
      <label>Curso / grupo<input name="grupo" value="${esc(d.grupo||"")}"></label>
      <label>Profesional que registra (alias)<input name="profesional" value="${esc(d.profesional||"")}"></label>
    </div>
  </div>

  <div class="card form-accordion-card">
    ${accordionSection("contexto","Contexto escolar",chips("contexto",OPT.contexto,d.contexto||[],"contextoOtro",d.contextoOtro||""),"Contexto escolar","Selecciona dónde ocurrió la situación. Puedes marcar varias opciones.")}
    ${accordionSection("factores","Factores del entorno",chips("factores",OPT.factores,d.factores||[],"factoresOtro",d.factoresOtro||""),"Factores del entorno","Marca condiciones del entorno que pudieron influir.")}
    ${accordionSection("antecedente","Antecedente inmediato",`${chips("antecedente",OPT.antecedente,d.antecedente||[],"antecedenteOtro",d.antecedenteOtro||"")}<label>Descripción objetiva<textarea name="antecedenteDesc">${esc(d.antecedenteDesc||"")}</textarea></label>`,"Antecedente inmediato","Qué ocurrió justo antes. Describe hechos observables.")}
    ${accordionSection("conducta","Conducta observada",`${chips("conducta",OPT.conducta,d.conducta||[],"conductaOtro",d.conductaOtro||"")}<label>Descripción objetiva<textarea name="conductaDesc">${esc(d.conductaDesc||"")}</textarea></label><div class="three"><label>Duración<input type="number" min="0" step="1" name="duracionValor" value="${esc(d.duracionValor||"")}"></label><label>Unidad<select name="duracionUnidad"><option>segundos</option><option ${d.duracionUnidad==="minutos"?"selected":""}>minutos</option></select></label><label>Frecuencia<input type="number" min="0" step="1" name="frecuencia" value="${esc(d.frecuencia||1)}"></label></div><div class="actions compact-actions"><button type="button" class="secondary small" id="timerStart">Iniciar cronómetro</button><button type="button" class="secondary small" id="timerStop" disabled>Detener</button><span id="timerDisplay" aria-live="polite"></span></div>`,"Conducta observada","Describe lo que se vio u oyó, sin atribuir intenciones.")}
    ${accordionSection("consecuencia","Consecuencia",`${chips("consecuencia",OPT.consecuencia,d.consecuencia||[],"consecuenciaOtro",d.consecuenciaOtro||"")}<label>Descripción adicional<textarea name="consecuenciaDesc">${esc(d.consecuenciaDesc||"")}</textarea></label>`,"Consecuencia","Qué ocurrió inmediatamente después. No implica causa.")}
    ${accordionSection("hipotesis","Hipótesis funcional provisional",`${chips("hipotesis",OPT.hipotesis,d.hipotesis||[],"hipotesisOtro",d.hipotesisOtro||"")}<p class="hint">Hipótesis provisional. Revisar con varios registros y en equipo.</p>`,"Hipótesis, no diagnóstico","Explicación provisional que debe revisarse con varios registros y en equipo.")}
    ${accordionSection("apoyos","Apoyos aplicados",`${chips("apoyos",OPT.apoyos,d.apoyos||[],"apoyosOtro",d.apoyosOtro||"")}<label>¿Pareció ayudar?<select name="apoyoValoracion"><option></option>${["Sí","Parcialmente","No","No valorable"].map(x=>`<option ${d.apoyoValoracion===x?"selected":""}>${x}</option>`).join("")}</select></label>`,"Apoyos aplicados","Marca los apoyos utilizados y si pareció que ayudaron.")}
    ${accordionSection("proxima","Próxima vez",`${chips("proxima",OPT.proxima,d.proxima||[],"proximaOtro",d.proximaOtro||"")}<label>Nota breve<textarea name="proximaTexto">${esc(d.proximaTexto||"")}</textarea></label>`,"Próxima vez","Anota apoyos o ajustes que conviene probar en una situación similar.")}
    ${accordionSection("inclusion","Inclusión y contexto",`<p class="hint">Revisa el entorno y los apoyos.</p><div class="two">${inclusionFields(inc)}</div>`,"Inclusión y contexto","Revisa accesibilidad, participación, predictibilidad, comunicación y dignidad.")}
  </div>

  <div class="card">
    <div class="two">
      <label>Intensidad <button type="button" class="help-dot inline-help" data-help-title="Intensidad" data-help-body="${encodeURIComponent("Nivel descriptivo de la magnitud observada. 1 = leve o de baja interferencia; 2 = moderada; 3 = alta o con interferencia importante. Valora lo observado, no a la persona.")}">?</button> (1–5)<select name="intensidad">${[1,2,3,4,5].map(n=>`<option ${String(d.intensidad||3)===String(n)?"selected":""}>${n}</option>`).join("")}</select></label>
      <label>Riesgo <button type="button" class="help-dot inline-help" data-help-title="Riesgo" data-help-body="${encodeURIComponent("Riesgo se refiere a la posibilidad inmediata de daño para la propia persona, otras personas o el entorno. Bajo = sin riesgo apreciable; Medio = requiere atención o prevención; Alto = existe riesgo claro y requiere actuación prioritaria según el protocolo del centro.")}">?</button><select name="riesgo" id="riskSelect">${["sin riesgo","leve","moderado","alto"].map(x=>`<option ${d.riesgo===x?"selected":""}>${x}</option>`).join("")}</select></label>
    </div>
    <div id="highRisk" class="risk ${d.riesgo==="alto"?"":"hidden"}">Prioriza la seguridad, la dignidad y los protocolos establecidos por el centro.</div>
  </div>

  <div class="card actions">
    <button type="submit">${currentEditId?"Guardar cambios":"Guardar registro"}</button>
    <button type="button" class="secondary" id="cancelForm">Cancelar</button>
  </div>
 </form>`;
}
function bindSpec(root=document){
 root.querySelectorAll("[data-chip-group]").forEach(g=>g.addEventListener("change",()=>{const name=g.dataset.chipGroup, spec=root.querySelector(`[data-spec-for="${CSS.escape(name)}"]`);if(!spec)return;const on=[...g.querySelectorAll("input:checked")].some(i=>["otro","otra","otros","similar","no incluido"].includes(i.value.toLowerCase()));spec.classList.toggle("hidden",!on)}))
}
function recordFromForm(form,base={}){
 const fd=new FormData(form), inc={};INCLUSION.forEach(k=>inc[k]=one(fd,`inc_${k}`));
 return {...base,id:base.id||uid(),fechaHora:one(fd,"fechaHora"),codigo:one(fd,"codigo"),grupo:one(fd,"grupo"),profesional:one(fd,"profesional"),
 contexto:arrayVal(fd,"contexto"),contextoOtro:one(fd,"contextoOtro"),factores:arrayVal(fd,"factores"),factoresOtro:one(fd,"factoresOtro"),
 antecedente:arrayVal(fd,"antecedente"),antecedenteOtro:one(fd,"antecedenteOtro"),antecedenteDesc:one(fd,"antecedenteDesc"),
 conducta:arrayVal(fd,"conducta"),conductaOtro:one(fd,"conductaOtro"),conductaDesc:one(fd,"conductaDesc"),duracionValor:Number(one(fd,"duracionValor")||0),duracionUnidad:one(fd,"duracionUnidad"),frecuencia:Number(one(fd,"frecuencia")||0),
 intensidad:Number(one(fd,"intensidad")||0),riesgo:one(fd,"riesgo"),consecuencia:arrayVal(fd,"consecuencia"),consecuenciaOtro:one(fd,"consecuenciaOtro"),consecuenciaDesc:one(fd,"consecuenciaDesc"),
 hipotesis:arrayVal(fd,"hipotesis"),hipotesisOtro:one(fd,"hipotesisOtro"),apoyos:arrayVal(fd,"apoyos"),apoyosOtro:one(fd,"apoyosOtro"),apoyoValoracion:one(fd,"apoyoValoracion"),
 proxima:arrayVal(fd,"proxima"),proximaOtro:one(fd,"proximaOtro"),proximaTexto:one(fd,"proximaTexto"),inclusion:inc,updatedAt:new Date().toISOString(),createdAt:base.createdAt||new Date().toISOString(),demo:!!base.demo,quick:!!base.quick}
}
async function renderForm(data=null){
 currentEditId=data?.id||null;
 document.querySelector("#screen-form").innerHTML=formTemplate(data||{});
 const root=document.querySelector("#screen-form"),f=document.querySelector("#recordForm");
 bindSpec(root);attachPrivacyScanner(f);bindCollapsibleFieldsets(f);bindOtherReveal(f);bindHelpButtons(f);bindScreenClose(root);
 document.querySelector("#chooseCodeBtn")?.addEventListener("click",()=>openCodeManager(f.elements.codigo));
 document.querySelector("#cancelForm").onclick=()=>{currentEditId=null;goHomeSafe()};
 const risk=document.querySelector("#riskSelect");if(risk)risk.onchange=e=>document.querySelector("#highRisk").classList.toggle("hidden",e.target.value!=="alto");
 let startTime=0,tick=null;const disp=document.querySelector("#timerDisplay"),startBtn=document.querySelector("#timerStart"),stopBtn=document.querySelector("#timerStop");
 if(startBtn)startBtn.onclick=()=>{startTime=Date.now();startBtn.disabled=true;stopBtn.disabled=false;tick=setInterval(()=>disp.textContent=`${Math.floor((Date.now()-startTime)/1000)} s`,1000)};
 if(stopBtn)stopBtn.onclick=()=>{clearInterval(tick);const secs=Math.max(1,Math.floor((Date.now()-startTime)/1000));f.elements.duracionValor.value=secs;f.elements.duracionUnidad.value="segundos";disp.textContent=`${secs} s`;startBtn.disabled=false;stopBtn.disabled=true};
 f.onsubmit=async e=>{
   e.preventDefault();
   if(!validateRequiredRecordFields(f))return;
   try{
     const base=currentEditId?await getRecord(currentEditId):{};
     const rec=recordFromForm(f,base);
     await finishSavedRecord(rec);
   }catch(err){
     console.error("Error al guardar:",err);
     toast("No se pudo guardar el registro");
   }
 };
}
function quickTemplate(d={}){
 return `<form id="quickForm">
  <div class="card screen-card">${screenCloseButton()}
    <h2>Registro rápido</h2>
    <div class="two">
      <label class="required">Código pseudónimo<div class="code-row"><input name="codigo" required readonly value="${esc(d.codigo||"")}"><button type="button" id="quickChooseCodeBtn" class="secondary">Elegir / crear</button></div></label>
      <label>Fecha y hora<input type="datetime-local" name="fechaHora" value="${esc(d.fechaHora||nowLocal())}"></label>
    </div>
  </div>
  <div class="card form-accordion-card">
    ${accordionSection("qcontexto","Contexto",chips("contexto",OPT.contexto,d.contexto||[],"contextoOtro",d.contextoOtro||""),"Contexto","Dónde ocurrió la situación.")}
    ${accordionSection("qantecedente","Antecedente",chips("antecedente",OPT.antecedente,d.antecedente||[],"antecedenteOtro",d.antecedenteOtro||""),"Antecedente","Qué ocurrió justo antes.")}
    ${accordionSection("qconducta","Conducta",`${chips("conducta",OPT.conducta,d.conducta||[],"conductaOtro",d.conductaOtro||"")}<label>Descripción objetiva breve<textarea name="conductaDesc">${esc(d.conductaDesc||"")}</textarea></label>`,"Conducta observada","Qué se vio u oyó.")}
    ${accordionSection("qconsecuencia","Consecuencia",chips("consecuencia",OPT.consecuencia,d.consecuencia||[],"consecuenciaOtro",d.consecuenciaOtro||""),"Consecuencia","Qué ocurrió inmediatamente después.")}
  </div>
  <div class="card"><div class="two quick-critical"><label>Intensidad <button type="button" class="help-dot inline-help" data-help-title="Intensidad" data-help-body="${encodeURIComponent("Nivel descriptivo de la magnitud observada. 1 = leve o de baja interferencia; 2 = moderada; 3 = alta o con interferencia importante. Valora lo observado, no a la persona.")}">?</button><select name="intensidad">${[1,2,3,4,5].map(n=>`<option ${n===3?"selected":""}>${n}</option>`).join("")}</select></label><label>Riesgo <button type="button" class="help-dot inline-help" data-help-title="Riesgo" data-help-body="${encodeURIComponent("Riesgo se refiere a la posibilidad inmediata de daño para la propia persona, otras personas o el entorno. Bajo = sin riesgo apreciable; Medio = requiere atención o prevención; Alto = existe riesgo claro y requiere actuación prioritaria según el protocolo del centro.")}">?</button><select name="riesgo">${["sin riesgo","leve","moderado","alto"].map(x=>`<option>${x}</option>`).join("")}</select></label></div></div>
  <div class="card actions"><button type="submit">Guardar registro rápido</button><button type="button" id="quickComplete" class="secondary">Completar detalles</button><button type="button" id="quickCancel" class="secondary">Cancelar</button></div>
 </form>`;
}
function quickToRecord(form){
 const fd=new FormData(form);return {id:uid(),fechaHora:one(fd,"fechaHora")||nowLocal(),codigo:one(fd,"codigo"),grupo:"",profesional:"",contexto:arrayVal(fd,"contexto"),contextoOtro:one(fd,"contextoOtro"),factores:[],factoresOtro:"",
 antecedente:arrayVal(fd,"antecedente"),antecedenteOtro:one(fd,"antecedenteOtro"),antecedenteDesc:"",conducta:arrayVal(fd,"conducta"),conductaOtro:one(fd,"conductaOtro"),conductaDesc:one(fd,"conductaDesc"),duracionValor:0,duracionUnidad:"segundos",frecuencia:1,intensidad:Number(one(fd,"intensidad")||3),riesgo:one(fd,"riesgo")||"sin riesgo",consecuencia:arrayVal(fd,"consecuencia"),consecuenciaOtro:one(fd,"consecuenciaOtro"),consecuenciaDesc:"",hipotesis:[],hipotesisOtro:"",apoyos:[],apoyosOtro:"",apoyoValoracion:"",proxima:[],proximaOtro:"",proximaTexto:"",inclusion:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),demo:false,quick:true}
}
function renderQuick(){
 document.querySelector("#screen-quick").innerHTML=quickTemplate();
 const root=document.querySelector("#screen-quick"),f=document.querySelector("#quickForm");
 bindSpec(root);attachPrivacyScanner(f);bindCollapsibleFieldsets(f);bindOtherReveal(f);bindHelpButtons(f);bindScreenClose(root);
 document.querySelector("#quickChooseCodeBtn")?.addEventListener("click",()=>openCodeManager(f.elements.codigo));
 document.querySelector("#quickCancel").onclick=()=>goHomeSafe();
 f.onsubmit=async e=>{
   e.preventDefault();
   if(!validateRequiredRecordFields(f))return;
   try{await finishSavedRecord(quickToRecord(f))}
   catch(err){console.error("Error al guardar registro rápido:",err);toast("No se pudo guardar el registro")}
 };
 document.querySelector("#quickComplete").onclick=async()=>{if(!validateRequiredRecordFields(f))return;await renderForm(quickToRecord(f));show("form")};
}
function summaryRecord(r,selectedIds=new Set()){
 const selected=selectedIds.has(r.id);
 return `<div class="record ${r.id===lastSavedRecordId?"just-saved":""} ${selected?"record-selected":""}" data-id="${esc(r.id)}"><div class="record-head"><div><h3>${esc(r.codigo)} ${r.demo?'<span class="badge demo">DEMO</span>':""}</h3><div class="meta">${esc(new Date(r.fechaHora).toLocaleString("es-ES"))} · ${esc(selectedFirst(r.contexto))}</div></div><span class="badge ${r.riesgo==="alto"?"high":""}">${esc(r.riesgo||"sin riesgo")}</span></div>
 <p><strong>Conducta:</strong> ${esc(selectedFirst(r.conducta))} · Intensidad ${esc(r.intensidad)}</p><p class="hint">${esc(r.conductaDesc||"")}</p>
 <label class="checkline record-select-line"><input type="checkbox" class="select-record" value="${esc(r.id)}" ${selected?"checked":""}> Seleccionar este registro</label>
 <div class="actions"><button class="small" data-act="view">Ver</button><button class="small secondary" data-act="edit">Editar</button><button class="small secondary" data-act="dup">Duplicar</button><button class="small danger" data-act="delete">Eliminar</button><button class="small secondary" data-act="export">Exportar</button></div></div>`;
}
async function renderList(mode="all"){
 listMode=mode;
 const all=await allRecords(),today=new Date().toISOString().slice(0,10);
 const codes=[...new Set(all.map(r=>r.codigo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
 const base=mode==="today"?all.filter(r=>dateOnly(r.fechaHora)===today):all;
 let visible=[...base];
 let selectedIds=new Set();

 document.querySelector("#screen-list").innerHTML=`<div class="card screen-card">${screenCloseButton()}
   <h2>Registros</h2>
   <details class="filter-panel"><summary>Filtrar registros</summary><div class="toolbar">
     <label>Código<select id="fCode"><option value="">Todos</option>${codes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select></label>
     <label>Contexto<select id="fContext"><option value="">Todos</option>${OPT.contexto.map(x=>`<option>${x}</option>`).join("")}</select></label>
     <label>Riesgo <button type="button" class="help-dot inline-help" data-help-title="Riesgo" data-help-body="${encodeURIComponent("Riesgo se refiere a la posibilidad inmediata de daño para la propia persona, otras personas o el entorno. Bajo = sin riesgo apreciable; Medio = requiere atención o prevención; Alto = existe riesgo claro y requiere actuación prioritaria según el protocolo del centro.")}">?</button><select id="fRisk"><option value="">Todos</option>${["sin riesgo","leve","moderado","alto"].map(x=>`<option>${x}</option>`).join("")}</select></label>
     <label>Conducta<select id="fBehavior"><option value="">Todas</option>${OPT.conducta.map(x=>`<option>${x}</option>`).join("")}</select></label>
     <label>Desde<input id="fFrom" type="date"></label><label>Hasta<input id="fTo" type="date"></label>
     <div class="actions compact-actions"><button id="applyFilters" class="secondary" type="button">Aplicar</button><button id="clearFilters" class="ghost" type="button">Limpiar</button></div>
   </div></details>
   <details class="filter-panel"><summary>Datos de prueba</summary><div class="records-tools-row"><button id="addDemoBtn" class="secondary demo-btn" type="button">＋ Probar con datos ficticios</button><button id="deleteDemoBtn" class="ghost demo-delete" type="button">Borrar pruebas</button><span>Alumno ficticio · solo para probar</span></div></details>
   <div class="record-selection-bar" aria-label="Acciones para los registros seleccionados">
     <label class="checkline"><input id="selectAllVisible" type="checkbox"> Seleccionar todos los visibles</label>
     <span id="recordSelectionSummary" aria-live="polite">Ningún registro seleccionado</span>
     <button id="deleteSelectedRecords" class="danger" type="button" disabled>Eliminar seleccionados</button>
   </div>
   <div class="records-export-bar"><span><strong>Exportar lo visible</strong></span><div class="records-export-actions"><button id="recordsPdfBtn">PDF</button><button id="recordsDocxBtn">DOCX</button><button id="recordsXlsxBtn">XLSX</button><button id="recordsCsvBtn">CSV</button></div></div>
   <div id="recordList">${visible.length?visible.map(r=>summaryRecord(r,selectedIds)).join(""):'<div class="card"><p>No hay registros.</p></div>'}</div>
 </div>`;

 const bindActions=()=>document.querySelectorAll("#recordList .record [data-act]").forEach(b=>b.onclick=async()=>{
   const id=b.closest(".record").dataset.id,act=b.dataset.act,r=await getRecord(id);
   if(act==="view")viewRecord(r);
   if(act==="edit"){await renderForm(r);show("form")}
   if(act==="dup"){const copy=structuredClone(r);copy.id=uid();copy.fechaHora=nowLocal();copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;await putRecord(copy);toast("Registro duplicado");renderList("all")}
   if(act==="delete"&&confirm("¿Eliminar este registro?")){await deleteRecord(id);toast("Registro eliminado");renderList("all")}
   if(act==="export"){selectedExportIds=[id];await renderReport();show("report")}
 });
 const updateSelectionUi=()=>{
  const visibleIds=new Set(visible.map(r=>r.id));
  selectedIds=new Set([...selectedIds].filter(id=>visibleIds.has(id)));
  const n=selectedIds.size,total=visible.length,allVisible=total>0&&n===total;
  const allBox=document.querySelector("#selectAllVisible"),summary=document.querySelector("#recordSelectionSummary"),del=document.querySelector("#deleteSelectedRecords");
  if(allBox){allBox.checked=allVisible;allBox.indeterminate=n>0&&!allVisible;allBox.disabled=!total}
  if(summary)summary.textContent=n?`${n} registro(s) seleccionado(s)`:"Ningún registro seleccionado";
  if(del){del.disabled=!n;del.textContent=n?`Eliminar seleccionados (${n})`:"Eliminar seleccionados"}
 };
 const bindSelection=()=>document.querySelectorAll("#recordList .select-record").forEach(ch=>ch.onchange=()=>{
  if(ch.checked)selectedIds.add(ch.value);else selectedIds.delete(ch.value);
  ch.closest(".record")?.classList.toggle("record-selected",ch.checked);updateSelectionUi()
 });
 const draw=()=>{document.querySelector("#recordList").innerHTML=visible.length?visible.map(r=>summaryRecord(r,selectedIds)).join(""):'<div class="card"><p>No hay resultados.</p></div>';bindActions();bindSelection();updateSelectionUi()};
 document.querySelector("#applyFilters").onclick=()=>{
   const code=document.querySelector("#fCode").value,ctx=document.querySelector("#fContext").value,risk=document.querySelector("#fRisk").value,bh=document.querySelector("#fBehavior").value,fr=document.querySelector("#fFrom").value,to=document.querySelector("#fTo").value;
   visible=base.filter(r=>(!code||r.codigo===code)&&(!ctx||r.contexto.includes(ctx))&&(!risk||r.riesgo===risk)&&(!bh||r.conducta.includes(bh))&&(!fr||dateOnly(r.fechaHora)>=fr)&&(!to||dateOnly(r.fechaHora)<=to));draw();
 };
 document.querySelector("#clearFilters").onclick=()=>{["fCode","fContext","fRisk","fBehavior","fFrom","fTo"].forEach(id=>document.querySelector(`#${id}`).value="");visible=[...base];draw()};
 bindActions();
 bindSelection();
 updateSelectionUi();
 document.querySelector("#selectAllVisible").onchange=e=>{selectedIds=e.target.checked?new Set(visible.map(r=>r.id)):new Set();draw()};
 document.querySelector("#deleteSelectedRecords").onclick=async()=>{
  const ids=[...selectedIds];if(!ids.length)return;
  if(!confirm(`¿Eliminar definitivamente ${ids.length} registro(s) seleccionado(s)? Esta acción no puede deshacerse.`))return;
  try{await deleteRecords(ids);toast(`${ids.length} registro(s) eliminado(s)`);await renderList(mode)}
  catch(err){console.error("Error al eliminar registros seleccionados:",err);toast("No se pudieron eliminar los registros")}
 };
 document.querySelector("#addDemoBtn").onclick=async()=>{if(!confirm("Se crearán registros ficticios para probar la aplicación. No corresponden a alumnado real."))return;const r=await addDemoRecords();toast(`Datos ficticios añadidos: ${r.code}`);await renderList("all")};
 document.querySelector("#deleteDemoBtn").onclick=async()=>{if(!confirm("¿Borrar todos los datos ficticios?"))return;const n=await deleteDemoRecords();toast(`${n} registro(s) ficticios eliminados`);await renderList("all")};
 const exportVisible=async fn=>{if(!visible.length)return toast("No hay registros visibles");await reviewGate(async()=>fn(visible))};
 document.querySelector("#recordsPdfBtn").onclick=()=>exportVisible(rs=>exportStatsPDF(rs,{charts:false,details:true,code:"all"}));
 document.querySelector("#recordsDocxBtn").onclick=()=>exportVisible(rs=>exportStatsDOCX(rs,{charts:false,details:true,code:"all"}));
 document.querySelector("#recordsXlsxBtn").onclick=()=>exportVisible(rs=>exportStatsXlsx(rs,{charts:false,details:true,code:"all"}));
 document.querySelector("#recordsCsvBtn").onclick=()=>exportVisible(rs=>exportStatsCSV(rs));
 bindScreenClose(document.querySelector("#screen-list"));
}
function ensureRecordDetailDialog(){
 let d=document.querySelector("#recordDetailDialog");
 if(d)return d;
 d=document.createElement("dialog");d.id="recordDetailDialog";d.className="record-detail-dialog";
 d.innerHTML=`<div class="detail-shell"><div class="detail-top"><div><span class="app-kicker">Registro completo</span><h2 id="detailTitle">Registro ACP Escolar</h2></div><button type="button" class="secondary small" id="detailClose">Cerrar</button></div><div id="detailBody"></div></div>`;
 document.body.appendChild(d);d.querySelector("#detailClose").onclick=()=>d.close();d.addEventListener("click",e=>{if(e.target===d)d.close()});return d
}
function viewRecord(r){
 const d=ensureRecordDetailDialog();d.querySelector("#detailTitle").textContent=`${r.codigo}${r.demo?" · DEMO":""}`;
 d.querySelector("#detailBody").innerHTML=`<div class="detail-brand"><strong>Registro ACP Escolar</strong><span>Observar · Comprender · Prevenir · Apoyar</span></div>${recordHtml(r)}<div class="detail-privacy"><strong>Privacidad:</strong> este resumen se muestra dentro de la aplicación. No se abre ninguna ventana web ni se transmite automáticamente el contenido.</div>`;
 d.showModal()
}
function recordHtml(r){
 const list=(x,o)=>`${(x||[]).map(esc).join(", ")||"—"}${o?` · <em>Especificar:</em> ${esc(o)}`:""}`;
 const metric=(label,value,cls="")=>`<div class="detail-metric ${cls}"><span>${label}</span><strong>${esc(value||"—")}</strong></div>`;
 return `<div class="detail-meta-grid">${metric("Fecha y hora",new Date(r.fechaHora).toLocaleString("es-ES"))}${metric("Curso / grupo",r.grupo||"—")}${metric("Profesional / alias",r.profesional||"—")}</div>
 <section class="detail-section"><h3>Contexto y entorno</h3><p><strong>Contexto:</strong> ${list(r.contexto,r.contextoOtro)}</p><p><strong>Factores del entorno:</strong> ${list(r.factores,r.factoresOtro)}</p></section>
 <section class="detail-section"><h3>Registro ABC</h3><div class="abc-block"><b>A · Antecedente</b><p>${list(r.antecedente,r.antecedenteOtro)}</p><p class="detail-note">${esc(r.antecedenteDesc||"Sin descripción adicional")}</p></div><div class="abc-block"><b>B · Conducta observada</b><p>${list(r.conducta,r.conductaOtro)}</p><p class="detail-note">${esc(r.conductaDesc||"—")}</p></div><div class="detail-metrics">${metric("Duración",`${r.duracionValor||0} ${r.duracionUnidad||""}`)}${metric("Frecuencia",r.frecuencia)}${metric("Intensidad",r.intensidad)}${metric("Riesgo",r.riesgo,r.riesgo==="alto"?"risk-metric":"")}</div><div class="abc-block"><b>C · Consecuencia</b><p>${list(r.consecuencia,r.consecuenciaOtro)}</p><p class="detail-note">${esc(r.consecuenciaDesc||"Sin descripción adicional")}</p></div></section>
 <section class="detail-section hypothesis-card"><h3>HIPÓTESIS FUNCIONAL PROVISIONAL — NO DIAGNÓSTICO</h3><p>${list(r.hipotesis,r.hipotesisOtro)}</p><small>Requiere varios registros, análisis de patrones y revisión en equipo. Una frecuencia o correlación no demuestra por sí sola la función de una conducta.</small></section>
 <section class="detail-section"><h3>Apoyos y prevención</h3><p><strong>Apoyos aplicados:</strong> ${list(r.apoyos,r.apoyosOtro)}</p><p><strong>¿Pareció ayudar?</strong> ${esc(r.apoyoValoracion||"—")} <span class="hint">(no demuestra causalidad)</span></p><p><strong>Qué probar la próxima vez:</strong> ${list(r.proxima,r.proximaOtro)}</p><p class="detail-note">${esc(r.proximaTexto||"Sin nota adicional")}</p></section>
 <section class="detail-section"><h3>Inclusión y contexto <button type="button" class="help-dot" data-help-title="Inclusión y contexto" data-help-body="Revisa accesibilidad, participación, predictibilidad, comunicación y dignidad. No evalúa a la persona.">?</button></h3><div class="inclusion-list">${INCLUSION.map(k=>`<div><span>${esc(INCLUSION_LABELS[k])}</span><strong>${esc(r.inclusion?.[k]||"—")}</strong></div>`).join("")}</div></section>`;
}
let selectedExportIds=[];

function studentReportGroups(records){
  const map=new Map();
  for(const r of records){
    if(!r.codigo)continue;
    if(!map.has(r.codigo))map.set(r.codigo,[]);
    map.get(r.codigo).push(r);
  }
  return [...map.entries()].map(([code,items])=>{
    items.sort((a,b)=>new Date(b.fechaHora)-new Date(a.fechaHora));
    return {code,items,last:new Date(items[0]?.fechaHora||0).getTime()};
  });
}
function sortStudentGroups(groups,order="recent"){
  return [...groups].sort((a,b)=>order==="oldest"?(a.last-b.last):(b.last-a.last));
}


let pendingStudentExport=null;
function openStudentExportOptions(format,rs,baseOpt){
  pendingStudentExport={format,rs,baseOpt};
  document.querySelector("#studentExportOptionsDialog")?.showModal();
}
function readStudentExportOptions(){
  return {
    summary:document.querySelector("#stuExpSummary").checked,
    charts:document.querySelector("#stuExpCharts").checked,
    temporalHeat:document.querySelector("#stuExpTemporalHeat").checked,
    temporalLine:document.querySelector("#stuExpTemporalLine").checked,
    codes:document.querySelector("#stuExpCodes").checked,
    support:document.querySelector("#stuExpSupport").checked,
    details:document.querySelector("#stuExpDetails").checked
  };
}

async function renderReport(){
 const all=await allRecords();
 const groups=studentReportGroups(all);
 document.querySelector("#screen-report").innerHTML=`<div class="card screen-card">${screenCloseButton()}
   <h2>Informe por alumnado</h2>
   <p class="hint">Selecciona uno, varios o todos los códigos pseudónimos.</p>

   <div class="student-report-toolbar">
     <label class="checkline select-all-students">
       <input id="studentAll" type="checkbox">
       <strong>Todos</strong>
     </label>
     <label>Orden
       <select id="studentOrder">
         <option value="recent">Más recientes primero</option>
         <option value="oldest">Más antiguos primero</option>
       </select>
     </label>
   </div>

   <div class="student-picker-shell">
     <button id="studentPrev" class="student-arrow" type="button" aria-label="Ver códigos anteriores">↑</button>
     <div id="studentPicker" class="student-picker" role="group" aria-label="Códigos pseudónimos"></div>
     <button id="studentNext" class="student-arrow" type="button" aria-label="Ver códigos siguientes">↓</button>
   </div>

   <div id="studentSelectionSummary" class="student-selection-summary"></div>

   <details class="filter-panel">
     <summary>Opciones del informe</summary>
     <div class="report-options-grid">
       <label class="checkline"><input id="studentCharts" type="checkbox" checked> Incluir gráficos</label>
       <label class="checkline"><input id="studentDetails" type="checkbox" checked> Incluir detalle de registros</label>
     </div>
   </details>

   <p class="hint export-choice-hint">Al exportar podrás elegir qué apartados incluir.</p><div class="actions report-export-actions">
     <button id="studentPdf">PDF</button>
     <button id="studentDocx">DOCX</button>
     <button id="studentXlsx">XLSX</button>
     <button id="studentCsv">CSV</button>
   </div>
 </div>`;

 let page=0;
 const PAGE=5;
 let selected=new Set();

 const orderedGroups=()=>sortStudentGroups(groups,document.querySelector("#studentOrder").value);
 const maxPage=()=>Math.max(0,Math.ceil(orderedGroups().length/PAGE)-1);

 const renderPicker=()=>{
   const sorted=orderedGroups();
   page=Math.min(page,maxPage());
   const slice=sorted.slice(page*PAGE,page*PAGE+PAGE);
   const picker=document.querySelector("#studentPicker");
   picker.innerHTML=slice.length?slice.map(g=>`
     <label class="student-code-option">
       <input type="checkbox" value="${esc(g.code)}" ${selected.has(g.code)?"checked":""}>
       <span><strong>${esc(g.code)}</strong><small>${g.items.length} registro(s) · ${new Date(g.last).toLocaleDateString("es-ES")}</small></span>
     </label>`).join(""):'<p class="hint">No hay códigos guardados.</p>';

   picker.querySelectorAll('input[type="checkbox"]').forEach(ch=>ch.addEventListener("change",()=>{
     if(ch.checked)selected.add(ch.value);else selected.delete(ch.value);
     document.querySelector("#studentAll").checked=selected.size===groups.length&&groups.length>0;
     updateSummary();
   }));

   document.querySelector("#studentPrev").disabled=page===0;
   document.querySelector("#studentNext").disabled=page>=maxPage();
   updateSummary();
 };

 const updateSummary=()=>{
   const totalRecords=all.filter(r=>selected.has(r.codigo)).length;
   document.querySelector("#studentSelectionSummary").textContent=
     selected.size?`${selected.size} código(s) · ${totalRecords} registro(s) seleccionados`:"Selecciona al menos un código.";
 };

 document.querySelector("#studentPrev").onclick=()=>{if(page>0){page--;renderPicker()}};
 document.querySelector("#studentNext").onclick=()=>{if(page<maxPage()){page++;renderPicker()}};

 document.querySelector("#studentOrder").onchange=()=>{page=0;renderPicker()};

 document.querySelector("#studentAll").onchange=e=>{
   selected=e.target.checked?new Set(groups.map(g=>g.code)):new Set();
   renderPicker();
 };

 const currentRecords=()=>{
   const order=document.querySelector("#studentOrder").value;
   let rs=all.filter(r=>selected.has(r.codigo));
   rs.sort((a,b)=>order==="oldest"
     ? new Date(a.fechaHora)-new Date(b.fechaHora)
     : new Date(b.fechaHora)-new Date(a.fechaHora));
   return rs;
 };
 const options=()=>({
   charts:document.querySelector("#studentCharts").checked,
   details:document.querySelector("#studentDetails").checked,
   code:selected.size===1?[...selected][0]:"all"
 });
 const exportSelected=async fn=>{
   const rs=currentRecords();
   if(!rs.length){toast("Selecciona al menos un código");announceA11y("Selecciona al menos un código.");return}
   await reviewGate(async()=>fn(rs,options()));
 };

 const prepStudentExport=(format)=>{
   const rs=currentRecords();
   if(!rs.length){toast("Selecciona al menos un código");announceA11y("Selecciona al menos un código.");return}
   const baseOpt={
     code:selected.size===1?[...selected][0]:"all",
     order:document.querySelector("#studentOrder").value
   };
   openStudentExportOptions(format,rs,baseOpt);
 };

 document.querySelector("#studentPdf").onclick=()=>prepStudentExport("pdf");
 document.querySelector("#studentDocx").onclick=()=>prepStudentExport("docx");
 document.querySelector("#studentXlsx").onclick=()=>prepStudentExport("xlsx");
 document.querySelector("#studentCsv").onclick=()=>prepStudentExport("csv");

 renderPicker();
 bindScreenClose(document.querySelector("#screen-report"));
}
async function recordsByIds(ids){if(!ids.length){toast("Selecciona al menos un registro");throw new Error("none")}const a=[];for(const id of ids){const r=await getRecord(id);if(r)a.push(r)}return a}
function reviewGate(fn){pendingReviewAction=fn;const d=document.querySelector("#reviewDialog"),c=document.querySelector("#reviewConfirm"),b=document.querySelector("#reviewProceed");c.checked=false;b.disabled=true;c.onchange=()=>b.disabled=!c.checked;d.showModal()}

function parseCsvSemicolon(text){
  text=String(text||"").replace(/^\uFEFF/,"");
  const rows=[];let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"' && text[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"'){quoted=false;}
      else cell+=ch;
    }else{
      if(ch==='"') quoted=true;
      else if(ch===';'){row.push(cell);cell="";}
      else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell="";}
      else if(ch!=='\r') cell+=ch;
    }
  }
  if(cell.length||row.length){row.push(cell);rows.push(row)}
  return rows.filter(r=>r.some(c=>String(c).trim()!==""));
}
function splitPipe(v){return String(v||"").split("|").map(x=>x.trim()).filter(Boolean)}
function importRowToRecord(obj){
  const inc={}, byLabel={
    "¿El entorno era predecible?":"entornoPredecible",
    "¿La información era comprensible y accesible?":"infoAccesible",
    "¿Se ofreció tiempo suficiente de procesamiento?":"tiempoProcesamiento",
    "¿Existía una alternativa sensorial o espacial?":"alternativaSensorial",
    "¿La persona pudo pedir ayuda, descanso o aclaración?":"pudoPedir",
    "¿Se mantuvo su dignidad?":"dignidad",
    "¿Se favoreció su participación?":"participacion",
    "¿Se ajustó la demanda a sus necesidades de apoyo?":"demandaAjustada"
  };
  for(const [label,key] of Object.entries(byLabel)) if(obj[label]!==undefined) inc[key]=obj[label];
  if(obj.inclusion) String(obj.inclusion).split("|").forEach(part=>{const [label,...rest]=part.split("=");const key=byLabel[label?.trim()];if(key)inc[key]=rest.join("=").trim()});
  return {
    id:uid(),demo:String(obj.demo||"").toUpperCase()==="DEMO",fechaHora:obj.fechaHora||nowLocal(),codigo:(obj.codigo||"").trim(),
    grupo:obj.grupo||"",profesional:obj.profesional||"",contexto:splitPipe(obj.contexto),contextoOtro:obj.contextoEspecificar||obj.contextoOtro||"",
    factores:splitPipe(obj.factores),factoresOtro:obj.factoresEspecificar||obj.factoresOtro||"",antecedente:splitPipe(obj.antecedente),
    antecedenteOtro:obj.antecedenteEspecificar||obj.antecedenteOtro||"",antecedenteDesc:obj.antecedenteDescripcion||obj.antecedenteDesc||"",
    conducta:splitPipe(obj.conducta),conductaOtro:obj.conductaEspecificar||obj.conductaOtro||"",conductaDesc:obj.conductaDescripcion||obj.conductaDesc||"",
    duracionValor:Number(obj.duracionValor||0),duracionUnidad:obj.duracionUnidad||"segundos",frecuencia:Number(obj.frecuencia||0),
    intensidad:Number(obj.intensidad||0),riesgo:obj.riesgo||"sin riesgo",consecuencia:splitPipe(obj.consecuencia),
    consecuenciaOtro:obj.consecuenciaEspecificar||obj.consecuenciaOtro||"",consecuenciaDesc:obj.consecuenciaDescripcion||obj.consecuenciaDesc||"",
    hipotesis:splitPipe(obj.hipotesis),hipotesisOtro:obj.hipotesisEspecificar||obj.hipotesisOtro||"",apoyos:splitPipe(obj.apoyos),
    apoyosOtro:obj.apoyosEspecificar||obj.apoyosOtro||"",apoyoValoracion:obj.parecioAyudar||obj.apoyoValoracion||"",
    proxima:splitPipe(obj.proximaVez||obj.proxima),proximaOtro:obj.proximaEspecificar||obj.proximaOtro||"",proximaTexto:obj.proximaTexto||"",
    inclusion:inc,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),quick:false
  };
}
async function importCsvFile(file){
  const rows=parseCsvSemicolon(await file.text());
  if(rows.length<2) throw new Error("CSV_EMPTY");
  const headers=rows[0].map(h=>String(h).trim());
  const records=rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??""]))).map(importRowToRecord).filter(r=>r.codigo);
  if(!records.length) throw new Error("NO_VALID_RECORDS");
  return records;
}

function minuteKey(dateLike){
  const d=new Date(dateLike);
  if(Number.isNaN(d.getTime()))return "";
  const yy=d.getFullYear(),mm=String(d.getMonth()+1).padStart(2,"0"),dd=String(d.getDate()).padStart(2,"0");
  const hh=String(d.getHours()).padStart(2,"0"),mi=String(d.getMinutes()).padStart(2,"0");
  return `${yy}-${mm}-${dd}T${hh}:${mi}`;
}
function normalizeCompareValue(v){
  if(Array.isArray(v))return [...v].map(x=>String(x??"").trim()).filter(Boolean).sort().join(" | ");
  if(v && typeof v==="object")return JSON.stringify(v,Object.keys(v).sort());
  return String(v??"").trim();
}
const CSV_COMPARE_FIELDS=[
  ["grupo","Curso / grupo"],["profesional","Profesional"],["contexto","Contexto"],["contextoOtro","Contexto · Otro"],
  ["factores","Factores del entorno"],["factoresOtro","Factores · Otro"],["antecedente","Antecedente"],["antecedenteOtro","Antecedente · Otro"],
  ["antecedenteDesc","Descripción antecedente"],["conducta","Conducta"],["conductaOtro","Conducta · Otro"],["conductaDesc","Descripción conducta"],
  ["duracionValor","Duración"],["duracionUnidad","Unidad duración"],["frecuencia","Frecuencia"],["intensidad","Intensidad"],["riesgo","Riesgo"],
  ["consecuencia","Consecuencia"],["consecuenciaOtro","Consecuencia · Otro"],["consecuenciaDesc","Descripción consecuencia"],
  ["hipotesis","Hipótesis"],["hipotesisOtro","Hipótesis · Otro"],["apoyos","Apoyos"],["apoyosOtro","Apoyos · Otro"],
  ["apoyoValoracion","Valoración del apoyo"],["proxima","Próxima vez"],["proximaOtro","Próxima vez · Otro"],["proximaTexto","Nota próxima vez"]
];
function compareCsvRecord(existing,incoming){
  const diffs=[];
  for(const [key,label] of CSV_COMPARE_FIELDS){
    const a=normalizeCompareValue(existing?.[key]);
    const b=normalizeCompareValue(incoming?.[key]);
    if(a!==b)diffs.push({key,label,existing:a,incoming:b});
  }
  return diffs;
}
function findCsvMinuteMatch(existingRecords,incoming){
  const code=String(incoming?.codigo||"").trim();
  const key=minuteKey(incoming?.fechaHora);
  if(!code||!key)return null;
  return existingRecords.find(r=>String(r.codigo||"").trim()===code && minuteKey(r.fechaHora)===key)||null;
}

function askCsvNewRecord(incoming){
  return new Promise(resolve=>{
    const d=document.querySelector("#csvNewRecordDialog");
    const summary=document.querySelector("#csvNewRecordSummary");
    if(!d){resolve("cancel");return}
    const when=new Date(incoming.fechaHora);
    const whenText=Number.isNaN(when.getTime())?String(incoming.fechaHora||""):when.toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"});
    summary.textContent=`No se ha encontrado otro registro del código ${incoming.codigo} en esa fecha y hora (${whenText}).`;
    const save=document.querySelector("#csvNewRecordSave");
    const cleanup=()=>{save.onclick=null;d.removeEventListener("close",onClose)};
    const finish=action=>{cleanup();d.close();resolve(action)};
    const onClose=()=>{cleanup();resolve("cancel")};
    d.addEventListener("close",onClose,{once:true});
    save.onclick=()=>finish("save");
    d.showModal();
  });
}

function askCsvConflict(existing,incoming,diffs=[]){
  return new Promise(resolve=>{
    const d=document.querySelector("#csvConflictDialog");
    const summary=document.querySelector("#csvConflictSummary");
    if(!d){resolve("cancel");return}
    const when=new Date(incoming.fechaHora);
    const whenText=Number.isNaN(when.getTime())?String(incoming.fechaHora||""):when.toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"});
    summary.textContent=`Ya existe un registro del código ${incoming.codigo} en la misma fecha y hora (${whenText}).`;
    const both=document.querySelector("#csvConflictKeepBoth");
    const replace=document.querySelector("#csvConflictReplace");
    const cleanup=()=>{both.onclick=null;replace.onclick=null;d.removeEventListener("close",onClose)};
    const finish=action=>{cleanup();d.close();resolve(action)};
    const onClose=()=>{cleanup();resolve("cancel")};
    d.addEventListener("close",onClose,{once:true});
    both.onclick=()=>finish("both");
    replace.onclick=()=>finish("replace");
    d.showModal();
  });
}
async function importCsvRecordsWithConflictResolution(records){
  const existing=await allRecords();
  let imported=0,duplicates=0,replaced=0;
  for(const incoming0 of records){
    const incoming={...incoming0};
    if(!incoming.id)incoming.id=uid();
    const match=findCsvMinuteMatch(existing,incoming);

    if(!match){
      const action=await askCsvNewRecord(incoming);
      if(action==="cancel")return {cancelled:true,imported,duplicates,replaced};
      await putRecord(incoming);
      existing.push(incoming);
      imported++;
      continue;
    }

    const action=await askCsvConflict(match,incoming,[]);
    if(action==="cancel")return {cancelled:true,imported,duplicates,replaced};

    if(action==="both"){
      incoming.id=uid();
      incoming.duplicado=true;
      incoming.duplicadoDe=match.id;
      incoming.updatedAt=new Date().toISOString();
      incoming.createdAt=incoming.createdAt||incoming.updatedAt;
      await putRecord(incoming);
      existing.push(incoming);
      duplicates++;
      continue;
    }

    if(action==="replace"){
      const replacement=await replaceExistingRecordExactly(match,incoming);
      // Refresh the in-memory snapshot so later rows compare against the final state.
      const fresh=await allRecords();
      existing.splice(0,existing.length,...fresh);
      replaced++;
    }
  }
  return {cancelled:false,imported,duplicates,replaced};
}

function openImportDialog(){
  const d=document.querySelector("#importDialog"),f=document.querySelector("#csvImportFile"),p=document.querySelector("#csvImportPreview"),c=document.querySelector("#csvImportConfirm"),b=document.querySelector("#csvImportBtn");
  if(!d)return;f.value="";p.innerHTML="";p.classList.add("hidden");c.checked=false;b.disabled=true;d.showModal();
}


function acpParseCSV(text){
  text=String(text||"").replace(/^\uFEFF/,"");
  const delimiter=(text.split("\n")[0].match(/;/g)||[]).length >= (text.split("\n")[0].match(/,/g)||[]).length ? ";" : ",";
  const rows=[];let row=[],cell="",q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')q=false;else cell+=c}
    else if(c==='"')q=true;else if(c===delimiter){row.push(cell);cell=""}
    else if(c==="\n"){row.push(cell);rows.push(row);row=[];cell=""}
    else if(c!=="\r")cell+=c}
  if(cell||row.length){row.push(cell);rows.push(row)}
  return rows.filter(r=>r.some(v=>String(v).trim()));
}
function acpList(v){return String(v||"").split("|").map(x=>x.trim()).filter(Boolean)}
function acpImportedRecord(o){
  return {id:uid(),demo:String(o.demo||"").toUpperCase()==="DEMO",duplicado:String(o.duplicado||"").toUpperCase()==="DUPLICADO",fechaHora:o.fechaHora||nowLocal(),codigo:String(o.codigo||"").trim(),
    grupo:o.grupo||"",profesional:o.profesional||"",contexto:acpList(o.contexto),contextoOtro:o.contextoEspecificar||o.contextoOtro||"",
    factores:acpList(o.factores),factoresOtro:o.factoresEspecificar||o.factoresOtro||"",antecedente:acpList(o.antecedente),
    antecedenteOtro:o.antecedenteEspecificar||o.antecedenteOtro||"",antecedenteDesc:o.antecedenteDescripcion||o.antecedenteDesc||"",
    conducta:acpList(o.conducta),conductaOtro:o.conductaEspecificar||o.conductaOtro||"",conductaDesc:o.conductaDescripcion||o.conductaDesc||"",
    duracionValor:Number(o.duracionValor||0),duracionUnidad:o.duracionUnidad||"segundos",frecuencia:Number(o.frecuencia||0),
    intensidad:Number(o.intensidad||0),riesgo:o.riesgo||"sin riesgo",consecuencia:acpList(o.consecuencia),
    consecuenciaOtro:o.consecuenciaEspecificar||o.consecuenciaOtro||"",consecuenciaDesc:o.consecuenciaDescripcion||o.consecuenciaDesc||"",
    hipotesis:acpList(o.hipotesis),hipotesisOtro:o.hipotesisEspecificar||o.hipotesisOtro||"",apoyos:acpList(o.apoyos),
    apoyosOtro:o.apoyosEspecificar||o.apoyosOtro||"",apoyoValoracion:o.parecioAyudar||o.apoyoValoracion||"",
    proxima:acpList(o.proximaVez||o.proxima),proximaOtro:o.proximaEspecificar||o.proximaOtro||"",proximaTexto:o.proximaTexto||"",
    inclusion:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),quick:false};
}
async function acpReadImport(file){
  const rows=acpParseCSV(await file.text()); if(rows.length<2)throw new Error("CSV");
  const h=rows[0].map(x=>String(x).trim());
  return rows.slice(1).map(r=>Object.fromEntries(h.map((x,i)=>[x,r[i]??""]))).map(acpImportedRecord).filter(r=>r.codigo);
}
function openImportDialog(){
  const d=document.querySelector("#importDialog");if(!d)return;
  document.querySelector("#csvImportFile").value="";
  document.querySelector("#csvImportPreview").innerHTML="";
  document.querySelector("#csvImportConfirm").checked=false;
  document.querySelector("#csvImportBtn").disabled=true; d.showModal();
}

function flat(r){
 const val=x=>(x||[]).join(" | ");
 const out={id:r.id,demo:r.demo?"DEMO":"",duplicado:r.duplicado?"DUPLICADO":"",fechaHora:r.fechaHora,codigo:r.codigo,grupo:r.grupo||"",profesional:r.profesional||"",contexto:val(r.contexto),contextoEspecificar:r.contextoOtro||"",factoresEntorno:val(r.factores),factoresEspecificar:r.factoresOtro||"",antecedente:val(r.antecedente),antecedenteEspecificar:r.antecedenteOtro||"",antecedenteDescripcion:r.antecedenteDesc||"",conductaObservada:val(r.conducta),conductaEspecificar:r.conductaOtro||"",conductaDescripcion:r.conductaDesc||"",duracionValor:r.duracionValor??"",duracionUnidad:r.duracionUnidad||"",frecuencia:r.frecuencia??"",intensidad:r.intensidad??"",riesgo:r.riesgo||"",consecuencia:val(r.consecuencia),consecuenciaEspecificar:r.consecuenciaOtro||"",consecuenciaDescripcion:r.consecuenciaDesc||"",hipotesisFuncionalProvisional:val(r.hipotesis),hipotesisEspecificar:r.hipotesisOtro||"",apoyosAplicados:val(r.apoyos),apoyosEspecificar:r.apoyosOtro||"",parecioAyudar:r.apoyoValoracion||"",proximaVez:val(r.proxima),proximaEspecificar:r.proximaOtro||"",proximaNota:r.proximaTexto||""};
 INCLUSION.forEach(k=>out[`inclusion_${k}`]=r.inclusion?.[k]||"");return out
}

function xmlEsc(s){return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}
function crc32(bytes){
  let c=0xffffffff;
  if(!crc32.table){crc32.table=Array.from({length:256},(_,n)=>{let x=n;for(let k=0;k<8;k++)x=(x&1)?0xedb88320^(x>>>1):x>>>1;return x>>>0})}
  for(const b of bytes)c=crc32.table[(c^b)&255]^(c>>>8);
  return (c^0xffffffff)>>>0
}
function le16(n){return new Uint8Array([n&255,(n>>>8)&255])}
function le32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function concatBytes(parts){const total=parts.reduce((s,p)=>s+p.length,0),out=new Uint8Array(total);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}
function dosDateTime(d=new Date()){let time=(d.getHours()<<11)|(d.getMinutes()<<5)|(Math.floor(d.getSeconds()/2));let date=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();return {time,date}}
function zipStore(files){
  const enc=new TextEncoder(), locals=[], centrals=[];let offset=0;const dt=dosDateTime();
  for(const f of files){
    const name=enc.encode(f.name),data=f.data instanceof Uint8Array?f.data:enc.encode(String(f.data)),crc=crc32(data);
    const local=concatBytes([le32(0x04034b50),le16(20),le16(0),le16(0),le16(dt.time),le16(dt.date),le32(crc),le32(data.length),le32(data.length),le16(name.length),le16(0),name,data]);
    locals.push(local);
    const central=concatBytes([le32(0x02014b50),le16(20),le16(20),le16(0),le16(0),le16(dt.time),le16(dt.date),le32(crc),le32(data.length),le32(data.length),le16(name.length),le16(0),le16(0),le16(0),le16(0),le32(0),le32(offset),name]);
    centrals.push(central);offset+=local.length;
  }
  const centralData=concatBytes(centrals),localData=concatBytes(locals);
  const eocd=concatBytes([le32(0x06054b50),le16(0),le16(0),le16(files.length),le16(files.length),le32(centralData.length),le32(localData.length),le16(0)]);
  return concatBytes([localData,centralData,eocd])
}
async function blobBytes(blob){return new Uint8Array(await blob.arrayBuffer())}
function docxTextRun(text,bold=false,size=20,color="263b35"){
  return `<w:r><w:rPr>${bold?'<w:b/>':''}<w:sz w:val="${size}"/><w:color w:val="${color}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`
}
function docxP(text="",opt={}){return `<w:p><w:pPr>${opt.after?`<w:spacing w:after="${opt.after}"/>`:""}${opt.align?`<w:jc w:val="${opt.align}"/>`:""}</w:pPr>${docxTextRun(text,!!opt.bold,opt.size||20,opt.color||"263b35")}</w:p>`}
function docxTable(rows,widths=[]){
  const cells=rows.map((row,ri)=>`<w:tr>${row.map((v,ci)=>`<w:tc><w:tcPr>${widths[ci]?`<w:tcW w:w="${widths[ci]}" w:type="dxa"/>`:""}<w:shd w:fill="${ri===0?"E8F2EE":"FFFFFF"}"/></w:tcPr>${docxP(v,{bold:ri===0,size:18})}</w:tc>`).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D7E4DE"/><w:left w:val="single" w:sz="4" w:color="D7E4DE"/><w:bottom w:val="single" w:sz="4" w:color="D7E4DE"/><w:right w:val="single" w:sz="4" w:color="D7E4DE"/><w:insideH w:val="single" w:sz="3" w:color="E4ECE8"/><w:insideV w:val="single" w:sz="3" w:color="E4ECE8"/></w:tblBorders></w:tblPr>${cells}</w:tbl>`
}
function docxImageDrawing(rId,name,width=520,height=260){
  const cx=Math.round(width*9525),cy=Math.round(height*9525);
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${rId.replace(/\D/g,"")||1}" name="${xmlEsc(name)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${xmlEsc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}
async function canvasPng(kind,title,data){
  const entries=Object.entries(data).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const rowH=48;
  const height=kind==="bar"?Math.max(520,120+entries.length*rowH):560;
  const canvas=document.createElement("canvas");
  canvas.width=1200;canvas.height=height;
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#1f4f41";ctx.font="bold 32px Arial, sans-serif";
  ctx.textAlign="left";ctx.fillText(title,42,50);

  const palette=["#2d6a58","#5a927e","#8bb6a6","#c5ded4","#496d9b","#8b78a5","#ba8b5b","#a75f5f","#6f8f80","#9cae9f"];

  const fitLabel=(text,maxWidth)=>{
    text=String(text??"");
    if(ctx.measureText(text).width<=maxWidth)return text;
    let out=text;
    while(out.length>3&&ctx.measureText(out+"…").width>maxWidth)out=out.slice(0,-1);
    return out+"…";
  };

  if(kind==="pie"){
    const total=entries.reduce((s,x)=>s+x[1],0)||1;
    const cx=310,cy=300,R=185;
    let ang=-Math.PI/2;
    entries.forEach(([k,v],i)=>{
      const a2=ang+Math.PI*2*v/total;
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,R,ang,a2);ctx.closePath();
      ctx.fillStyle=palette[i%palette.length];ctx.fill();ang=a2;
    });
    ctx.font="22px Arial, sans-serif";
    entries.forEach(([k,v],i)=>{
      const y=105+i*43;
      ctx.fillStyle=palette[i%palette.length];ctx.fillRect(590,y-18,22,22);
      ctx.fillStyle="#263b35";
      ctx.fillText(fitLabel(`${k}: ${v}`,500),630,y);
    });
  }else{
    ctx.font="20px Arial, sans-serif";
    const labelW=320,left=360,right=90,plotW=canvas.width-left-right;
    const max=Math.max(...entries.map(x=>x[1]),1);
    entries.forEach(([k,v],i)=>{
      const y=88+i*rowH;
      ctx.fillStyle="#263b35";ctx.textAlign="right";
      ctx.fillText(fitLabel(k,labelW),left-18,y+24);
      ctx.fillStyle=palette[i%palette.length];
      const w=Math.max(6,plotW*v/max);
      ctx.fillRect(left,y,w,30);
      ctx.textAlign="left";ctx.fillStyle="#263b35";
      ctx.fillText(String(v),Math.min(left+w+12,canvas.width-45),y+24);
    });
  }
  return new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error("PNG")),"image/png"));
}
function countField(rs,field){
  const m={};for(const r of rs){const vals=Array.isArray(r[field])?r[field]:[r[field]];for(const v of vals.filter(v=>v!==""&&v!=null))m[String(v)]=(m[String(v)]||0)+1}return m
}
function statsData(rs){
  const durations=rs.filter(r=>Number(r.duracionValor)>0).map(r=>r.duracionUnidad==="minutos"?Number(r.duracionValor)*60:Number(r.duracionValor));
  const rated=rs.filter(r=>["Sí","Parcialmente","No"].includes(r.apoyoValoracion));
  const yes=rated.filter(r=>r.apoyoValoracion==="Sí").length;
  const part=rated.filter(r=>r.apoyoValoracion==="Parcialmente").length;
  const no=rated.filter(r=>r.apoyoValoracion==="No").length;
  const notValuable=rs.filter(r=>r.apoyoValoracion==="No valorable").length;
  const weightedPoints=yes+(part*0.5);
  return {
    total:rs.length,
    codes:countField(rs,"codigo"),contexto:countField(rs,"contexto"),conducta:countField(rs,"conducta"),
    antecedente:countField(rs,"antecedente"),consecuencia:countField(rs,"consecuencia"),
    intensidad:countField(rs,"intensidad"),riesgo:countField(rs,"riesgo"),
    hipotesis:countField(rs,"hipotesis"),apoyos:countField(rs,"apoyos"),
    avgDuration:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):0,
    supportUseful:rated.length?Math.round((weightedPoints/rated.length)*100):0,
    supportYes:rated.length?Math.round((yes/rated.length)*100):0,
    supportRated:rated.length,
    supportYesCount:yes,supportPartCount:part,supportNoCount:no,supportNotValuable:notValuable
  };
}
function humanRows(map,limit=20){return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,limit)}

async function temporalHeatmapPng(records,title="Frecuencia por día y hora"){
  const h=temporalHeatmapData(records);
  const active=h.hours.filter(hour=>h.matrix.some(row=>row[hour]>0));
  const minHour=active.length?Math.max(0,Math.min(...active)-1):7;
  const maxHour=active.length?Math.min(23,Math.max(...active)+1):18;
  const hours=h.hours.filter(x=>x>=minHour&&x<=maxHour);
  const cellW=70,cellH=42,left=90,top=80,width=left+hours.length*cellW+40,height=top+7*cellH+65;
  const c=document.createElement("canvas");c.width=width;c.height=height;const ctx=c.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);ctx.fillStyle="#1f4f41";ctx.font="bold 24px Arial";ctx.fillText(title,25,35);
  ctx.font="14px Arial";ctx.textAlign="center";ctx.fillStyle="#61766e";hours.forEach((hour,i)=>ctx.fillText(`${String(hour).padStart(2,"0")}h`,left+i*cellW+cellW/2,65));
  const fills=["#f8fbfa","#e2f0ea","#b7d8cb","#78ad98","#347b64"];
  h.days.forEach((day,di)=>{
    ctx.textAlign="right";ctx.fillStyle="#263b35";ctx.fillText(day,left-12,top+di*cellH+26);
    hours.forEach((hour,i)=>{
      const v=h.matrix[di][hour],lev=heatLevel(v,h.max),x=left+i*cellW,y=top+di*cellH;
      ctx.fillStyle=fills[lev];ctx.fillRect(x+2,y+2,cellW-4,cellH-4);
      if(v){ctx.fillStyle=lev>=4?"#fff":"#173e32";ctx.textAlign="center";ctx.fillText(String(v),x+cellW/2,y+26)}
    });
  });
  return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("PNG")),"image/png"));
}
async function hourlyLinePng(records,title="Frecuencia por hora"){
  const data=hourlyFrequencyData(records),W=1100,H=460,L=80,R=45,T=70,B=70,pW=W-L-R,pH=H-T-B,max=Math.max(1,...data.map(d=>d.count));
  const c=document.createElement("canvas");c.width=W;c.height=H;const ctx=c.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);ctx.fillStyle="#1f4f41";ctx.font="bold 28px Arial";ctx.fillText(title,35,38);
  ctx.font="16px Arial";ctx.strokeStyle="#e4ece8";ctx.fillStyle="#61766e";
  [0,.25,.5,.75,1].forEach(fr=>{const y=T+pH-fr*pH,v=Math.round(fr*max);ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(W-R,y);ctx.stroke();ctx.textAlign="right";ctx.fillText(String(v),L-12,y+5)});
  const pts=data.map((d,i)=>({d,x:L+(data.length===1?pW/2:i/(data.length-1)*pW),y:T+pH-d.count/max*pH}));
  ctx.strokeStyle="#347b64";ctx.lineWidth=5;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
  pts.forEach(p=>{ctx.fillStyle="#347b64";ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();ctx.textAlign="center";ctx.fillStyle="#61766e";ctx.fillText(`${String(p.d.hour).padStart(2,"0")}h`,p.x,H-30)});
  return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("PNG")),"image/png"));
}

async function buildStatsDocx(rs,opt={}){
  const s=statsData(rs),images=[],rels=[];let imageXml="";
  let rid=1;
  if(opt.charts){
    const bar=await canvasPng("bar","Conductas más registradas",s.conducta),pie=await canvasPng("pie","Distribución de riesgos",s.riesgo);
    images.push({name:"word/media/bar.png",data:await blobBytes(bar)},{name:"word/media/risk.png",data:await blobBytes(pie)});
    rels.push(`<Relationship Id="rId${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/bar.png"/>`);imageXml+=docxImageDrawing(`rId${rid++}`,"Conductas");
    rels.push(`<Relationship Id="rId${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/risk.png"/>`);imageXml+=docxImageDrawing(`rId${rid++}`,"Riesgos");
  }
  if(opt.temporalHeat){
    const heat=await temporalHeatmapPng(rs);
    images.push({name:"word/media/heatmap.png",data:await blobBytes(heat)});
    rels.push(`<Relationship Id="rId${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/heatmap.png"/>`);
    imageXml+=docxP("Frecuencia por día y hora",{bold:true,size:22})+docxImageDrawing(`rId${rid++}`,"Mapa horario",520,300);
  }
  if(opt.temporalLine){
    const line=await hourlyLinePng(rs);
    images.push({name:"word/media/hourline.png",data:await blobBytes(line)});
    rels.push(`<Relationship Id="rId${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/hourline.png"/>`);
    imageXml+=docxP("Frecuencia por hora",{bold:true,size:22})+docxImageDrawing(`rId${rid++}`,"Frecuencia por hora",520,260);
  }
  const codeLabel=opt.code&&opt.code!=="all"?opt.code:"Todos los códigos";
  let body=docxP("REGISTRO ACP ESCOLAR",{bold:true,size:32,color:"1F4F41"})+docxP("Patrones descriptivos",{bold:true,size:26})+docxP(`Ámbito: ${codeLabel} · Registros: ${rs.length}`,{size:20})+
    docxP("Las frecuencias y correlaciones observadas no demuestran por sí mismas la función de una conducta.",{size:18,color:"7A5A22"})+
    docxTable([["Indicador","Valor"],["Registros",String(s.total)],["Duración media",`${s.avgDuration} s`],["Índice de utilidad del apoyo",`${s.supportUseful}%`],["Apoyo marcado Sí",`${s.supportYes}%`],["Registros valorados",String(s.supportRated)]])+
    docxP("Frecuencia por código pseudónimo",{bold:true,size:22,after:100})+docxTable([["Código","Registros"],...humanRows(s.codes).map(([a,b])=>[a,String(b)])])+
    docxP("Conductas más registradas",{bold:true,size:22,after:100})+docxTable([["Conducta","Frecuencia"],...humanRows(s.conducta).map(([a,b])=>[a,String(b)])])+
    docxP("Contextos",{bold:true,size:22,after:100})+docxTable([["Contexto","Frecuencia"],...humanRows(s.contexto).map(([a,b])=>[a,String(b)])])+
    docxP("Riesgos",{bold:true,size:22,after:100})+docxTable([["Riesgo","Frecuencia"],...humanRows(s.riesgo).map(([a,b])=>[a,String(b)])])+imageXml;
  if(opt.details){
    body+=docxP("Detalle de registros",{bold:true,size:24,after:120});
    for(const r of rs)body+=docxTable([["Código","Fecha","Contexto","Conducta","Intensidad","Riesgo"],[r.codigo,new Date(r.fechaHora).toLocaleString("es-ES"),(r.contexto||[]).join(", "),(r.conducta||[]).join(", "),String(r.intensidad??""),r.riesgo||""]]);
  }
  body+=docxP("Autor: Carlos Tejero · Licencia CC BY-NC-SA 4.0",{size:16,color:"5B6F67"})+docxP("Proyecto desarrollado con apoyo de ChatGPT. Interpretación y uso: persona usuaria y equipo profesional responsable.",{size:15,color:"5B6F67"});
  const document=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900"/></w:sectPr></w:body></w:document>`;
  const files=[
    {name:"[Content_Types].xml",data:`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`},
    {name:"_rels/.rels",data:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`},
    {name:"word/document.xml",data:document},
    {name:"word/_rels/document.xml.rels",data:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`},
    ...images
  ];
  return new Blob([zipStore(files)],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"})
}
async function exportRecordsDOCX(rs){
  const blob=await buildStatsDocx(rs,{charts:false,details:true,code:"all"});
  const method=await exportUserFile(blob,`registro-acp-${new Date().toISOString().slice(0,10)}.docx`);
  if(method!=="cancelled")toast("DOCX listo")
}
function xlsxCell(v,style=0){
  if(typeof v==="number"&&Number.isFinite(v))return `<c s="${style}"><v>${v}</v></c>`;
  return `<c t="inlineStr" s="${style}"><is><t>${xmlEsc(v??"")}</t></is></c>`
}
function xlsxRow(vals,header=false){return `<row>${vals.map(v=>xlsxCell(v,header?1:0)).join("")}</row>`}
async function buildStatsXlsx(rs,opt={}){
  const s=statsData(rs),flatRows=rs.map(flat),heads=flatRows.length?Object.keys(flatRows[0]):["codigo"];
  const sheet1=`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xlsxRow(heads,true)}${flatRows.map(r=>xlsxRow(heads.map(h=>r[h]))).join("")}</sheetData></worksheet>`;
  const summary=[["REGISTRO ACP ESCOLAR — Patrones descriptivos",""],["Registros",s.total],["Duración media (s)",s.avgDuration],["Índice de utilidad del apoyo (%)",s.supportUseful],["Apoyo marcado Sí (%)",s.supportYes],["Registros valorados",s.supportRated],["",""],["Código pseudónimo","Registros"],...humanRows(s.codes),["",""],["Conducta","Frecuencia"],...humanRows(s.conducta),["",""],["Contexto","Frecuencia"],...humanRows(s.contexto),["",""],["Riesgo","Frecuencia"],...humanRows(s.riesgo)];
  const sheet2=`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${summary.map((r,i)=>xlsxRow(r,i===0||r[0]==="Código pseudónimo"||r[0]==="Conducta"||r[0]==="Contexto"||r[0]==="Riesgo")).join("")}</sheetData></worksheet>`;
  let sheet3=`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xlsxRow(["Gráficos visuales incluidos en el informe PDF/DOCX. Esta hoja mantiene los datos fuente."],true)}</sheetData></worksheet>`,extra=[],sheet3rel="";
  if(opt.charts){
    const bar=await canvasPng("bar","Conductas más registradas",s.conducta),pie=await canvasPng("pie","Distribución de riesgos",s.riesgo);
    extra=[
      {name:"xl/media/bar.png",data:await blobBytes(bar)},{name:"xl/media/risk.png",data:await blobBytes(pie)},
      {name:"xl/drawings/drawing1.xml",data:`<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="7620000" cy="3810000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Conductas"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>27</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="7620000" cy="3810000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="3" name="Riesgos"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`},
      {name:"xl/drawings/_rels/drawing1.xml.rels",data:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/bar.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/risk.png"/></Relationships>`},
      {name:"xl/worksheets/_rels/sheet3.xml.rels",data:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`}
    ];
    sheet3=`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${xlsxRow(["Gráficos"],true)}</sheetData><drawing r:id="rId1"/></worksheet>`;
  }
  const files=[
    {name:"[Content_Types].xml",data:`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${opt.charts?'<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>':""}</Types>`},
    {name:"_rels/.rels",data:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:"xl/workbook.xml",data:`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Registros" sheetId="1" r:id="rId1"/><sheet name="Resumen" sheetId="2" r:id="rId2"/><sheet name="Gráficos" sheetId="3" r:id="rId3"/></sheets></workbook>`},
    {name:"xl/_rels/workbook.xml.rels",data:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {name:"xl/styles.xml",data:`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FF1F4F41"/><name val="Arial"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0"/><xf fontId="1" fillId="0" borderId="0" applyFont="1"/></cellXfs></styleSheet>`},
    {name:"xl/worksheets/sheet1.xml",data:sheet1},{name:"xl/worksheets/sheet2.xml",data:sheet2},{name:"xl/worksheets/sheet3.xml",data:sheet3},...extra
  ];
  return new Blob([zipStore(files)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})
}
async function exportStatsXlsx(rs,opt){
  const blob=await buildStatsXlsx(rs,opt),method=await exportUserFile(blob,`patrones-acp-${new Date().toISOString().slice(0,10)}.xlsx`);
  if(method!=="cancelled")toast("XLSX listo")
}
function statsPdfSafe(s){
  const map={
    "á":"\\341","é":"\\351","í":"\\355","ó":"\\363","ú":"\\372",
    "Á":"\\301","É":"\\311","Í":"\\315","Ó":"\\323","Ú":"\\332",
    "ñ":"\\361","Ñ":"\\321","ü":"\\374","Ü":"\\334",
    "¿":"\\277","¡":"\\241","º":"\\272","ª":"\\252",
    "€":" EUR ","·":" - ","—":" - ","–":" - ",
    "“":"\"","”":"\"","‘":"'","’":"'","…":"..."
  };
  return String(s??"")
    .replace(/[\\()]/g,m=>"\\"+m)
    .replace(/[áéíóúÁÉÍÓÚñÑüÜ¿¡ºª€·—–“”‘’…]/g,ch=>map[ch]||ch)
    .replace(/[^\x20-\x7E\\]/g," ");
}
function buildStatsPDF(rs,opt={}){
  const W=595,H=842,M=40,CW=W-2*M,s=statsData(rs),brand=[45,106,88],textc=[31,47,42],muted=[91,111,103],line=[218,229,224],pal=[[45,106,88],[92,150,127],[137,184,166],[80,115,157],[156,112,168],[183,126,80],[173,88,88]];
  let pages=[],ops=[],y=H-M,pn=0;const cmd=x=>ops.push(x),fill=c=>cmd(`${rgb(c)} rg`),stroke=c=>cmd(`${rgb(c)} RG`);
  function t(x,yy,txt,sz=9,b=false,c=textc){fill(c);cmd(`BT /${b?'F2':'F1'} ${sz} Tf ${x} ${yy} Td (${statsPdfSafe(txt)}) Tj ET`)}
  function rect(x,yy,w,h,c){fill(c);cmd(`${x} ${yy} ${w} ${h} re f`)}
  function page(){if(ops.length)pages.push(ops.join("\n"));ops=[];pn++;rect(0,H-84,W,84,[31,79,65]);t(M,H-42,"REGISTRO ACP ESCOLAR",18,true,[255,255,255]);t(M,H-63,"Patrones descriptivos",10,false,[225,240,234]);t(W-M-70,H-42,`Página ${pn}`,8,false,[225,240,234]);y=H-108}
  function need(h){if(y-h<70)page()}
  function heading(x){need(34);rect(M,y-24,CW,28,[235,245,241]);t(M+10,y-17,x,11,true,[31,79,65]);y-=38}
  function table(title,map){
    heading(title);
    const rows=humanRows(map,10),max=rows[0]?.[1]||1;
    for(const [k,v] of rows){
      need(26);
      const raw=String(k);
      const label=raw.length>30?raw.slice(0,29)+"…":raw;
      t(M,y,label,8.2,false,textc);
      rect(M+205,y-8,Math.max(2,(CW-275)*v/max),10,brand);
      t(W-M-34,y,String(v),8.3,true,textc);
      y-=24;
    }
  }
  page();t(M,y,`Ámbito: ${opt.code&&opt.code!=="all"?opt.code:"Todos los códigos"} · ${rs.length} registros`,10,true,textc);y-=22;t(M,y,`Duración media: ${s.avgDuration} s · Apoyo útil: ${s.supportUseful}%`,9,false,muted);y-=28;
  if(opt.charts){table("Conductas más registradas",s.conducta);table("Contextos",s.contexto);heading("Distribución de riesgos");const entries=humanRows(s.riesgo,6),total=entries.reduce((a,b)=>a+b[1],0)||1;let ang=0,cx=M+105,cy=y-105,R=68;entries.forEach(([k,v],i)=>{const a2=ang+Math.PI*2*v/total,pts=[[cx,cy]];for(let st=0;st<=18;st++){const a=ang+(a2-ang)*st/18;pts.push([cx+Math.cos(a)*R,cy+Math.sin(a)*R])}fill(pal[i%pal.length]);cmd(`${pts[0][0]} ${pts[0][1]} m ${pts.slice(1).map(p=>`${p[0].toFixed(1)} ${p[1].toFixed(1)} l`).join(" ")} h f`);ang=a2});entries.forEach(([k,v],i)=>{rect(M+255,y-55-i*24,12,12,pal[i%pal.length]);t(M+274,y-51-i*24,`${k}: ${v}`,8.5,false,textc)});y-=170}
  if(opt.codes!==false){heading("Registros por código pseudónimo");for(const [k,v] of humanRows(s.codes,30)){need(20);t(M,y,k,9,true,textc);t(M+150,y,String(v),9,false,textc);y-=18}}
  if(opt.temporalHeat){
    heading("Frecuencia por día y hora");
    const h=temporalHeatmapData(rs),hours=h.hours.filter(hr=>h.matrix.some(row=>row[hr]>0));
    const hs=hours.length?hours: [8,9,10,11,12,13,14,15];
    for(let di=0;di<h.days.length;di++){
      need(20);
      const vals=hs.map(hr=>`${String(hr).padStart(2,"0")}h:${h.matrix[di][hr]}`).join("  ");
      t(M,y,`${h.days[di]}  ${vals}`,7.2,false,textc);y-=17;
    }
  }
  if(opt.temporalLine){
    heading("Frecuencia por hora");
    const hd=hourlyFrequencyData(rs);
    for(let i=0;i<hd.length;i+=6){
      need(20);t(M,y,hd.slice(i,i+6).map(x=>`${String(x.hour).padStart(2,"0")}h:${x.count}`).join("   "),8,false,textc);y-=18;
    }
  }
  if(opt.details){heading("Detalle de registros");for(const r of rs){need(42);t(M,y,`${r.codigo} · ${new Date(r.fechaHora).toLocaleDateString("es-ES")} · ${r.riesgo||"—"}`,8.5,true,textc);t(M,y-14,`Contexto: ${(r.contexto||[]).join(", ").slice(0,72)}`,7.8,false,muted);t(M,y-27,`Conducta: ${(r.conducta||[]).join(", ").slice(0,72)}`,7.8,false,muted);y-=42}}
  t(M,38,"Autor: Carlos Tejero · CC BY-NC-SA 4.0 · Datos locales. No diagnóstico.",7.2,false,muted);
  if(ops.length)pages.push(ops.join("\n"));
  let objs=[];const add=o=>{objs.push(o);return objs.length},f1=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),f2=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');let pids=[];for(const ps of pages){const cid=add(`<< /Length ${ps.length} >>\nstream\n${ps}\nendstream`),pid=add("PENDING");pids.push({pid,cid})}const pagesId=add("PAGES");for(const p of pids)objs[p.pid-1]=`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${p.cid} 0 R >>`;objs[pagesId-1]=`<< /Type /Pages /Kids [${pids.map(p=>`${p.pid} 0 R`).join(" ")}] /Count ${pids.length} >>`;const catalog=add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);let pdf="%PDF-1.4\n",offs=[0];for(let i=0;i<objs.length;i++){offs.push(pdf.length);pdf+=`${i+1} 0 obj\n${objs[i]}\nendobj\n`}const x=pdf.length;pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offs.length;i++)pdf+=`${String(offs[i]).padStart(10,"0")} 00000 n \n`;pdf+=`trailer\n<< /Size ${objs.length+1} /Root ${catalog} 0 R >>\nstartxref\n${x}\n%%EOF`;const bytes=new Uint8Array(pdf.length);
  for(let i=0;i<pdf.length;i++)bytes[i]=pdf.charCodeAt(i)&255;
  return new Blob([bytes],{type:"application/pdf"})
}
async function exportStatsPDF(rs,opt){
  const method=await exportUserFile(buildStatsPDF(rs,opt),`patrones-acp-${new Date().toISOString().slice(0,10)}.pdf`);if(method!=="cancelled")toast("PDF listo")
}
async function exportStatsDOCX(rs,opt){
  const blob=await buildStatsDocx(rs,opt),method=await exportUserFile(blob,`patrones-acp-${new Date().toISOString().slice(0,10)}.docx`);if(method!=="cancelled")toast("DOCX listo")
}
async function exportStatsCSV(rs){
  await exportCSV(rs)
}
function statsFilterRecords(rs,opt){
  const from=opt.from?new Date(`${opt.from}T00:00:00`):null,to=opt.to?new Date(`${opt.to}T23:59:59`):null;
  return rs.filter(r=>(!opt.code||opt.code==="all"||r.codigo===opt.code)&&(!from||new Date(r.fechaHora)>=from)&&(!to||new Date(r.fechaHora)<=to))
}
function svgBars(map){
  const arr=humanRows(map,8),max=arr[0]?.[1]||1;if(!arr.length)return '<p class="hint">Sin datos.</p>';
  return `<div class="chart-bars">${arr.map(([k,v])=>`<div class="chart-row"><span>${esc(k)}</span><div><i style="width:${v/max*100}%"></i></div><b>${v}</b></div>`).join("")}</div>`
}
function svgPie(map){
  const arr=humanRows(map,6),total=arr.reduce((s,x)=>s+x[1],0)||1,colors=["#2d6a58","#5c967f","#8ab7a5","#5576a0","#9177a0","#b47d55"];let angle=0,stops=[];
  arr.forEach(([k,v],i)=>{const start=angle,end=angle+v/total*100;stops.push(`${colors[i]} ${start}% ${end}%`);angle=end});
  return `<div class="pie-wrap"><div class="pie-chart" style="background:conic-gradient(${stops.join(",")})"></div><div class="pie-legend">${arr.map(([k,v],i)=>`<span><i style="background:${colors[i]}"></i>${esc(k)} · ${v}</span>`).join("")}</div></div>`
}

async function exportCSV(rs){
 const rows=rs.map(flat),heads=Object.keys(rows[0]);const q=v=>`"${String(v??"").replaceAll('"','""')}"`;const csv="\uFEFF"+[heads.map(q).join(";"),...rows.map(r=>heads.map(h=>q(r[h])).join(";"))].join("\r\n");const method=await exportUserFile(new Blob([csv],{type:"text/csv;charset=utf-8"}),`registro-acp-${new Date().toISOString().slice(0,10)}.csv`);if(method!=="cancelled")toast(method==="download"?"CSV descargado":"CSV listo")
}
function pdfSafe(s){return String(s??"").normalize("NFC").replace(/[–—]/g,"-").replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/…/g,"...").replace(/[^\x20-\xFF]/g,"?").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)")}
function rgb(c){return c.map(x=>(x/255).toFixed(3)).join(" ")}
function buildVisualPDF(rs){
 const W=595,H=842,M=38,CONTENT=W-M*2;let pages=[],ops=[],y=H-M,pageNo=0;
 const C={brand:[45,106,88],brandDark:[31,79,65],soft:[234,244,240],line:[214,226,220],text:[31,47,42],muted:[91,111,103],warn:[255,246,225],risk:[181,55,55],white:[255,255,255]};
 const cmd=s=>ops.push(s);const fill=c=>cmd(`${rgb(c)} rg`);const stroke=c=>cmd(`${rgb(c)} RG`);
 function rect(x,y,w,h,fc=null,sc=null,r=0){if(fc)fill(fc);if(sc)stroke(sc);cmd(`${x} ${y} ${w} ${h} re ${fc&&sc?'B':fc?'f':'S'}`)}
 function text(x,yy,s,size=10,bold=false,color=C.text){fill(color);cmd(`BT /${bold?'F2':'F1'} ${size} Tf ${x} ${yy} Td (${pdfSafe(s)}) Tj ET`)}
 function wrap(s,maxChars=82){s=String(s??'—').trim()||'—';const out=[];for(const para of s.split(/\n+/)){let line='';for(const word of para.split(/\s+/)){const n=(line+' '+word).trim();if(n.length>maxChars&&line){out.push(line);line=word}else line=n}if(line)out.push(line)}return out.length?out:['—']}
 function newPage(){if(ops.length)pages.push(ops.join('\n'));ops=[];pageNo++;fill(C.white);rect(0,0,W,H,C.white);rect(0,H-92,W,92,C.brandDark);text(M,H-48,'REGISTRO ACP ESCOLAR',20,true,C.white);text(M,H-70,'Observar · Comprender · Prevenir · Apoyar',10,false,[223,239,233]);text(W-M-90,H-50,`Página ${pageNo}`,9,false,[223,239,233]);y=H-116}
 function need(h){if(y-h<72)newPage()}
 function sectionTitle(t){need(34);fill(C.soft);rect(M,y-24,CONTENT,28,C.soft);text(M+12,y-16,t,11,true,C.brandDark);y-=38}
 function lines(label,value,opt={}){const rows=wrap(value,opt.chars||82);const h=18+rows.length*13;need(h);if(label)text(M,y,label,8,true,C.muted);let yy=y-(label?15:0);for(const l of rows){text(M,yy,l,opt.size||9.5,!!opt.bold,opt.color||C.text);yy-=13}y=yy-8}
 function twoCol(a,b,c,d){need(52);rect(M,y-43,CONTENT,46,[249,252,251],C.line);text(M+12,y-16,a,8,true,C.muted);text(M+12,y-31,b,10,true,C.text);text(M+CONTENT/2+8,y-16,c,8,true,C.muted);text(M+CONTENT/2+8,y-31,d,10,true,C.text);y-=58}
 function fourMetrics(r){need(62);const vals=[["Duración",`${r.duracionValor||0} ${r.duracionUnidad||''}`],["Frecuencia",String(r.frecuencia??'—')],["Intensidad",String(r.intensidad??'—')],["Riesgo",r.riesgo||'—']];const cw=CONTENT/4;for(let i=0;i<4;i++){const x=M+i*cw;const danger=i===3&&r.riesgo==='alto';rect(x,y-47,cw-5,48,danger?[255,237,237]:[248,251,250],danger?C.risk:C.line);text(x+9,y-16,vals[i][0],7.5,true,C.muted);text(x+9,y-34,vals[i][1],10,true,danger?C.risk:C.text)}y-=62}
 function listVal(a,o){return `${(a||[]).join(', ')||'—'}${o?` · Especificar: ${o}`:''}`}
 function footer(){stroke(C.line);cmd(`${M} 54 m ${W-M} 54 l S`);text(M,39,'Registro ACP Escolar · Autor: Carlos Tejero · CC BY-NC-SA 4.0',7.5,true,C.muted);text(M,27,'Proyecto desarrollado con apoyo de ChatGPT. La interpretación y uso corresponde a la persona usuaria y al equipo profesional responsable.',6.8,false,C.muted)}
 for(const r of rs){newPage();twoCol('CÓDIGO PSEUDÓNIMO',`${r.codigo}${r.demo?' · DEMO':''}`,'FECHA Y HORA',new Date(r.fechaHora).toLocaleString('es-ES'));twoCol('CURSO / GRUPO',r.grupo||'—','PROFESIONAL / ALIAS',r.profesional||'—');sectionTitle('1 · CONTEXTO Y ENTORNO');lines('CONTEXTO',listVal(r.contexto,r.contextoOtro));lines('FACTORES DEL ENTORNO',listVal(r.factores,r.factoresOtro));sectionTitle('2 · REGISTRO ABC');lines('A · ANTECEDENTE INMEDIATO',listVal(r.antecedente,r.antecedenteOtro));lines('DESCRIPCIÓN OBJETIVA DEL ANTECEDENTE',r.antecedenteDesc||'—');lines('B · CONDUCTA OBSERVADA',listVal(r.conducta,r.conductaOtro));lines('DESCRIPCIÓN OBJETIVA DE LA CONDUCTA',r.conductaDesc||'—');fourMetrics(r);lines('C · CONSECUENCIA',listVal(r.consecuencia,r.consecuenciaOtro));lines('DESCRIPCIÓN ADICIONAL',r.consecuenciaDesc||'—');sectionTitle('3 · HIPÓTESIS FUNCIONAL PROVISIONAL — NO DIAGNÓSTICO');need(48);rect(M,y-38,CONTENT,42,C.warn,[235,211,162]);text(M+12,y-15,'Hipótesis provisional; requiere varios registros, análisis de patrones y revisión en equipo.',8.5,true,[119,83,22]);text(M+12,y-29,'Las frecuencias o correlaciones observadas no demuestran por sí mismas la función de una conducta.',8,false,[119,83,22]);y-=52;lines('LOS DATOS PODRÍAN SER COMPATIBLES CON',listVal(r.hipotesis,r.hipotesisOtro));sectionTitle('4 · APOYOS Y PREVENCIÓN');lines('APOYOS APLICADOS',listVal(r.apoyos,r.apoyosOtro));lines('¿PARECIÓ AYUDAR?',`${r.apoyoValoracion||'—'} (valoración descriptiva; no demuestra causalidad)`);lines('QUÉ PROBAR LA PRÓXIMA VEZ',listVal(r.proxima,r.proximaOtro));lines('NOTA',r.proximaTexto||'—');sectionTitle('5 · INDICADORES DE INCLUSIÓN Y CONTEXTO');for(const k of INCLUSION){need(28);rect(M,y-21,CONTENT,25,[249,252,251],C.line);text(M+9,y-15,INCLUSION_LABELS[k],7.5,false,C.text);text(W-M-75,y-15,r.inclusion?.[k]||'—',8,true,C.brandDark);y-=30}need(48);rect(M,y-38,CONTENT,42,C.soft,C.line);text(M+10,y-14,'Uso responsable: emplea códigos pseudónimos y revisa antes de compartir.',8,true,C.brandDark);text(M+10,y-27,'El uso institucional debe ajustarse a las políticas y herramientas autorizadas por el centro o Administración.',7.2,false,C.muted);footer()}
 if(ops.length)pages.push(ops.join('\n'));
 let objs=[];const add=o=>{objs.push(o);return objs.length};const f1=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),f2=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');let pids=[];for(const s of pages){const cid=add(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`),pid=add('PENDING');pids.push({pid,cid})}const pagesId=add('PAGES');for(const p of pids)objs[p.pid-1]=`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${p.cid} 0 R >>`;objs[pagesId-1]=`<< /Type /Pages /Kids [${pids.map(p=>`${p.pid} 0 R`).join(' ')}] /Count ${pids.length} >>`;const catalog=add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);let pdf='%PDF-1.4\n',offs=[0];for(let i=0;i<objs.length;i++){offs.push(pdf.length);pdf+=`${i+1} 0 obj\n${objs[i]}\nendobj\n`}const x=pdf.length;pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offs.length;i++)pdf+=`${String(offs[i]).padStart(10,'0')} 00000 n \n`;pdf+=`trailer\n<< /Size ${objs.length+1} /Root ${catalog} 0 R >>\nstartxref\n${x}\n%%EOF`;const bytes=new Uint8Array(pdf.length);for(let i=0;i<pdf.length;i++)bytes[i]=pdf.charCodeAt(i)&255;return new Blob([bytes],{type:'application/pdf'})
}
async function generatePDF(rs){const method=await exportUserFile(buildVisualPDF(rs),`registro-acp-${new Date().toISOString().slice(0,10)}.pdf`);if(method!=="cancelled")toast(method==="download"?"PDF descargado":"PDF listo")}
async function blobToBase64(blob){
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
function isNativeApp(){
  try{
    return !!(window.Capacitor && typeof window.Capacitor.getPlatform==="function" && window.Capacitor.getPlatform()!=="web");
  }catch{return false}
}
async function nativePluginCall(pluginId, methodName, options={}){
  if(!window.Capacitor || typeof window.Capacitor.nativePromise!=="function"){
    throw new Error("Puente nativo de Capacitor no disponible");
  }
  return await window.Capacitor.nativePromise(pluginId,methodName,options);
}
async function shareNativeBlob(blob,filename){
  const base64=await blobToBase64(blob);
  const safeName=`acp-${Date.now()}-${filename}`.replace(/[^a-zA-Z0-9._-]/g,"_");
  const write=await nativePluginCall("Filesystem","writeFile",{
    path:safeName,
    data:base64,
    directory:"CACHE",
    recursive:true
  });
  if(!write || !write.uri) throw new Error("No se pudo obtener la ubicación local del archivo");
  await nativePluginCall("Share","share",{
    title:filename,
    text:"Archivo generado localmente por Registro ACP Escolar.",
    url:write.uri,
    dialogTitle:"Guardar o compartir archivo"
  });
  return true;
}
async function exportUserFile(blob,filename){
  if(isNativeApp()){
    await shareNativeBlob(blob,filename);
    return "native-share";
  }
  if(navigator.share && typeof File!=="undefined"){
    try{
      const file=new File([blob],filename,{type:blob.type||"application/octet-stream"});
      if(!navigator.canShare || navigator.canShare({files:[file]})){
        await navigator.share({title:filename,files:[file]});
        return "web-share";
      }
    }catch(err){
      if(err?.name==="AbortError") return "cancelled";
    }
  }
  downloadBlob(blob,filename);
  return "download";
}

function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}


function temporalHeatmapData(records){
  const hours=[...Array(24)].map((_,i)=>i);
  const days=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  const matrix=Array.from({length:7},()=>Array(24).fill(0));
  for(const r of records){
    const d=new Date(r.fechaHora);
    if(Number.isNaN(d.getTime()))continue;
    const jsDay=d.getDay(); // Sun=0
    const day=(jsDay+6)%7;  // Mon=0
    matrix[day][d.getHours()]++;
  }
  const max=Math.max(1,...matrix.flat());
  return {days,hours,matrix,max};
}
function heatLevel(v,max){
  if(!v)return 0;
  const ratio=v/max;
  if(ratio<=.25)return 1;
  if(ratio<=.5)return 2;
  if(ratio<=.75)return 3;
  return 4;
}
function renderTemporalHeatmap(records,title="Frecuencia por día y hora"){
  const h=temporalHeatmapData(records);
  const activeHours=h.hours.filter(hour=>h.matrix.some(row=>row[hour]>0));
  const minHour=activeHours.length?Math.max(0,Math.min(...activeHours)-1):7;
  const maxHour=activeHours.length?Math.min(23,Math.max(...activeHours)+1):18;
  const hours=h.hours.filter(x=>x>=minHour&&x<=maxHour);
  return `<div class="temporal-card">
    <div class="temporal-head">
      <h4>${esc(title)}</h4>
      <span>${records.length} registro(s)</span>
    </div>
    <div class="temporal-scroll">
      <div class="temporal-grid" style="--hours:${hours.length}">
        <div class="temporal-corner"></div>
        ${hours.map(x=>`<div class="temporal-hour">${String(x).padStart(2,"0")}h</div>`).join("")}
        ${h.days.map((day,di)=>`
          <div class="temporal-day">${day}</div>
          ${hours.map(hour=>{
            const v=h.matrix[di][hour],level=heatLevel(v,h.max);
            return `<div class="temporal-cell heat-${level}" title="${day} ${String(hour).padStart(2,"0")}:00 · ${v} registro(s)">
              ${v||""}
            </div>`;
          }).join("")}
        `).join("")}
      </div>
    </div>
    <div class="temporal-legend">
      <span>Menor frecuencia</span>
      <i class="heat-1"></i><i class="heat-2"></i><i class="heat-3"></i><i class="heat-4"></i>
      <span>Mayor frecuencia</span>
    </div>
  </div>`;
}
function renderTemporalPatterns(records,selectedCodes){
  if(!records.length)return '<p class="hint">No hay registros para construir el mapa horario.</p>';
  const general=renderTemporalHeatmap(records,"Vista general");
  const codes=[...selectedCodes];
  if(codes.length<=1)return general;
  const byCode=codes.map(code=>{
    const rs=records.filter(r=>r.codigo===code);
    return rs.length?renderTemporalHeatmap(rs,code):"";
  }).join("");
  return `${general}<details class="temporal-by-student"><summary>Ver por alumnado</summary><div class="temporal-student-list">${byCode}</div></details>`;
}


function hourlyFrequencyData(records){
  const counts=Array(24).fill(0);
  for(const r of records){
    const d=new Date(r.fechaHora);
    if(!Number.isNaN(d.getTime()))counts[d.getHours()]++;
  }
  const active=counts.map((v,i)=>v?i:null).filter(v=>v!==null);
  const min=active.length?Math.max(0,Math.min(...active)-1):7;
  const max=active.length?Math.min(23,Math.max(...active)+1):18;
  return counts.map((v,h)=>({hour:h,count:v})).filter(x=>x.hour>=min&&x.hour<=max);
}
function renderHourlyLineChart(records,title="Frecuencia por hora"){
  const data=hourlyFrequencyData(records);
  const max=Math.max(1,...data.map(d=>d.count));
  const width=760,height=260,padL=48,padR=24,padT=34,padB=42;
  const plotW=width-padL-padR,plotH=height-padT-padB;
  const points=data.map((d,i)=>{
    const x=padL+(data.length===1?plotW/2:(i/(data.length-1))*plotW);
    const y=padT+plotH-(d.count/max)*plotH;
    return {...d,x,y};
  });
  const path=points.map((p,i)=>`${i?"L":"M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return `<div class="hour-line-card">
    <div class="temporal-head"><h4>${esc(title)}</h4><span>${records.length} registro(s)</span></div>
    <div class="hour-line-scroll">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
        ${[0,.25,.5,.75,1].map(fr=>{const y=padT+plotH-(fr*plotH),v=Math.round(fr*max);return `<line x1="${padL}" y1="${y}" x2="${width-padR}" y2="${y}" class="line-grid"/><text x="${padL-10}" y="${y+4}" text-anchor="end" class="line-axis">${v}</text>`}).join("")}
        <line x1="${padL}" y1="${padT+plotH}" x2="${width-padR}" y2="${padT+plotH}" class="line-axis-line"/>
        ${points.map(p=>`<text x="${p.x}" y="${height-16}" text-anchor="middle" class="line-axis">${String(p.hour).padStart(2,"0")}h</text>`).join("")}
        <path d="${path}" class="hour-line-path"/>
        ${points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="5" class="hour-line-point"><title>${String(p.hour).padStart(2,"0")}:00 · ${p.count} registro(s)</title></circle>`).join("")}
      </svg>
    </div>
  </div>`;
}


let pendingStatsExport=null;
function openStatsExportOptions(format,rs,baseOpt){
  pendingStatsExport={format,rs,baseOpt};
  document.querySelector("#statsExportOptionsDialog")?.showModal();
}
function readStatsExportOptions(){
  return {
    summary:document.querySelector("#expSummary").checked,
    charts:document.querySelector("#expCharts").checked,
    temporalHeat:document.querySelector("#expTemporalHeat").checked,
    temporalLine:document.querySelector("#expTemporalLine").checked,
    codes:document.querySelector("#expCodes").checked,
    support:document.querySelector("#expSupport").checked,
    details:document.querySelector("#expDetails").checked
  };
}

async function renderStats(){
 const all=await allRecords();
 const groups=studentReportGroups(all);
 document.querySelector("#screen-stats").innerHTML=`<div class="card screen-card">${screenCloseButton()}
 <h2>Patrones descriptivos</h2>
 <p class="hint">Resumen local. No demuestra la función de una conducta ni realiza diagnósticos.</p>

 <details class="filter-panel">
   <summary>Filtros y opciones</summary>
   <div class="stats-filter-stack">
     <div class="student-report-toolbar">
       <label class="checkline select-all-students">
         <input id="statsAllCodes" type="checkbox" checked>
         <strong>Todos los códigos</strong>
       </label>
       <label>Orden
         <select id="statsCodeOrder">
           <option value="recent">Más recientes primero</option>
           <option value="oldest">Más antiguos primero</option>
         </select>
       </label>
     </div>

     <div class="student-picker-shell">
       <button id="statsPrevCodes" class="student-arrow" type="button" aria-label="Ver códigos anteriores">↑</button>
       <div id="statsCodePicker" class="student-picker" role="group" aria-label="Códigos pseudónimos"></div>
       <button id="statsNextCodes" class="student-arrow" type="button" aria-label="Ver códigos siguientes">↓</button>
     </div>

     <div id="statsCodeSummary" class="student-selection-summary"></div>

     <details class="temporal-filter-box">
       <summary>Vista temporal: alumnado</summary>
       <div class="temporal-student-controls">
         <label class="checkline"><input id="temporalAllCodes" type="checkbox" checked> Todos los seleccionados</label>
         <div id="temporalCodePicker" class="temporal-code-picker"></div>
       </div>
     </details>

     <div class="stats-controls">
       <label>Desde<input id="statsFrom" type="date"></label>
       <label>Hasta<input id="statsTo" type="date"></label>
       <label class="checkline"><input id="statsCharts" type="checkbox" checked> Incluir gráficos</label>
       <label class="checkline"><input id="statsDetails" type="checkbox"> Incluir detalle de registros</label>
       <label class="checkline"><input id="statsTemporal" type="checkbox" checked> Mapa horario</label>
       <button id="statsApply" type="button">Aplicar</button>
     </div>
   </div>
 </details>

 <div id="statsSummary"></div>
 <div class="actions stats-export"><button id="statsPdf">PDF</button><button id="statsDocx">DOCX</button><button id="statsXlsx">XLSX</button><button id="statsCsv">CSV</button></div>
 </div>`;

 let page=0;
 const PAGE=5;
 let selected=new Set(groups.map(g=>g.code));
 let temporalSelected=new Set(groups.map(g=>g.code));

 const orderedGroups=()=>sortStudentGroups(groups,document.querySelector("#statsCodeOrder").value);
 const maxPage=()=>Math.max(0,Math.ceil(orderedGroups().length/PAGE)-1);


 const renderTemporalCodePicker=()=>{
   const available=[...selected];
   temporalSelected=new Set([...temporalSelected].filter(c=>available.includes(c)));
   if(!temporalSelected.size&&available.length)temporalSelected=new Set(available);
   const box=document.querySelector("#temporalCodePicker");
   if(!box)return;
   box.innerHTML=available.length?available.map(code=>`
     <label class="temporal-code-option">
       <input type="checkbox" value="${esc(code)}" ${temporalSelected.has(code)?"checked":""}>
       <span>${esc(code)}</span>
     </label>`).join(""):'<p class="hint">No hay códigos seleccionados.</p>';
   box.querySelectorAll('input').forEach(ch=>ch.onchange=()=>{
     ch.checked?temporalSelected.add(ch.value):temporalSelected.delete(ch.value);
     document.querySelector("#temporalAllCodes").checked=temporalSelected.size===available.length&&available.length>0;
     draw();
   });
   document.querySelector("#temporalAllCodes").checked=temporalSelected.size===available.length&&available.length>0;
 };

 const renderCodePicker=()=>{
   const sorted=orderedGroups();
   page=Math.min(page,maxPage());
   const slice=sorted.slice(page*PAGE,page*PAGE+PAGE);
   const picker=document.querySelector("#statsCodePicker");
   picker.innerHTML=slice.length?slice.map(g=>`
     <label class="student-code-option">
       <input type="checkbox" value="${esc(g.code)}" ${selected.has(g.code)?"checked":""}>
       <span><strong>${esc(g.code)}</strong><small>${g.items.length} registro(s) · ${new Date(g.last).toLocaleDateString("es-ES")}</small></span>
     </label>`).join(""):'<p class="hint">No hay códigos guardados.</p>';

   picker.querySelectorAll('input[type="checkbox"]').forEach(ch=>ch.addEventListener("change",()=>{
     if(ch.checked)selected.add(ch.value);else selected.delete(ch.value);
     document.querySelector("#statsAllCodes").checked=selected.size===groups.length&&groups.length>0;
     updateCodeSummary();renderTemporalCodePicker();
   }));

   document.querySelector("#statsPrevCodes").disabled=page===0;
   document.querySelector("#statsNextCodes").disabled=page>=maxPage();
   updateCodeSummary();
 };

 const updateCodeSummary=()=>{
   if(selected.size===groups.length&&groups.length>0){
     document.querySelector("#statsCodeSummary").textContent=`Todos los códigos · ${all.length} registro(s)`;
   }else{
     const n=all.filter(r=>selected.has(r.codigo)).length;
     document.querySelector("#statsCodeSummary").textContent=selected.size?`${selected.size} código(s) · ${n} registro(s)`:"Ningún código seleccionado";
   }
 };

 document.querySelector("#statsPrevCodes").onclick=()=>{if(page>0){page--;renderCodePicker()}};
 document.querySelector("#statsNextCodes").onclick=()=>{if(page<maxPage()){page++;renderCodePicker()}};
 document.querySelector("#statsCodeOrder").onchange=()=>{page=0;renderCodePicker()};
 document.querySelector("#statsAllCodes").onchange=e=>{
   selected=e.target.checked?new Set(groups.map(g=>g.code)):new Set();
   temporalSelected=new Set(selected);
   renderCodePicker();renderTemporalCodePicker();
 };
 document.querySelector("#temporalAllCodes").onchange=e=>{
   temporalSelected=e.target.checked?new Set(selected):new Set();
   renderTemporalCodePicker();draw();
 };

 const state=()=>({
   codes:new Set(selected),
   from:document.querySelector("#statsFrom").value,
   to:document.querySelector("#statsTo").value,
   charts:document.querySelector("#statsCharts").checked,
   details:document.querySelector("#statsDetails").checked,
   temporal:document.querySelector("#statsTemporal").checked,
   order:document.querySelector("#statsCodeOrder").value
 });

 const current=()=>{
   const st=state();
   const from=st.from?new Date(`${st.from}T00:00:00`):null;
   const to=st.to?new Date(`${st.to}T23:59:59`):null;
   let rs=all.filter(r=>st.codes.has(r.codigo)&&(!from||new Date(r.fechaHora)>=from)&&(!to||new Date(r.fechaHora)<=to));
   rs.sort((a,b)=>st.order==="oldest"?new Date(a.fechaHora)-new Date(b.fechaHora):new Date(b.fechaHora)-new Date(a.fechaHora));
   return rs;
 };

 const draw=()=>{
   const rs=current(),s=statsData(rs),charts=state().charts;
   document.querySelector("#statsSummary").innerHTML=`<div class="stats-kpis">
     <div><span>Registros</span><strong>${s.total}</strong></div>
     <div><span>Duración media</span><strong>${s.avgDuration} s</strong></div>
     <div class="kpi-with-help"><span>Apoyo útil <button type="button" class="help-dot stat-help" data-help-title="Apoyo útil" data-help-body="${encodeURIComponent("Índice descriptivo de utilidad del apoyo: Sí puntúa 100 %, Parcialmente 50 % y No 0 %. Los registros No valorable se excluyen del cálculo. No demuestra por sí solo eficacia causal.")}">?</button></span><strong>${s.supportUseful}%</strong></div>
     <div><span>Códigos</span><strong>${Object.keys(s.codes).length}</strong></div>
   </div>
   <details class="support-breakdown"><summary>Ver desglose de apoyos</summary><div class="support-breakdown-grid">
     <span><b>Sí</b> ${s.supportYesCount}</span><span><b>Parcialmente</b> ${s.supportPartCount}</span><span><b>No</b> ${s.supportNoCount}</span><span><b>No valorable</b> ${s.supportNotValuable}</span>
   </div></details>
   ${state().temporal?(()=>{
     const temporalRs=rs.filter(r=>temporalSelected.has(r.codigo));
     return `<section class="temporal-patterns">
       <div class="section-title-row"><h3>Frecuencia por día y hora</h3><button type="button" class="help-dot" data-help-title="Frecuencia por día y hora" data-help-body="${encodeURIComponent("Vista descriptiva inspirada en registros temporales de Apoyo Conductual Positivo. Muestra cuándo se concentran los registros, pero no demuestra causalidad.")}">?</button></div>
       ${renderTemporalPatterns(temporalRs,temporalSelected)}
       ${renderHourlyLineChart(temporalRs,"Frecuencia total por hora")}
     </section>`;
   })():""}${charts?`<div class="chart-grid">
     <div class="stat"><h3>Conductas</h3>${svgBars(s.conducta)}</div>
     <div class="stat"><h3>Contextos</h3>${svgBars(s.contexto)}</div>
     <div class="stat"><h3>Riesgos</h3>${svgPie(s.riesgo)}</div>
     <div class="stat"><h3>Registros por código</h3>${svgBars(s.codes)}</div>
   </div>`:""}
   <details class="stats-table"><summary>Ver resumen numérico</summary><div class="table-wrap"><table><thead><tr><th>Código</th><th>Registros</th></tr></thead><tbody>${humanRows(s.codes,100).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join("")}</tbody></table></div></details>
   ${state().details?`<details open><summary>Detalle de ${rs.length} registros</summary><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Código</th><th>Contexto</th><th>Conducta</th><th>Intensidad</th><th>Riesgo</th></tr></thead><tbody>${rs.map(r=>`<tr><td>${esc(new Date(r.fechaHora).toLocaleDateString("es-ES"))}</td><td>${esc(r.codigo)}</td><td>${esc((r.contexto||[]).join(", "))}</td><td>${esc((r.conducta||[]).join(", "))}</td><td>${esc(r.intensidad)}</td><td>${esc(r.riesgo)}</td></tr>`).join("")}</tbody></table></div></details>`:""}`;
   bindHelpButtons(document.querySelector("#statsSummary"));
 };

 document.querySelector("#statsApply").onclick=()=>{
   if(!selected.size){toast("Selecciona al menos un código");return}
   draw();
 };
 draw();

 const gate=(fn)=>reviewGate(async()=>{
   const rs=current();
   if(!rs.length){toast("No hay registros con esos filtros");return}
   const codeLabel=selected.size===1?[...selected][0]:"all";
   await fn(rs,{charts:state().charts,details:state().details,code:codeLabel});
 });

 const prep=(format)=>reviewGate(async()=>{
   const rs=current();if(!rs.length){toast("No hay registros con esos filtros");return}
   const codeLabel=selected.size===1?[...selected][0]:"all";
   openStatsExportOptions(format,rs,{code:codeLabel,order:state().order});
 });
 document.querySelector("#statsPdf").onclick=()=>prep("pdf");
 document.querySelector("#statsDocx").onclick=()=>prep("docx");
 document.querySelector("#statsXlsx").onclick=()=>prep("xlsx");
 document.querySelector("#statsCsv").onclick=()=>prep("csv");

 renderCodePicker();renderTemporalCodePicker();
 bindScreenClose(document.querySelector("#screen-stats"));
}
function renderHelp(){
 const qs=[["¿Qué es ABC?","Un modo estructurado de registrar Antecedente, Conducta observada y Consecuencia para revisar patrones sin convertir una observación aislada en una explicación causal."],["¿Qué es un antecedente?","Lo que ocurrió inmediatamente antes del episodio, descrito mediante hechos observables."],["¿Qué es una consecuencia?","Lo que ocurrió inmediatamente después. No significa necesariamente premio, castigo ni causa."],["¿Qué es una hipótesis funcional?","Una explicación provisional sobre qué necesidad o función podría ser compatible con un patrón de registros. Requiere varios datos y revisión profesional/en equipo."],["¿Qué significa análisis funcional?","Proceso sistemático para comprender relaciones entre contexto, conducta y consecuencias. Esta aplicación ayuda a registrar datos, pero no sustituye una evaluación funcional profesional cuando sea necesaria."],["¿Observación o interpretación?","Observable: “Al indicarle que guardase el dispositivo, golpeó la mesa tres veces y salió del aula.” Interpretativo: “Se enfadó, quiso desafiar al profesor y perdió el control.” El primero describe hechos; el segundo atribuye estados internos o intenciones."],["¿Qué significa Apoyo Conductual Positivo?","Un enfoque centrado en la persona que busca comprender necesidades, prevenir dificultades y mejorar bienestar, participación, calidad de vida y apoyos, evitando reducir a la persona a una conducta."],["¿Por qué observar el entorno?","Porque accesibilidad, ruido, demandas, comunicación, predictibilidad, transiciones o tiempos de procesamiento pueden influir en la participación y regulación."],["¿Por qué una hipótesis necesita varios registros?","Un episodio aislado puede tener muchas explicaciones. Los patrones repetidos aportan información más prudente y útil."],["¿Qué es pseudonimización?","Sustituir identificadores directos por un código. Reduce riesgos, pero puede seguir siendo dato personal si existe información adicional que permite reidentificar."],["¿Qué datos no debo introducir?","Evita nombres completos, DNI, direcciones, diagnósticos, información clínica y cualquier dato identificativo que no sea necesario para la finalidad educativa del registro."]];
 document.querySelector("#screen-help").innerHTML=`<div class=card><h2>Ayuda</h2>${qs.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>`
}
function renderPrivacy(){
 document.querySelector("#screen-privacy").innerHTML=`<div class=card><h2>Privacidad y datos</h2><div class="privacy-note"><strong>Exportaciones</strong><p>La aplicación puede generar archivos PDF, DOCX, XLSX y CSV en el propio dispositivo. La exportación no envía los datos automáticamente a ningún servicio externo. <strong>Los archivos exportados no están cifrados por la aplicación.</strong> Una vez guardado o compartido un archivo fuera de la aplicación, su custodia corresponde al usuario y al centro.</p></div>
 ${["Qué información guarda la aplicación|Registros ACP, códigos pseudónimos y los campos que la persona usuaria decide introducir.","Dónde se guarda|El contenido de los registros ACP se almacena localmente en el dispositivo mediante IndexedDB. Preferencias sencillas se guardan en localStorage.","Qué datos no deben introducirse|Evita nombres completos, DNI, direcciones, diagnósticos, información clínica y datos identificativos innecesarios.","Exportaciones|CSV, PDF, DOCX y XLSX se generan mediante código ejecutado en el navegador tras una acción deliberada.","Borrado|La aplicación permite borrar registros individuales, seleccionados, DEMO y todos los registros locales.","Seguridad del dispositivo|El PIN limita el acceso desde la interfaz, pero no es cifrado completo del almacenamiento.","Arquitectura técnica|No existe base de datos central destinada a recibir registros ACP, ni sincronización automática de registros.","Metadatos de conexión|Al acceder a la versión web, el proveedor de alojamiento puede registrar datos técnicos como la dirección IP, fecha, hora y páginas solicitadas. El contenido de los registros no se incluye en esas peticiones.","Limitaciones|La app no contiene una API destinada a recibir el contenido de los registros ACP. El contenido permanece local salvo exportación deliberada, acceso al dispositivo o ejecución futura de código autorizado bajo el mismo origen web.","Uso institucional en España|El uso debe ajustarse al RGPD, la normativa española, las políticas de la organización responsable y las instrucciones de la comunidad autónoma correspondiente. Antes de utilizar datos reales, verifica que la finalidad, la herramienta y el dispositivo estén autorizados y consulta al delegado de protección de datos cuando corresponda.","Autorizaciones|La aplicación no ha sido homologada, certificada ni autorizada para uso institucional por la AEPD, el Ministerio de Educación, las consejerías autonómicas ni ningún centro educativo.","Comunidad de Madrid|Sus instrucciones publicadas contienen restricciones expresas para herramientas externas destinadas a la valoración de conductas y otros trámites confidenciales. En las demás comunidades autónomas deben consultarse sus instrucciones propias."].map(x=>{const [a,b]=x.split("|");return `<h3>${a}</h3><p>${b}</p>`}).join("")}
 <h3>Arquitectura de privacidad y datos</h3>
 <p>Los registros ACP se almacenan localmente en el dispositivo. El autor no recibe ni puede consultar los registros almacenados localmente. No existe sincronización automática de registros. Una vez exportados fuera de la aplicación, su protección dependerá también del sistema, dispositivo o servicio utilizado.</p>
 <div class=table-wrap><table><thead><tr><th>DATO</th><th>DÓNDE SE GUARDA</th><th>¿SE ENVÍA AUTOMÁTICAMENTE?</th></tr></thead><tbody>
 ${[["Registros ACP","Dispositivo local","NO"],["Código pseudónimo","Dispositivo local","NO"],["Preferencias","Dispositivo local","NO"],["PIN","Dispositivo local","NO"],["CSV","Generado localmente","NO"],["PDF","Generado localmente","NO"],["DOCX","Generado localmente","NO"],["XLSX","Generado localmente","NO"],].map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
 <h3>Uso institucional</h3><div class="privacy-note institutional-export-note"><strong>Uso institucional y exportación</strong><p>La aplicación no incorpora envío automático de registros ni configuración de receptores. Genera archivos PDF, DOCX, XLSX y CSV en el propio dispositivo. El centro decide posteriormente cómo custodiar, archivar o transferir esos archivos conforme a sus procedimientos, medidas de seguridad y responsabilidades en protección de datos.</p></div><p>Cuando corresponda, consulta al Delegado o Delegada de Protección de Datos del centro o Administración competente. La aplicación no ha sido homologada, certificada ni autorizada para uso institucional por la AEPD, el Ministerio de Educación, las consejerías autonómicas ni ningún centro educativo.</p><p>La utilización de códigos pseudónimos reduce riesgos, pero los datos pseudonimizados pueden seguir siendo datos personales si pueden vincularse nuevamente a una persona mediante información adicional.</p></div>`
}
function renderAbout(){
 document.querySelector("#screen-about").innerHTML=`<div class=card><h2>Acerca de / Licencia / Uso ético</h2><h3>Autoría</h3><p><strong>Autor: Carlos Tejero</strong></p><p>Proyecto desarrollado por Carlos Tejero con apoyo de ChatGPT para la ideación, estructuración y desarrollo técnico.</p><p>Carlos Tejero es el autor. ChatGPT es una herramienta de apoyo. ChatGPT no es autor ni titular de los derechos de la obra.</p>
 <h3>Finalidad</h3><p>Herramienta educativa de observación y registro dentro de procesos de Apoyo Conductual Positivo, centrada en prevención, comprensión funcional, dignidad, participación y apoyos. No es una herramienta diagnóstica.</p>
 <h3>Privacidad y uso responsable</h3><p>La persona usuaria es responsable de los datos que introduce, de la legitimidad de su tratamiento, de su confidencialidad, conservación, exportación, envío y eliminación, así como del cumplimiento de la normativa aplicable y de los protocolos de su centro o entidad.</p><p>El autor proporciona la herramienta, pero no determina la finalidad del tratamiento realizado por cada centro o profesional, no recibe los registros y no controla los datos introducidos localmente.</p><p>La utilización de esta herramienta no exime a la persona usuaria de sus obligaciones profesionales, éticas, legales o institucionales.</p><p>La persona usuaria y, cuando corresponda, el centro o entidad responsable determinan la legitimidad y condiciones del tratamiento de los datos.</p>
 <h3>Licencia</h3><p><strong>Creative Commons Atribución-NoComercial-CompartirIgual 4.0 Internacional — CC BY-NC-SA 4.0.</strong></p><p>Puedes usar, copiar, compartir y modificar esta obra. Si publicas una versión modificada, debes reconocer la autoría original, mantener la misma licencia y respetar sus condiciones.</p><p>Atribución: “Tejero, Carlos. Registro ACP Escolar. Licencia CC BY-NC-SA 4.0.”</p><p><a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es" target="_blank" rel="noopener">Enlace oficial de la licencia</a></p>
 <h3>Limitaciones</h3><p>No sustituye evaluación psicológica, médica, psiquiátrica, pedagógica ni profesional, ni protocolos de centro, protección, seguridad o emergencia. Tampoco sustituye la decisión del responsable del tratamiento sobre qué herramientas pueden utilizarse en el contexto escolar.</p><p>La aplicación se facilita “tal cual”, sin garantía de adecuación a una finalidad institucional concreta, en la máxima medida permitida por la legislación aplicable. Estas condiciones no excluyen responsabilidades que legalmente no puedan excluirse.</p></div>`
}
async function renderSettings(){
 const p=prefs();document.querySelector("#screen-settings").innerHTML=`<div class=card><h2>Configuración</h2>
 <h3>Protección mediante PIN local</h3><p>Este PIN protege el acceso dentro de la aplicación, pero no sustituye las medidas de seguridad del dispositivo.</p><p>Si olvidas el PIN podría no ser posible acceder a los registros almacenados.</p><p><strong>El PIN limita el acceso mediante la interfaz de la aplicación, pero no constituye por sí mismo cifrado completo del almacenamiento del dispositivo.</strong></p>
 <p>Estado: <strong>${p.pinEnabled?"Activado":"Desactivado"}</strong></p><div class=actions>${p.pinEnabled?'<button id=changePin>Cambiar PIN</button><button id=disablePin class=secondary>Desactivar PIN</button>':'<button id=enablePin>Activar PIN</button>'}</div>
 <h3>Recordatorio de revisión de datos</h3><label>Revisar registros con antigüedad superior a<select id=retention><option value=7 ${p.retention==="7"?"selected":""}>7 días</option><option value=30 ${p.retention==="30"?"selected":""}>30 días</option><option value=90 ${p.retention==="90"?"selected":""}>90 días</option><option value=manual ${p.retention==="manual"?"selected":""}>Manual</option></select></label><p class=hint>No se borra automáticamente. El centro debe definir y aplicar el plazo de conservación que corresponda.</p>
 
 <h3>Centro / Personalización</h3>
 <p class="hint">Personalización local. No se sincroniza.</p>
 <div class="actions">
   <button id="centerCustomizeBtn" class="secondary">Personalizar centro</button>
   <button id="centerDocsBtn" class="secondary">Documentos del centro</button>
 </div>
 <h3>Uso institucional</h3>
 <div class="compact-note"><strong>Privacidad desde el diseño.</strong> La autorización de uso corresponde al centro o Administración responsable. <button type="button" class="help-dot" id="dpdInfoBtn">?</button></div>
<h3>Datos DEMO</h3><div class=actions><button id=addDemo class=secondary>Añadir datos DEMO</button></div>
 <h3>Borrado total</h3><button id=deleteAll class=danger>Borrar todos los datos</button></div>`;
 document.querySelector("#retention").onchange=e=>{savePrefs({retention:e.target.value});toast("Preferencia guardada")};
 if(!p.pinEnabled)document.querySelector("#enablePin").onclick=()=>setNewPin("activar");else{document.querySelector("#changePin").onclick=()=>setNewPin("cambiar");document.querySelector("#disablePin").onclick=async()=>{const pin=prompt("Introduce el PIN actual");if(pin===null)return;if(await hashPin(pin,p.pinSalt)!==p.pinHash)return alert("PIN incorrecto");savePrefs({pinEnabled:false,pinHash:"",pinSalt:""});unlocked=false;toast("PIN desactivado");renderSettings()}}
 document.querySelector("#addDemo").onclick=addDemo;
 
 document.querySelector("#centerCustomizeBtn")?.addEventListener("click",()=>{
   const p=prefs();document.querySelector("#centerDisplayName").value=p.centerDisplayName||"";document.querySelector("#codePrefixSetting").value=p.codePrefix||"";document.querySelector("#codeFormatSetting").value=p.codeFormat||"01A";document.querySelector("#centerLocalNote").value=p.centerLocalNote||"";document.querySelector("#centerCustomizeDialog").showModal();
 });
 document.querySelector("#centerDocsBtn")?.addEventListener("click",async()=>{await renderCenterDocs();document.querySelector("#centerDocsDialog").showModal()});
 document.querySelector("#dpdInfoBtn")?.addEventListener("click",()=>quickHelp("Información para centro / DPD",`<div class="help-menu"><p><b>Almacenamiento</b><br><span>Registros y documentos institucionales se guardan localmente en el dispositivo.</span></p><p><b>Servidor</b><br><span>No existe base de datos central de registros ACP.</span></p><p><b>Identificación</b><br><span>Se utilizan códigos pseudónimos. La pseudonimización reduce riesgos, pero no convierte automáticamente los datos en anónimos.</span></p><p><b>Exportación</b><br><span>PDF, DOCX, XLSX y CSV se generan localmente y solo salen del dispositivo por acción del usuario.</span></p><p><b>Decisiones</b><br><span>No diagnostica, no perfila y no toma decisiones automatizadas.</span></p><p><b>Uso institucional</b><br><span>Debe ajustarse a las políticas, medidas de seguridad y herramientas autorizadas por el centro o Administración.</span></p></div>`));

 document.querySelector("#deleteAll").onclick=async()=>{if(!confirm("¿Quieres eliminar todos los registros almacenados en este dispositivo?"))return;if(!confirm("Esta acción no puede deshacerse. Confirmar borrado definitivo."))return;await clearRecords();toast("Todos los registros han sido eliminados")}
}
async function setNewPin(mode){
 if(mode==="activar"&&!confirm("Este PIN protege el acceso dentro de la aplicación, pero no sustituye las medidas de seguridad del dispositivo. ¿Continuar?"))return;
 const a=prompt("Introduce un PIN de al menos 4 cifras");if(a===null)return;if(!/^\d{4,}$/.test(a))return alert("Usa al menos 4 cifras.");const b=prompt("Repite el PIN");if(a!==b)return alert("Los PIN no coinciden.");const salt=uid();const h=await hashPin(a,salt);savePrefs({pinEnabled:true,pinSalt:salt,pinHash:h});unlocked=true;toast(mode==="cambiar"?"PIN cambiado":"PIN activado");renderSettings()
}
async function addDemo(){
 const a=[{codigo:"DEMO-A01",contexto:["aula ordinaria"],factores:["ruido","tarea poco clara"],antecedente:["tarea poco clara"],antecedenteDesc:"Se presentó una ficha nueva sin ejemplo visual previo.",conducta:["no inicia/se niega"],conductaDesc:"Permanece sentado sin iniciar la tarea durante 2 minutos y aparta la ficha.",duracionValor:2,duracionUnidad:"minutos",frecuencia:1,intensidad:2,riesgo:"sin riesgo",consecuencia:["ayuda recibida"],consecuenciaDesc:"Se mostró un ejemplo visual y se fragmentó la actividad.",hipotesis:["comunicar incomprensión"],apoyos:["apoyo visual","fragmentar tarea","tiempo de procesamiento"],apoyoValoracion:"Sí",proxima:["clarificar instrucciones","preparar apoyo visual"],proximaTexto:"Mostrar ejemplo antes de iniciar.",inclusion:{entornoPredecible:"Parcial",infoAccesible:"No",tiempoProcesamiento:"Sí",alternativaSensorial:"No aplica",pudoPedir:"Parcial",dignidad:"Sí",participacion:"Parcial",demandaAjustada:"Parcial"}},
 {codigo:"DEMO-B02",contexto:["cambio de clase"],factores:["transición","ruido"],antecedente:["transición"],antecedenteDesc:"Sonó el timbre y se indicó cambiar de aula.",conducta:["se tapa oídos/ojos","busca aislamiento"],conductaDesc:"Se tapa ambos oídos y permanece junto a la pared durante aproximadamente 40 segundos.",duracionValor:40,duracionUnidad:"segundos",frecuencia:1,intensidad:3,riesgo:"leve",consecuencia:["descanso"],consecuenciaDesc:"Se permitió esperar en una zona tranquila antes de continuar.",hipotesis:["regulación sensorial/emocional","necesidad de predictibilidad/control"],apoyos:["ajuste sensorial","pausa/espacio tranquilo","anticipación"],apoyoValoracion:"Parcialmente",proxima:["anticipar transición","reducir estímulos"],proximaTexto:"Aviso visual antes del timbre.",inclusion:{entornoPredecible:"Parcial",infoAccesible:"Sí",tiempoProcesamiento:"Parcial",alternativaSensorial:"Sí",pudoPedir:"No",dignidad:"Sí",participacion:"Parcial",demandaAjustada:"Sí"}}];
 for(const x of a)await putRecord({...x,id:uid(),fechaHora:nowLocal(),grupo:"DEMO",profesional:"CT",contextoOtro:"",factoresOtro:"",antecedenteOtro:"",conductaOtro:"",consecuenciaOtro:"",hipotesisOtro:"",apoyosOtro:"",proximaOtro:"",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),demo:true,quick:false});toast("Datos DEMO añadidos")
}
function oldCount(rs){const r=prefs().retention;if(r==="manual"||!r)return 0;const cut=Date.now()-Number(r)*86400000;return rs.filter(x=>new Date(x.fechaHora).getTime()<cut).length}

async function renderExport(){
 const all=await allRecords();
 document.querySelector("#screen-export").innerHTML=`<div class="card screen-card">${screenCloseButton()}
   <h2>Informe / Exportar</h2>
   <p class="hint">Selecciona registros concretos o todos.</p>
   <div class="export-record-toolbar">
     <label class="checkline export-all"><input id="exportAllRecords" type="checkbox"><strong>Todos</strong></label>
     <label>Orden<select id="exportRecordOrder"><option value="recent">Más recientes primero</option><option value="oldest">Más antiguos primero</option></select></label>
   </div>
   <div class="export-record-picker-shell">
     <button id="exportPrevRecords" class="student-arrow" type="button" aria-label="Registros anteriores">↑</button>
     <div id="exportRecordPicker" class="export-record-picker"></div>
     <button id="exportNextRecords" class="student-arrow" type="button" aria-label="Registros siguientes">↓</button>
   </div>
   <div id="exportRecordSummary" class="student-selection-summary"></div>
   <div class="actions"><button id="exportCsvBtn">CSV</button><button id="exportPdfBtn">PDF</button><button id="exportDocxBtn">DOCX</button></div>
 </div>`;

 const PAGE=5; let page=0; let selected=new Set();
 const ordered=()=>[...all].sort((a,b)=>document.querySelector("#exportRecordOrder").value==="oldest"?new Date(a.fechaHora)-new Date(b.fechaHora):new Date(b.fechaHora)-new Date(a.fechaHora));
 const maxPage=()=>Math.max(0,Math.ceil(all.length/PAGE)-1);
 const summary=()=>document.querySelector("#exportRecordSummary").textContent=selected.size?`${selected.size} de ${all.length} registro(s) seleccionados`:"Ningún registro seleccionado";
 const renderPicker=()=>{
   const slice=ordered().slice(page*PAGE,page*PAGE+PAGE);
   document.querySelector("#exportRecordPicker").innerHTML=slice.length?slice.map(r=>`<label class="export-record-option"><input type="checkbox" value="${esc(r.id)}" ${selected.has(r.id)?"checked":""}><span><strong>${esc(r.codigo||"Sin código")}</strong><small>${esc(new Date(r.fechaHora).toLocaleString("es-ES"))}${r.demo?" · DEMO":""}</small></span></label>`).join(""):'<p class="hint">No hay registros.</p>';
   document.querySelectorAll("#exportRecordPicker input").forEach(ch=>ch.onchange=()=>{ch.checked?selected.add(ch.value):selected.delete(ch.value);document.querySelector("#exportAllRecords").checked=selected.size===all.length&&all.length>0;summary()});
   document.querySelector("#exportPrevRecords").disabled=page===0;
   document.querySelector("#exportNextRecords").disabled=page>=maxPage();
   summary();
 };
 document.querySelector("#exportPrevRecords").onclick=()=>{if(page>0){page--;renderPicker()}};
 document.querySelector("#exportNextRecords").onclick=()=>{if(page<maxPage()){page++;renderPicker()}};
 document.querySelector("#exportRecordOrder").onchange=()=>{page=0;renderPicker()};
 document.querySelector("#exportAllRecords").onchange=e=>{selected=e.target.checked?new Set(all.map(r=>r.id)):new Set();renderPicker()};
 const chosen=()=>ordered().filter(r=>selected.has(r.id));
 const need=()=>{const rs=chosen();if(!rs.length){toast("Selecciona al menos un registro");return null}return rs};
 document.querySelector("#exportCsvBtn").onclick=async()=>{const rs=need();if(rs)await reviewGate(async()=>exportStatsCSV(rs))};
 document.querySelector("#exportPdfBtn").onclick=async()=>{const rs=need();if(rs)await reviewGate(async()=>exportStatsPDF(rs,{charts:false,details:true,code:"seleccion"}))};
 document.querySelector("#exportDocxBtn").onclick=async()=>{const rs=need();if(rs)await reviewGate(async()=>exportStatsDOCX(rs,{charts:false,details:true,code:"seleccion"}))};
 renderPicker(); bindScreenClose(document.querySelector("#screen-export"));
}

async function navigate(dest){
 const protectedScreens=["form","quick","today","all","report","stats","settings"];
 const go=async()=>{if(dest==="reports"){openReportsChooser();return}if(dest==="importcsv"){openImportDialog();return}if(dest==="more"){renderMore();return}if(dest==="form"){await renderForm();show("form")}else if(dest==="quick"){renderQuick();show("quick")}else if(dest==="today"){await renderList("today");show("list")}else if(dest==="all"){await renderList("all");show("list")}else if(dest==="report"){selectedExportIds=[];await renderReport();show("report")}else if(dest==="stats"){await renderStats();show("stats")}else if(dest==="help"){renderHelp();show("help")}else if(dest==="privacy"){renderPrivacy();show("privacy")}else if(dest==="about"){renderAbout();show("about")}else if(dest==="settings"){await renderSettings();show("settings")}};
 if(protectedScreens.includes(dest))requirePin(go);else go()
}
document.addEventListener("DOMContentLoaded",async()=>{
 try{
   db=await openDB();

 document.querySelector("#confirmStudentExportBtn")?.addEventListener("click",async()=>{
   if(!pendingStudentExport)return;
   const opts={...pendingStudentExport.baseOpt,...readStudentExportOptions()};
   const {format,rs}=pendingStudentExport;
   document.querySelector("#studentExportOptionsDialog")?.close();
   pendingStudentExport=null;
   if(format==="pdf")await reviewGate(async()=>exportStatsPDF(rs,opts));
   if(format==="docx")await reviewGate(async()=>exportStatsDOCX(rs,opts));
   if(format==="xlsx")await reviewGate(async()=>exportStatsXlsx(rs,opts));
   if(format==="csv")await reviewGate(async()=>exportStatsCSV(rs));
 });


 document.querySelector("#confirmStatsExportBtn")?.addEventListener("click",async()=>{
   if(!pendingStatsExport)return;
   const opts={...pendingStatsExport.baseOpt,...readStatsExportOptions()};
   const {format,rs}=pendingStatsExport;
   document.querySelector("#statsExportOptionsDialog")?.close();
   pendingStatsExport=null;
   if(format==="pdf")await exportStatsPDF(rs,opts);
   if(format==="docx")await exportStatsDOCX(rs,opts);
   if(format==="xlsx")await exportStatsXlsx(rs,opts);
   if(format==="csv")await exportStatsCSV(rs);
 });

 }catch(err){
   console.error("No se pudo abrir el almacenamiento local:",err);
   const h=document.querySelector("#screen-home");
   if(h){
     h.innerHTML='<div class="card"><h2>Registro ACP Escolar</h2><p>No se pudo abrir el almacenamiento local.</p><button id="retryStorage">Reintentar</button></div>';
     show("home");
     document.querySelector("#retryStorage")?.addEventListener("click",()=>location.reload());
   }
   return;
 }

 document.addEventListener("submit",e=>{
   const form=e.target;
   if(!(form instanceof HTMLFormElement))return;
   if(!form.querySelector('[name="codigo"]'))return;
   if(!validateRequiredRecordFields(form)){
     e.preventDefault();e.stopImmediatePropagation();
   }
 },true);


 const gear=document.querySelector("#headerSettingsBtn"), menu=document.querySelector("#settingsMenu");
 gear?.addEventListener("click",e=>{
   e.stopPropagation();
   const open=!menu.classList.contains("hidden");
   menu.classList.toggle("hidden",open);
   gear.setAttribute("aria-expanded",String(!open));
 });
 document.addEventListener("click",e=>{
   if(menu && !menu.classList.contains("hidden") && !menu.contains(e.target) && e.target!==gear){
     menu.classList.add("hidden");gear?.setAttribute("aria-expanded","false");
   }
 });
 menu?.querySelectorAll("[data-menu-nav]").forEach(b=>b.addEventListener("click",()=>{
   menu.classList.add("hidden");gear?.setAttribute("aria-expanded","false");navigate(b.dataset.menuNav);
 }));
 document.querySelectorAll("[data-report-choice]").forEach(b=>b.addEventListener("click",()=>{
   document.querySelector("#reportsChooserDialog")?.close();
   if(b.dataset.reportChoice==="stats")navigate("stats");else navigate("report");
 }));

 
 window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstallPrompt=e;});
 window.addEventListener("appinstalled",()=>{deferredInstallPrompt=null;localStorage.setItem(PWA_FLAG,"1");toast("App instalada");refreshInstallUI();});
 window.addEventListener("pageshow",()=>{setTimeout(()=>ensureHomeVisible().catch(()=>{}),50)});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)setTimeout(()=>ensureHomeVisible().catch(()=>{}),50)});
  document.querySelector("#floatingHelpBtn")?.addEventListener("click",()=>quickHelp("Ayuda rápida",`<div class="mini-flow"><b>1</b><span>Nuevo registro</span><b>2</b><span>Anota hechos observables</span><b>3</b><span>Revisa patrones</span><b>4</b><span>Planifica apoyos</span></div><p class="hint">Pulsa los símbolos ? para aclaraciones concretas.</p>`));
 document.querySelector("#conceptHelpBtn")?.addEventListener("click",()=>quickHelp("Conceptos clave",`<div class="help-menu"><p><b>Antecedente</b><br><span>Qué ocurrió justo antes.</span></p><p><b>Conducta observada</b><br><span>Qué se vio u oyó.</span></p><p><b>Consecuencia</b><br><span>Qué ocurrió después.</span></p><p><b>Hipótesis funcional</b><br><span>Explicación provisional, no diagnóstico.</span></p></div>`));
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshInstallUI();});

 
 const codeDialog=document.querySelector("#codeManagerDialog");

 const newCodeCard=document.querySelector("#newCodeChoice");
 newCodeCard?.addEventListener("click",e=>{
   if(e.target.closest("input,button,select"))return;
   const r=codeDialog?.querySelector('input[name="codeChoice"][value="new"]');
   if(r){r.checked=true;r.dispatchEvent(new Event("change",{bubbles:true}))}
 });
 codeDialog?.querySelectorAll(".code-choice").forEach(card=>card.addEventListener("click",e=>{
   if(e.target.closest("select,input[type=text],button"))return;
   const r=card.querySelector('input[name="codeChoice"]');
   if(r){r.checked=true;r.dispatchEvent(new Event("change",{bubbles:true}))}
 }));

 const codeSave=document.querySelector("#saveCodeChoiceBtn");
 const codeExisting=document.querySelector("#existingCodeSelect");
 const codeCustom=document.querySelector("#customCodeInput");
 const codeWarning=document.querySelector("#customCodeWarning");

 async function refreshCodeChoiceState(){
   const choice=codeDialog?.querySelector('input[name="codeChoice"]:checked')?.value;
   let valid=false;
   if(choice==="new") valid=!!document.querySelector("#newCodePreview")?.textContent?.trim() && document.querySelector("#newCodePreview")?.textContent?.trim()!=="—";
   if(choice==="existing") valid=!!codeExisting?.value;
   if(choice==="custom"){
     const result=validateCustomCode(codeCustom?.value||"",await usedCodes());
     valid=result.problems.length===0 && !!result.code;
     if(codeWarning){
       codeWarning.textContent=result.problems.length?`⚠ ${result.problems.join(" · ")}`:"";
       codeWarning.classList.toggle("hidden",!result.problems.length);
     }
   }else if(codeWarning){
     codeWarning.textContent="";codeWarning.classList.add("hidden");
   }
   if(codeSave) codeSave.disabled=!valid;
 }

 codeDialog?.querySelectorAll('input[name="codeChoice"]').forEach(r=>r.addEventListener("change",refreshCodeChoiceState));
 codeExisting?.addEventListener("change",()=>{
   const r=codeDialog?.querySelector('input[name="codeChoice"][value="existing"]');if(r)r.checked=true;
   refreshCodeChoiceState();
 });
 codeCustom?.addEventListener("input",()=>{
   const r=codeDialog?.querySelector('input[name="codeChoice"][value="custom"]');if(r)r.checked=true;
   refreshCodeChoiceState();
 });

 codeSave?.addEventListener("click",async()=>{
   const choice=codeDialog?.querySelector('input[name="codeChoice"]:checked')?.value;
   const target=currentCodeTarget();
   if(!choice||!target)return;
   let code="";
   if(choice==="new"){
     code=document.querySelector("#newCodePreview")?.textContent?.trim()||"";
     if(!code||code==="—"){const codes=await usedCodes();code=nextMaskedCode(codes)}
   }
   if(choice==="existing") code=codeExisting?.value||"";
   if(choice==="custom"){
     const result=validateCustomCode(codeCustom?.value||"",await usedCodes());
     if(result.problems.length||!result.code){await refreshCodeChoiceState();return}
     if(!confirm("Confirma que este código no permite identificar directamente al alumnado y que su diseño ha sido autorizado por el centro cuando corresponda."))return;
     code=result.code;
   }
   if(!code)return;
   target.value=code; syncVisibleCodeInputs(code);
   codeDialog.close();
   toast(`Código ${code} aplicado`);
 });

 document.querySelector("#saveCenterCustomizeBtn")?.addEventListener("click",()=>{
   const prefix=normalizePrefix(document.querySelector("#codePrefixSetting").value);
   savePrefs({centerDisplayName:document.querySelector("#centerDisplayName").value.trim(),codePrefix:prefix,codeFormat:document.querySelector("#codeFormatSetting").value,centerLocalNote:document.querySelector("#centerLocalNote").value.trim()});
   document.querySelector("#centerCustomizeDialog").close();toast("Personalización guardada");
 });
 document.querySelector("#centerDocFile")?.addEventListener("change",async e=>{
   const file=e.target.files?.[0];if(!file)return;
   try{await putCenterDoc(file);toast("Documento guardado localmente");e.target.value=""; syncVisibleCodeInputs("");renderCenterDocs()}catch(err){alert(err.message==="TOO_LARGE"?"Máximo 5 MB por documento.":"No se pudo guardar el documento.")}
 });

 document.querySelector("#installNowBtn")?.addEventListener("click",e=>{e.preventDefault();triggerInstall();});

 let acpPendingImport=[];
 const acpFile=document.querySelector("#csvImportFile"),acpPrev=document.querySelector("#csvImportPreview"),acpCheck=document.querySelector("#csvImportConfirm"),acpBtn=document.querySelector("#csvImportBtn");
 acpFile?.addEventListener("change",async()=>{acpPendingImport=[];acpBtn.disabled=true;const f=acpFile.files?.[0];if(!f)return;try{acpPendingImport=await acpReadImport(f);acpPrev.innerHTML=`<div class="import-summary"><strong>${acpPendingImport.length}</strong> registros listos para importar.</div>`;acpPrev.classList.remove("hidden");acpBtn.disabled=!(acpCheck.checked&&acpPendingImport.length)}catch{acpPrev.innerHTML='<div class="risk">CSV no compatible.</div>';acpPrev.classList.remove("hidden")}});
 acpCheck?.addEventListener("change",()=>acpBtn.disabled=!(acpCheck.checked&&acpPendingImport.length));
 acpBtn?.addEventListener("click",async()=>{if(!acpCheck.checked||!acpPendingImport.length)return;const importResult=await importCsvRecordsWithConflictResolution(acpPendingImport);const n=acpPendingImport.length;acpPendingImport=[];document.querySelector("#importDialog")?.close();toast(`${n} registros importados`);renderHome();show("home")});

 
 document.querySelectorAll("[data-bottom-nav]").forEach(b=>b.addEventListener("click",async()=>{
  const d=b.dataset.bottomNav;
  if(d==="home"){await renderHome();show("home");return}
  if(d==="reports"){openReportsChooser();return}
  if(d==="csv"){
    openImportDialog();
    return;
  }
  if(d==="list"){await renderList("all");show("list");return}
  if(d==="form"){await renderForm();show("form");return}
  navigate(d);
}));
 document.querySelector("#reviewProceed").onclick=async e=>{if(!document.querySelector("#reviewConfirm").checked){e.preventDefault();return}const fn=pendingReviewAction;pendingReviewAction=null;setTimeout(async()=>{try{await fn?.()}catch(err){if(err.message!=="none"){console.error("Fallo de exportación",err?.name||"Error");alert("No se ha podido abrir el archivo para guardarlo o compartirlo. Cierra y vuelve a abrir la app; si persiste, revisaremos la integración nativa.")}}},0)};
 document.querySelector("#pinUnlockForm").onsubmit=async e=>{e.preventDefault();const p=prefs(),h=await hashPin(document.querySelector("#unlockPin").value,p.pinSalt);if(h!==p.pinHash){document.querySelector("#pinError").classList.remove("hidden");return}unlocked=true;document.querySelector("#pinDialog").close();pinNext?.();pinNext=null};
 
 document.addEventListener("keydown",e=>{
   if(e.key==="Escape"){
     const open=[...document.querySelectorAll("dialog[open]")].pop();
     if(open) open.close();
   }
 });

 if("serviceWorker" in navigator){
   const native=(()=>{try{return !!(window.Capacitor&&typeof window.Capacitor.getPlatform==="function"&&window.Capacitor.getPlatform()!=="web")}catch{return false}})();
   if(native){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});}
   else navigator.serviceWorker.register("./sw.js").catch(()=>{});
 }
 try{
   if(prefs().accepted && prefs().acceptedVersion===CONSENT_VERSION){await renderHome();show("home");setTimeout(()=>ensureHomeVisible().catch(()=>{}),80)}
   else{renderConsent();show("consent")}
 }catch(err){
   console.error("Inicio",err);
   const h=document.querySelector("#screen-home");
   h.innerHTML='<div class="card"><h2>Registro ACP Escolar</h2><p>No se pudo iniciar correctamente.</p><button id="retryHome">Reintentar</button></div>';
   show("home");
   document.querySelector("#retryHome")?.addEventListener("click",async()=>{await renderHome();show("home")});
 }
});
