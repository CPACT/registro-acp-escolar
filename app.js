
"use strict";
const DB_NAME="registro_acp_escolar_db", DB_VERSION=2, STORE="registros", DOC_STORE="documentosCentro";
const PREF="registro_acp_escolar_prefs";
let db=null, currentEditId=null, pendingReviewAction=null, listMode="all", unlocked=false;
let deferredInstallPrompt=null;
const PWA_FLAG="registro_acp_pwa_instalada";

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
function prefs(){try{return {...{accepted:false,retention:"30",rememberRecipient:false,recipient:"",pinEnabled:false,pinHash:"",pinSalt:"",codeFormat:"01A",codePrefix:"",centerDisplayName:"",centerLocalNote:""},...JSON.parse(localStorage.getItem(PREF)||"{}")}}catch{return {accepted:false}}}
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
async function putRecord(rec){return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(rec);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function getRecord(id){return new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function allRecords(){return new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>res(r.result.sort((a,b)=>(b.fechaHora||"").localeCompare(a.fechaHora||"")));r.onerror=()=>rej(r.error)})}
async function deleteRecord(id){return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
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
async function openCodeManager(targetInput){
  const d=document.querySelector("#codeManagerDialog");
  const sel=document.querySelector("#existingCodeSelect"), prev=document.querySelector("#newCodePreview");
  const codes=await usedCodes();
  sel.innerHTML='<option value="">Seleccionar…</option>'+codes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
  prev.value=nextMaskedCode(codes);
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
  if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(t)) hits.push("email");
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
  if(!prefs().accepted) return;
  const home=document.querySelector("#screen-home");
  const anyVisible=[...document.querySelectorAll(".screen")].some(s=>!s.classList.contains("hidden"));
  if(!anyVisible || !home || home.innerHTML.trim()===""){
    await renderHome();
    show("home");
  }
}


function screenCloseButton(){
  return `<button type="button" class="screen-close" aria-label="Cerrar" title="Cerrar">×</button>`;
}
function bindScreenClose(root){
  root?.querySelector(".screen-close")?.addEventListener("click",()=>{renderHome();show("home")});
}

function show(id){
 document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));
 const el=document.querySelector(`#screen-${id}`);el.classList.remove("hidden");el.scrollIntoView({block:"start"});document.querySelector("#main").focus();setTimeout(()=>{bindHelpButtons(el);attachPrivacyScanner(el);bindScreenClose(el)},0);setTimeout(()=>bindHelpButtons(el),0);
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
 document.querySelector("#screen-consent").innerHTML=`<div class="card hero"><h2>Uso responsable y privacidad</h2>
 <p>Esta aplicación está diseñada para funcionar con almacenamiento local en el dispositivo. No existe un servidor central que reciba automáticamente los registros.</p>
 <p>La persona usuaria es responsable de los datos que introduce, de la legitimidad de su tratamiento, de su confidencialidad, conservación, exportación, envío y eliminación, así como del cumplimiento de la normativa aplicable y de los protocolos de su centro o entidad.</p>
 <p>El autor de la aplicación no recibe, supervisa ni controla los datos introducidos localmente por las personas usuarias.</p>
 <p>La utilización de esta herramienta no exime a la persona usuaria de sus obligaciones profesionales, éticas, legales o institucionales.</p>
 <div class="warning"><strong>Utiliza códigos pseudónimos.</strong> No introduzcas nombres completos, DNI, direcciones, diagnósticos, información clínica ni otros datos identificativos innecesarios.</div>
 <p>Antes de exportar, compartir o enviar información, revisa cuidadosamente el contenido y las personas destinatarias.</p>
 <p>Los datos almacenados localmente pueden permanecer en este dispositivo hasta que sean eliminados. Si el dispositivo es compartido, utiliza las medidas de seguridad establecidas por tu centro y evita dejar información accesible a personas no autorizadas.</p>
 <p>Si utilizas esta herramienta en un centro educativo, verifica previamente que su uso esté autorizado por tu centro o Administración educativa y sigue sus normas, políticas de protección de datos, medidas de seguridad y procedimientos. La instalación de esta aplicación no constituye por sí misma una autorización institucional.</p>
 <label class="checkline"><input id="acceptUse" type="checkbox"> He leído y comprendo las condiciones de uso y privacidad.</label>
 <div class="actions"><button id="continueConsent" disabled>Continuar</button></div></div>`;
 document.querySelector("#acceptUse").addEventListener("change",e=>document.querySelector("#continueConsent").disabled=!e.target.checked);
 document.querySelector("#continueConsent").addEventListener("click",()=>{savePrefs({accepted:true,acceptedAt:new Date().toISOString()});renderHome();show("home")})
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

    <div class="home-utility-row">
      <button id="homeCsvImportBtn" class="utility-btn" type="button">↑ Importar CSV</button>
      <button id="howUseBtn" class="utility-btn subtle" type="button"><span class="help-mini">?</span> Cómo se usa</button>
    </div>

    <div class="install-card compact-install">
      <div class="install-icon">＋</div>
      <div><h3>Instalar app</h3><p>Acceso rápido desde este dispositivo.</p></div>
      <button id="homeInstallBtn" class="secondary" type="button">Instalar app</button>
    </div>`;

  el.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.nav)));
  el.querySelector("#homeReportsBtn")?.addEventListener("click",openReportsChooser);
  el.querySelector("#homeCsvImportBtn")?.addEventListener("click",openImportDialog);
  el.querySelector("#homeInstallBtn")?.addEventListener("click",openInstallHelp);
  el.querySelector("#howUseBtn")?.addEventListener("click",()=>quickHelp("Cómo se usa",`
    <div class="install-steps"><b>1</b><span><strong>Observa</strong>.</span><b>2</b><span><strong>Registra hechos</strong>.</span><b>3</b><span><strong>Revisa patrones</strong>.</span><b>4</b><span><strong>Planifica apoyos</strong>.</span></div>
    <p class="hint">Las hipótesis son provisionales y no son diagnósticos.</p>
  `));
  refreshInstallUI();bindHelpButtons(el);
}
function formTemplate(d={}){
 const inc=d.inclusion||{};
 return `<form id="recordForm">
 <div class="card screen-card">${screenCloseButton()}<div class="section-title-row"><h2>${currentEditId?"Editar registro":"Nuevo registro"}</h2>${currentEditId?"":'<button type="button" class="secondary small" id="importFromForm">Importar CSV</button>'}</div><p class="hint">Usa un código pseudónimo.</p>
 <div class="two"><label class="required">Fecha y hora<input name="fechaHora" type="datetime-local" required value="${esc(d.fechaHora||nowLocal())}"></label>
 <label class="required">Código pseudónimo
  <div class="code-row"><input name="codigo" required readonly aria-readonly="true" value="${esc(d.codigo||"")}"><button type="button" class="secondary code-pick" id="chooseCodeBtn">Elegir / crear</button></div>
  <span class="hint">No uses nombre, iniciales ni datos personales.</span>
