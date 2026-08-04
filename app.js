
"use strict";
const DB_NAME="registro_acp_escolar_db", DB_VERSION=1, STORE="registros";
const PREF="registro_acp_escolar_prefs";
let db=null, currentEditId=null, pendingReviewAction=null, listMode="all", unlocked=false;
let deferredInstallPrompt=null;

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
function prefs(){try{return {...{accepted:false,retention:"30",rememberRecipient:false,recipient:"",pinEnabled:false,pinHash:"",pinSalt:""},...JSON.parse(localStorage.getItem(PREF)||"{}")}}catch{return {accepted:false}}}
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
 return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE)){const s=d.createObjectStore(STORE,{keyPath:"id"});s.createIndex("fechaHora","fechaHora");s.createIndex("codigo","codigo");s.createIndex("riesgo","riesgo")}};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
}
async function putRecord(rec){return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(rec);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function getRecord(id){return new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function allRecords(){return new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>res(r.result.sort((a,b)=>(b.fechaHora||"").localeCompare(a.fechaHora||"")));r.onerror=()=>rej(r.error)})}
async function deleteRecord(id){return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function clearRecords(){return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}


function platformInfo(){
  const ua=navigator.userAgent||"";
  const isIOS=/iPad|iPhone|iPod/.test(ua) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
  const isAndroid=/Android/i.test(ua);
  const standalone=window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone===true;
  return {isIOS,isAndroid,standalone};
}
function installHelpText(){
  const {isIOS,isAndroid,standalone}=platformInfo();
  if(standalone) return `<p><strong>Registro ACP Escolar ya está instalada</strong> en este dispositivo.</p><p class="hint">Los registros siguen almacenándose localmente en este dispositivo.</p>`;
  if(isIOS) return `<p>En iPhone/iPad, Apple no muestra un botón automático de instalación. Haz esto:</p><ol class="install-steps"><li>Abre esta página en <strong>Safari</strong>.</li><li>Pulsa el botón <strong>Compartir</strong> (cuadrado con flecha hacia arriba).</li><li>Selecciona <strong>Añadir a pantalla de inicio</strong>.</li><li>Confirma con <strong>Añadir</strong>.</li></ol><p class="hint">Después se abrirá como una app independiente.</p>`;
  if(isAndroid) return `<p>En Android puedes instalarla desde Chrome.</p><ol class="install-steps"><li>Pulsa <strong>Instalar ahora</strong> si aparece disponible.</li><li>Si no, abre el menú ⋮ de Chrome y selecciona <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>.</li></ol>`;
  return `<p>Puedes instalar Registro ACP Escolar como aplicación si tu navegador lo permite.</p><p class="hint">En Chrome/Edge, usa “Instalar ahora” o el icono de instalación de la barra de direcciones.</p>`;
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

function show(id){
 document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));
 const el=document.querySelector(`#screen-${id}`);el.classList.remove("hidden");el.scrollIntoView({block:"start"});document.querySelector("#main").focus();
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
 const rs=await allRecords(), old=oldCount(rs); const note=old?`<div class="warning"><strong>Revisión de datos:</strong> Existen ${old} registro(s) antiguos en este dispositivo. Revisa si sigue siendo necesario conservarlos.</div>`:"";
 document.querySelector("#screen-home").innerHTML=`<div class="card hero"><div class="hero-copy"><span class="app-kicker">ACP · Registro educativo</span><h2>Observar para comprender y apoyar</h2><p>Registra hechos, revisa patrones y planifica apoyos desde una mirada centrada en la persona.</p><span class="privacy-pill">Datos guardados en este dispositivo</span></div>
 <div class="disclaimer"><p><strong>Esta herramienta facilita el registro educativo dentro de procesos de Apoyo Conductual Positivo. No realiza diagnósticos ni sustituye la valoración profesional.</strong></p>
 <p>No sustituye la evaluación psicológica, médica, psiquiátrica, pedagógica ni profesional.</p><p>No sustituye los protocolos del centro, los procedimientos establecidos de protección o seguridad ni las actuaciones de emergencia.</p></div>${note}</div>
 <div class="install-card"><div class="install-icon">⬇</div><div><h3>Instalar esta app</h3><p>Acceso rápido, funcionamiento offline y datos guardados en este dispositivo.</p></div><button id="homeInstallBtn" class="secondary">Instalar / Cómo instalar</button></div>
 <div class="local-badge">● Sin cuenta · Sin nube de registros · Almacenamiento local</div>
 <div style="height:.75rem"></div>
 <div class="grid-buttons">
 ${[
 ["Nuevo registro","Crear un registro ABC ampliado","form"],["Registro rápido","Registrar lo esencial en una sola pantalla","quick"],["Registros de hoy","Consultar y gestionar los registros de hoy","today"],["Todos los registros","Buscar, filtrar, editar y duplicar","all"],["Informe / Exportar","PDF, CSV o preparación de correo","report"],["Estadísticas","Patrones descriptivos calculados localmente","stats"],["Ayuda","Conceptos y ejemplos observables","help"],["Privacidad y datos","Arquitectura y flujo local de datos","privacy"],["Acerca de / Licencia / Uso ético","Autoría, licencia y limitaciones","about"],["Configuración","PIN y recordatorio de revisión","settings"]
 ].map(([a,b,c])=>`<button data-nav="${c}"><strong>${a}</strong><span>${b}</span></button>`).join("")}</div>
 <div class="card"><h2>Cómo usarla en 60 segundos</h2><div class="flow">${["Observar","↓","Registrar hechos","↓","Revisar patrones","↓","Formular hipótesis","↓","Planificar apoyos","↓","Revisar en equipo"].map(x=>x==="↓"?"<b>↓</b>":`<span>${x}</span>`).join("")}</div></div>`;
 document.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
 document.querySelector("#homeInstallBtn")?.addEventListener("click",openInstallDialog);
}
function formTemplate(d={}){
 const inc=d.inclusion||{};
 return `<form id="recordForm">
 <div class="card"><h2>${currentEditId?"Editar registro":"Nuevo registro"}</h2><p class="warning">No introduzcas datos identificativos innecesarios.</p>
 <div class="two"><label class="required">Fecha y hora<input name="fechaHora" type="datetime-local" required value="${esc(d.fechaHora||nowLocal())}"></label>
 <label class="required">Código pseudónimo del alumnado<input name="codigo" required value="${esc(d.codigo||"")}"><span class="hint">Utiliza un código interno que no permita identificar directamente a la persona.</span></label>
 <label>Curso / grupo<input name="grupo" value="${esc(d.grupo||"")}"></label><label>Profesional que registra (iniciales o alias)<input name="profesional" value="${esc(d.profesional||"")}"></label></div></div>
 <div class="card"><h3>Contexto escolar</h3>${chips("contexto",OPT.contexto,d.contexto||[],"contextoOtro",d.contextoOtro||"")}</div>
 <div class="card"><h3>Factores del entorno</h3>${chips("factores",OPT.factores,d.factores||[],"factoresOtro",d.factoresOtro||"")}
 <p class="hint">En alumnado autista o con otras necesidades de apoyo, observa especialmente barreras sensoriales, predictibilidad, comunicación, comprensión, transiciones y tiempo de procesamiento.</p><p class="hint">Estos indicadores no deben utilizarse para inferir un diagnóstico.</p></div>
 <div class="card"><h3>A) Antecedente inmediato</h3>${chips("antecedente",OPT.antecedente,d.antecedente||[],"antecedenteOtro",d.antecedenteOtro||"")}
 <label>Descripción objetiva del antecedente <button type="button" class="small secondary" data-help="ante">?</button><textarea name="antecedenteDesc">${esc(d.antecedenteDesc||"")}</textarea></label>
 <p class="hint">Adecuado: “Se le indicó guardar el móvil y comenzó a golpear la mesa.” Evita: “Se enfadó porque no quería obedecer.”</p></div>
 <div class="card"><h3>Conducta observada</h3>${chips("conducta",OPT.conducta,d.conducta||[],"conductaOtro",d.conductaOtro||"")}
 <label class="required">Descripción objetiva de la conducta<textarea name="conductaDesc" required>${esc(d.conductaDesc||"")}</textarea></label>
 <p class="hint">Ejemplo: “Golpea la mesa con la mano abierta durante aproximadamente 20 segundos.” Evita: “Se porta mal.”</p>
 <div class="three"><label>Duración<input type="number" min="0" step="1" name="duracionValor" value="${esc(d.duracionValor||"")}"></label><label>Unidad<select name="duracionUnidad"><option>segundos</option><option ${d.duracionUnidad==="minutos"?"selected":""}>minutos</option></select></label><label>Frecuencia<input type="number" min="0" step="1" name="frecuencia" value="${esc(d.frecuencia||1)}"></label></div>
 <div class="actions"><button type="button" class="secondary small" id="timerStart">Iniciar cronómetro</button><button type="button" class="secondary small" id="timerStop" disabled>Detener</button><span id="timerDisplay" aria-live="polite"></span></div></div>
 <div class="card"><div class="two"><label>Intensidad (1–5)<select name="intensidad">${[1,2,3,4,5].map(n=>`<option ${String(d.intensidad||3)===String(n)?"selected":""}>${n}</option>`).join("")}</select></label>
 <label>Riesgo<select name="riesgo" id="riskSelect">${["sin riesgo","leve","moderado","alto"].map(x=>`<option ${d.riesgo===x?"selected":""}>${x}</option>`).join("")}</select></label></div>
 <p class="hint">1 — Muy baja: apenas interfiere. 2 — Baja. 3 — Moderada. 4 — Alta. 5 — Muy alta. La intensidad describe este episodio concreto, no a la persona.</p>
 <div id="highRisk" class="risk ${d.riesgo==="alto"?"":"hidden"}">Prioriza la seguridad, la dignidad y los protocolos establecidos por el centro. Esta aplicación no es una guía de intervención de emergencia.</div></div>
 <div class="card"><h3>Consecuencia</h3>${chips("consecuencia",OPT.consecuencia,d.consecuencia||[],"consecuenciaOtro",d.consecuenciaOtro||"")}
 <label>Descripción adicional<textarea name="consecuenciaDesc">${esc(d.consecuenciaDesc||"")}</textarea></label><p class="hint">Consecuencia significa qué ocurrió inmediatamente después. No implica necesariamente premio, castigo ni causa.</p></div>
 <div class="card"><h3>HIPÓTESIS, NO DIAGNÓSTICO</h3><div class="warning"><strong>Hipótesis funcional provisional:</strong> requiere varios registros, análisis de patrones y revisión en equipo.</div>${chips("hipotesis",OPT.hipotesis,d.hipotesis||[],"hipotesisOtro",d.hipotesisOtro||"")}
 <p class="hint">Los datos podrían ser compatibles con una o varias hipótesis; ninguna se presenta como verdadera automáticamente.</p></div>
 <div class="card"><h3>Apoyos aplicados</h3>${chips("apoyos",OPT.apoyos,d.apoyos||[],"apoyosOtro",d.apoyosOtro||"")}
 <label>¿Pareció ayudar?<select name="apoyoValoracion"><option></option>${["Sí","Parcialmente","No","No valorable"].map(x=>`<option ${d.apoyoValoracion===x?"selected":""}>${x}</option>`).join("")}</select></label><p class="hint">Esta valoración no demuestra causalidad.</p></div>
 <div class="card"><h3>Qué probar la próxima vez</h3>${chips("proxima",OPT.proxima,d.proxima||[],"proximaOtro",d.proximaOtro||"")}<label>Nota breve<textarea name="proximaTexto">${esc(d.proximaTexto||"")}</textarea></label></div>
 <div class="card"><h3>Indicadores de inclusión y contexto</h3><p>Esta sección ayuda a revisar las condiciones del entorno y los apoyos ofrecidos; no es una escala sobre la persona.</p><div class="two">${inclusionFields(inc)}</div></div>
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
 const f=document.querySelector("#recordForm");document.querySelector("#cancelForm").onclick=()=>{currentEditId=null;renderHome();show("home")};
 document.querySelector("#riskSelect").onchange=e=>document.querySelector("#highRisk").classList.toggle("hidden",e.target.value!=="alto");
 document.querySelectorAll("[data-help=ante]").forEach(b=>b.onclick=()=>alert("Registra lo que ocurrió inmediatamente antes utilizando hechos observables y evitando interpretar intenciones."));
 let start=0,tick=null;const disp=document.querySelector("#timerDisplay");
 document.querySelector("#timerStart").onclick=()=>{start=Date.now();document.querySelector("#timerStart").disabled=true;document.querySelector("#timerStop").disabled=false;tick=setInterval(()=>disp.textContent=`${Math.floor((Date.now()-start)/1000)} s`,1000)};
 document.querySelector("#timerStop").onclick=()=>{clearInterval(tick);const secs=Math.max(1,Math.floor((Date.now()-start)/1000));f.elements.duracionValor.value=secs;f.elements.duracionUnidad.value="segundos";disp.textContent=`${secs} s`;document.querySelector("#timerStart").disabled=false;document.querySelector("#timerStop").disabled=true};
 f.onsubmit=async e=>{e.preventDefault();const base=currentEditId?await getRecord(currentEditId):{};const rec=recordFromForm(f,base);await putRecord(rec);currentEditId=null;toast("Registro guardado localmente");await renderList("all");show("list")}
}
function quickTemplate(d={}){
 return `<form id="quickForm"><div class="card"><h2>Registro rápido</h2><div class="two"><label class="required">Código pseudónimo<input name="codigo" required value="${esc(d.codigo||"")}"></label><label>Fecha y hora<input type="datetime-local" name="fechaHora" value="${esc(d.fechaHora||nowLocal())}"></label></div>
 <h3>Contexto</h3>${chips("contexto",OPT.contexto,d.contexto||[],"contextoOtro",d.contextoOtro||"")}<h3>Antecedente</h3>${chips("antecedente",OPT.antecedente,d.antecedente||[],"antecedenteOtro",d.antecedenteOtro||"")}
 <h3>Conducta</h3>${chips("conducta",OPT.conducta,d.conducta||[],"conductaOtro",d.conductaOtro||"")}<label class="required">Descripción objetiva breve<textarea name="conductaDesc" required>${esc(d.conductaDesc||"")}</textarea></label>
 <h3>Consecuencia</h3>${chips("consecuencia",OPT.consecuencia,d.consecuencia||[],"consecuenciaOtro",d.consecuenciaOtro||"")}
 <div class="two"><label>Intensidad<select name="intensidad">${[1,2,3,4,5].map(n=>`<option ${n===3?"selected":""}>${n}</option>`).join("")}</select></label><label>Riesgo<select name="riesgo">${["sin riesgo","leve","moderado","alto"].map(x=>`<option>${x}</option>`).join("")}</select></label></div>
 <div class="actions"><button>Guardar registro rápido</button><button type="button" id="quickComplete" class="secondary">Completar detalles</button><button type="button" id="quickCancel" class="secondary">Cancelar</button></div></div></form>`;
}
function quickToRecord(form){
 const fd=new FormData(form);return {id:uid(),fechaHora:one(fd,"fechaHora"),codigo:one(fd,"codigo"),grupo:"",profesional:"",contexto:arrayVal(fd,"contexto"),contextoOtro:one(fd,"contextoOtro"),factores:[],factoresOtro:"",
 antecedente:arrayVal(fd,"antecedente"),antecedenteOtro:one(fd,"antecedenteOtro"),antecedenteDesc:"",conducta:arrayVal(fd,"conducta"),conductaOtro:one(fd,"conductaOtro"),conductaDesc:one(fd,"conductaDesc"),duracionValor:0,duracionUnidad:"segundos",frecuencia:1,intensidad:Number(one(fd,"intensidad")),riesgo:one(fd,"riesgo"),consecuencia:arrayVal(fd,"consecuencia"),consecuenciaOtro:one(fd,"consecuenciaOtro"),consecuenciaDesc:"",hipotesis:[],hipotesisOtro:"",apoyos:[],apoyosOtro:"",apoyoValoracion:"",proxima:[],proximaOtro:"",proximaTexto:"",inclusion:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),demo:false,quick:true}
}
function renderQuick(){
 document.querySelector("#screen-quick").innerHTML=quickTemplate();bindSpec(document.querySelector("#screen-quick"));const f=document.querySelector("#quickForm");
 document.querySelector("#quickCancel").onclick=()=>{renderHome();show("home")};
 f.onsubmit=async e=>{e.preventDefault();const r=quickToRecord(f);await putRecord(r);toast("Registro rápido guardado");renderList("today");show("list")};
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
 <div class="toolbar"><div><label>Código<input id="fCode"></label></div><div><label>Contexto<select id="fContext"><option value="">Todos</option>${OPT.contexto.map(x=>`<option>${x}</option>`).join("")}</select></label></div><div><label>Riesgo<select id="fRisk"><option value="">Todos</option>${["sin riesgo","leve","moderado","alto"].map(x=>`<option>${x}</option>`).join("")}</select></label></div><div><label>Conducta<select id="fBehavior"><option value="">Todas</option>${OPT.conducta.map(x=>`<option>${x}</option>`).join("")}</select></label></div><div><label>Desde<input id="fFrom" type="date"></label></div><div><label>Hasta<input id="fTo" type="date"></label></div><button id="applyFilters" class="secondary">Filtrar</button></div>
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
 <section class="detail-section"><h3>Indicadores de inclusión y contexto</h3><div class="inclusion-list">${INCLUSION.map(k=>`<div><span>${esc(INCLUSION_LABELS[k])}</span><strong>${esc(r.inclusion?.[k]||"—")}</strong></div>`).join("")}</div></section>`;
}
let selectedExportIds=[];
async function renderReport(){
 const rs=await allRecords();document.querySelector("#screen-report").innerHTML=`<div class=card><h2>Informe / Exportar</h2><p>Selecciona uno o varios registros. Todas las operaciones se inician de forma deliberada por la persona usuaria.</p>
 <div id=exportChoices>${rs.length?rs.map(r=>`<label class=checkline><input class=export-choice type=checkbox value="${esc(r.id)}" ${selectedExportIds.includes(r.id)?"checked":""}> ${esc(r.codigo)} — ${esc(new Date(r.fechaHora).toLocaleString("es-ES"))} ${r.demo?"(DEMO)":""}</label>`).join(""):"<p>No hay registros.</p>"}</div>
 <div class=actions><button id=csvBtn>Exportar CSV</button><button id=pdfBtn>Generar PDF</button><button id=mailBtn>Preparar correo</button></div></div>`;
 const ids=()=>[...document.querySelectorAll(".export-choice:checked")].map(x=>x.value);
 document.querySelector("#csvBtn").onclick=()=>reviewGate(async()=>exportCSV(await recordsByIds(ids())));
 document.querySelector("#pdfBtn").onclick=()=>reviewGate(async()=>generatePDF(await recordsByIds(ids())));
 document.querySelector("#mailBtn").onclick=()=>reviewGate(async()=>prepareMail(await recordsByIds(ids())));
}
async function recordsByIds(ids){if(!ids.length){toast("Selecciona al menos un registro");throw new Error("none")}const a=[];for(const id of ids){const r=await getRecord(id);if(r)a.push(r)}return a}
function reviewGate(fn){pendingReviewAction=fn;const d=document.querySelector("#reviewDialog"),c=document.querySelector("#reviewConfirm"),b=document.querySelector("#reviewProceed");c.checked=false;b.disabled=true;c.onchange=()=>b.disabled=!c.checked;d.showModal()}
function flat(r){
 const val=x=>(x||[]).join(" | ");
 const out={id:r.id,demo:r.demo?"DEMO":"",fechaHora:r.fechaHora,codigo:r.codigo,grupo:r.grupo||"",profesional:r.profesional||"",contexto:val(r.contexto),contextoEspecificar:r.contextoOtro||"",factoresEntorno:val(r.factores),factoresEspecificar:r.factoresOtro||"",antecedente:val(r.antecedente),antecedenteEspecificar:r.antecedenteOtro||"",antecedenteDescripcion:r.antecedenteDesc||"",conductaObservada:val(r.conducta),conductaEspecificar:r.conductaOtro||"",conductaDescripcion:r.conductaDesc||"",duracionValor:r.duracionValor??"",duracionUnidad:r.duracionUnidad||"",frecuencia:r.frecuencia??"",intensidad:r.intensidad??"",riesgo:r.riesgo||"",consecuencia:val(r.consecuencia),consecuenciaEspecificar:r.consecuenciaOtro||"",consecuenciaDescripcion:r.consecuenciaDesc||"",hipotesisFuncionalProvisional:val(r.hipotesis),hipotesisEspecificar:r.hipotesisOtro||"",apoyosAplicados:val(r.apoyos),apoyosEspecificar:r.apoyosOtro||"",parecioAyudar:r.apoyoValoracion||"",proximaVez:val(r.proxima),proximaEspecificar:r.proximaOtro||"",proximaNota:r.proximaTexto||""};
 INCLUSION.forEach(k=>out[`inclusion_${k}`]=r.inclusion?.[k]||"");return out
}
async function exportCSV(rs){
 const rows=rs.map(flat),heads=Object.keys(rows[0]);const q=v=>`"${String(v??"").replaceAll('"','""')}"`;const csv="\uFEFF"+[heads.map(q).join(";"),...rows.map(r=>heads.map(h=>q(r[h])).join(";"))].join("\r\n");const method=await exportUserFile(new Blob([csv],{type:"text/csv;charset=utf-8"}),`registro-acp-${new Date().toISOString().slice(0,10)}.csv`);if(method!=="cancelled")toast(method==="download"?"CSV descargado":"CSV listo para guardar o compartir")
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
async function generatePDF(rs){const method=await exportUserFile(buildVisualPDF(rs),`registro-acp-${new Date().toISOString().slice(0,10)}.pdf`);if(method!=="cancelled")toast(method==="download"?"PDF descargado":"PDF listo para guardar o compartir")}
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
 const rs=await allRecords();const counts=(field)=>{const m={};for(const r of rs){const vals=Array.isArray(r[field])?r[field]:[r[field]];for(const v of vals.filter(Boolean))m[v]=(m[v]||0)+1}return m};const blocks=(title,m)=>{const arr=Object.entries(m).sort((a,b)=>b[1]-a[1]),max=arr[0]?.[1]||1;return `<div class=stat><h3>${title}</h3>${arr.length?arr.slice(0,10).map(([k,v])=>`<p>${esc(k)} — ${v}</p><div class=bar><i style="width:${v/max*100}%"></i></div>`).join(""):"<p>Sin datos.</p>"}</div>`};
 const dur=rs.filter(r=>r.duracionValor>0).map(r=>r.duracionUnidad==="minutos"?r.duracionValor*60:r.duracionValor),avg=dur.length?Math.round(dur.reduce((a,b)=>a+b,0)/dur.length):0;
 const help=rs.filter(r=>r.apoyoValoracion),yes=help.filter(r=>r.apoyoValoracion==="Sí").length,part=help.filter(r=>r.apoyoValoracion==="Parcialmente").length;
 document.querySelector("#screen-stats").innerHTML=`<div class=card><h2>Estadísticas locales</h2><p>Calculadas exclusivamente a partir de los registros almacenados en este dispositivo.</p><div class=warning>Las correlaciones o frecuencias observadas no demuestran la función de una conducta.</div></div>
 <div class=stat-grid>${blocks("Frecuencia por contexto",counts("contexto"))}${blocks("Conductas más registradas",counts("conducta"))}${blocks("Antecedentes más frecuentes",counts("antecedente"))}${blocks("Consecuencias más frecuentes",counts("consecuencia"))}${blocks("Distribución de intensidad",counts("intensidad"))}${blocks("Distribución de riesgos",counts("riesgo"))}${blocks("Distribución de hipótesis",counts("hipotesis"))}${blocks("Apoyos más utilizados",counts("apoyos"))}
 <div class=stat><h3>Duración media</h3><p><strong>${avg} segundos</strong></p></div><div class=stat><h3>“Pareció ayudar”</h3><p>Sí: ${help.length?Math.round(yes/help.length*100):0}% · Sí o parcialmente: ${help.length?Math.round((yes+part)/help.length*100):0}%</p><p class=hint>No demuestra causalidad.</p></div></div>`;
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
 ${[["Registros ACP","Dispositivo local","NO"],["Código pseudónimo","Dispositivo local","NO"],["Preferencias","Dispositivo local","NO"],["Destinatario recordado","Dispositivo local","NO"],["PIN","Dispositivo local","NO"],["CSV","Generado localmente","NO"],["PDF","Generado localmente","NO"],["Correo","Cliente de correo elegido por la persona usuaria","NO desde Registro ACP Escolar"]].map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
 <h3>Uso institucional</h3><p>Cuando corresponda, consulta al Delegado o Delegada de Protección de Datos del centro o administración competente. La aplicación no está homologada ni autorizada automáticamente por la AEPD, la Comunidad de Madrid ni ningún centro educativo.</p><p>La utilización de códigos pseudónimos reduce riesgos, pero los datos pseudonimizados pueden seguir siendo datos personales si pueden vincularse nuevamente a una persona mediante información adicional.</p></div>`
}
function renderAbout(){
 document.querySelector("#screen-about").innerHTML=`<div class=card><h2>Acerca de / Licencia / Uso ético</h2><h3>Autoría</h3><p><strong>Autor: Carlos Tejero</strong></p><p>Proyecto desarrollado por Carlos Tejero con apoyo de ChatGPT para la ideación, estructuración y desarrollo técnico.</p><p>Carlos Tejero es el autor. ChatGPT es una herramienta de apoyo. ChatGPT no es autor ni titular de los derechos de la obra.</p>
 <h3>Finalidad</h3><p>Herramienta educativa de observación y registro dentro de procesos de Apoyo Conductual Positivo, centrada en prevención, comprensión funcional, dignidad, participación y apoyos. No es una herramienta diagnóstica.</p>
 <h3>Privacidad y uso responsable</h3><p>La persona usuaria es responsable de los datos que introduce, de la legitimidad de su tratamiento, de su confidencialidad, conservación, exportación, envío y eliminación, así como del cumplimiento de la normativa aplicable y de los protocolos de su centro o entidad.</p><p>El autor de la aplicación no recibe, supervisa ni controla los registros almacenados localmente.</p><p>La utilización de esta herramienta no exime a la persona usuaria de sus obligaciones profesionales, éticas, legales o institucionales.</p><p>La persona usuaria y, cuando corresponda, el centro o entidad responsable determinan la legitimidad y condiciones del tratamiento de los datos.</p>
 <h3>Licencia</h3><p><strong>Creative Commons Atribución-NoComercial-CompartirIgual 4.0 Internacional — CC BY-NC-SA 4.0.</strong></p><p>Puedes copiar, compartir y adaptar esta obra siempre que reconozcas adecuadamente la autoría, no la utilices con fines comerciales y compartas cualquier obra derivada bajo la misma licencia.</p><p>Atribución: “Tejero, Carlos. Registro ACP Escolar. Licencia CC BY-NC-SA 4.0.”</p><p><a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es" target="_blank" rel="noopener">Enlace oficial de la licencia</a></p>
 <h3>Limitaciones</h3><p>No sustituye evaluación psicológica, médica, psiquiátrica, pedagógica ni profesional, ni protocolos de centro, protección, seguridad o emergencia. Tampoco sustituye la decisión del responsable del tratamiento sobre qué herramientas pueden utilizarse en el contexto escolar.</p></div>`
}
async function renderSettings(){
 const p=prefs();document.querySelector("#screen-settings").innerHTML=`<div class=card><h2>Configuración</h2>
 <h3>Protección mediante PIN local</h3><p>Este PIN protege el acceso dentro de la aplicación, pero no sustituye las medidas de seguridad del dispositivo.</p><p>Si olvidas el PIN podría no ser posible acceder a los registros almacenados.</p><p><strong>El PIN limita el acceso mediante la interfaz de la aplicación, pero no constituye por sí mismo cifrado completo del almacenamiento del dispositivo.</strong></p>
 <p>Estado: <strong>${p.pinEnabled?"Activado":"Desactivado"}</strong></p><div class=actions>${p.pinEnabled?'<button id=changePin>Cambiar PIN</button><button id=disablePin class=secondary>Desactivar PIN</button>':'<button id=enablePin>Activar PIN</button>'}</div>
 <h3>Recordatorio de revisión de datos</h3><label>Revisar registros con antigüedad superior a<select id=retention><option value=7 ${p.retention==="7"?"selected":""}>7 días</option><option value=30 ${p.retention==="30"?"selected":""}>30 días</option><option value=90 ${p.retention==="90"?"selected":""}>90 días</option><option value=manual ${p.retention==="manual"?"selected":""}>Manual</option></select></label><p class=hint>No se borra ningún registro automáticamente.</p>
 <h3>Datos DEMO</h3><div class=actions><button id=addDemo class=secondary>Añadir datos DEMO</button></div>
 <h3>Borrado total</h3><button id=deleteAll class=danger>Borrar todos los datos</button></div>`;
 document.querySelector("#retention").onchange=e=>{savePrefs({retention:e.target.value});toast("Preferencia guardada")};
 if(!p.pinEnabled)document.querySelector("#enablePin").onclick=()=>setNewPin("activar");else{document.querySelector("#changePin").onclick=()=>setNewPin("cambiar");document.querySelector("#disablePin").onclick=async()=>{const pin=prompt("Introduce el PIN actual");if(pin===null)return;if(await hashPin(pin,p.pinSalt)!==p.pinHash)return alert("PIN incorrecto");savePrefs({pinEnabled:false,pinHash:"",pinSalt:""});unlocked=false;toast("PIN desactivado");renderSettings()}}
 document.querySelector("#addDemo").onclick=addDemo;
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
  <button data-more="quick"><strong>Registro rápido</strong><span>Guardar lo esencial</span></button>
  <button data-more="help"><strong>Ayuda</strong><span>ABC, ACP y ejemplos</span></button>
  <button data-more="privacy"><strong>Privacidad y datos</strong><span>Arquitectura local-first</span></button>
  <button data-more="about"><strong>Acerca de</strong><span>Autoría, licencia y uso ético</span></button>
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
 const go=async()=>{if(dest==="more"){renderMore();return}if(dest==="form"){await renderForm();show("form")}else if(dest==="quick"){renderQuick();show("quick")}else if(dest==="today"){await renderList("today");show("list")}else if(dest==="all"){await renderList("all");show("list")}else if(dest==="report"){selectedExportIds=[];await renderReport();show("report")}else if(dest==="stats"){await renderStats();show("stats")}else if(dest==="help"){renderHelp();show("help")}else if(dest==="privacy"){renderPrivacy();show("privacy")}else if(dest==="about"){renderAbout();show("about")}else if(dest==="settings"){await renderSettings();show("settings")}};
 if(protectedScreens.includes(dest))requirePin(go);else go()
}
document.addEventListener("DOMContentLoaded",async()=>{
 db=await openDB();
 window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstallPrompt=e;});
 window.addEventListener("appinstalled",()=>{deferredInstallPrompt=null;toast("Registro ACP Escolar instalada");});
 document.querySelector("#headerInstallBtn")?.addEventListener("click",openInstallDialog);
 document.querySelector("#installNowBtn")?.addEventListener("click",e=>{e.preventDefault();triggerInstall();});
 document.querySelector("#menuHome").onclick=()=>{renderHome();show("home")};
 document.querySelectorAll("[data-bottom-nav]").forEach(b=>b.addEventListener("click",()=>{const d=b.dataset.bottomNav;if(d==="home"){renderHome();show("home")}else navigate(d)}));
 document.querySelector("#reviewProceed").onclick=async e=>{if(!document.querySelector("#reviewConfirm").checked){e.preventDefault();return}const fn=pendingReviewAction;pendingReviewAction=null;setTimeout(async()=>{try{await fn?.()}catch(err){if(err.message!=="none"){console.error("Fallo de exportación",err?.name||"Error");alert("No se ha podido abrir el archivo para guardarlo o compartirlo. Cierra y vuelve a abrir la app; si persiste, revisaremos la integración nativa.")}}},0)};
 document.querySelector("#pinUnlockForm").onsubmit=async e=>{e.preventDefault();const p=prefs(),h=await hashPin(document.querySelector("#unlockPin").value,p.pinSalt);if(h!==p.pinHash){document.querySelector("#pinError").classList.remove("hidden");return}unlocked=true;document.querySelector("#pinDialog").close();pinNext?.();pinNext=null};
 if("serviceWorker" in navigator){
   const native=(()=>{try{return !!(window.Capacitor&&typeof window.Capacitor.getPlatform==="function"&&window.Capacitor.getPlatform()!=="web")}catch{return false}})();
   if(native){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});}
   else navigator.serviceWorker.register("./sw.js").catch(()=>{});
 }
 if(prefs().accepted){await renderHome();show("home")}else{renderConsent();show("consent")}
});