</label>
 <label>Curso / grupo<input name="grupo" value="${esc(d.grupo||"")}"></label><label>Profesional que registra (iniciales o alias)<input name="profesional" value="${esc(d.profesional||"")}"></label></div></div>
 <div class="card"><h3>Contexto escolar <button type="button" class="help-dot" data-help-title="Contexto escolar" data-help-body="Selecciona dónde ocurrió la situación. Puedes marcar varias opciones.">?</button></h3>${chips("contexto",OPT.contexto,d.contexto||[],"contextoOtro",d.contextoOtro||"")}</div>
 <div class="card"><h3>Factores del entorno ${helpButton("Factores del entorno","Marca condiciones que pudieron influir: ruido, espera, cambios, comunicación, descanso, etc. No se usan para inferir diagnósticos.")}</h3>${chips("factores",OPT.factores,d.factores||[],"factoresOtro",d.factoresOtro||"")}
 <p class="hint">Observa barreras del entorno y necesidades de apoyo.</p><p class="hint"></p></div>
 <div class="card"><h3>Antecedente inmediato <button type="button" class="help-dot" data-help-title="Antecedente" data-help-body="Qué ocurrió justo antes. Describe hechos observables.">?</button></h3>${chips("antecedente",OPT.antecedente,d.antecedente||[],"antecedenteOtro",d.antecedenteOtro||"")}
 <label>Descripción objetiva del antecedente <button type="button" class="small secondary" data-help="ante">?</button><textarea name="antecedenteDesc">${esc(d.antecedenteDesc||"")}</textarea></label>
 <p class="hint">Describe hechos, no intenciones.</p></div>
 <div class="card"><h3>Conducta observada ${helpButton("Conducta observada","Describe lo que se vio u oyó. Ejemplo: “Golpeó la mesa tres veces”. Evita etiquetas como “se portó mal”.")}</h3>${chips("conducta",OPT.conducta,d.conducta||[],"conductaOtro",d.conductaOtro||"")}
 <label class="required">Descripción objetiva de la conducta<textarea name="conductaDesc" required>${esc(d.conductaDesc||"")}</textarea></label>
 <p class="hint">Describe hechos observables.</p>
 <div class="three"><label>Duración<input type="number" min="0" step="1" name="duracionValor" value="${esc(d.duracionValor||"")}"></label><label>Unidad<select name="duracionUnidad"><option>segundos</option><option ${d.duracionUnidad==="minutos"?"selected":""}>minutos</option></select></label><label>Frecuencia<input type="number" min="0" step="1" name="frecuencia" value="${esc(d.frecuencia||1)}"></label></div>
 <div class="actions"><button type="button" class="secondary small" id="timerStart">Iniciar cronómetro</button><button type="button" class="secondary small" id="timerStop" disabled>Detener</button><span id="timerDisplay" aria-live="polite"></span></div></div>
 <div class="card"><div class="two"><label>Intensidad (1–5)<select name="intensidad">${[1,2,3,4,5].map(n=>`<option ${String(d.intensidad||3)===String(n)?"selected":""}>${n}</option>`).join("")}</select></label>
 <label>Riesgo<select name="riesgo" id="riskSelect">${["sin riesgo","leve","moderado","alto"].map(x=>`<option ${d.riesgo===x?"selected":""}>${x}</option>`).join("")}</select></label></div>
 <p class="hint">1 — Muy baja: apenas interfiere. 2 — Baja. 3 — Moderada. 4 — Alta. 5 — Muy alta. Describe el episodio, no a la persona.</p>
 <div id="highRisk" class="risk ${d.riesgo==="alto"?"":"hidden"}">Prioriza la seguridad, la dignidad y los protocolos establecidos por el centro. Esta aplicación no es una guía de intervención de emergencia.</div></div>
 <div class="card"><h3>Consecuencia ${helpButton("Consecuencia","¿Qué ocurrió inmediatamente después? No significa premio, castigo ni causa.")}</h3>${chips("consecuencia",OPT.consecuencia,d.consecuencia||[],"consecuenciaOtro",d.consecuenciaOtro||"")}
 <label>Descripción adicional<textarea name="consecuenciaDesc">${esc(d.consecuenciaDesc||"")}</textarea></label><p class="hint">Qué ocurrió después.</p></div>
 <div class="card"><h3>Hipótesis provisional <button type="button" class="help-dot" data-help-title="Hipótesis, no diagnóstico" data-help-body="Es una explicación provisional. Necesita varios registros y revisión en equipo.">?</button></h3><div class="warning"><strong>Hipótesis funcional provisional:</strong> requiere varios registros, análisis de patrones y revisión en equipo.</div>${chips("hipotesis",OPT.hipotesis,d.hipotesis||[],"hipotesisOtro",d.hipotesisOtro||"")}
 <p class="hint">Hipótesis provisional.</p></div>
 <div class="card"><h3>Apoyos aplicados ${helpButton("Apoyos","Registra los apoyos utilizados y si pareció que ayudaron. Esto no demuestra causalidad.")}</h3>${chips("apoyos",OPT.apoyos,d.apoyos||[],"apoyosOtro",d.apoyosOtro||"")}
 <label>¿Pareció ayudar?<select name="apoyoValoracion"><option></option>${["Sí","Parcialmente","No","No valorable"].map(x=>`<option ${d.apoyoValoracion===x?"selected":""}>${x}</option>`).join("")}</select></label><p class="hint">No demuestra causalidad.</p></div>
 <div class="card"><h3>Próxima vez <button type="button" class="help-dot" data-help-title="Próxima vez" data-help-body="Anota ajustes o apoyos que conviene probar en una situación similar.">?</button></h3>${chips("proxima",OPT.proxima,d.proxima||[],"proximaOtro",d.proximaOtro||"")}<label>Nota breve<textarea name="proximaTexto">${esc(d.proximaTexto||"")}</textarea></label></div>
 <div class="card"><h3>Inclusión y contexto <button type="button" class="help-dot" data-help-title="Inclusión y contexto" data-help-body="Revisa accesibilidad, participación, predictibilidad, comunicación y dignidad. No evalúa a la persona.">?</button></h3><p>Revisa el entorno y los apoyos.</p><div class="two">${inclusionFields(inc)}</div></div>
 <div class="card actions"><button type="submit">${currentEditId?"Guardar cambios":"Guardar registro"}</button><button type="button" class="secondary" id="cancelForm">Cancelar</button></div></form>`;
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
 currentEditId=data?.id||null;document.querySelector("#screen-form").innerHTML=formTemplate(data||{});bindSpec(document.querySelector("#screen-form"));
 const f=document.querySelector("#recordForm");document.querySelector("#chooseCodeBtn")?.addEventListener("click",()=>openCodeManager(f.elements.codigo));attachPrivacyScanner(f);document.querySelector("#importFromForm")?.addEventListener("click",openImportDialog);bindHelpButtons(document.querySelector("#recordForm"));document.querySelector("#cancelForm").onclick=()=>{currentEditId=null;renderHome();show("home")};
 document.querySelector("#riskSelect").onchange=e=>document.querySelector("#highRisk").classList.toggle("hidden",e.target.value!=="alto");
 document.querySelectorAll("[data-help=ante]").forEach(b=>b.onclick=()=>alert("Registra lo que ocurrió inmediatamente antes utilizando hechos observables y evitando interpretar intenciones."));
 let start=0,tick=null;const disp=document.querySelector("#timerDisplay");
 document.querySelector("#timerStart").onclick=()=>{start=Date.now();document.querySelector("#timerStart").disabled=true;document.querySelector("#timerStop").disabled=false;tick=setInterval(()=>disp.textContent=`${Math.floor((Date.now()-start)/1000)} s`,1000)};
 document.querySelector("#timerStop").onclick=()=>{clearInterval(tick);const secs=Math.max(1,Math.floor((Date.now()-start)/1000));f.elements.duracionValor.value=secs;f.elements.duracionUnidad.value="segundos";disp.textContent=`${secs} s`;document.querySelector("#timerStart").disabled=false;document.querySelector("#timerStop").disabled=true};
 f.onsubmit=async e=>{e.preventDefault();const base=currentEditId?await getRecord(currentEditId):{};const rec=recordFromForm(f,base);await putRecord(rec);currentEditId=null;toast("Registro guardado");await renderList("all");show("list")}
}
function quickTemplate(d={}){
 return `<form id="quickForm"><div class="card screen-card">${screenCloseButton()}<h2>Registro rápido</h2><div class="two"><label class="required">Código pseudónimo<div class="code-row"><input name="codigo" required readonly value="${esc(d.codigo||"")}"><button type="button" id="quickChooseCodeBtn" class="secondary">Elegir / crear</button></div></label><label>Fecha y hora<input type="datetime-local" name="fechaHora" value="${esc(d.fechaHora||nowLocal())}"></label></div>
 <h3>Contexto</h3>${chips("contexto",OPT.contexto,d.contexto||[],"contextoOtro",d.contextoOtro||"")}<h3>Antecedente</h3>${chips("antecedente",OPT.antecedente,d.antecedente||[],"antecedenteOtro",d.antecedenteOtro||"")}
 <h3>Conducta</h3>${chips("conducta",OPT.conducta,d.conducta||[],"conductaOtro",d.conductaOtro||"")}<label class="required">Descripción objetiva breve<textarea name="conductaDesc" required>${esc(d.conductaDesc||"")}</textarea></label>
 <h3>Consecuencia ${helpButton("Consecuencia","¿Qué ocurrió inmediatamente después? No significa premio, castigo ni causa.")}</h3>${chips("consecuencia",OPT.consecuencia,d.consecuencia||[],"consecuenciaOtro",d.consecuenciaOtro||"")}
 <div class="two"><label>Intensidad<select name="intensidad">${[1,2,3,4,5].map(n=>`<option ${n===3?"selected":""}>${n}</option>`).join("")}</select></label><label>Riesgo<select name="riesgo">${["sin riesgo","leve","moderado","alto"].map(x=>`<option>${x}</option>`).join("")}</select></label></div>
 <div class="actions"><button>Guardar registro rápido</button><button type="button" id="quickComplete" class="secondary">Completar detalles</button><button type="button" id="quickCancel" class="secondary">Cancelar</button></div></div></form>`;
}
function quickToRecord(form){
 const fd=new FormData(form);return {id:uid(),fechaHora:one(fd,"fechaHora"),codigo:one(fd,"codigo"),grupo:"",profesional:"",contexto:arrayVal(fd,"contexto"),contextoOtro:one(fd,"contextoOtro"),factores:[],factoresOtro:"",
 antecedente:arrayVal(fd,"antecedente"),antecedenteOtro:one(fd,"antecedenteOtro"),antecedenteDesc:"",conducta:arrayVal(fd,"conducta"),conductaOtro:one(fd,"conductaOtro"),conductaDesc:one(fd,"conductaDesc"),duracionValor:0,duracionUnidad:"segundos",frecuencia:1,intensidad:Number(one(fd,"intensidad")),riesgo:one(fd,"riesgo"),consecuencia:arrayVal(fd,"consecuencia"),consecuenciaOtro:one(fd,"consecuenciaOtro"),consecuenciaDesc:"",hipotesis:[],hipotesisOtro:"",apoyos:[],apoyosOtro:"",apoyoValoracion:"",proxima:[],proximaOtro:"",proximaTexto:"",inclusion:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),demo:false,quick:true}
}
function renderQuick(){
 document.querySelector("#screen-quick").innerHTML=quickTemplate();bindSpec(document.querySelector("#screen-quick"));const f=document.querySelector("#quickForm");document.querySelector("#quickChooseCodeBtn")?.addEventListener("click",()=>openCodeManager(f.elements.codigo));attachPrivacyScanner(f);
 document.querySelector("#quickCancel").onclick=()=>{renderHome();show("home")};
 f.onsubmit=async e=>{e.preventDefault();const r=quickToRecord(f);await putRecord(r);toast("Guardado");renderList("today");show("list")};
 document.querySelector("#quickComplete").onclick=async()=>{if(!f.reportValidity())return;const r=quickToRecord(f);currentEditId=null;await renderForm(r);show("form")}
}
function summaryRecord(r){
 return `<div class="record" data-id="${esc(r.id)}"><div class="record-head"><div><h3>${esc(r.codigo)} ${r.demo?'<span class="badge demo">DEMO</span>':""}</h3><div class="meta">${esc(new Date(r.fechaHora).toLocaleString("es-ES"))} · ${esc(selectedFirst(r.contexto))}</div></div><span class="badge ${r.riesgo==="alto"?"high":""}">${esc(r.riesgo||"sin riesgo")}</span></div>
 <p><strong>Conducta:</strong> ${esc(selectedFirst(r.conducta))} · Intensidad ${esc(r.intensidad)}</p><p class="hint">${esc(r.conductaDesc||"")}</p>
 <label class="checkline"><input type="checkbox" class="select-record" value="${esc(r.id)}"> Seleccionar</label>
 <div class="actions"><button class="small" data-act="view">Ver</button><button class="small secondary" data-act="edit">Editar</button><button class="small secondary" data-act="dup">Duplicar</button><button class="small danger" data-act="delete">Eliminar</button><button class="small secondary" data-act="export">Exportar</button></div></div>`;
}
async function renderList(mode="all"){
 listMode=mode;let rs=await allRecords(),today=new Date().toISOString().slice(0,10);if(mode==="today")rs=rs.filter(r=>dateOnly(r.fechaHora)===today);
 document.querySelector("#screen-list").innerHTML=`<div class="card"><h2>${mode==="today"?"Registros de hoy":"Todos los registros"}</h2>
 <details class="filter-panel"><summary>Filtrar registros</summary><div class="toolbar"><div><label>Código<input id="fCode"></label></div><div><label>Contexto<select id="fContext"><option value="">Todos</option>${OPT.contexto.map(x=>`<option>${x}</option>`).join("")}</select></label></div><div><label>Riesgo<select id="fRisk"><option value="">Todos</option>${["sin riesgo","leve","moderado","alto"].map(x=>`<option>${x}</option>`).join("")}</select></label></div><div><label>Conducta<select id="fBehavior"><option value="">Todas</option>${OPT.conducta.map(x=>`<option>${x}</option>`).join("")}</select></label></div><div><label>Desde<input id="fFrom" type="date"></label></div><div><label>Hasta<input id="fTo" type="date"></label></div><button id="applyFilters" class="secondary">Filtrar</button></div>
 <div class="actions"><button id="deleteSelected" class="danger">Borrar registros seleccionados</button><button id="deleteDemo" class="secondary">Eliminar datos DEMO</button></div></div>
 <div id="recordList">${rs.length?rs.map(summaryRecord).join(""):'<div class="card"><p>No hay registros.</p></div>'}</div>`;
 const refresh=async()=>{let a=await allRecords();if(mode==="today")a=a.filter(r=>dateOnly(r.fechaHora)===today);const code=document.querySelector("#fCode").value.trim().toLowerCase(),ctx=document.querySelector("#fContext").value,risk=document.querySelector("#fRisk").value,bh=document.querySelector("#fBehavior").value,fr=document.querySelector("#fFrom").value,to=document.querySelector("#fTo").value;a=a.filter(r=>(!code||r.codigo.toLowerCase().includes(code))&&(!ctx||r.contexto.includes(ctx))&&(!risk||r.riesgo===risk)&&(!bh||r.conducta.includes(bh))&&(!fr||dateOnly(r.fechaHora)>=fr)&&(!to||dateOnly(r.fechaHora)<=to));document.querySelector("#recordList").innerHTML=a.length?a.map(summaryRecord).join(""):"<div class=card><p>No hay resultados.</p></div>";bindRecordActions()};
 document.querySelector("#applyFilters").onclick=refresh;
 function bindRecordActions(){document.querySelectorAll(".record [data-act]").forEach(b=>b.onclick=async()=>{const id=b.closest(".record").dataset.id,act=b.dataset.act,r=await getRecord(id);if(act==="view")viewRecord(r);if(act==="edit"){await renderForm(r);show("form")}if(act==="dup"){const copy=structuredClone(r);copy.id=uid();copy.fechaHora=nowLocal();copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;await putRecord(copy);toast("Registro duplicado");renderList(mode)}if(act==="delete"&&confirm("¿Quieres eliminar este registro almacenado en este dispositivo?")){await deleteRecord(id);toast("Registro eliminado");renderList(mode)}if(act==="export"){selectedExportIds=[id];await renderReport();show("report")}})}
 bindRecordActions();
 document.querySelector("#deleteSelected").onclick=async()=>{const ids=[...document.querySelectorAll(".select-record:checked")].map(x=>x.value);if(!ids.length)return toast("Selecciona al menos un registro");if(confirm(`¿Eliminar ${ids.length} registro(s) seleccionado(s)?`)){for(const id of ids)await deleteRecord(id);toast("Registros eliminados");renderList(mode)}};
 document.querySelector("#deleteDemo").onclick=async()=>{const all=await allRecords(),d=all.filter(r=>r.demo);if(!d.length)return toast("No hay datos DEMO");if(confirm(`¿Eliminar ${d.length} registro(s) DEMO?`)){for(const r of d)await deleteRecord(r.id);toast("Datos DEMO eliminados");renderList(mode)}};
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
async function renderReport(){
 const rs=await allRecords();document.querySelector("#screen-report").innerHTML=`<div class=card><h2>Informe / Exportar</h2><p>Selecciona uno o varios registros. Todas las operaciones se inician de forma deliberada por la persona usuaria.</p>
 <div id=exportChoices>${rs.length?rs.map(r=>`<label class=checkline><input class=export-choice type=checkbox value="${esc(r.id)}" ${selectedExportIds.includes(r.id)?"checked":""}> ${esc(r.codigo)} — ${esc(new Date(r.fechaHora).toLocaleString("es-ES"))} ${r.demo?"(DEMO)":""}</label>`).join(""):"<p>No hay registros.</p>"}</div>
 <div class=actions><button id=csvBtn>CSV</button><button id=pdfBtn>PDF</button><button id=docxBtn>DOCX</button><button id=mailBtn>Correo</button></div></div>`;
 const ids=()=>[...document.querySelectorAll(".export-choice:checked")].map(x=>x.value);
 document.querySelector("#csvBtn").onclick=()=>reviewGate(async()=>exportCSV(await recordsByIds(ids())));
 document.querySelector("#pdfBtn").onclick=()=>reviewGate(async()=>generatePDF(await recordsByIds(ids())));
 document.querySelector("#docxBtn").onclick=()=>reviewGate(async()=>exportRecordsDOCX(await recordsByIds(ids())));
 document.querySelector("#mailBtn").onclick=()=>reviewGate(async()=>prepareMail(await recordsByIds(ids())));
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
  return {id:uid(),demo:String(o.demo||"").toUpperCase()==="DEMO",fechaHora:o.fechaHora||nowLocal(),codigo:String(o.codigo||"").trim(),
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
 const out={id:r.id,demo:r.demo?"DEMO":"",fechaHora:r.fechaHora,codigo:r.codigo,grupo:r.grupo||"",profesional:r.profesional||"",contexto:val(r.contexto),contextoEspecificar:r.contextoOtro||"",factoresEntorno:val(r.factores),factoresEspecificar:r.factoresOtro||"",antecedente:val(r.antecedente),antecedenteEspecificar:r.antecedenteOtro||"",antecedenteDescripcion:r.antecedenteDesc||"",conductaObservada:val(r.conducta),conductaEspecificar:r.conductaOtro||"",conductaDescripcion:r.conductaDesc||"",duracionValor:r.duracionValor??"",duracionUnidad:r.duracionUnidad||"",frecuencia:r.frecuencia??"",intensidad:r.intensidad??"",riesgo:r.riesgo||"",consecuencia:val(r.consecuencia),consecuenciaEspecificar:r.consecuenciaOtro||"",consecuenciaDescripcion:r.consecuenciaDesc||"",hipotesisFuncionalProvisional:val(r.hipotesis),hipotesisEspecificar:r.hipotesisOtro||"",apoyosAplicados:val(r.apoyos),apoyosEspecificar:r.apoyosOtro||"",parecioAyudar:r.apoyoValoracion||"",proximaVez:val(r.proxima),proximaEspecificar:r.proximaOtro||"",proximaNota:r.proximaTexto||""};
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
  const canvas=document.createElement("canvas");canvas.width=1000;canvas.height=500;const ctx=canvas.getContext("2d");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,1000,500);ctx.fillStyle="#1f4f41";ctx.font="bold 30px system-ui";ctx.fillText(title,35,45);
  const entries=Object.entries(data).sort((a,b)=>b[1]-a[1]).slice(0,8),palette=["#2d6a58","#5a927e","#8bb6a6","#c5ded4","#496d9b","#8b78a5","#ba8b5b","#a75f5f"];
  if(kind==="pie"){
    const total=entries.reduce((s,x)=>s+x[1],0)||1;let ang=-Math.PI/2;
    entries.forEach(([k,v],i)=>{const a2=ang+Math.PI*2*v/total;ctx.beginPath();ctx.moveTo(270,270);ctx.arc(270,270,170,ang,a2);ctx.closePath();ctx.fillStyle=palette[i%palette.length];ctx.fill();ang=a2});
    ctx.font="20px system-ui";entries.forEach(([k,v],i)=>{ctx.fillStyle=palette[i%palette.length];ctx.fillRect(520,90+i*43,22,22);ctx.fillStyle="#263b35";ctx.fillText(`${k}: ${v}`,555,108+i*43)});
  }else{
    const max=Math.max(...entries.map(x=>x[1]),1),baseY=440,left=200,barH=36,gap=12,plotW=740;
    ctx.font="18px system-ui";entries.forEach(([k,v],i)=>{const y=80+i*(barH+gap);ctx.fillStyle="#263b35";ctx.textAlign="right";ctx.fillText(k.slice(0,22),left-12,y+25);ctx.fillStyle=palette[i%palette.length];ctx.fillRect(left,y,plotW*v/max,barH);ctx.textAlign="left";ctx.fillStyle="#263b35";ctx.fillText(String(v),left+plotW*v/max+10,y+25)});
  }
  return new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error("PNG")),"image/png"))
}
function countField(rs,field){
  const m={};for(const r of rs){const vals=Array.isArray(r[field])?r[field]:[r[field]];for(const v of vals.filter(v=>v!==""&&v!=null))m[String(v)]=(m[String(v)]||0)+1}return m
}
function statsData(rs){
  const durations=rs.filter(r=>Number(r.duracionValor)>0).map(r=>r.duracionUnidad==="minutos"?Number(r.duracionValor)*60:Number(r.duracionValor));
  const help=rs.filter(r=>r.apoyoValoracion),yes=help.filter(r=>r.apoyoValoracion==="Sí").length,part=help.filter(r=>r.apoyoValoracion==="Parcialmente").length;
  return {
    total:rs.length,codes:countField(rs,"codigo"),contexto:countField(rs,"contexto"),conducta:countField(rs,"conducta"),antecedente:countField(rs,"antecedente"),consecuencia:countField(rs,"consecuencia"),
    intensidad:countField(rs,"intensidad"),riesgo:countField(rs,"riesgo"),hipotesis:countField(rs,"hipotesis"),apoyos:countField(rs,"apoyos"),
    avgDuration:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):0,
    helpYes:help.length?Math.round(yes/help.length*100):0,helpSome:help.length?Math.round((yes+part)/help.length*100):0
  }
}
function humanRows(map,limit=20){return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,limit)}
async function buildStatsDocx(rs,opt={}){
  const s=statsData(rs),images=[],rels=[];let imageXml="";
  if(opt.charts){
    const bar=await canvasPng("bar","Conductas más registradas",s.conducta),pie=await canvasPng("pie","Distribución de riesgos",s.riesgo);
    images.push({name:"word/media/bar.png",data:await blobBytes(bar)},{name:"word/media/risk.png",data:await blobBytes(pie)});
    rels.push(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/bar.png"/>`,`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/risk.png"/>`);
    imageXml=docxImageDrawing("rId1","Conductas")+docxImageDrawing("rId2","Riesgos");
  }
  const codeLabel=opt.code&&opt.code!=="all"?opt.code:"Todos los códigos";
  let body=docxP("REGISTRO ACP ESCOLAR",{bold:true,size:32,color:"1F4F41"})+docxP("Patrones descriptivos",{bold:true,size:26})+docxP(`Ámbito: ${codeLabel} · Registros: ${rs.length}`,{size:20})+
    docxP("Las frecuencias y correlaciones observadas no demuestran por sí mismas la función de una conducta.",{size:18,color:"7A5A22"})+
    docxTable([["Indicador","Valor"],["Registros",String(s.total)],["Duración media",`${s.avgDuration} s`],["Pareció ayudar — Sí",`${s.helpYes}%`],["Sí o parcialmente",`${s.helpSome}%`]])+
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
  const summary=[["REGISTRO ACP ESCOLAR — Patrones descriptivos",""],["Registros",s.total],["Duración media (s)",s.avgDuration],["Pareció ayudar — Sí (%)",s.helpYes],["Sí o parcialmente (%)",s.helpSome],["",""],["Código pseudónimo","Registros"],...humanRows(s.codes),["",""],["Conducta","Frecuencia"],...humanRows(s.conducta),["",""],["Contexto","Frecuencia"],...humanRows(s.contexto),["",""],["Riesgo","Frecuencia"],...humanRows(s.riesgo)];
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
function statsPdfSafe(s){return pdfSafe(s)}
function buildStatsPDF(rs,opt={}){
  const W=595,H=842,M=40,CW=W-2*M,s=statsData(rs),brand=[45,106,88],textc=[31,47,42],muted=[91,111,103],line=[218,229,224],pal=[[45,106,88],[92,150,127],[137,184,166],[80,115,157],[156,112,168],[183,126,80],[173,88,88]];
  let pages=[],ops=[],y=H-M,pn=0;const cmd=x=>ops.push(x),fill=c=>cmd(`${rgb(c)} rg`),stroke=c=>cmd(`${rgb(c)} RG`);
  function t(x,yy,txt,sz=9,b=false,c=textc){fill(c);cmd(`BT /${b?'F2':'F1'} ${sz} Tf ${x} ${yy} Td (${statsPdfSafe(txt)}) Tj ET`)}
  function rect(x,yy,w,h,c){fill(c);cmd(`${x} ${yy} ${w} ${h} re f`)}
  function page(){if(ops.length)pages.push(ops.join("\n"));ops=[];pn++;rect(0,H-84,W,84,[31,79,65]);t(M,H-42,"REGISTRO ACP ESCOLAR",18,true,[255,255,255]);t(M,H-63,"Patrones descriptivos",10,false,[225,240,234]);t(W-M-70,H-42,`Página ${pn}`,8,false,[225,240,234]);y=H-108}
  function need(h){if(y-h<70)page()}
  function heading(x){need(34);rect(M,y-24,CW,28,[235,245,241]);t(M+10,y-17,x,11,true,[31,79,65]);y-=38}
  function table(title,map){heading(title);const rows=humanRows(map,10),max=rows[0]?.[1]||1;for(const [k,v] of rows){need(24);t(M,y,k.slice(0,34),8.5,false,textc);rect(M+190,y-8,Math.max(2,(CW-250)*v/max),10,brand);t(W-M-42,y,String(v),8.5,true,textc);y-=22}}
  page();t(M,y,`Ámbito: ${opt.code&&opt.code!=="all"?opt.code:"Todos los códigos"} · ${rs.length} registros`,10,true,textc);y-=22;t(M,y,`Duración media: ${s.avgDuration} s · Pareció ayudar: ${s.helpYes}%`,9,false,muted);y-=28;
  if(opt.charts){table("Conductas más registradas",s.conducta);table("Contextos",s.contexto);heading("Distribución de riesgos");const entries=humanRows(s.riesgo,6),total=entries.reduce((a,b)=>a+b[1],0)||1;let ang=0,cx=M+125,cy=y-120,R=80;entries.forEach(([k,v],i)=>{const a2=ang+Math.PI*2*v/total,pts=[[cx,cy]];for(let st=0;st<=18;st++){const a=ang+(a2-ang)*st/18;pts.push([cx+Math.cos(a)*R,cy+Math.sin(a)*R])}fill(pal[i%pal.length]);cmd(`${pts[0][0]} ${pts[0][1]} m ${pts.slice(1).map(p=>`${p[0].toFixed(1)} ${p[1].toFixed(1)} l`).join(" ")} h f`);ang=a2});entries.forEach(([k,v],i)=>{rect(M+255,y-55-i*24,12,12,pal[i%pal.length]);t(M+274,y-51-i*24,`${k}: ${v}`,8.5,false,textc)});y-=190}
  heading("Registros por código pseudónimo");for(const [k,v] of humanRows(s.codes,30)){need(20);t(M,y,k,9,true,textc);t(M+150,y,String(v),9,false,textc);y-=18}
  if(opt.details){heading("Detalle de registros");for(const r of rs){need(42);t(M,y,`${r.codigo} · ${new Date(r.fechaHora).toLocaleDateString("es-ES")} · ${r.riesgo||"—"}`,8.5,true,textc);t(M,y-14,`Contexto: ${(r.contexto||[]).join(", ").slice(0,72)}`,7.8,false,muted);t(M,y-27,`Conducta: ${(r.conducta||[]).join(", ").slice(0,72)}`,7.8,false,muted);y-=42}}
  t(M,38,"Autor: Carlos Tejero · CC BY-NC-SA 4.0 · Datos locales. No diagnóstico.",7.2,false,muted);
  if(ops.length)pages.push(ops.join("\n"));
  let objs=[];const add=o=>{objs.push(o);return objs.length},f1=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),f2=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');let pids=[];for(const ps of pages){const cid=add(`<< /Length ${ps.length} >>\nstream\n${ps}\nendstream`),pid=add("PENDING");pids.push({pid,cid})}const pagesId=add("PAGES");for(const p of pids)objs[p.pid-1]=`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${p.cid} 0 R >>`;objs[pagesId-1]=`<< /Type /Pages /Kids [${pids.map(p=>`${p.pid} 0 R`).join(" ")}] /Count ${pids.length} >>`;const catalog=add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);let pdf="%PDF-1.4\n",offs=[0];for(let i=0;i<objs.length;i++){offs.push(pdf.length);pdf+=`${i+1} 0 obj\n${objs[i]}\nendobj\n`}const x=pdf.length;pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offs.length;i++)pdf+=`${String(offs[i]).padStart(10,"0")} 00000 n \n`;pdf+=`trailer\n<< /Size ${objs.length+1} /Root ${catalog} 0 R >>\nstartxref\n${x}\n%%EOF`;return new Blob([new TextEncoder().encode(pdf)],{type:"application/pdf"})
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
function mailRecordText(r){const list=(a,o)=>`${(a||[]).join(', ')||'—'}${o?` · Especificar: ${o}`:''}`;return [`Código pseudónimo: ${r.codigo}${r.demo?' (DEMO)':''}`,`Fecha/hora: ${new Date(r.fechaHora).toLocaleString('es-ES')}`,`Curso/grupo: ${r.grupo||'—'}`,`Profesional/alias: ${r.profesional||'—'}`,`Contexto: ${list(r.contexto,r.contextoOtro)}`,`Factores del entorno: ${list(r.factores,r.factoresOtro)}`,`Antecedente: ${list(r.antecedente,r.antecedenteOtro)}`,`Descripción del antecedente: ${r.antecedenteDesc||'—'}`,`Conducta observada: ${list(r.conducta,r.conductaOtro)}`,`Descripción objetiva: ${r.conductaDesc||'—'}`,`Duración: ${r.duracionValor||0} ${r.duracionUnidad||''}`,`Frecuencia: ${r.frecuencia??'—'}`,`Intensidad: ${r.intensidad??'—'}`,`Riesgo: ${r.riesgo||'—'}`,`Consecuencia: ${list(r.consecuencia,r.consecuenciaOtro)}`,`Descripción consecuencia: ${r.consecuenciaDesc||'—'}`,`HIPÓTESIS FUNCIONAL PROVISIONAL — NO DIAGNÓSTICO: ${list(r.hipotesis,r.hipotesisOtro)}`,`Apoyos aplicados: ${list(r.apoyos,r.apoyosOtro)}`,`¿Pareció ayudar?: ${r.apoyoValoracion||'—'} (no demuestra causalidad)`,`Qué probar la próxima vez: ${list(r.proxima,r.proximaOtro)}`,`Nota próxima vez: ${r.proximaTexto||'—'}`,'Indicadores de inclusión:',...INCLUSION.map(k=>`- ${INCLUSION_LABELS[k]} ${r.inclusion?.[k]||'—'}`)].join('\n')}
async function prepareMail(rs){
 const p=prefs(),recipient=prompt("Destinatario",p.rememberRecipient?p.recipient:"")||"";if(!recipient)return;
 const ok=confirm("Antes de continuar: utiliza únicamente un destinatario y un canal de correo autorizados por tu centro o Administración para este tipo de información. ¿Confirmas que has revisado el destinatario y que el canal es adecuado?");if(!ok)return;
 const remember=confirm("¿Recordar este destinatario en este dispositivo? Si el dispositivo es compartido, se recomienda NO guardarlo.");if(remember)savePrefs({rememberRecipient:true,recipient});
 const body=["REGISTRO ACP ESCOLAR","Observar · Comprender · Prevenir · Apoyar","",...rs.map(mailRecordText),"","HIPÓTESIS FUNCIONALES PROVISIONALES — NO DIAGNÓSTICO","La interpretación y uso de estos datos corresponde a la persona usuaria y al equipo profesional responsable.","Antes de reenviar o conservar este mensaje, aplica las políticas de protección de datos y seguridad de tu centro o Administración.","","Autor: Carlos Tejero · CC BY-NC-SA 4.0 · Proyecto desarrollado con apoyo de ChatGPT"].join("\n\n");
 alert("Al continuar, el contenido pasa al cliente de correo seleccionado. Registro ACP Escolar no envía el mensaje automáticamente. Desde ese momento la protección depende también del servicio y de las medidas organizativas aplicables.");location.href=`mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent("Registro ACP Escolar — información pseudonimizada")}&body=${encodeURIComponent(body)}`
}

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

async function renderStats(){
 const all=await allRecords(),codes=[...new Set(all.map(r=>r.codigo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
 document.querySelector("#screen-stats").innerHTML=`<div class="card screen-card">${screenCloseButton()}<h2>Patrones descriptivos</h2>
 <p class="hint">Resumen local. No demuestra la función de una conducta ni realiza diagnósticos.</p>
 <details class="filter-panel"><summary>Filtros y opciones</summary><div class="stats-controls">
   <label>Código pseudónimo<select id="statsCode"><option value="all">Todos</option>${codes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select></label>
   <label>Desde<input id="statsFrom" type="date"></label>
   <label>Hasta<input id="statsTo" type="date"></label>
   <label class="checkline"><input id="statsCharts" type="checkbox" checked> Incluir gráficos</label>
   <label class="checkline"><input id="statsDetails" type="checkbox"> Incluir detalle de registros</label>
   <button id="statsApply" type="button">Aplicar</button>
 </div>
 </div></details><div id="statsSummary"></div>
 <div class="actions stats-export"><button id="statsPdf">PDF</button><button id="statsDocx">DOCX</button><button id="statsXlsx">XLSX</button><button id="statsCsv">CSV</button></div>
 </div>`;
 const state=()=>({code:document.querySelector("#statsCode").value,from:document.querySelector("#statsFrom").value,to:document.querySelector("#statsTo").value,charts:document.querySelector("#statsCharts").checked,details:document.querySelector("#statsDetails").checked});
 const current=()=>statsFilterRecords(all,state());
 const draw=()=>{const rs=current(),s=statsData(rs),charts=state().charts;document.querySelector("#statsSummary").innerHTML=`<div class="stats-kpis"><div><span>Registros</span><strong>${s.total}</strong></div><div><span>Duración media</span><strong>${s.avgDuration} s</strong></div><div><span>Ayudó</span><strong>${s.helpYes}%</strong></div><div><span>Códigos</span><strong>${Object.keys(s.codes).length}</strong></div></div>${charts?`<div class="chart-grid"><div class="stat"><h3>Conductas</h3>${svgBars(s.conducta)}</div><div class="stat"><h3>Contextos</h3>${svgBars(s.contexto)}</div><div class="stat"><h3>Riesgos</h3>${svgPie(s.riesgo)}</div><div class="stat"><h3>Registros por código</h3>${svgBars(s.codes)}</div></div>`:""}<details class="stats-table"><summary>Ver resumen numérico</summary><div class="table-wrap"><table><thead><tr><th>Código</th><th>Registros</th></tr></thead><tbody>${humanRows(s.codes,100).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join("")}</tbody></table></div></details>${state().details?`<details open><summary>Detalle de ${rs.length} registros</summary><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Código</th><th>Contexto</th><th>Conducta</th><th>Intensidad</th><th>Riesgo</th></tr></thead><tbody>${rs.map(r=>`<tr><td>${esc(new Date(r.fechaHora).toLocaleDateString("es-ES"))}</td><td>${esc(r.codigo)}</td><td>${esc((r.contexto||[]).join(", "))}</td><td>${esc((r.conducta||[]).join(", "))}</td><td>${esc(r.intensidad)}</td><td>${esc(r.riesgo)}</td></tr>`).join("")}</tbody></table></div></details>`:""}`};
 document.querySelector("#statsApply").onclick=draw;draw();
 const gate=(fn)=>reviewGate(async()=>{const rs=current();if(!rs.length){toast("No hay registros con esos filtros");throw new Error("none")}await fn(rs,state())});
 document.querySelector("#statsPdf").onclick=()=>gate(exportStatsPDF);
 document.querySelector("#statsDocx").onclick=()=>gate(exportStatsDOCX);
 document.querySelector("#statsXlsx").onclick=()=>gate(exportStatsXlsx);
 document.querySelector("#statsCsv").onclick=()=>gate(async rs=>exportStatsCSV(rs));
}
function renderHelp(){
 const qs=[["¿Qué es ABC?","Un modo estructurado de registrar Antecedente, Conducta observada y Consecuencia para revisar patrones sin convertir una observación aislada en una explicación causal."],["¿Qué es un antecedente?","Lo que ocurrió inmediatamente antes del episodio, descrito mediante hechos observables."],["¿Qué es una consecuencia?","Lo que ocurrió inmediatamente después. No significa necesariamente premio, castigo ni causa."],["¿Qué es una hipótesis funcional?","Una explicación provisional sobre qué necesidad o función podría ser compatible con un patrón de registros. Requiere varios datos y revisión profesional/en equipo."],["¿Qué significa análisis funcional?","Proceso sistemático para comprender relaciones entre contexto, conducta y consecuencias. Esta aplicación ayuda a registrar datos, pero no sustituye una evaluación funcional profesional cuando sea necesaria."],["¿Observación o interpretación?","Observable: “Al indicarle que guardase el dispositivo, golpeó la mesa tres veces y salió del aula.” Interpretativo: “Se enfadó, quiso desafiar al profesor y perdió el control.” El primero describe hechos; el segundo atribuye estados internos o intenciones."],["¿Qué significa Apoyo Conductual Positivo?","Un enfoque centrado en la persona que busca comprender necesidades, prevenir dificultades y mejorar bienestar, participación, calidad de vida y apoyos, evitando reducir a la persona a una conducta."],["¿Por qué observar el entorno?","Porque accesibilidad, ruido, demandas, comunicación, predictibilidad, transiciones o tiempos de procesamiento pueden influir en la participación y regulación."],["¿Por qué una hipótesis necesita varios registros?","Un episodio aislado puede tener muchas explicaciones. Los patrones repetidos aportan información más prudente y útil."],["¿Qué es pseudonimización?","Sustituir identificadores directos por un código. Reduce riesgos, pero puede seguir siendo dato personal si existe información adicional que permite reidentificar."],["¿Qué datos no debo introducir?","Evita nombres completos, DNI, direcciones, diagnósticos, información clínica y cualquier dato identificativo que no sea necesario para la finalidad educativa del registro."]];
 document.querySelector("#screen-help").innerHTML=`<div class=card><h2>Ayuda</h2>${qs.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>`
}
function renderPrivacy(){
 document.querySelector("#screen-privacy").innerHTML=`<div class=card><h2>Privacidad y datos</h2>
 ${["Qué información guarda la aplicación|Registros ACP, códigos pseudónimos y los campos que la persona usuaria decide introducir.","Dónde se guarda|Los registros ACP se almacenan localmente en el dispositivo de la persona usuaria mediante IndexedDB. Preferencias sencillas se guardan en localStorage.","Qué datos no deben introducirse|Evita nombres completos, DNI, direcciones, diagnósticos, información clínica y datos identificativos innecesarios.","Exportaciones|CSV y PDF se generan mediante código ejecutado en el navegador tras una acción deliberada.","Correo|Preparar correo no envía automáticamente la información; abre el cliente de correo elegido por la persona usuaria.","Borrado|La aplicación permite borrar registros individuales, seleccionados, DEMO y todos los registros locales.","Seguridad del dispositivo|El PIN limita el acceso desde la interfaz, pero no es cifrado completo del almacenamiento.","Arquitectura técnica|No existe base de datos central destinada a recibir registros ACP, ni sincronización automática de registros.","Limitaciones|En la versión web, el proveedor de alojamiento puede tratar datos técnicos de conexión necesarios para servir la aplicación. La app no contiene una API destinada a recibir el contenido de los registros ACP. En iOS/Android, el contenido permanece local salvo exportación o apertura deliberada del cliente de correo.","Uso institucional|El uso en un centro debe ajustarse a las políticas de protección de datos, seguridad y procedimientos de la organización responsable. Antes de utilizarla con datos personales del alumnado, verifica que la herramienta y el dispositivo estén autorizados para esa finalidad; cuando corresponda, consulta al Delegado/a de Protección de Datos."].map(x=>{const [a,b]=x.split("|");return `<h3>${a}</h3><p>${b}</p>`}).join("")}
 <h3>Arquitectura de privacidad y datos</h3>
 <p>Los registros ACP se almacenan localmente en el dispositivo. El autor no recibe ni puede consultar los registros almacenados localmente. No existe sincronización automática de registros. Una vez exportados o incorporados a un correo, su protección dependerá también del sistema o servicio utilizado.</p>
 <div class=table-wrap><table><thead><tr><th>DATO</th><th>DÓNDE SE GUARDA</th><th>¿SE ENVÍA AUTOMÁTICAMENTE?</th></tr></thead><tbody>
 ${[["Registros ACP","Dispositivo local","NO"],["Código pseudónimo","Dispositivo local","NO"],["Preferencias","Dispositivo local","NO"],["Destinatario recordado","Dispositivo local","NO"],["PIN","Dispositivo local","NO"],["CSV","Generado localmente","NO"],["PDF","Generado localmente","NO"],["DOCX","Generado localmente","NO"],["XLSX","Generado localmente","NO"],["Correo","Cliente de correo elegido por la persona usuaria","NO desde Registro ACP Escolar"]].map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
 <h3>Uso institucional</h3><p>Cuando corresponda, consulta al Delegado o Delegada de Protección de Datos del centro o administración competente. La aplicación no está homologada ni autorizada automáticamente por la AEPD, la Comunidad de Madrid ni ningún centro educativo.</p><p>La utilización de códigos pseudónimos reduce riesgos, pero los datos pseudonimizados pueden seguir siendo datos personales si pueden vincularse nuevamente a una persona mediante información adicional.</p></div>`
}
function renderAbout(){
 document.querySelector("#screen-about").innerHTML=`<div class=card><h2>Acerca de / Licencia / Uso ético</h2><h3>Autoría</h3><p><strong>Autor: Carlos Tejero</strong></p><p>Proyecto desarrollado por Carlos Tejero con apoyo de ChatGPT para la ideación, estructuración y desarrollo técnico.</p><p>Carlos Tejero es el autor. ChatGPT es una herramienta de apoyo. ChatGPT no es autor ni titular de los derechos de la obra.</p>
 <h3>Finalidad</h3><p>Herramienta educativa de observación y registro dentro de procesos de Apoyo Conductual Positivo, centrada en prevención, comprensión funcional, dignidad, participación y apoyos. No es una herramienta diagnóstica.</p>
 <h3>Privacidad y uso responsable</h3><p>La persona usuaria es responsable de los datos que introduce, de la legitimidad de su tratamiento, de su confidencialidad, conservación, exportación, envío y eliminación, así como del cumplimiento de la normativa aplicable y de los protocolos de su centro o entidad.</p><p>El autor de la aplicación no recibe, supervisa ni controla los registros almacenados localmente.</p><p>La utilización de esta herramienta no exime a la persona usuaria de sus obligaciones profesionales, éticas, legales o institucionales.</p><p>La persona usuaria y, cuando corresponda, el centro o entidad responsable determinan la legitimidad y condiciones del tratamiento de los datos.</p>
 <h3>Licencia</h3><p><strong>Creative Commons Atribución-NoComercial-CompartirIgual 4.0 Internacional — CC BY-NC-SA 4.0.</strong></p><p>Puedes usar, copiar, compartir y modificar esta obra. Si publicas una versión modificada, debes reconocer la autoría original, mantener la misma licencia y respetar sus condiciones.</p><p>Atribución: “Tejero, Carlos. Registro ACP Escolar. Licencia CC BY-NC-SA 4.0.”</p><p><a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es" target="_blank" rel="noopener">Enlace oficial de la licencia</a></p>
 <h3>Limitaciones</h3><p>No sustituye evaluación psicológica, médica, psiquiátrica, pedagógica ni profesional, ni protocolos de centro, protección, seguridad o emergencia. Tampoco sustituye la decisión del responsable del tratamiento sobre qué herramientas pueden utilizarse en el contexto escolar.</p></div>`
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

function renderMore(){
 document.querySelector("#screen-settings").innerHTML=`<div class="card"><span class="app-kicker">Más opciones</span><h2>Herramientas y configuración</h2>
 <div class="more-grid">
  <button data-more="report"><strong>Informe / Exportar</strong><span>PDF, CSV y correo</span></button>
  <button data-more="quick"><strong>Registro rápido</strong><span>Registro rápido</span></button>
  <button data-more="help"><strong>Ayuda</strong><span>ABC, ACP y ejemplos</span></button>
  <button data-more="privacy"><strong>Privacidad y datos</strong><span>Arquitectura local-first</span></button>
  <button data-more="about"><strong>Acerca de</strong><span>Acerca de</span></button>
  <button data-more="settings"><strong>Configuración</strong><span>PIN y revisión de datos</span></button>
 </div></div>`;
 document.querySelectorAll("[data-more]").forEach(b=>b.onclick=async()=>{
   const d=b.dataset.more;
   if(d==="settings"){await renderSettings();show("settings")} else navigate(d)
 });
 show("settings");
}

async function navigate(dest){
 const protectedScreens=["form","quick","today","all","report","stats","settings"];
 const go=async()=>{if(dest==="reports"){openReportsChooser();return}if(dest==="importcsv"){openImportDialog();return}if(dest==="more"){renderMore();return}if(dest==="form"){await renderForm();show("form")}else if(dest==="quick"){renderQuick();show("quick")}else if(dest==="today"){await renderList("today");show("list")}else if(dest==="all"){await renderList("all");show("list")}else if(dest==="report"){selectedExportIds=[];await renderReport();show("report")}else if(dest==="stats"){await renderStats();show("stats")}else if(dest==="help"){renderHelp();show("help")}else if(dest==="privacy"){renderPrivacy();show("privacy")}else if(dest==="about"){renderAbout();show("about")}else if(dest==="settings"){await renderSettings();show("settings")}};
 if(protectedScreens.includes(dest))requirePin(go);else go()
}
document.addEventListener("DOMContentLoaded",async()=>{
 db=await openDB();

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
 
 document.querySelector("#useExistingCodeBtn")?.addEventListener("click",()=>{
   const v=document.querySelector("#existingCodeSelect").value;if(!v)return toast("Selecciona un código");
   const target=currentCodeTarget();if(target)target.value=v;document.querySelector("#codeManagerDialog").close();
 });
 document.querySelector("#createNewCodeBtn")?.addEventListener("click",async()=>{
   const codes=await usedCodes(),code=nextMaskedCode(codes);const target=currentCodeTarget();if(target)target.value=code;document.querySelector("#codeManagerDialog").close();toast(`Código ${code} creado`);
 });

 document.querySelector("#customCodeInput")?.addEventListener("input",async e=>{
   const warning=document.querySelector("#customCodeWarning");
   const {problems}=validateCustomCode(e.target.value,await usedCodes());
   warning.textContent=problems.length?`⚠ ${problems.join(" · ")}`:"";
   warning.classList.toggle("hidden",!problems.length);
 });
 document.querySelector("#useCustomCodeBtn")?.addEventListener("click",async()=>{
   const input=document.querySelector("#customCodeInput"),warning=document.querySelector("#customCodeWarning");
   const result=validateCustomCode(input.value,await usedCodes());
   if(result.problems.length){warning.textContent=`⚠ ${result.problems.join(" · ")}`;warning.classList.remove("hidden");return}
   if(!confirm("Confirma que este código no permite identificar directamente al alumnado y que su diseño ha sido autorizado por el centro cuando corresponda."))return;
   const target=currentCodeTarget();if(target)target.value=result.code;
   input.value="";warning.classList.add("hidden");document.querySelector("#codeManagerDialog").close();toast("Código aplicado");
 });

 document.querySelector("#saveCenterCustomizeBtn")?.addEventListener("click",()=>{
   const prefix=normalizePrefix(document.querySelector("#codePrefixSetting").value);
   savePrefs({centerDisplayName:document.querySelector("#centerDisplayName").value.trim(),codePrefix:prefix,codeFormat:document.querySelector("#codeFormatSetting").value,centerLocalNote:document.querySelector("#centerLocalNote").value.trim()});
   document.querySelector("#centerCustomizeDialog").close();toast("Personalización guardada");
 });
 document.querySelector("#centerDocFile")?.addEventListener("change",async e=>{
   const file=e.target.files?.[0];if(!file)return;
   try{await putCenterDoc(file);toast("Documento guardado localmente");e.target.value="";renderCenterDocs()}catch(err){alert(err.message==="TOO_LARGE"?"Máximo 5 MB por documento.":"No se pudo guardar el documento.")}
 });

 document.querySelector("#installNowBtn")?.addEventListener("click",e=>{e.preventDefault();triggerInstall();});

 let acpPendingImport=[];
 const acpFile=document.querySelector("#csvImportFile"),acpPrev=document.querySelector("#csvImportPreview"),acpCheck=document.querySelector("#csvImportConfirm"),acpBtn=document.querySelector("#csvImportBtn");
 acpFile?.addEventListener("change",async()=>{acpPendingImport=[];acpBtn.disabled=true;const f=acpFile.files?.[0];if(!f)return;try{acpPendingImport=await acpReadImport(f);acpPrev.innerHTML=`<div class="import-summary"><strong>${acpPendingImport.length}</strong> registros listos para importar.</div>`;acpPrev.classList.remove("hidden");acpBtn.disabled=!(acpCheck.checked&&acpPendingImport.length)}catch{acpPrev.innerHTML='<div class="risk">CSV no compatible.</div>';acpPrev.classList.remove("hidden")}});
 acpCheck?.addEventListener("change",()=>acpBtn.disabled=!(acpCheck.checked&&acpPendingImport.length));
 acpBtn?.addEventListener("click",async()=>{if(!acpCheck.checked||!acpPendingImport.length)return;for(const r of acpPendingImport)await putRecord(r);const n=acpPendingImport.length;acpPendingImport=[];document.querySelector("#importDialog")?.close();toast(`${n} registros importados`);renderHome();show("home")});

 
 document.querySelectorAll("[data-bottom-nav]").forEach(b=>b.addEventListener("click",()=>{const d=b.dataset.bottomNav;if(d==="home"){renderHome();show("home")}else navigate(d)}));
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
   if(prefs().accepted){await renderHome();show("home");setTimeout(()=>ensureHomeVisible().catch(()=>{}),80)}
   else{renderConsent();show("consent")}
 }catch(err){
   console.error("Inicio",err);
   const h=document.querySelector("#screen-home");
   h.innerHTML='<div class="card"><h2>Registro ACP Escolar</h2><p>No se pudo iniciar correctamente.</p><button id="retryHome">Reintentar</button></div>';
   show("home");
   document.querySelector("#retryHome")?.addEventListener("click",async()=>{await renderHome();show("home")});
 }
});
