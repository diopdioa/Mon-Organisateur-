/* ============================================================
   Orbis — logique de l'application
   Fichier unique volontairement (pas de modules ES) : le HTML
   appelle beaucoup de fonctions directement via des attributs
   onclick="...", qui exigent qu'elles restent dans la portée
   globale (un module ES ne les y placerait pas automatiquement).
   Repère-toi avec les commentaires "==== section ====" ci-dessous.
   ============================================================ */
const SUPABASE_URL='https://azqgdgxneymeyrbjgiqo.supabase.co';
const SUPABASE_KEY='sb_publishable_kWWqcZptq5Qbtf3dAuiEcQ_ggOyL3ye';
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let user=null, data={objectifs:[],taches:[],projets:[],planning:[],rappels:[],notes:[],businessPlans:[]};
let espaces=[], currentEspaceId=null;
let excelSort={col:'date_echeance',dir:'asc'};
let charts={progress:null,task:null,budget:null,objOverview:null}, editing=null;
const $=id=>document.getElementById(id);
const today=()=>new Date().toISOString().slice(0,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money=n=>Number(n||0).toLocaleString('fr-CA',{style:'currency',currency:'CAD'});
const dateFr=d=>d?new Date(d+'T12:00:00').toLocaleDateString('fr-CA',{day:'2-digit',month:'2-digit',year:'numeric'}):'';
const IS_IOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
// ==== Interface : notifications toast, erreurs lisibles, confirmation modale ====
function toast(message,type='error',duration=4500){
 const wrap=$('toastContainer');
 if(!wrap)return;
 const styles={
  error:{bg:'bg-red-600',icon:'<path d="M10 6.4v4.2"/><circle cx="10" cy="13.4" r=".2" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="7.3"/>'},
  warn:{bg:'bg-amber-500',icon:'<path d="M10 3.5l7.5 13H2.5z"/><path d="M10 8.4v3.4"/><circle cx="10" cy="14" r=".2" fill="currentColor" stroke="none"/>'},
  success:{bg:'bg-teal-700',icon:'<circle cx="10" cy="10" r="7.3"/><path d="M6.8 10.2l2.1 2.1 4.3-4.6"/>'},
  info:{bg:'bg-slate-800',icon:'<circle cx="10" cy="10" r="7.3"/><path d="M10 9.2v4.2"/><circle cx="10" cy="6.6" r=".2" fill="currentColor" stroke="none"/>'}
 };
 const s=styles[type]||styles.info;
 const el=document.createElement('div');
 el.className=`pointer-events-auto ${s.bg} text-white text-sm rounded-xl shadow-xl px-3.5 py-2.5 flex items-start gap-2 w-full animate-[toastIn_.25s_ease]`;
 el.innerHTML=`<svg viewBox="0 0 20 20" class="w-[18px] h-[18px] shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg><span class="flex-1 leading-snug">${esc(message)}</span><button type="button" class="shrink-0 opacity-80 hover:opacity-100 text-base leading-none" aria-label="Fermer la notification">×</button>`;
 el.querySelector('button').onclick=()=>el.remove();
 wrap.appendChild(el);
 if(duration)setTimeout(()=>{el.style.transition='opacity .25s ease';el.style.opacity='0';setTimeout(()=>el.remove(),250)},duration);
}
function friendlyError(error){
 const raw=(error&&error.message)||String(error||'');
 const m=raw.toLowerCase();
 const table=[
  [/invalid login credentials/,'Adresse courriel ou mot de passe incorrect.'],
  [/email not confirmed/,'Ton adresse courriel n\u2019est pas encore confirmée — vérifie ta boîte de réception.'],
  [/user already registered/,'Un compte existe déjà avec cette adresse courriel.'],
  [/password should be at least/,'Le mot de passe doit contenir au moins 6 caractères.'],
  [/invalid email/,'Adresse courriel invalide.'],
  [/jwt expired|invalid jwt|invalid refresh token/,'Ta session a expiré — reconnecte-toi.'],
  [/failed to fetch|networkerror|load failed/,'Impossible de contacter le serveur — vérifie ta connexion internet.'],
  [/duplicate key value/,'Cet élément existe déjà.'],
  [/row-level security|permission denied/,'Tu n\u2019as pas la permission nécessaire pour effectuer cette action.'],
  [/rate limit/,'Trop de tentatives — patiente un instant avant de réessayer.']
 ];
 for(const [re,msg] of table)if(re.test(m))return msg;
 return raw||'Une erreur est survenue.';
}
function confirmDialog(message,opts={}){
 const {title='Confirmer',confirmLabel='Supprimer',cancelLabel='Annuler',danger=true}=opts;
 return new Promise(resolve=>{
  $('confirmTitle').textContent=title;
  $('confirmMessage').textContent=message;
  const okBtn=$('confirmOkBtn'),cancelBtn=$('confirmCancelBtn');
  okBtn.textContent=confirmLabel;
  okBtn.className='flex-1 p-2.5 rounded-lg font-semibold text-white '+(danger?'bg-red-600 hover:bg-red-700':'bg-teal-600 hover:bg-teal-700');
  $('confirmIcon').className='shrink-0 w-10 h-10 rounded-full flex items-center justify-center '+(danger?'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400':'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-300');
  cancelBtn.textContent=cancelLabel;
  $('confirmModal').classList.remove('hidden');
  const cleanup=result=>{$('confirmModal').classList.add('hidden');okBtn.onclick=null;cancelBtn.onclick=null;resolve(result)};
  okBtn.onclick=()=>cleanup(true);
  cancelBtn.onclick=()=>cleanup(false);
  requestAnimationFrame(()=>okBtn.focus());
 });
}
$('confirmModal').addEventListener('click',e=>{if(e.target.id==='confirmModal')$('confirmCancelBtn').click()});
// ==== État réseau (en ligne / hors ligne) ====
function updateOnlineStatus(){$('offlineBanner')?.classList.toggle('hidden',navigator.onLine)}
window.addEventListener('online',()=>{updateOnlineStatus();toast('Connexion internet rétablie.','success',3000);syncPendingOps()});
window.addEventListener('offline',()=>{updateOnlineStatus();toast('Connexion internet perdue — tes modifications seront mises en attente et synchronisées automatiquement.','warn',5000)});
updateOnlineStatus();
document.addEventListener('keydown',e=>{
 if(e.key!=='Escape')return;
 if(!$('confirmModal').classList.contains('hidden')){$('confirmCancelBtn').click();return}
 if(!$('fileViewer').classList.contains('hidden')){closeFileViewer();return}
 if(!$('modal').classList.contains('hidden')){closeModal();return}
 if(!$('spaceActionsMenu').classList.contains('hidden')){$('spaceActionsMenu').classList.add('hidden');return}
 document.querySelectorAll('[id$="Menu"]:not(.hidden)').forEach(m=>m.classList.add('hidden'));
 if(!$('globalSearchResults').classList.contains('hidden'))$('globalSearchResults').classList.add('hidden');
 if(!$('mobileSearchRow').classList.contains('hidden'))$('mobileSearchRow').classList.add('hidden');
});
document.addEventListener('keydown',e=>{
 const tag=(e.target.tagName||'').toLowerCase();
 const typing=tag==='input'||tag==='textarea'||tag==='select'||e.target.isContentEditable;
 if(typing||e.metaKey||e.ctrlKey||e.altKey)return;
 if(e.key==='/'){
  e.preventDefault();
  if(window.innerWidth<640){if($('mobileSearchRow').classList.contains('hidden'))$('mobileSearchBtn').click();$('globalSearchMobile').focus();}
  else $('globalSearch').focus();
  return;
 }
 if(e.key.toLowerCase()==='n'){
  const openId=document.querySelector('.tab:not(.hidden)')?.id;
  const map={objectifs:'addObj',taches:'addTask',projets:'addProject',planning:'addPlanning'};
  const btnId=map[openId];
  if(btnId&&$(btnId)){e.preventDefault();$(btnId).click();}
 }
});
// ==== Indicateur de synchronisation (pastille dans l'en-tête) ====
function setSync(ok){const b=$('syncBadge');b.textContent=ok?'●':'●';b.title=ok?'Synchronisé':'Erreur de synchronisation';b.className='text-[10px] sm:text-xs px-1.5 sm:px-2 py-1 rounded-full whitespace-nowrap '+(ok?'text-emerald-300':'text-red-300')+' bg-white/20'}
// "planning" a été retiré de NAV_GROUPS : ce n'est plus un menu déroulant,
// c'est maintenant un bouton d'onglet direct (voir navPlanningGroup dans index.html),
// câblé comme les autres via document.querySelectorAll('.tab-btn[data-tab]') plus bas.
const NAV_GROUPS={
 bizplan:{btn:'navBizplanBtn',label:'navBizplanLabel',menu:'navBizplanMenu',def:"Plan d'affaires",tabs:{'bizplan':"Plan d'affaires",'excel':'Excel','rapport':'Rapport'}}
};
// ==== Navigation : barre d'onglets et bascule entre sections ====
function moveTabIndicator(){
 const ind=$('tabIndicator');
 const row=$('tabNavRow');
 if(!ind||!row)return;
 let active=null;
 row.querySelectorAll('.tab-btn.active').forEach(el=>{if(!active&&el.offsetParent!==null)active=el});
 if(!active)return;
 const rowRect=row.getBoundingClientRect(),btnRect=active.getBoundingClientRect();
 ind.style.width=btnRect.width+'px';
 ind.style.height=btnRect.height+'px';
 ind.style.left=(btnRect.left-rowRect.left)+'px';
 ind.style.top=(btnRect.top-rowRect.top)+'px';
 ind.style.opacity='1';
}
function openTab(id){
 document.querySelectorAll('.tab').forEach(x=>x.classList.add('hidden'));
 $(id).classList.remove('hidden');
 document.querySelectorAll('.tab-btn[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===id);if(b.dataset.tab===id)b.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'})});
 Object.values(NAV_GROUPS).forEach(g=>{
  const match=id in g.tabs;
  $(g.btn).classList.toggle('active',match);
  $(g.label).innerHTML=match?g.tabs[id]:g.def;
  $(g.menu).classList.add('hidden');
 });
 requestAnimationFrame(moveTabIndicator);
}
Object.values(NAV_GROUPS).forEach(g=>{
 $(g.btn).onclick=(e)=>{e.stopPropagation();const willOpen=$(g.menu).classList.contains('hidden');Object.values(NAV_GROUPS).forEach(o=>$(o.menu).classList.add('hidden'));if(willOpen)$(g.menu).classList.remove('hidden')};
});
document.querySelectorAll('.nav-group-item').forEach(b=>b.onclick=()=>openTab(b.dataset.tab));
document.addEventListener('click',e=>{if(!e.target.closest('#navBizplanBtn')&&!e.target.closest('.nav-group-item')){Object.values(NAV_GROUPS).forEach(g=>$(g.menu).classList.add('hidden'))}});
document.querySelectorAll('.tab-btn[data-tab]').forEach(b=>b.onclick=()=>openTab(b.dataset.tab));
moveTabIndicator();
requestAnimationFrame(()=>requestAnimationFrame(moveTabIndicator));
window.addEventListener('load',moveTabIndicator);
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(moveTabIndicator);
window.addEventListener('resize',()=>{clearTimeout(window.__tiResize);window.__tiResize=setTimeout(moveTabIndicator,120)});
function closeModal(){$('modal').classList.add('hidden');editing=null}
function modal(title,body){$('modalTitle').innerHTML=title;$('modalBody').innerHTML=body;$('modal').classList.remove('hidden')}
const input=(id,label,value='',type='text',extra='')=>`<label class="block text-sm font-medium mb-1">${label}</label><input id="${id}" type="${type}" value="${esc(value)}" class="w-full p-2.5 border rounded-lg mb-3 dark:bg-slate-800 dark:border-slate-700" ${extra}>`;
const progressField=(id,value=0)=>`<label class="block text-sm font-medium mb-1">Progression — <span id="${id}_val">${value}</span>%</label><input id="${id}" type="range" min="0" max="100" value="${value}" class="pro-range w-full mb-3" style="--val:${value}%" oninput="$('${id}_val').textContent=this.value;this.style.setProperty('--val',this.value+'%')">`;
const textarea=(id,label,value='')=>`<label class="block text-sm font-medium mb-1">${label}</label><textarea id="${id}" class="w-full p-2.5 border rounded-lg mb-3 h-24 dark:bg-slate-800 dark:border-slate-700">${esc(value)}</textarea>`;
const select=(id,label,value,opts)=>`<label class="block text-sm font-medium mb-1">${label}</label><select id="${id}" class="w-full p-2.5 border rounded-lg mb-3 dark:bg-slate-800 dark:border-slate-700">${opts.map(o=>`<option value="${o[0]}" ${o[0]===value?'selected':''}>${o[1]}</option>`).join('')}</select>`;
const saveBtn='<div class="flex gap-2"><button id="modalSave" class="flex-1 bg-teal-600 text-white p-2.5 rounded-lg font-semibold">Enregistrer</button><button onclick="closeModal()" class="flex-1 border p-2.5 rounded-lg">Annuler</button></div>';

// ==== Petits utilitaires pour les formulaires (menus déroulants, calculs de budget) ====
function projectOptions(selected=''){return [['','Aucun'],...data.projets.map(p=>[p.id,p.nom])]}
function projectSpent(projId){return data.taches.filter(t=>t.projet_id===projId).reduce((s,t)=>s+Number(t.budget||0),0)}
function projectRemaining(proj){return Number(proj.budget||0)-projectSpent(proj.id)}
function objectiveOptions(selected=''){return [['','Aucun'],...data.objectifs.map(o=>[o.id,o.titre])]}
function taskOptions(selected=''){return [['','Aucune'],...data.taches.map(t=>[t.id,t.titre])]}

// ==== Formulaires : objectifs, tâches, projets ====
function showObjective(id=null,presetProj=null){
 const o=id?data.objectifs.find(x=>x.id===id):{};
 editing={type:'objectifs',id};
 modal(id?'Modifier l’objectif':'Nouvel objectif',
 input('f_titre','Titre',o.titre)+textarea('f_desc','Description',o.description)+
 select('f_proj','Projet',o.projet_id||presetProj||'',projectOptions())+
 select('f_type','Type',o.type_objectif||'mensuel',[['mensuel','Mensuel'],['annuel','Annuel'],['autre','Autre']])+
 input('f_start','Date de début',o.date_debut||today(),'date')+input('f_end','Date cible',o.date_fin||'','date')+
 select('f_prio','Priorité',o.priorite||'moyenne',[['faible','Faible'],['moyenne','Moyenne'],['haute','Haute'],['urgente','Urgente']])+
 input('f_budget','Budget',o.budget||'','number','step="0.01"')+
 select('f_status','Statut',o.statut||'en_cours',[['en_cours','En cours'],['termine','Terminé'],['annule','Annulé']])+saveBtn);
 $('modalSave').onclick=async()=>{const p={user_id:user.id,workspace_id:currentEspaceId,titre:$('f_titre').value.trim(),description:$('f_desc').value,projet_id:$('f_proj').value||null,type_objectif:$('f_type').value,date_debut:$('f_start').value||null,date_fin:$('f_end').value||null,priorite:$('f_prio').value,budget:$('f_budget').value?+$('f_budget').value:null,statut:$('f_status').value};if(!p.titre)return toast('Titre requis','warn');await save('objectifs',p,id);};
}
function showTask(id=null,presetProj=null,presetStatus=null){
 const t=id?data.taches.find(x=>x.id===id):{projet_id:presetProj,statut:presetStatus};
 editing={type:'taches',id};
 modal(id?'Modifier la tâche':'Nouvelle tâche',
 input('f_titre','Titre',t.titre)+textarea('f_desc','Description',t.description)+
 input('f_date','Date',t.date_tache||today(),'date')+input('f_dead','Échéance',t.date_echeance||'','date')+
 `<div class="grid grid-cols-2 gap-3">${input('f_h1','Début',t.heure_debut||'','time')}${input('f_h2','Fin',t.heure_fin||'','time')}</div>`+
 select('f_prio','Priorité',t.priorite||'moyenne',[['faible','Faible'],['moyenne','Moyenne'],['haute','Haute'],['urgente','Urgente']])+
 select('f_proj','Projet',t.projet_id||'',projectOptions())+input('f_budget','Budget',t.budget||'','number','step="0.01"')+
 '<p id="f_budgetHint" class="text-xs text-slate-500 -mt-2 mb-3"></p>'+
 select('f_status','Statut',t.statut||'a_faire',[['a_faire','À faire'],['en_cours','En cours'],['complete','Complète']])+
 progressField('f_taskProg',t.progression||0)+saveBtn);
 const updateBudgetHint=()=>{const proj=data.projets.find(x=>x.id===$('f_proj').value);if(!proj||!proj.budget){$('f_budgetHint').textContent='';return}const otherSpent=projectSpent(proj.id)-(id&&t.projet_id===proj.id?Number(t.budget||0):0);const thisBudget=Number($('f_budget').value||0);const rem=Number(proj.budget)-otherSpent-thisBudget;$('f_budgetHint').textContent=`Projet "${proj.nom}" — budget global ${money(proj.budget)}, restant après cette tâche : ${money(rem)}`;$('f_budgetHint').className='text-xs -mt-2 mb-3 '+(rem<0?'text-red-600':'text-slate-500')};
 $('f_proj').onchange=updateBudgetHint;$('f_budget').oninput=updateBudgetHint;updateBudgetHint();
 $('modalSave').onclick=async()=>{const p={user_id:user.id,workspace_id:currentEspaceId,titre:$('f_titre').value.trim(),description:$('f_desc').value,date_tache:$('f_date').value||null,date_echeance:$('f_dead').value||null,heure_debut:$('f_h1').value||null,heure_fin:$('f_h2').value||null,priorite:$('f_prio').value,projet_id:$('f_proj').value||null,budget:$('f_budget').value?+$('f_budget').value:null,statut:$('f_status').value,terminee:$('f_status').value==='complete',progression:$('f_status').value==='complete'?100:(+$('f_taskProg').value||0)};if(!p.titre)return toast('Titre requis','warn');await save('taches',p,id);};
}
function bizPlanBlock(p,id){
 if(!id)return '<div class="mb-3"><label class="block text-sm font-medium mb-1">Documents du projet</label><p class="text-xs text-slate-500">Enregistre d\'abord le projet, puis rouvre-le en modification pour y joindre des documents (PDF/Word).</p></div>';
 return `<div class="mb-3"><label class="block text-sm font-medium mb-1">Documents du projet</label><div id="bizPlanCurrent" class="text-sm mb-2">${docListCompactHtml(id)}</div>
  <label id="bizPlanDropzone" for="f_bizplan" class="flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition border-slate-300 dark:border-slate-700 hover:border-teal-500 hover:bg-teal-50/50 dark:hover:bg-teal-950/20">
   <svg viewBox="0 0 20 20" class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13.5V4.5"/><path d="M6.5 8L10 4.5 13.5 8"/><path d="M3.5 13.5v2a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-2"/></svg>
   <span class="text-sm"><span class="text-teal-600 font-medium">Clique pour choisir un ou plusieurs fichiers</span> ou glisse-les ici</span>
   <input type="file" id="f_bizplan" accept=".pdf,.doc,.docx" multiple class="hidden">
  </label>
  <p class="text-[11px] text-slate-400 mt-1">Formats acceptés : PDF, Word — 20 Mo maximum par fichier. Tu peux en ajouter autant que tu veux.</p><p id="bizPlanStatus" class="text-xs text-slate-500 mt-1"></p></div>`;
}
function showProject(id=null){
 const p=id?data.projets.find(x=>x.id===id):{};
 editing={type:'projets',id};
 modal(id?'Modifier le projet':'Nouveau projet',
 input('f_nom','Nom',p.nom)+textarea('f_desc','Description',p.description)+
 input('f_start','Date de début',p.date_debut||today(),'date')+input('f_end','Date de fin',p.date_fin||'','date')+
 input('f_budget','Budget global',p.budget||'','number','step="0.01"')+
 (id&&p.budget?`<p class="text-xs text-slate-500 -mt-2 mb-3">Dépensé par les tâches liées : ${money(projectSpent(p.id))} · Restant : ${money(projectRemaining(p))}</p>`:'')+
 select('f_status','Statut',p.statut||'en_cours',[['en_cours','En cours'],['termine','Terminé'],['en_attente','En attente'],['annule','Annulé']])+
 textarea('f_projnotes','Note',p.notes)+
 bizPlanBlock(p,id)+saveBtn);
 if(id)$('f_bizplan').onchange=async()=>{const files=[...$('f_bizplan').files];$('f_bizplan').value='';if(files.length)await uploadProjectDocs(id,files)};
 if(id&&$('bizPlanDropzone')){
  const zone=$('bizPlanDropzone');
  const setActive=on=>{zone.classList.toggle('border-teal-500',on);zone.classList.toggle('bg-teal-50/50',on)};
  ['dragenter','dragover'].forEach(evt=>zone.addEventListener(evt,e=>{e.preventDefault();e.stopPropagation();setActive(true)}));
  ['dragleave','drop'].forEach(evt=>zone.addEventListener(evt,e=>{e.preventDefault();e.stopPropagation();setActive(false)}));
  zone.addEventListener('drop',async e=>{const files=[...e.dataTransfer.files];if(files.length)await uploadProjectDocs(id,files)});
 }
 $('modalSave').onclick=async()=>{const pld={user_id:user.id,workspace_id:currentEspaceId,nom:$('f_nom').value.trim(),description:$('f_desc').value,date_debut:$('f_start').value||null,date_fin:$('f_end').value||null,budget:$('f_budget').value?+$('f_budget').value:null,statut:$('f_status').value,notes:$('f_projnotes').value};if(!pld.nom)return toast('Nom requis','warn');await save('projets',pld,id);};
}
async function uploadBusinessPlan(projectId,file,statusElId='bizPlanStatus'){
 const MAX_SIZE=20*1024*1024;
 if(file.size>MAX_SIZE){
  toast(`Fichier trop volumineux (${(file.size/1024/1024).toFixed(1)} Mo). Le maximum est de 20 Mo.`,'warn',6000);
  const el=$(statusElId);if(el){el.textContent='Fichier trop volumineux (max 20 Mo).';el.className='text-xs text-red-600 font-medium'}
  return;
 }
 const proj=data.projets.find(x=>x.id===projectId);
 const setStatus=(t,isError)=>{const el=$(statusElId);if(el){el.innerHTML=t;el.className=isError?'text-xs text-red-600 font-medium':'text-xs text-slate-500'}};
 setStatus('Téléversement…',false);
 const path=`${user.id}/${projectId}/${Date.now()}_${file.name}`;
 const {error:upErr}=await db.storage.from('business-plans').upload(path,file,{upsert:true});
 if(upErr){setStatus('Erreur de téléversement : '+upErr.message+' — vérifie que le bucket "business-plans" existe dans Supabase (voir plans_affaires_setup.sql)',true);return}
 if(proj&&proj.business_plan_path&&proj.business_plan_path!==path){await db.storage.from('business-plans').remove([proj.business_plan_path])}
 const {error:updErr}=await db.from('projets').update({business_plan_path:path,business_plan_name:file.name,business_plan_uploaded_at:new Date().toISOString()}).eq('id',projectId).eq('workspace_id',currentEspaceId);
 if(updErr){setStatus('Erreur d\'enregistrement : '+updErr.message+' — vérifie que les colonnes business_plan_* existent sur la table projets',true);return}
 if(proj)Object.assign(proj,{business_plan_path:path,business_plan_name:file.name,business_plan_uploaded_at:new Date().toISOString()});
 setStatus('Téléversé <svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M6.8 10.2l2 2 4.4-4.6"/></svg>',false);
 refreshDocsUI(projectId);
 render();
}
async function downloadBusinessPlan(path,filename){
 let iosWin=null;
 if(IS_IOS)iosWin=window.open('about:blank','_blank');
 const {data:blob,error}=await db.storage.from('business-plans').download(path);
 if(error){if(iosWin)iosWin.close();toast('Erreur de téléchargement : '+friendlyError(error));return}
 const url=URL.createObjectURL(blob);
 if(IS_IOS){
  // Safari iOS ignore l'attribut "download" : on ouvre le fichier dans un nouvel onglet,
  // l'utilisateur peut ensuite utiliser le bouton Partager pour l'enregistrer.
  if(iosWin)iosWin.location=url;else window.open(url,'_blank');
 }else{
  const a=document.createElement('a');a.href=url;a.download=filename||'plan-affaires';document.body.appendChild(a);a.click();a.remove();
 }
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
let fileViewerUrl=null;
function closeFileViewer(){
 $('fileViewer').classList.add('hidden');
 $('fileViewerBody').innerHTML='';
 if(fileViewerUrl){URL.revokeObjectURL(fileViewerUrl);fileViewerUrl=null}
}
async function viewFile(path,filename){
 const name=filename||'document';
 const ext=(name.split('.').pop()||'').toLowerCase();
 const iosPdfFlow=IS_IOS&&ext==='pdf';
 let iosWin=null;
 if(iosPdfFlow)iosWin=window.open('about:blank','_blank');
 $('fileViewerName').textContent=name;
 $('fileViewerDownload').onclick=()=>downloadBusinessPlan(path,name);
 const body=$('fileViewerBody');
 body.innerHTML='<div class="h-full flex items-center justify-center text-sm text-slate-500 gap-2 p-8"><svg class="w-4 h-4 animate-spin" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="7" stroke-opacity=".25"/><path d="M17 10a7 7 0 0 0-7-7"/></svg> Chargement du document…</div>';
 if(!iosPdfFlow)$('fileViewer').classList.remove('hidden');
 if(fileViewerUrl){URL.revokeObjectURL(fileViewerUrl);fileViewerUrl=null}
 const {data:blob,error}=await db.storage.from('business-plans').download(path);
 if(error){
  if(iosWin)iosWin.close();
  if(iosPdfFlow){toast('Erreur de chargement : '+friendlyError(error));return}
  $('fileViewer').classList.remove('hidden');
  body.innerHTML=`<div class="h-full flex items-center justify-center text-sm text-red-600 p-8 text-center">Erreur de chargement : ${esc(friendlyError(error))}</div>`;return
 }
 if(ext==='pdf'){
  fileViewerUrl=URL.createObjectURL(new Blob([blob],{type:'application/pdf'}));
  if(iosPdfFlow){
   if(iosWin)iosWin.location=fileViewerUrl;else window.open(fileViewerUrl,'_blank');
   toast('Le PDF s\'ouvre dans un nouvel onglet (Safari iOS n\'affiche pas bien les PDF à l\'intérieur de l\'app).','info',5000);
   return;
  }
  body.innerHTML=`<iframe src="${fileViewerUrl}#toolbar=0&navpanes=0" class="w-full h-full border-0" title="${esc(name)}"></iframe>`;
 }else if(ext==='docx'){
  if(!window.mammoth){body.innerHTML='<div class="h-full flex items-center justify-center text-sm text-slate-500 p-8 text-center">Aperçu indisponible pour l\'instant. Utilise le bouton Télécharger.</div>';return}
  try{
   const arrayBuffer=await blob.arrayBuffer();
   const result=await mammoth.convertToHtml({arrayBuffer});
   body.innerHTML=`<div class="max-w-3xl mx-auto bg-white dark:bg-slate-900 shadow my-4 sm:my-8 p-6 sm:p-10 rounded-lg docx-preview">${result.value||'<p class="text-slate-500">Document vide.</p>'}</div>`;
  }catch(e){
   body.innerHTML=`<div class="h-full flex items-center justify-center text-sm text-red-600 p-8 text-center">Impossible d'afficher ce document Word : ${esc(e.message)}<br>Utilise le bouton Télécharger ci-dessus.</div>`;
  }
 }else{
  body.innerHTML=`<div class="h-full flex items-center justify-center text-sm text-slate-500 p-8 text-center">Aperçu non disponible pour ce type de fichier (.${esc(ext)}).<br>Utilise le bouton Télécharger ci-dessus pour l'ouvrir.</div>`;
 }
}
$('fileViewer').addEventListener('click',e=>{if(e.target.id==='fileViewer')closeFileViewer()});
async function removeBusinessPlan(projectId){
 if(!(await confirmDialog('Supprimer le plan d\'affaires de ce projet ?',{title:'Supprimer le plan d\u2019affaires'})))return;
 const proj=data.projets.find(x=>x.id===projectId);
 if(!proj||!proj.business_plan_path)return;
 await db.storage.from('business-plans').remove([proj.business_plan_path]);
 const {error}=await db.from('projets').update({business_plan_path:null,business_plan_name:null,business_plan_uploaded_at:null}).eq('id',projectId).eq('workspace_id',currentEspaceId);
 if(error){toast(friendlyError(error));return}
 proj.business_plan_path=null;proj.business_plan_name=null;
 refreshDocsUI(projectId);
}

// ==== Documents : vue centralisée de tous les fichiers téléversés (tous projets confondus) ====
// ==== Documents multiples par projet (table projet_documents) ====
const ICON_FILE='<svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h5.5L15 6.5V16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M11.3 3v3.4h3.4"/></svg>';
const ICON_EYE='<svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 10S5.5 4.5 10 4.5 17.5 10 17.5 10 14.5 15.5 10 15.5 2.5 10 2.5 10z"/><circle cx="10" cy="10" r="2.3"/></svg>';
const ICON_DL='<svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5v9.4"/><path d="M6.2 9.4L10 13.2l3.8-3.8"/><path d="M4 15.8h12"/></svg>';
const ICON_TRASH='<svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12"/><path d="M8 6V4.6c0-.6.4-1 1-1h2c.6 0 1 .4 1 1V6"/><path d="M5.5 6l.6 9.4c0 .6.5 1 1 1h5.8c.5 0 1-.4 1-1L15.5 6"/><path d="M8.3 9v4.4M11.7 9v4.4"/></svg>';
const DOC_MAX_SIZE=20*1024*1024;
function fmtSize(n){n=Number(n)||0;if(!n)return '';return n<1024*1024?Math.max(1,Math.round(n/1024))+' Ko':(n/1024/1024).toFixed(1)+' Mo'}
// Liste unifiée : documents de la table + ancien fichier unique (colonnes business_plan_*) s'il existe encore
function projectDocsList(projectId){
 const list=(data.documents||[]).filter(d=>d.projet_id===projectId).map(d=>({id:d.id,path:d.file_path,name:d.file_name||'Fichier',at:d.uploaded_at,size:d.file_size,legacy:false}));
 const proj=data.projets.find(x=>x.id===projectId);
 if(proj&&proj.business_plan_path&&!list.some(d=>d.path===proj.business_plan_path))list.push({id:'legacy:'+projectId,path:proj.business_plan_path,name:proj.business_plan_name||'Fichier',at:proj.business_plan_uploaded_at,size:0,legacy:true});
 return list;
}
function findDoc(projectId,docId){return projectDocsList(projectId).find(d=>d.id===docId)}
function viewDoc(projectId,docId){const d=findDoc(projectId,docId);if(d)viewFile(d.path,d.name)}
function downloadDoc(projectId,docId){const d=findDoc(projectId,docId);if(d)downloadBusinessPlan(d.path,d.name)}
function docRowHtml(d,projectId,projectName){
 const sub=[projectName?esc(projectName):'',d.at?'Téléversé le '+dateFr(String(d.at).slice(0,10)):'',fmtSize(d.size)].filter(Boolean).join(' · ');
 return `<div class="p-3 flex items-center justify-between gap-2 flex-wrap hover:bg-teal-50/40 dark:hover:bg-teal-950/10 transition">
  <div class="min-w-0"><div class="font-medium break-all">${ICON_FILE} ${esc(d.name)}</div>${sub?`<div class="text-xs text-slate-500">${sub}</div>`:''}</div>
  <div class="flex gap-3 text-sm shrink-0">
   <button type="button" class="text-indigo-600" onclick="viewDoc('${projectId}','${d.id}')">${ICON_EYE} Aperçu</button>
   <button type="button" class="text-teal-600" onclick="downloadDoc('${projectId}','${d.id}')">${ICON_DL} Télécharger</button>
   <button type="button" class="text-red-600" onclick="removeDoc('${projectId}','${d.id}')">${ICON_TRASH} Supprimer</button>
  </div>
 </div>`;
}
function docListCompactHtml(projectId){
 const docs=projectDocsList(projectId);
 if(!docs.length)return '<span class="text-slate-500">Aucun fichier</span>';
 return `<div class="border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-200 dark:divide-slate-700">${docs.map(d=>docRowHtml(d,projectId)).join('')}</div>`;
}
function refreshDocsUI(projectId){
 const el=$('bizPlanCurrent');if(el&&editing&&editing.type==='projets'&&editing.id===projectId)el.innerHTML=docListCompactHtml(projectId);
 render();
}
async function uploadProjectDocs(projectId,fileList,statusElId='bizPlanStatus'){
 const files=[...fileList];if(!files.length)return;
 const setStatus=(t,err)=>{const el=$(statusElId);if(el){el.textContent=t;el.className=err?'text-xs text-red-600 font-medium':'text-xs text-slate-500'}};
 if(!navigator.onLine){setStatus('Connexion requise pour téléverser des fichiers.',true);toast('Hors ligne — le téléversement de fichiers exige une connexion.','warn',4000);return}
 // Table pas encore créée : on garde l'ancien comportement (1 seul fichier par projet)
 if(!data.documentsOk){
  if(files.length>1)toast('Le script SQL « documents multiples » n\u2019est pas encore installé : seul le premier fichier est téléversé.','warn',7000);
  return uploadBusinessPlan(projectId,files[0],statusElId);
 }
 let ok=0;const failed=[];
 for(let i=0;i<files.length;i++){
  const f=files[i];
  setStatus(`Téléversement ${i+1}/${files.length}…`);
  if(f.size>DOC_MAX_SIZE){failed.push(`${f.name} (plus de 20 Mo)`);continue}
  const safe=f.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w.\-]+/g,'_');
  const path=`${user.id}/${projectId}/${Date.now()}_${i}_${safe}`;
  const {error:upErr}=await db.storage.from('business-plans').upload(path,f);
  if(upErr){failed.push(`${f.name} (${friendlyError(upErr)})`);continue}
  const {data:row,error:insErr}=await db.from('projet_documents').insert({workspace_id:currentEspaceId,projet_id:projectId,user_id:user.id,file_path:path,file_name:f.name,file_size:f.size}).select();
  if(insErr||!row||!row[0]){await db.storage.from('business-plans').remove([path]);failed.push(`${f.name} (${insErr?friendlyError(insErr):'enregistrement impossible'})`);continue}
  data.documents.unshift(row[0]);ok++;
 }
 if(failed.length){setStatus(`${ok} fichier(s) ajouté(s). Échec : ${failed.join(' ; ')}`,true);toast(`${failed.length} fichier(s) non téléversé(s).`,'warn',5000)}
 else{setStatus(`${ok} fichier${ok>1?'s':''} téléversé${ok>1?'s':''} ✓`);if(ok)toast(`${ok} document${ok>1?'s':''} ajouté${ok>1?'s':''}.`,'success',2500)}
 saveOfflineSnapshot();
 refreshDocsUI(projectId);
}
async function removeDoc(projectId,docId){
 const d=findDoc(projectId,docId);if(!d)return;
 if(d.legacy)return removeBusinessPlan(projectId);
 if(!(await confirmDialog(`Supprimer « ${d.name} » ?`,{title:'Supprimer le document'})))return;
 await db.storage.from('business-plans').remove([d.path]);
 const {error}=await db.from('projet_documents').delete().eq('id',docId).eq('workspace_id',currentEspaceId);
 if(error){toast(friendlyError(error));return}
 data.documents=data.documents.filter(x=>x.id!==docId);
 saveOfflineSnapshot();
 refreshDocsUI(projectId);
}

let docFilterProject=null;
function renderDocuments(){
 const sel=$('docProjectSelect');
 const prevVal=sel?sel.value:null;
 if(sel){
  sel.innerHTML=data.projets.map(p=>`<option value="${p.id}">${esc(p.nom)}</option>`).join('')||'<option value="">Aucun projet</option>';
  if(prevVal&&data.projets.some(p=>p.id===prevVal))sel.value=prevVal;
 }
 const all=allProjectDocsFlat();
 const withFiles=data.projets.filter(p=>all.some(d=>d.projectId===p.id));
 if(docFilterProject&&!withFiles.some(p=>p.id===docFilterProject))docFilterProject=null;

 // Chips cliquables : "Tous" + un par projet ayant au moins un document
 const chips=[{id:null,label:`Tous (${all.length})`}].concat(withFiles.map(p=>({id:p.id,label:`${p.nom} (${all.filter(d=>d.projectId===p.id).length})`})));
 $('docChips').innerHTML=chips.map(c=>`<button type="button" onclick="docFilterProject=${c.id?`'${c.id}'`:'null'};renderDocuments()"
   class="px-3 py-1.5 text-sm font-medium rounded-full transition ${docFilterProject===c.id?'bg-indigo-600 text-white shadow-sm':'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}">${esc(c.label)}</button>`).join('');

 const shown0=docFilterProject?all.filter(d=>d.projectId===docFilterProject):all;
 const q=($('docSearch')?.value||'').toLowerCase().trim();
 const shown=q?shown0.filter(d=>(d.name||'').toLowerCase().includes(q)||(d.projectName||'').toLowerCase().includes(q)):shown0;
 const ICON_FOLDER='<svg viewBox="0 0 20 20" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.2a1 1 0 0 1 1-1h3.3l1.4 1.7H16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.2z"/></svg>';
 const groups=data.projets.map(p=>({p,docs:shown.filter(d=>d.projectId===p.id)})).filter(g=>g.docs.length);
 let html=groups.map(({p,docs})=>{
  const total=docs.reduce((a,d)=>a+(Number(d.size)||0),0);
  return `<details open class="group rounded-2xl border border-teal-200/70 dark:border-teal-900/40 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
   <summary class="brand-tint cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-3 px-4 py-3 select-none">
    <div class="flex items-center gap-3 min-w-0">
     <span class="shrink-0 w-10 h-10 rounded-xl bg-white/70 dark:bg-white/10 text-teal-700 dark:text-teal-300 flex items-center justify-center shadow-sm">${ICON_FOLDER}</span>
     <div class="min-w-0"><div class="font-display font-bold truncate">${esc(p.nom)}</div><div class="text-xs text-slate-500">${docs.length} document${docs.length>1?'s':''}${total?' · '+fmtSize(total):''}</div></div>
    </div>
    <div class="flex items-center gap-2 shrink-0">
     <button type="button" onclick="event.preventDefault();event.stopPropagation();quickAddDocs('${p.id}')" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white">+ Ajouter</button>
     <svg viewBox="0 0 20 20" class="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7.5l5 5 5-5"/></svg>
    </div>
   </summary>
   <div class="divide-y divide-slate-200 dark:divide-slate-800">${docs.map(d=>docRowHtml(d,p.id,'')).join('')}</div>
  </details>`}).join('');
 if(!groups.length)html=`<div class="rounded-2xl border border-dashed border-teal-300/70 dark:border-teal-900/50 p-6 text-center text-sm text-slate-500">${q?'Aucun document ne correspond à ta recherche.':'Aucun fichier téléversé pour l’instant. Choisis un projet ci-dessus et téléverse un ou plusieurs fichiers.'}</div>`;
 const empty=(!q&&!docFilterProject)?data.projets.filter(p=>!all.some(d=>d.projectId===p.id)):[];
 if(empty.length)html+=`<div class="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 pt-1"><span class="font-semibold">Projets sans document :</span>${empty.map(p=>`<button type="button" onclick="quickAddDocs('${p.id}')" class="px-2 py-1 rounded-full border border-teal-200/70 dark:border-teal-900/40 hover:bg-teal-50 dark:hover:bg-teal-950/30">+ ${esc(p.nom)}</button>`).join('')}</div>`;
 $('docList').innerHTML=html;
}
let docQuickTarget=null;
function quickAddDocs(projectId){docQuickTarget=projectId;$('docQuickInput').click()}
$('docQuickInput').onchange=async()=>{const files=[...$('docQuickInput').files];$('docQuickInput').value='';if(files.length&&docQuickTarget)await uploadProjectDocs(docQuickTarget,files,'docUploadStatus')};
function allProjectDocsFlat(){return data.projets.flatMap(p=>projectDocsList(p.id).map(d=>({...d,projectId:p.id,projectName:p.nom})))}
$('docSearch').oninput=renderDocuments;
$('docUploadInput').multiple=true;
$('docUploadBtn').onclick=async()=>{
 const pid=$('docProjectSelect').value,files=[...$('docUploadInput').files];
 const st=$('docUploadStatus');
 if(!pid){st.textContent='Choisis un projet.';st.className='text-xs text-red-600 font-medium mb-2';return}
 if(!files.length){st.textContent='Choisis au moins un fichier.';st.className='text-xs text-red-600 font-medium mb-2';return}
 await uploadProjectDocs(pid,files,'docUploadStatus');
 $('docUploadInput').value='';
};

// ==== Rapport de projet : vue consolidée à l’écran + export PDF ====
let rapportProjectId=null;
function renderRapport(){
 const sel=$('rapportProjectSelect');
 const prevVal=rapportProjectId;
 sel.innerHTML='<option value="">— Choisir un projet —</option>'+data.projets.map(p=>`<option value="${p.id}">${esc(p.nom)}</option>`).join('');
 if(prevVal&&data.projets.some(p=>p.id===prevVal)){rapportProjectId=prevVal}
 sel.value=rapportProjectId||'';
 drawRapportContent();
}
function rapportBuildSections(projectId){
 const proj=data.projets.find(p=>p.id===projectId);
 if(!proj)return null;
 const tasks=data.taches.filter(t=>t.projet_id===projectId);
 const spent=projectSpent(projectId);
 const rem=projectRemaining(proj);
 const bp=data.businessPlans.find(b=>b.projet_id===projectId);
 const bpFilled=bp?BP_SECTIONS.filter(([key])=>bp[key]&&bp[key].trim()):[];
 return {proj,tasks,spent,rem,bp,bpFilled};
}
function drawRapportContent(){
 const box=$('rapportContent');
 if(!rapportProjectId){box.innerHTML='<div class="bg-[#F5F6F9] dark:bg-slate-900 rounded-xl shadow p-6 text-center text-slate-500 text-sm">Choisis un projet dans la liste ci-dessus pour afficher son rapport complet.</div>';return}
 const d=rapportBuildSections(rapportProjectId);
 if(!d){box.innerHTML='';return}
 const {proj,tasks,spent,rem,bp,bpFilled}=d;
 const doneCount=tasks.filter(t=>t.terminee||t.statut==='complete').length;
 const taskPct=tasks.length?Math.round(doneCount/tasks.length*100):0;
 const budget=Number(proj.budget||0), spentNum=Math.max(0,Number(spent||0));
 const budgetPct=budget?Math.min(100,Math.round(spentNum/budget*100)):0;
 const remaining=budget-spentNum;
 const status=statutLabel(proj.statut);
 const dateRange=`${proj.date_debut?dateFr(proj.date_debut):'—'} → ${proj.date_fin?dateFr(proj.date_fin):'—'}`;
 box.innerHTML=`
  <div class="report-shell">
   <div class="report-paper">
    <div class="report-cover">
     <div class="text-[10px] font-bold uppercase tracking-[.12em] text-white/70 mb-2">Rapport de projet</div>
     <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div><h3 class="font-display font-extrabold text-2xl leading-tight">${esc(proj.nom)}</h3><p class="text-sm text-white/75 mt-1 max-w-2xl">${esc(proj.description||'Synthèse professionnelle du projet')}</p></div>
      <span class="inline-flex w-fit px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-xs font-bold">${esc(status)}</span>
     </div>
     <div class="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
      <div class="bg-white/10 rounded-xl p-2.5 border border-white/10"><div class="text-white/60">Progression</div><b class="text-lg">${proj.progression||0}%</b></div>
      <div class="bg-white/10 rounded-xl p-2.5 border border-white/10"><div class="text-white/60">Tâches</div><b class="text-lg">${doneCount}/${tasks.length}</b></div>
      <div class="bg-white/10 rounded-xl p-2.5 border border-white/10"><div class="text-white/60">Période</div><b class="text-xs">${dateRange}</b></div>
      <div class="bg-white/10 rounded-xl p-2.5 border border-white/10"><div class="text-white/60">Budget restant</div><b class="text-lg">${budget?money(remaining):'—'}</b></div>
     </div>
    </div>
    <div class="p-4 sm:p-5 space-y-4">
     <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="report-kpi"><div class="report-kpi-label">Statut</div><div class="report-kpi-value text-base">${esc(status)}</div></div>
      <div class="report-kpi"><div class="report-kpi-label">Tâches terminées</div><div class="report-kpi-value">${taskPct}%</div></div>
      <div class="report-kpi"><div class="report-kpi-label">Dépensé</div><div class="report-kpi-value">${budget?money(spentNum):'—'}</div></div>
      <div class="report-kpi"><div class="report-kpi-label">Plan d'affaires</div><div class="report-kpi-value">${bpFilled.length}/${BP_SECTIONS.length}</div></div>
     </div>
     <div class="grid lg:grid-cols-2 gap-3">
      <div class="report-chart-card"><div class="report-chart-title">Avancement des tâches</div><div class="report-chart-wrap"><canvas id="reportTaskChart"></canvas></div></div>
      <div class="report-chart-card"><div class="report-chart-title">Utilisation du budget</div>
       ${budget?`<div class="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">${money(spentNum)} dépensé sur ${money(budget)}</div>
       <div class="report-progress-row"><div class="report-progress-head"><span>Consommation</span><span>${budgetPct}%</span></div><div class="report-progress-track"><div class="report-progress-fill" style="width:${budgetPct}%"></div></div></div>
       <div class="grid grid-cols-2 gap-2 mt-5"><div class="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><div class="text-[10px] uppercase font-bold text-slate-500">Dépensé</div><div class="font-bold mt-1">${money(spentNum)}</div></div><div class="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><div class="text-[10px] uppercase font-bold text-slate-500">Restant</div><div class="font-bold mt-1 ${remaining<0?'text-red-600':'text-emerald-600'}">${money(remaining)}</div></div></div>`:'<div class="h-full min-h-[175px] flex items-center justify-center text-sm text-slate-500 text-center">Aucun budget défini pour ce projet.</div>'}
      </div>
     </div>
     ${budget&&data.projets.filter(p=>Number(p.budget||0)>0).length>1?`<div class="report-chart-card"><div class="report-chart-title">Répartition des budgets du projet</div>${data.projets.filter(p=>Number(p.budget||0)>0).map(p=>{const b=Number(p.budget||0),sp=Math.max(0,Number(projectSpent(p.id)||0)),pct=Math.min(100,Math.round(sp/b*100));return `<div class="report-budget-row"><span class="font-semibold truncate">${esc(p.nom)}</span><div class="report-budget-track"><div class="report-budget-fill" style="width:${pct}%"></div></div><span class="text-right font-bold">${pct}%</span></div>`}).join('')}</div>`:''}
     <div class="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div class="px-4 py-3 bg-slate-50 dark:bg-slate-800/70 flex items-center justify-between"><h3 class="font-display font-bold">Tâches (${tasks.length})</h3><span class="text-xs text-slate-500">${doneCount} terminée${doneCount>1?'s':''}</span></div>
      ${tasks.length?`<div class="divide-y divide-slate-100 dark:divide-slate-800">${tasks.map(t=>{const done=!!(t.terminee||t.statut==='complete');return `<div class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span class="min-w-0 truncate ${done?'line-through opacity-55':''}">${done?'✓':'○'} ${esc(t.titre)}</span><span class="text-xs text-slate-500 shrink-0">${t.budget?money(t.budget)+' · ':''}${t.date_echeance?dateFr(t.date_echeance):''}</span></div>`}).join('')}</div>`:'<div class="p-5 text-sm text-slate-500">Aucune tâche liée à ce projet.</div>'}
     </div>
     <div class="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div class="px-4 py-3 bg-slate-50 dark:bg-slate-800/70"><h3 class="font-display font-bold">Plan d'affaires <span class="text-xs font-semibold text-slate-500">${bpFilled.length}/${BP_SECTIONS.length} sections</span></h3></div>
      <div class="p-4">${bpFilled.length?bpFilled.map(([key,title])=>`<div class="mb-4 last:mb-0"><div class="text-sm font-bold">${esc(title)}</div><p class="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap mt-1 leading-relaxed">${esc(bp[key])}</p></div>`).join(''):'<p class="text-sm text-slate-500">Aucune section rédigée pour l’instant.</p>'}</div>
     </div>
     ${(()=>{const ds=projectDocsList(proj.id);return ds.length?`<div class="rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/70 dark:bg-indigo-950/20 overflow-hidden"><div class="px-4 pt-3 text-sm font-semibold">Documents joints (${ds.length})</div><div class="divide-y divide-indigo-100 dark:divide-indigo-900/40">${ds.map(d=>docRowHtml(d,proj.id)).join('')}</div></div>`:''})()}
    </div>
   </div>
  </div>`;
 if(window.Chart){
  if(window.__reportTaskChart){try{window.__reportTaskChart.destroy()}catch(e){}}
  const dark=document.documentElement.classList.contains('dark');
  const total=tasks.length,active=Math.max(0,total-doneCount);
  window.__reportTaskChart=new Chart($('reportTaskChart'),{type:'doughnut',data:{labels:['Terminées','À faire'],datasets:[{data:total?[doneCount,active]:[1,0],backgroundColor:total?['#0f766e',dark?'#2b4d5a':'#d2ebed']:[dark?'#2b4d5a':'#d2ebed'],borderColor:dark?'#111c2e':'#fff',borderWidth:4}]},options:{responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{position:'bottom',labels:{color:dark?'#b3dade':'#3a6370',font:{family:"Inter",size:11,weight:'600'},usePointStyle:true,pointStyle:'circle',padding:15}},tooltip:{callbacks:{label:c=>` ${c.label} : ${c.parsed}`}}}},plugins:[{id:'reportCenter',afterDraw(chart){const{ctx,chartArea}=chart;if(!chartArea)return;const cx=(chartArea.left+chartArea.right)/2,cy=(chartArea.top+chartArea.bottom)/2;ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=dark?'#f6fbfc':'#102331';ctx.font="800 27px Inter";ctx.fillText(total,cx,cy-7);ctx.fillStyle=dark?'#7daeba':'#528391';ctx.font="600 11px Inter";ctx.fillText(total===1?'tâche':'tâches',cx,cy+15);ctx.restore()}}]});
 }
}
function statutLabel(s){return {en_cours:'En cours',termine:'Terminé',en_attente:'En attente',annule:'Annulé'}[s]||s||'—'}
$('rapportProjectSelect').onchange=()=>{rapportProjectId=$('rapportProjectSelect').value||null;drawRapportContent()};
const whiteBgPlugin={id:'whiteBg',beforeDraw(chart){const{ctx,width,height}=chart;ctx.save();ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);ctx.restore()}};
async function chartToImage(config,widthPx=1100,heightPx=680){
 const canvas=document.createElement('canvas');
 canvas.width=widthPx;canvas.height=heightPx;
 const ctx=canvas.getContext('2d');
 const chart=new Chart(ctx,{...config,plugins:[whiteBgPlugin,...(config.plugins||[])],options:{...(config.options||{}),responsive:false,animation:false,devicePixelRatio:1}});
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const img=canvas.toDataURL('image/png',1.0);
 chart.destroy();
 return img;
}
async function savePdf(doc,filename){
 const isMobile=/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.userAgentData&&navigator.userAgentData.mobile);
 if(isMobile){
  try{
   const blob=doc.output('blob');
   const file=new File([blob],filename,{type:'application/pdf'});
   if(navigator.canShare&&navigator.canShare({files:[file]})){
    await navigator.share({files:[file],title:filename});
    return;
   }
  }catch(e){/* l'utilisateur a peut-être annulé le partage, ou l'API n'est pas dispo : on retombe sur le téléchargement direct */}
 }
 doc.save(filename);
}
async function buildRapportPdf(){
 if(!rapportProjectId){toast('Choisis un projet d\'abord.','warn');return null}
 const d=rapportBuildSections(rapportProjectId);
 if(!d)return null;
 const {proj,tasks,spent,rem,bp,bpFilled}=d;
 const doneCount=tasks.filter(t=>t.terminee||t.statut==='complete').length;
 const {jsPDF}=window.jspdf;
 const doc=new jsPDF({unit:'pt',format:'a4'});
 doc.setProperties({title:`Rapport — ${proj.nom||'Projet'}`,subject:'Rapport de projet',author:'Orbis',creator:'Orbis'});
 const pageW=doc.internal.pageSize.getWidth(),pageH=doc.internal.pageSize.getHeight();
 const marginX=42,maxW=pageW-marginX*2;let y=54;
 const checkPage=(needed)=>{if(y+needed>pageH-46){doc.addPage();y=54}};
 const sectionTitle=(t)=>{
  checkPage(30);
  doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(15,118,110);doc.text(t,marginX,y);
  doc.setDrawColor(13,148,136);doc.setLineWidth(1.1);doc.line(marginX,y+5,pageW-marginX,y+5);
  y+=22;
 };
 const statRow=(items)=>{
  const colW=maxW/items.length;
  items.forEach((it,i)=>{
   const x=marginX+i*colW;
   doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(100,116,139);doc.text(it[0],x,y);
   doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(15,23,42);doc.text(String(it[1]),x,y+16);
  });
  y+=38;
 };

 doc.setFont('helvetica','bold');doc.setFontSize(20);doc.setTextColor(15,23,42);
 doc.text(proj.nom||'Projet',marginX,y);y+=22;
 if(proj.description){
  doc.setFont('helvetica','normal');doc.setFontSize(11);doc.setTextColor(100,116,139);
  const lines=doc.splitTextToSize(proj.description,maxW);
  lines.forEach(line=>{checkPage(14);doc.text(line,marginX,y);y+=14});
  y+=8;
 }
 statRow([['Statut',statutLabel(proj.statut)],['Progression',`${proj.progression||0}%`],['Tâches',`${doneCount}/${tasks.length} terminées`]]);

 if(proj.budget){
  sectionTitle('Budget');
  statRow([['Budget global',money(proj.budget)],['Dépensé',money(spent)],['Restant',money(rem)]]);
 }

 if(tasks.length||proj.budget){
  sectionTitle('Aperçu visuel');
  const chartCards=[];
  if(tasks.length){
   const dc=tasks.filter(t=>t.terminee||t.statut==='complete').length;
   const pct=Math.round(dc/tasks.length*100);
   chartCards.push({
    label:'Avancement des tâches',
    img:await chartToImage({
     type:'doughnut',
     data:{labels:['Terminées','À faire'],datasets:[{data:[dc,tasks.length-dc],backgroundColor:['#0f766e','#dbe3ea'],borderColor:'#ffffff',borderWidth:4,hoverOffset:0}]},
     options:{
      cutout:'70%',
      plugins:{
       legend:{position:'bottom',labels:{font:{size:24,family:'Helvetica'},color:'#2b4d5a',padding:22,boxWidth:18,usePointStyle:true,pointStyle:'circle'}},
       datalabels:{display:v=>v.dataset.data[v.dataIndex]>0,color:'#fff',font:{size:26,weight:'700',family:'Helvetica'},formatter:v=>Math.round(v/tasks.length*100)+'%'}
      }
     },
     plugins:[{id:'centerPct',afterDraw(chart){
      const{ctx,chartArea}=chart;if(!chartArea)return;
      const cx=(chartArea.left+chartArea.right)/2,cy=(chartArea.top+chartArea.bottom)/2;
      ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font="700 46px Helvetica";ctx.fillStyle='#102331';ctx.fillText(pct+'%',cx,cy-8);
      ctx.font="600 20px Helvetica";ctx.fillStyle='#528391';ctx.fillText(`${dc}/${tasks.length} tâches`,cx,cy+28);
      ctx.restore();
     }}]
    })
   });
  }
  if(proj.budget){
   chartCards.push({
    label:'Budget vs dépenses',
    img:await chartToImage({
     type:'bar',
     data:{labels:[''],datasets:[
      {label:'Budget',data:[proj.budget],backgroundColor:'#38bdf8',borderRadius:8,barThickness:56},
      {label:'Dépensé',data:[spent],backgroundColor:rem<0?'#dc2626':'#4f46e5',borderRadius:8,barThickness:56}
     ]},
     options:{
      indexAxis:'y',
      layout:{padding:{right:70}},
      plugins:{
       legend:{position:'bottom',labels:{font:{size:24,family:'Helvetica'},color:'#2b4d5a',padding:22,boxWidth:18,usePointStyle:true,pointStyle:'circle'}},
       datalabels:{anchor:'end',align:'end',color:'#102331',font:{size:22,weight:'700',family:'Helvetica'},formatter:v=>money(v)}
      },
      scales:{
       x:{beginAtZero:true,ticks:{font:{size:20,family:'Helvetica'},color:'#528391',callback:v=>money(v)},grid:{color:'#eef2f7'}},
       y:{ticks:{display:false},grid:{display:false}}
      }
     }
    })
   });
  }
  const gap=16,cardW=(maxW-gap*(chartCards.length-1))/chartCards.length,cardH=cardW*0.72,imgPad=10;
  checkPage(cardH+28);
  chartCards.forEach((c,i)=>{
   const cx=marginX+i*(cardW+gap);
   doc.setFillColor(249,250,251);doc.setDrawColor(226,232,240);doc.setLineWidth(0.8);
   doc.roundedRect(cx,y,cardW,cardH,8,8,'FD');
   doc.setFont('helvetica','bold');doc.setFontSize(10.5);doc.setTextColor(51,65,85);
   doc.text(c.label,cx+imgPad,y+18);
   doc.addImage(c.img,'PNG',cx+imgPad,y+26,cardW-imgPad*2,cardH-26-imgPad);
  });
  y+=cardH+22;
 }

 sectionTitle(`Tâches (${tasks.length})`);
 if(tasks.length){
  tasks.forEach(t=>{
   checkPage(17);
   const mark=(t.terminee||t.statut==='complete')?'[x]':'[ ]';
   doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(30,41,59);
   doc.text(`${mark} ${t.titre}`,marginX,y);
   const rightBits=[t.budget?money(t.budget):'',t.date_echeance?dateFr(t.date_echeance):''].filter(Boolean).join('   ·   ');
   if(rightBits){doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(100,116,139);doc.text(rightBits,pageW-marginX,y,{align:'right'});}
   y+=16;
  });
 } else {
  doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(100,116,139);doc.text('Aucune tâche liée à ce projet.',marginX,y);y+=16;
 }
 y+=8;

 sectionTitle(`Plan d'affaires (${bpFilled.length}/${BP_SECTIONS.length} sections)`);
 if(bpFilled.length){
  bpFilled.forEach(([key,title])=>{
   checkPage(28);
   doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(15,23,42);doc.text(title,marginX,y);y+=14;
   doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(51,65,85);
   doc.splitTextToSize(bp[key]||'',maxW).forEach(line=>{checkPage(13);doc.text(line,marginX,y);y+=13});
   y+=8;
  });
 } else {
  doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(100,116,139);doc.text('Aucune section rédigée.',marginX,y);y+=16;
 }

 const pageCount=doc.internal.getNumberOfPages();
 for(let p=1;p<=pageCount;p++){
  doc.setPage(p);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(148,163,184);
  doc.text(`Rapport généré le ${new Date().toLocaleDateString('fr-FR')} — Orbis`,pageW/2,pageH-20,{align:'center'});
 }

 return {doc,filename:`rapport-${(proj.nom||'projet').replace(/[^a-z0-9]+/gi,'-')}.pdf`};
}
async function previewPdf(doc,filename,iosWin=null){
 if(IS_IOS){
  const blobUrl=URL.createObjectURL(doc.output('blob'));
  if(iosWin)iosWin.location=blobUrl;else window.open(blobUrl,'_blank');
  toast('Le PDF s\'ouvre dans un nouvel onglet (Safari iOS n\'affiche pas bien les PDF à l\'intérieur de l\'app).','info',5000);
  return;
 }
 $('fileViewerName').textContent=filename;
 $('fileViewerDownload').onclick=()=>savePdf(doc,filename);
 const body=$('fileViewerBody');
 body.innerHTML='<div class="h-full flex items-center justify-center text-sm text-slate-500 gap-2 p-8"><svg class="w-4 h-4 animate-spin" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="7" stroke-opacity=".25"/><path d="M17 10a7 7 0 0 0-7-7"/></svg> Préparation de l\'aperçu…</div>';
 $('fileViewer').classList.remove('hidden');
 if(fileViewerUrl){URL.revokeObjectURL(fileViewerUrl);fileViewerUrl=null}
 fileViewerUrl=URL.createObjectURL(doc.output('blob'));
 await new Promise(r=>requestAnimationFrame(r));
 body.innerHTML=`<iframe src="${fileViewerUrl}#toolbar=0&navpanes=0&view=FitH" class="w-full h-full border-0" title="${esc(filename)}"></iframe>`;
}
$('rapportPreview').onclick=async()=>{
 let iosWin=null;
 if(IS_IOS)iosWin=window.open('about:blank','_blank');
 $('rapportPreview').disabled=true;
 toast('Génération de l\'aperçu…','info',2000);
 const built=await buildRapportPdf();
 $('rapportPreview').disabled=false;
 if(!built){if(iosWin)iosWin.close();return}
 await previewPdf(built.doc,built.filename,iosWin);
};
$('rapportDownload').onclick=async()=>{
 $('rapportDownload').disabled=true;
 const built=await buildRapportPdf();
 $('rapportDownload').disabled=false;
 if(!built)return;
 await savePdf(built.doc,built.filename);
};

// ==== Plan d’affaires structuré par sections (par projet) ====
const BP_SECTIONS=[
 ['resume_executif',"Résumé exécutif","En quelques phrases : la vision, la mission et ce qui rend ton projet unique."],
 ['entreprise',"Description de l'entreprise","Historique, forme juridique, emplacement, mission et valeurs."],
 ['marche',"Étude de marché","Clientèle cible, taille du marché, concurrence, tendances."],
 ['produits',"Produits / Services","Ce que tu vends, ce qui le différencie, ton offre actuelle et future."],
 ['marketing',"Marketing & Ventes","Comment tu attires et gardes tes clients, tes canaux, ta stratégie de prix."],
 ['operations',"Opérations","Fonctionnement au quotidien, fournisseurs, équipements, logistique."],
 ['equipe',"Équipe & Organisation","Qui fait quoi, expérience clé, besoins de recrutement."],
 ['finances',"Plan financier","Revenus prévus, coûts, seuil de rentabilité, besoins de financement."],
 ['annexes',"Annexes","Documents complémentaires, sources, hypothèses détaillées."]
];
let bpCurrentProjectId=null,bpDebounce={};
let bpLastError=null;
async function ensureBusinessPlan(projectId){
 let bp=data.businessPlans.find(x=>x.projet_id===projectId);
 if(bp)return bp;
 const {data:inserted,error}=await db.from('business_plans').insert({user_id:user.id,workspace_id:currentEspaceId,projet_id:projectId}).select();
 if(error){bpLastError=error.message;console.warn('Impossible de créer le plan d\'affaires :',error.message);return null}
 bpLastError=null;
 bp=inserted&&inserted[0];if(bp)data.businessPlans.push(bp);
 return bp;
}
function bpShowPlaceholder(msg){
 const editor=$('bpEditor');
 editor.innerHTML=`<div class="bg-[#F5F6F9] dark:bg-slate-900 rounded-xl shadow p-6 text-center text-slate-500 text-sm">${msg}</div>`;
}
function renderBizPlan(){
 const sel=$('bpProjectSelect');
 if(!data.projets.length){$('bpEmpty').classList.remove('hidden');$('bpEditor').classList.add('hidden');if(sel)sel.innerHTML='';return}
 $('bpEmpty').classList.add('hidden');$('bpEditor').classList.remove('hidden');
 sel.innerHTML='<option value="">— Choisir un projet —</option>'+data.projets.map(p=>`<option value="${p.id}" ${p.id===bpCurrentProjectId?'selected':''}>${esc(p.nom)}</option>`).join('');
 sel.value=bpCurrentProjectId||'';
 // Ne pas écraser le texte en cours de frappe si un rechargement arrive en arrière-plan
 if(document.activeElement&&$('bpEditor').contains(document.activeElement))return;
 if(!bpCurrentProjectId){bpShowPlaceholder('Choisis un projet dans la liste ci-dessus pour afficher ou rédiger son plan d\'affaires.');return}
 drawBizPlanSections();
}
async function drawBizPlanSections(){
 let bp=data.businessPlans.find(x=>x.projet_id===bpCurrentProjectId);
 if(!bp)bp=await ensureBusinessPlan(bpCurrentProjectId);
 const editor=$('bpEditor');
 editor.innerHTML='';
 if(!bp){
  editor.innerHTML=`<div class="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-xl p-4 text-sm">
   <svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5l7.5 13H2.5z"/><path d="M10 8.3v3.4"/><circle cx="10" cy="14.3" r="0.9" fill="currentColor" stroke="none"/></svg> Impossible d'ouvrir le plan d'affaires : la table <code>business_plans</code> n'existe pas encore (ou n'est pas accessible) dans Supabase.<br>
   Détail technique : ${esc(bpLastError||'inconnu')}<br><br>
   Exécute le script <b>business_plans_structure.sql</b> dans Supabase → SQL Editor, puis reviens sur cet onglet.
  </div>`;
  return;
 }
 const wrap=document.createElement('div');wrap.className='space-y-3';
 BP_SECTIONS.forEach(([key,title,hint])=>{
  const d=document.createElement('details');d.open=true;d.className='bg-[#F5F6F9] dark:bg-slate-900 rounded-xl shadow p-4';
  d.innerHTML=`<summary class="font-semibold cursor-pointer">${title}</summary><p class="text-xs text-slate-500 mt-1 mb-2">${hint}</p><textarea data-key="${key}" rows="4" class="w-full p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm">${esc(bp[key]||'')}</textarea>`;
  wrap.appendChild(d);
 });
 const status=document.createElement('p');status.id='bpStatus';status.className='text-xs text-slate-500';
 editor.appendChild(status);editor.appendChild(wrap);
 const saveBar=document.createElement('div');saveBar.className='flex justify-end pt-1';
 saveBar.innerHTML='<button id="bpSaveAll" class="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3.5h9.5L16.5 6.5V16a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z"/><path d="M6 3.5v4h6v-4"/><path d="M6.5 12h7v4.5h-7z"/></svg> Enregistrer le plan d\'affaires</button>';
 editor.appendChild(saveBar);
 editor.querySelectorAll('textarea[data-key]').forEach(ta=>{
  ta.addEventListener('input',()=>{
   status.textContent='Modification en cours…';status.className='text-xs text-slate-500';
   clearTimeout(bpDebounce[ta.dataset.key]);
   bpDebounce[ta.dataset.key]=setTimeout(()=>saveBizPlanField(ta.dataset.key,ta.value,status),700);
  });
 });
 $('bpSaveAll').addEventListener('click',()=>saveAllBizPlanFields(editor,status));
 $('bpSaveAll').addEventListener('touchend',e=>{e.preventDefault();saveAllBizPlanFields(editor,status)});
}
async function saveBizPlanField(key,value,statusEl){
 const bp=data.businessPlans.find(x=>x.projet_id===bpCurrentProjectId);
 if(!bp){if(statusEl){statusEl.textContent='Erreur : le plan n\'a pas pu être créé (voir message ci-dessus)';statusEl.className='text-xs text-red-600 font-medium'}return}
 const payload={};payload[key]=value;
 const {error}=await db.from('business_plans').update(payload).eq('id',bp.id).eq('workspace_id',currentEspaceId);
 if(statusEl){statusEl.innerHTML=error?('Erreur : '+esc(friendlyError(error))):'Enregistré <svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M6.8 10.2l2 2 4.4-4.6"/></svg>';statusEl.className=error?'text-xs text-red-600 font-medium':'text-xs text-emerald-600'}
 if(!error)Object.assign(bp,payload);
}
async function saveAllBizPlanFields(editor,statusEl){
 const bp=data.businessPlans.find(x=>x.projet_id===bpCurrentProjectId);
 if(!bp){statusEl.textContent='Erreur : le plan n\'a pas pu être créé (voir message ci-dessus)';statusEl.className='text-xs text-red-600 font-medium';return}
 Object.values(bpDebounce).forEach(t=>clearTimeout(t));
 statusEl.textContent='Enregistrement…';statusEl.className='text-xs text-slate-500';
 const payload={};
 editor.querySelectorAll('textarea[data-key]').forEach(ta=>{payload[ta.dataset.key]=ta.value});
 const {error}=await db.from('business_plans').update(payload).eq('id',bp.id).eq('workspace_id',currentEspaceId);
 if(error){statusEl.textContent='Erreur : '+friendlyError(error);statusEl.className='text-xs text-red-600 font-medium';return}
 Object.assign(bp,payload);
 bpCurrentProjectId=null;
 $('bpProjectSelect').value='';
 bpShowPlaceholder('<svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M6.8 10.2l2 2 4.4-4.6"/></svg> Plan d\'affaires enregistré. Choisis un projet dans la liste ci-dessus pour le revoir ou continuer à le rédiger.');
}
$('bpProjectSelect').onchange=()=>{
 bpCurrentProjectId=$('bpProjectSelect').value||null;
 if(!bpCurrentProjectId){bpShowPlaceholder('Choisis un projet dans la liste ci-dessus pour afficher ou rédiger son plan d\'affaires.');return}
 drawBizPlanSections();
};
function goToBizPlan(projectId){bpCurrentProjectId=projectId;openTab('bizplan');renderBizPlan();}
function showBizPlanPreview(projectId){
 const proj=data.projets.find(p=>p.id===projectId);
 const bp=data.businessPlans.find(b=>b.projet_id===projectId)||{};
 const filled=BP_SECTIONS.filter(([key])=>bp[key]&&bp[key].trim());
 const body=(filled.length?filled.map(([key,title])=>`<div class="mb-4"><h3 class="font-display font-bold text-base mb-1">${title}</h3><p class="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">${esc(bp[key])}</p></div>`).join('')
  :'<p class="text-slate-500 text-sm">Aucune section rédigée pour ce projet pour l’instant.</p>')
  +`<div class="flex gap-3 mt-4 pt-3 border-t dark:border-slate-700 text-sm"><button class="text-teal-600" onclick="$('modal').classList.add('hidden');goToBizPlan('${projectId}')"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 15.8l.3-2.4 8.1-8.1a1.3 1.3 0 0 1 1.9 0l.1.1a1.3 1.3 0 0 1 0 1.9l-8.1 8.1-2.3.4z"/><path d="M11.4 6.4l2 2"/></svg> Modifier</button><button class="text-slate-500" onclick="$('modal').classList.add('hidden');bpCurrentProjectId='${projectId}';$('bpExport').click()"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7.5V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3.5"/><rect x="3.5" y="7.5" width="13" height="6" rx="1"/><path d="M6 12.5h8V17H6z"/></svg> Télécharger</button></div>`;
 modal(`<svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.3" width="12" height="13.4" rx="1.3"/><path d="M7 7.2h6M7 10h6M7 12.8h3.6"/></svg> Plan d'affaires — ${esc(proj?.nom||'')}`,body);
}
$('bpExport').onclick=async()=>{
 const proj=data.projets.find(p=>p.id===bpCurrentProjectId);
 const bp=data.businessPlans.find(x=>x.projet_id===bpCurrentProjectId)||{};
 const {jsPDF}=window.jspdf;
 const doc=new jsPDF({unit:'pt',format:'a4'});
 const pageW=doc.internal.pageSize.getWidth(),pageH=doc.internal.pageSize.getHeight();
 const marginX=42,maxW=pageW-marginX*2;let y=54;
 const checkPage=(needed)=>{if(y+needed>pageH-46){doc.addPage();y=54}};
 doc.setFont('helvetica','bold');doc.setFontSize(18);doc.setTextColor(15,23,42);
 doc.text(`Plan d'affaires — ${proj?.nom||''}`,marginX,y);y+=26;
 BP_SECTIONS.forEach(([key,title])=>{
  checkPage(30);
  doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(15,118,110);doc.text(title,marginX,y);y+=16;
  doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(51,65,85);
  doc.splitTextToSize(bp[key]||'—',maxW).forEach(line=>{checkPage(13);doc.text(line,marginX,y);y+=13});
  y+=10;
 });
 const pageCount=doc.internal.getNumberOfPages();
 for(let p=1;p<=pageCount;p++){
  doc.setPage(p);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(148,163,184);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} — Orbis`,pageW/2,pageH-20,{align:'center'});
 }
 await savePdf(doc,`plan-affaires-${(proj?.nom||'projet').replace(/[^a-z0-9]+/gi,'-')}.pdf`);
};
function showPlanning(id=null){
 const p=id?data.planning.find(x=>x.id===id):{};
 editing={type:'planning',id};
 modal(id?'Modifier le planning':'Nouvel événement',
 input('f_titre','Titre',p.titre)+textarea('f_desc','Description',p.description)+
 input('f_date','Date',p.date_planifiee||today(),'date')+`<div class="grid grid-cols-2 gap-3">${input('f_h1','Début',p.heure_debut||'09:00','time')}${input('f_h2','Fin',p.heure_fin||'','time')}</div>`+
 input('f_lieu','Lieu',p.lieu)+
 select('f_status','Statut',p.statut||'planifie',[['planifie','Planifié'],['termine','Terminé'],['annule','Annulé']])+saveBtn);
 $('modalSave').onclick=async()=>{const pld={user_id:user.id,workspace_id:currentEspaceId,titre:$('f_titre').value.trim(),description:$('f_desc').value,date_planifiee:$('f_date').value,heure_debut:$('f_h1').value||null,heure_fin:$('f_h2').value||null,lieu:$('f_lieu').value,statut:$('f_status').value};if(!pld.titre||!pld.date_planifiee)return toast('Titre et date requis','warn');await save('planning',pld,id);};
}
// Les anciens formulaires globaux "Rappel" et "Note" ont été retirés avec leurs onglets.
// Chaque projet porte maintenant sa propre note libre, directement dans son formulaire
// (champ f_projnotes dans showProject(), colonne projets.notes).

// ==== Mode hors ligne : cache local + file d'attente de synchronisation ====
// Principe : les tables de données courantes (objectifs, tâches, projets, planning,
// rappels, notes) restent utilisables sans connexion. Les téléversements de fichiers,
// la gestion des espaces communs et les invitations exigent toujours une connexion.
const OFFLINE_QUEUE_KEY='orbis_pending_ops';
const OFFLINE_SNAPSHOT_KEY='orbis_offline_snapshot';
const TABLE_KEYS={objectifs:'objectifs',taches:'taches',projets:'projets',planning:'planning',rappel:'rappels',notes:'notes'};
let pendingOps=[], syncInProgress=false;
const isTempId=id=>typeof id==='string'&&id.startsWith('tmp_');
const genTempId=()=>'tmp_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
const isNetworkError=error=>/failed to fetch|networkerror|load failed|network request failed/.test((error&&error.message||'').toLowerCase());
function loadPendingOps(){try{pendingOps=JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)||'[]')}catch{pendingOps=[]}}
function persistPendingOps(){try{localStorage.setItem(OFFLINE_QUEUE_KEY,JSON.stringify(pendingOps))}catch{}}
function saveOfflineSnapshot(){try{localStorage.setItem(OFFLINE_SNAPSHOT_KEY,JSON.stringify({data,espaces,currentEspaceId,ts:Date.now()}))}catch{}}
function loadOfflineSnapshot(){try{return JSON.parse(localStorage.getItem(OFFLINE_SNAPSHOT_KEY)||'null')}catch{return null}}
function localArray(table){return data[TABLE_KEYS[table]]}
function updatePendingBadge(){
 const n=pendingOps.filter(o=>o.workspaceId===currentEspaceId).length;
 const b=$('pendingSyncBadge');if(!b)return;
 b.classList.toggle('hidden',n===0);b.textContent=n;
}
function queueInsert(table,payload,tempId){pendingOps.push({opId:genTempId(),type:'insert',table,tempId,payload:{...payload},workspaceId:currentEspaceId,ts:Date.now()});persistPendingOps();updatePendingBadge()}
function queueUpdate(table,id,payload){
 const existing=pendingOps.find(o=>o.type==='update'&&o.table===table&&o.id===id);
 if(existing)Object.assign(existing.payload,payload);
 else pendingOps.push({opId:genTempId(),type:'update',table,id,payload:{...payload},workspaceId:currentEspaceId,ts:Date.now()});
 persistPendingOps();updatePendingBadge();
}
function queueDelete(table,id){
 pendingOps=pendingOps.filter(o=>!((o.type==='update'||o.type==='delete')&&o.table===table&&o.id===id));
 pendingOps.push({opId:genTempId(),type:'delete',table,id,workspaceId:currentEspaceId,ts:Date.now()});
 persistPendingOps();updatePendingBadge();
}
function dropQueuedInsert(table,tempId){pendingOps=pendingOps.filter(o=>!(o.type==='insert'&&o.table===table&&o.tempId===tempId));persistPendingOps();updatePendingBadge()}
function applyLocalUpdate(table,id,payload){const arr=localArray(table),item=arr&&arr.find(x=>x.id===id);if(item)Object.assign(item,payload);saveOfflineSnapshot()}
function applyLocalDelete(table,id){const arr=localArray(table);if(arr){const i=arr.findIndex(x=>x.id===id);if(i>-1)arr.splice(i,1)}saveOfflineSnapshot()}

async function writeInsert(table,payload){
 const goOffline=()=>{
  const tempId=genTempId();
  queueInsert(table,payload,tempId);
  const localItem={...payload,id:tempId,_pending:true};
  localArray(table)?.unshift(localItem);
  saveOfflineSnapshot();
  return {data:localItem,error:null,offline:true};
 };
 if(!navigator.onLine)return goOffline();
 const {data:inserted,error}=await db.from(table).insert(payload).select();
 if(error)return isNetworkError(error)?goOffline():{data:null,error,offline:false};
 if(inserted&&inserted[0])localArray(table)?.unshift(inserted[0]);
 return {data:inserted&&inserted[0],error:null,offline:false};
}
async function writeUpdate(table,id,payload){
 if(isTempId(id)){
  const pending=pendingOps.find(o=>o.type==='insert'&&o.table===table&&o.tempId===id);
  if(pending)Object.assign(pending.payload,payload);
  persistPendingOps();applyLocalUpdate(table,id,payload);
  return {error:null,offline:true};
 }
 const goOffline=()=>{queueUpdate(table,id,payload);applyLocalUpdate(table,id,payload);return {error:null,offline:true}};
 if(!navigator.onLine)return goOffline();
 const {error}=await db.from(table).update(payload).eq('id',id).eq('workspace_id',currentEspaceId);
 if(error)return isNetworkError(error)?goOffline():{error,offline:false};
 return {error:null,offline:false};
}
async function writeDelete(table,id){
 if(isTempId(id)){dropQueuedInsert(table,id);applyLocalDelete(table,id);return {error:null,offline:true}}
 const goOffline=()=>{queueDelete(table,id);applyLocalDelete(table,id);return {error:null,offline:true}};
 if(!navigator.onLine)return goOffline();
 const {error}=await db.from(table).delete().eq('id',id).eq('workspace_id',currentEspaceId);
 if(error)return isNetworkError(error)?goOffline():{error,offline:false};
 return {error:null,offline:false};
}
function remapForeignKeys(payload,idMap){['projet_id','tache_id','objectif_id'].forEach(k=>{if(payload[k]&&idMap[payload[k]])payload[k]=idMap[payload[k]]});return payload}
async function syncPendingOps(){
 if(syncInProgress||!navigator.onLine||!pendingOps.length||!user)return;
 syncInProgress=true;
 const idMap={},remaining=[];
 for(const op of pendingOps){
  try{
   if(op.type==='insert'){
    const {data:inserted,error}=await db.from(op.table).insert(remapForeignKeys({...op.payload},idMap)).select();
    if(error){remaining.push(op);continue}
    if(inserted&&inserted[0])idMap[op.tempId]=inserted[0].id;
   }else if(op.type==='update'){
    const id=idMap[op.id]||op.id;
    if(isTempId(id)){remaining.push(op);continue}
    const {error}=await db.from(op.table).update(remapForeignKeys({...op.payload},idMap)).eq('id',id).eq('workspace_id',op.workspaceId);
    if(error){remaining.push(op);continue}
   }else if(op.type==='delete'){
    const id=idMap[op.id]||op.id;
    if(!isTempId(id)){
     const {error}=await db.from(op.table).delete().eq('id',id).eq('workspace_id',op.workspaceId);
     if(error){remaining.push(op);continue}
    }
   }
  }catch{remaining.push(op)}
 }
 pendingOps=remaining;persistPendingOps();updatePendingBadge();syncInProgress=false;
 toast(remaining.length?`${remaining.length} modification(s) hors ligne n\u2019ont pas pu être synchronisées — nouvel essai plus tard.`:'Synchronisation terminée : tes modifications hors ligne ont été envoyées.',remaining.length?'warn':'success',4000);
 await loadData();
}

async function save(table,payload,id){
 const {error,offline}=id?await writeUpdate(table,id,payload):await writeInsert(table,payload);
 if(error){toast('Erreur Supabase : '+friendlyError(error));return}
 if(offline){toast('Hors ligne — sera synchronisé au retour de la connexion.','warn',4000);closeModal();render();return}
 toast('Enregistré avec succès.','success',2500);closeModal();await loadData();
}
async function remove(table,id){
 if(!(await confirmDialog('Supprimer cet élément ?')))return;
 const docPaths=table==='projets'?projectDocsList(id).map(d=>d.path):[];
 const {error,offline}=await writeDelete(table,id);
 if(error){toast(friendlyError(error));return}
 if(docPaths.length&&!offline)db.storage.from('business-plans').remove(docPaths);
 if(offline){toast('Suppression enregistrée hors ligne — sera synchronisée au retour de la connexion.','warn',4000);render();return}
 loadData();
}
async function progress(table,id,val){
 const v=+val;
 const p={progression:v};
 if(table==='taches'){
  const t=data.taches.find(x=>x.id===id);
  if(v>=100){p.statut='complete';p.terminee=true;}
  else if(t&&(t.terminee||t.statut==='complete')){p.statut='en_cours';p.terminee=false;}
 }
 const {error,offline}=await writeUpdate(table,id,p);
 if(error){toast(friendlyError(error));return}
 if(offline){render();return}
 if(table==='taches'){const t=data.taches.find(x=>x.id===id);if(t)Object.assign(t,p);render();}
 else loadData();
}
async function toggleTask(id,done){
 const {error,offline}=await writeUpdate('taches',id,{terminee:!done,statut:!done?'complete':'a_faire',progression:!done?100:0});
 if(error){toast(friendlyError(error));return}
 if(offline){render();return}
 loadData();
}
const PROJECT_STATUS={
 en_cours:{label:'En cours',cls:'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'},
 termine:{label:'Terminé',cls:'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'},
 en_attente:{label:'En attente',cls:'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'},
 annule:{label:'Annulé',cls:'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}
};
const STATUT_ORDER={en_cours:0,en_attente:1,termine:2,annule:3};
// ==== Rendu principal : construit le HTML de chaque onglet à partir de `data` ====
function proBar(id,table,val){return `<input class="pro-range w-full" style="--val:${val}%" type="range" min="0" max="100" value="${val}" onchange="progress('${table}','${id}',this.value)">`}
function render(){
 const obj=data.objectifs,t=data.taches,p=data.projets,pl=data.planning;
 if($('dashboardDateLabel'))$('dashboardDateLabel').textContent=new Date().toLocaleDateString('fr-CA',{weekday:'long',day:'numeric',month:'long'});
 $('countObj').textContent=obj.length;$('doneObj').textContent=`${obj.filter(x=>x.progression===100).length} terminé(s)`;
 $('countTask').textContent=t.filter(x=>!x.terminee&&x.statut!=='complete').length;$('doneTask').textContent=`${t.filter(x=>x.terminee||x.statut==='complete').length} terminée(s)`;
 $('countProject').textContent=p.length;$('activeProject').textContent=`${p.filter(x=>x.statut==='en_cours').length} actif(s)`;
 const lim=new Date();lim.setDate(lim.getDate()+7);$('countUpcoming').textContent=pl.filter(x=>x.date_planifiee>=today()&&x.date_planifiee<=lim.toISOString().slice(0,10)).length;

 const todays=t.filter(x=>x.date_tache===today()||x.date_echeance===today());
 $('todayList').innerHTML=todays.length?todays.map(x=>`<div class="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800"><div><div class="font-medium ${x.terminee?'line-through opacity-60':''}">${esc(x.titre)}</div><div class="text-xs text-slate-500">${x.heure_debut||''} ${x.priorite?'· '+esc(x.priorite):''}</div></div><button onclick="toggleTask('${x.id}',${!!x.terminee})" class="text-lg">${x.terminee?'<svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5L3.5 9.5l3 3"/><path d="M3.5 9.5H12a3.6 3.6 0 0 1 3.6 3.6v0A3.6 3.6 0 0 1 12 16.7"/></svg>':'<svg viewBox="0 0 20 20" class="inline-block w-5 h-5 align-[-4px]" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="13" height="13" rx="2.5" fill="#0f766e" stroke="#0f766e"/><path d="M6.8 10.2l2 2 4.4-4.6" stroke="white"/></svg>'}</button></div>`).join(''):'<p class="text-slate-500 text-sm">Aucune tâche prévue aujourd’hui.</p>';

 renderObjectives();

 const taskCard=x=>`<div class="bg-[#F5F6F9] dark:bg-slate-900 rounded-xl shadow p-3 flex gap-3 items-start"><button onclick="toggleTask('${x.id}',${!!x.terminee})" class="text-xl mt-1">${x.terminee?'<svg viewBox="0 0 20 20" class="inline-block w-5 h-5 align-[-4px]" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="13" height="13" rx="2.5" fill="#0f766e" stroke="#0f766e"/><path d="M6.8 10.2l2 2 4.4-4.6" stroke="white"/></svg>':'<svg viewBox="0 0 20 20" class="inline-block w-5 h-5 align-[-4px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3.5" y="3.5" width="13" height="13" rx="2.5"/></svg>'}</button><div class="flex-1"><div class="flex justify-between gap-2"><h3 class="font-bold ${x.terminee?'line-through opacity-60':''}">${esc(x.titre)}</h3><span class="text-xs px-2 py-1 rounded-full ${x.priorite==='urgente'?'bg-red-100 text-red-700':x.priorite==='haute'?'bg-orange-100 text-orange-700':'bg-slate-100 text-slate-600'}">${esc(x.priorite||'moyenne')}</span></div><p class="text-sm text-slate-500">${esc(x.description||'')}</p><div class="text-xs text-slate-500 mt-2"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="4.4" width="13.6" height="12" rx="1.4"/><path d="M3.2 8h13.6"/><path d="M7 3v2.8M13 3v2.8"/></svg> ${dateFr(x.date_echeance||x.date_tache)} ${x.budget?` · <svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="6.7" stroke-linecap="butt"/><path d="M10 6.5v7M12 8.2c0-1-.9-1.7-2-1.7s-2 .6-2 1.6c0 2.2 4 1.1 4 3.3 0 1-1 1.7-2 1.7s-2-.6-2-1.6"/></svg> ${money(x.budget)}`:''}</div><div class="text-sm mt-2"><button class="text-teal-600" onclick="showTask('${x.id}')"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 15.8l.3-2.4 8.1-8.1a1.3 1.3 0 0 1 1.9 0l.1.1a1.3 1.3 0 0 1 0 1.9l-8.1 8.1-2.3.4z"/><path d="M11.4 6.4l2 2"/></svg> Modifier</button><button class="text-red-600 ml-3" onclick="remove('taches','${x.id}')">Supprimer</button></div></div></div>`;
 const tSorted=t.slice().sort((a,b)=>(a.date_echeance||'9999').localeCompare(b.date_echeance||'9999'));
 const withProj=data.projets.map(pr=>({proj:pr,items:tSorted.filter(x=>x.projet_id===pr.id)})).filter(g=>g.items.length);
 const noProj=tSorted.filter(x=>!x.projet_id||!data.projets.some(pr=>pr.id===x.projet_id));
 let taskHtml='';
 withProj.forEach(g=>{const rem=projectRemaining(g.proj);taskHtml+=`<div class="mb-4"><div class="flex items-center justify-between gap-2 mb-2 pl-1 border-l-4 border-teal-500"><h3 class="font-bold pl-2"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.2a1 1 0 0 1 1-1h3.3l1.4 1.7H16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.2z"/></svg> ${esc(g.proj.nom)} <span class="text-xs font-normal text-slate-500">(${g.items.length} tâche${g.items.length>1?'s':''})</span></h3>${g.proj.budget?`<span class="text-xs ${rem<0?'text-red-600':'text-emerald-600'} pr-1">Restant : ${money(rem)}</span>`:''}</div><div class="space-y-3">${g.items.map(taskCard).join('')}</div></div>`});
 if(noProj.length)taskHtml+=`<div class="mb-4"><h3 class="font-bold mb-2 pl-1 border-l-4 border-slate-300 pl-2 text-slate-500"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h5.5L15 6.5V16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M11.3 3v3.4h3.4"/></svg> Sans projet <span class="text-xs font-normal">(${noProj.length})</span></h3><div class="space-y-3">${noProj.map(taskCard).join('')}</div></div>`;
 $('taskList').innerHTML=t.length?taskHtml:'<p class="text-slate-500">Aucune tâche.</p>';
 renderTaskBoard();

 renderExcelTable();
 renderDocuments();
 renderBizPlan();
 renderRapport();

 const pSorted=p.slice().sort((a,b)=>(STATUT_ORDER[a.statut]??1)-(STATUT_ORDER[b.statut]??1)||(a.date_fin||'9999').localeCompare(b.date_fin||'9999'));
 $('projectList').innerHTML=p.length?pSorted.map(x=>{const related=t.filter(z=>z.projet_id===x.id);const spent=projectSpent(x.id),rem=projectRemaining(x);const bp=data.businessPlans.find(b=>b.projet_id===x.id);const bpFilled=bp?BP_SECTIONS.filter(([key])=>bp[key]&&bp[key].trim()).length:0;const st=PROJECT_STATUS[x.statut]||PROJECT_STATUS.en_cours;return `<div class="bg-[#F5F6F9] dark:bg-slate-900 rounded-xl shadow p-4 flex flex-col gap-2">
  <div class="flex items-start gap-2">
   <svg viewBox="0 0 20 20" class="w-4 h-4 shrink-0 mt-1 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.2a1 1 0 0 1 1-1h3.3l1.4 1.7H16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.2z"/></svg>
   <div class="min-w-0 flex-1">
    <h3 class="font-bold font-display text-base truncate">${esc(x.nom)}</h3>
    ${x.description?`<p class="text-sm text-slate-500 mt-0.5">${esc(x.description)}</p>`:'<p class="text-sm text-slate-400 italic mt-0.5">Aucune description</p>'}
   </div>
   <span class="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${st.cls}">${st.label}</span>
  </div>
  ${x.notes?`<div class="text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/40 text-amber-800 dark:text-amber-200 rounded-lg px-2.5 py-2 flex gap-1.5"><svg viewBox="0 0 20 20" class="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5h12M4 9h12M4 13.5h7"/></svg><span class="whitespace-pre-wrap">${esc(x.notes)}</span></div>`:''}

  <details class="group">
   <summary class="text-xs font-semibold text-teal-600 cursor-pointer list-none flex items-center gap-1 select-none w-fit mt-1">
    <svg viewBox="0 0 20 20" class="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4l6 6-6 6"/></svg>
    Détails
   </summary>

   <div class="mt-3 flex flex-col gap-3 border-t border-slate-200/70 dark:border-slate-700/70 pt-3">
    <div class="flex flex-wrap items-center gap-2 text-xs">
     <span class="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">${related.length} tâche${related.length>1?'s':''}</span>
     ${x.date_fin?`<span class="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full"><svg viewBox="0 0 20 20" class="inline-block w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="4.4" width="13.6" height="12" rx="1.4"/><path d="M3.2 8h13.6"/><path d="M7 3v2.8M13 3v2.8"/></svg> ${dateFr(x.date_fin)}</span>`:''}
    </div>

    ${x.budget?`<div class="grid grid-cols-3 gap-2 text-center bg-white/70 dark:bg-slate-800/60 rounded-lg p-2 border border-slate-200/70 dark:border-slate-700/70">
     <div><p class="text-[10px] uppercase tracking-wide text-slate-400">Budget</p><p class="font-semibold text-sm">${money(x.budget)}</p></div>
     <div><p class="text-[10px] uppercase tracking-wide text-slate-400">Dépensé</p><p class="font-semibold text-sm">${money(spent)}</p></div>
     <div><p class="text-[10px] uppercase tracking-wide text-slate-400">Restant</p><p class="font-semibold text-sm ${rem<0?'text-red-600':'text-emerald-600'}">${money(rem)}</p></div>
    </div>`:''}

    ${related.length?`<div>
     <p class="text-xs font-medium text-slate-500 mb-1.5">Tâches liées</p>
     <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      ${related.map(rt=>`<button type="button" onclick="showTask('${rt.id}')" class="text-left text-xs bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 transition flex items-center gap-1.5 cursor-pointer">${rt.terminee?'<svg viewBox="0 0 20 20" class="inline-block w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="13" height="13" rx="2.5" fill="#0f766e" stroke="#0f766e"/><path d="M6.8 10.2l2 2 4.4-4.6" stroke="white"/></svg>':'<svg viewBox="0 0 20 20" class="inline-block w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3.5" y="3.5" width="13" height="13" rx="2.5"/></svg>'}<span class="truncate ${rt.terminee?'line-through opacity-60':''}">${esc(rt.titre)}</span>${rt.budget?`<span class="ml-auto text-slate-400 shrink-0">${money(rt.budget)}</span>`:''}</button>`).join('')}
     </div>
    </div>`:''}

    <button onclick="showBizPlanPreview('${x.id}')" class="self-start text-xs px-2.5 py-1 rounded-full ${bpFilled===0?'bg-slate-100 text-slate-500 dark:bg-slate-800':bpFilled===BP_SECTIONS.length?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.3" width="12" height="13.4" rx="1.3"/><path d="M7 7.2h6M7 10h6M7 12.8h3.6"/></svg> Plan d'affaires : ${bpFilled}/${BP_SECTIONS.length}${bpFilled===BP_SECTIONS.length?' <svg viewBox="0 0 20 20" class="inline-block w-3.5 h-3.5 align-[-2px]" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l4 4 8-9"/></svg>':''}</button>

    <div class="flex items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-700 text-sm">
     <button class="text-teal-600 inline-flex items-center gap-1" onclick="showProject('${x.id}')"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 15.8l.3-2.4 8.1-8.1a1.3 1.3 0 0 1 1.9 0l.1.1a1.3 1.3 0 0 1 0 1.9l-8.1 8.1-2.3.4z"/><path d="M11.4 6.4l2 2"/></svg> Modifier</button>
     <button class="text-indigo-600 inline-flex items-center gap-1" onclick="rapportProjectId='${x.id}';openTab('rapport');renderRapport()"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.6" y="3" width="12.8" height="14" rx="1.3"/><path d="M6.8 13.2V10M10 13.2V7M13.2 13.2V8.6"/></svg> Rapport</button>
     ${(()=>{const n=projectDocsList(x.id).length;return n?`<button class="text-indigo-600 inline-flex items-center gap-1" onclick="docFilterProject='${x.id}';openTab('documents');renderDocuments()">${ICON_FILE} ${n} fichier${n>1?'s':''}</button>`:''})()}
     <button class="text-red-600 inline-flex items-center gap-1 ml-auto" onclick="remove('projets','${x.id}')"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12"/><path d="M8 6V4.6c0-.6.4-1 1-1h2c.6 0 1 .4 1 1V6"/><path d="M5.5 6l.6 9.4c0 .6.5 1 1 1h5.8c.5 0 1-.4 1-1L15.5 6"/><path d="M8.3 9v4.4M11.7 9v4.4"/></svg> Supprimer</button>
    </div>
   </div>
  </details>
 </div>`}).join(''):'<p class="text-slate-500">Aucun projet.</p>';

 $('planningList').innerHTML=pl.length?pl.slice().sort((a,b)=>(a.date_planifiee+a.heure_debut).localeCompare(b.date_planifiee+b.heure_debut)).map(x=>`<div class="p-3 border rounded-xl dark:border-slate-700"><div class="flex justify-between"><h3 class="font-bold">${esc(x.titre)}</h3><span class="text-xs">${esc(x.statut)}</span></div><p class="text-sm text-slate-500"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="4.4" width="13.6" height="12" rx="1.4"/><path d="M3.2 8h13.6"/><path d="M7 3v2.8M13 3v2.8"/></svg> ${dateFr(x.date_planifiee)} ${x.heure_debut?'à '+x.heure_debut:''}${x.heure_fin?' – '+x.heure_fin:''}</p><p class="text-sm mt-1">${esc(x.description||'')}</p><div class="mt-3 text-sm"><button class="text-teal-600" onclick="showPlanning('${x.id}')">Modifier</button><button class="text-red-600 ml-3" onclick="remove('planning','${x.id}')">Supprimer</button></div></div>`).join(''):'<p class="text-slate-500">Aucun événement.</p>';

 // Les onglets globaux "Rappels" et "Notes" ont été retirés : chaque projet a
 // maintenant sa propre note (voir f_projnotes dans showProject()), donc on ne
 // rend plus de listes reminderList/noteList ici (ces éléments n'existent plus
 // dans index.html).

 $('dashProjectList').innerHTML=p.length?p.map(x=>{const rem=projectRemaining(x);return `<div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm"><div class="flex justify-between gap-2"><b class="truncate"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.2a1 1 0 0 1 1-1h3.3l1.4 1.7H16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.2z"/></svg> ${esc(x.nom)}</b></div>${x.budget?`<div class="text-xs text-slate-500 mt-1">Restant : <span class="${rem<0?'text-red-600':'text-emerald-600'} font-medium">${money(rem)}</span></div>`:''}</div>`}).join(''):'<p class="text-slate-500 text-sm">Aucun projet.</p>';
 renderCharts();
}
let excelSelected=new Set();
// ==== Vue « Excel » (tableau éditable des tâches) ====
function excelFilteredSorted(){
 const q=($('excelSearch')?.value||'').toLowerCase().trim();
 const fs=$('excelFilterStatut')?.value||'';
 const fp=$('excelFilterPrio')?.value||'';
 const fproj=$('excelFilterProjet')?.value||'';
 let rows=data.taches.filter(x=>(!q||(x.titre||'').toLowerCase().includes(q))&&(!fs||x.statut===fs)&&(!fp||x.priorite===fp)&&(!fproj||x.projet_id===fproj));
 const {col,dir}=excelSort;
 rows=rows.slice().sort((a,b)=>{
  let va=a[col],vb=b[col];
  if(col==='projet_id'){va=(data.projets.find(p=>p.id===a.projet_id)||{}).nom||'';vb=(data.projets.find(p=>p.id===b.projet_id)||{}).nom||''}
  if(col==='budget'||col==='progression'){va=Number(va||0);vb=Number(vb||0)}
  else{va=String(va??'');vb=String(vb??'')}
  if(va<vb)return dir==='asc'?-1:1;
  if(va>vb)return dir==='asc'?1:-1;
  return 0;
 });
 return rows;
}
function excelUpdateBulkBar(){
 const n=excelSelected.size;
 $('excelBulkBar').classList.toggle('hidden',n===0);
 $('excelBulkCount').textContent=`${n} sélectionnée(s)`;
}
function excelRenderProjectSummary(rows){
 const fproj=$('excelFilterProjet')?.value||'';
 const box=$('excelProjectSummary');
 if(!fproj){box.classList.add('hidden');box.innerHTML='';return}
 const proj=data.projets.find(p=>p.id===fproj);
 if(!proj){box.classList.add('hidden');return}
 const spentTotal=rows.reduce((s,x)=>s+Number(x.budget||0),0);
 const projBudget=Number(proj.budget||0);
 const rem=projBudget-spentTotal;
 box.classList.remove('hidden');
 box.innerHTML=`<div class="flex flex-wrap items-center justify-between gap-3">
  <div><span class="font-display font-bold text-indigo-700 dark:text-indigo-300"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.2a1 1 0 0 1 1-1h3.3l1.4 1.7H16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.2z"/></svg> ${esc(proj.nom)}</span><span class="text-xs text-slate-500 ml-2">${rows.length} tâche(s) liée(s)</span></div>
  <div class="flex gap-4 text-sm">
   <div>Budget projet<br><b>${proj.budget?money(projBudget):'—'}</b></div>
   <div>Dépensé (tâches)<br><b>${money(spentTotal)}</b></div>
   ${proj.budget?`<div>Restant<br><b class="${rem<0?'text-red-600':'text-emerald-600'}">${money(rem)}</b></div>`:''}
  </div>
 </div>`;
}
function toggleTaskSection(key){
 let collapsed;
 try{collapsed=new Set(JSON.parse(localStorage.getItem('orbis_task_collapsed')||'[]'));}catch{collapsed=new Set();}
 if(collapsed.has(key))collapsed.delete(key);else collapsed.add(key);
 localStorage.setItem('orbis_task_collapsed',JSON.stringify([...collapsed]));
 renderTaskBoard();
}
function renderTaskBoard(){
 const projSel=$('taskBoardFilterProjet');
 if(projSel){
  const prevVal=projSel.value;
  projSel.innerHTML='<option value="">— Tous les projets —</option>'+data.projets.map(p=>`<option value="${p.id}">${esc(p.nom)}</option>`).join('');
  if(prevVal&&data.projets.some(p=>p.id===prevVal))projSel.value=prevVal;
 }
 const filterProj=projSel?projSel.value:'';
 const filtered=filterProj?data.taches.filter(x=>x.projet_id===filterProj):data.taches;

 const statutMeta={
  a_faire:{label:'À faire',dot:'bg-slate-400'},
  en_cours:{label:'En cours',dot:'bg-blue-500'},
  complete:{label:'Terminé',dot:'bg-emerald-500'}
 };
 const prioMeta={
  urgente:{label:'Urgente',dot:'bg-red-500',cls:'text-red-600 dark:text-red-400 font-medium'},
  haute:{label:'Haute',dot:'bg-orange-500',cls:'text-orange-600 dark:text-orange-400 font-medium'},
  moyenne:{label:'Moyenne',dot:'bg-slate-300 dark:bg-slate-600',cls:'text-slate-500'},
  faible:{label:'Faible',dot:'bg-slate-200 dark:bg-slate-700',cls:'text-slate-400'}
 };
 const rowHtml=x=>{
  const s=x.terminee||x.statut==='complete'?'complete':(x.statut==='en_cours'?'en_cours':'a_faire');
  const sm=statutMeta[s],pm=prioMeta[x.priorite]||prioMeta.moyenne;
  const overdue=s!=='complete'&&x.date_echeance&&x.date_echeance<today();
  return `<tr class="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 ${s==='complete'?'opacity-60':''}">
   <td class="p-2.5"><button class="text-left font-medium text-slate-700 dark:text-slate-200 hover:text-teal-700 dark:hover:text-teal-400 ${s==='complete'?'line-through':''}" onclick="showTask('${x.id}')">${esc(x.titre)}</button></td>
   <td class="p-2.5 whitespace-nowrap"><span class="inline-flex items-center gap-1.5 text-xs ${pm.cls}"><span class="w-1.5 h-1.5 rounded-full ${pm.dot}"></span>${pm.label}</span></td>
   <td class="p-2.5 whitespace-nowrap text-xs ${overdue?'text-red-600 dark:text-red-400 font-medium':'text-slate-500'}">${x.date_echeance?dateFr(x.date_echeance):'—'}${overdue?' · en retard':''}</td>
   <td class="p-2.5"><div class="flex items-center gap-2 min-w-[140px]"><input class="pro-range flex-1" style="--val:${x.progression||0}%" type="range" min="0" max="100" value="${x.progression||0}" onchange="progress('taches','${x.id}',this.value)"><span class="text-xs text-slate-400 w-8 text-right shrink-0">${x.progression||0}%</span></div></td>
   <td class="p-2.5 whitespace-nowrap"><span class="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"><span class="w-1.5 h-1.5 rounded-full ${sm.dot}"></span>${sm.label}</span></td>
   <td class="p-2.5 text-right whitespace-nowrap">
    <button class="text-slate-400 hover:text-teal-600 p-1" title="Modifier" onclick="showTask('${x.id}')"><svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 15.8l.3-2.4 8.1-8.1a1.3 1.3 0 0 1 1.9 0l.1.1a1.3 1.3 0 0 1 0 1.9l-8.1 8.1-2.3.4z"/><path d="M11.4 6.4l2 2"/></svg></button>
    <button class="text-slate-400 hover:text-red-600 p-1" title="Supprimer" onclick="remove('taches','${x.id}')"><svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12"/><path d="M8 6V4.6c0-.6.4-1 1-1h2c.6 0 1 .4 1 1V6"/><path d="M5.5 6l.6 9.4c0 .6.5 1 1 1h5.8c.5 0 1-.4 1-1L15.5 6"/></svg></button>
   </td>
  </tr>`;
 };
 let taskCollapsed;
 try{taskCollapsed=new Set(JSON.parse(localStorage.getItem('orbis_task_collapsed')||'[]'));}catch{taskCollapsed=new Set();}
 const tableHtml=(title,items,icon,key)=>{
  const done=items.filter(x=>x.terminee||x.statut==='complete').length;
  const sorted=[...items].sort((a,b)=>{
   const ca=a.terminee||a.statut==='complete'?1:0,cb=b.terminee||b.statut==='complete'?1:0;
   if(ca!==cb)return ca-cb;
   return (a.date_echeance||'9999').localeCompare(b.date_echeance||'9999');
  });
  const collapsed=taskCollapsed.has(key);
  return `<div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
   <div class="flex items-center justify-between px-4 py-3 ${collapsed?'':'border-b border-slate-200 dark:border-slate-800'} cursor-pointer select-none" onclick="toggleTaskSection('${key}')">
    <h3 class="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><svg viewBox="0 0 20 20" class="w-3.5 h-3.5 text-slate-400 transition-transform ${collapsed?'-rotate-90':''}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8l4 4 4-4"/></svg>${icon} ${esc(title)}</h3>
    <span class="text-xs text-slate-400">${done}/${items.length} terminées</span>
   </div>
   ${collapsed?'':`<div class="overflow-x-auto">
    <table class="w-full text-sm min-w-[640px]">
     <thead><tr class="text-left text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
      <th class="p-2.5 font-medium">Tâche</th><th class="p-2.5 font-medium">Priorité</th><th class="p-2.5 font-medium">Échéance</th><th class="p-2.5 font-medium">Progression</th><th class="p-2.5 font-medium">Statut</th><th class="p-2.5"></th>
     </tr></thead>
     <tbody>${sorted.map(rowHtml).join('')}</tbody>
    </table>
   </div>`}
  </div>`;
 };
 const projIcon='<svg viewBox="0 0 20 20" class="inline-block w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.2a1 1 0 0 1 1-1h3.3l1.4 1.7H16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.2z"/></svg>';
 let html='';
 data.projets.forEach(p=>{
  const items=filtered.filter(x=>x.projet_id===p.id);
  if(!items.length)return;
  html+=tableHtml(p.nom,items,projIcon,p.id);
 });
 const noProj=filtered.filter(x=>!x.projet_id||!data.projets.some(p=>p.id===x.projet_id));
 if(noProj.length)html+=tableHtml('Sans projet',noProj,'','sans-projet');
 $('taskBoardView').innerHTML=html||'<p class="text-slate-500 text-sm">Aucune tâche à afficher.</p>';
}

// ==== Objectifs : prévisions et cartes ====
function objectiveForecast(o){
 const start=o.date_debut?new Date(o.date_debut+'T00:00:00'):null;
 const end=o.date_fin?new Date(o.date_fin+'T00:00:00'):null;
 const now=new Date(today()+'T00:00:00');
 const actual=Math.max(0,Math.min(100,o.progression||0));
 let expected=null;
 if(start&&end&&end>start)expected=Math.max(0,Math.min(100,(now-start)/(end-start)*100));
 let status,statusCls;
 if(o.statut==='termine'){status='Atteint';statusCls='bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';}
 else if(o.statut==='annule'){status='Annulé';statusCls='bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300';}
 else if(expected===null){status='Sans échéance';statusCls='bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';}
 else if(end&&now>end&&actual<100){status='Échéance dépassée';statusCls='bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';}
 else{
  const delta=actual-expected;
  if(delta>=8){status='En avance';statusCls='bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';}
  else if(delta>=-8){status='Dans les temps';statusCls='bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';}
  else{status='En retard';statusCls='bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';}
 }
 return {actual,expected,status,statusCls};
}
function objTimelineHtml(f){
 const barColor=f.status==='En retard'||f.status==='Échéance dépassée'?'bg-red-500':f.status==='En avance'?'bg-emerald-500':f.status==='Atteint'?'bg-emerald-600':'bg-blue-500';
 const marker=f.expected!==null?`<div class="absolute -top-0.5 -bottom-0.5 w-[2px] bg-slate-900 dark:bg-white" style="left:${f.expected}%" title="Attendu à ce jour : ${Math.round(f.expected)}%"></div>`:'';
 return `<div class="relative h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
  <div class="h-full ${barColor} rounded-full transition-all" style="width:${f.actual}%"></div>
  ${marker}
 </div>`;
}
function objCardHtml(x){
 const f=objectiveForecast(x);
 return `<div class="bg-white dark:bg-slate-800 rounded-lg p-3 border dark:border-slate-700">
  <div class="flex justify-between gap-2">
   <div class="flex-1"><h4 class="font-semibold leading-snug">${esc(x.titre)}</h4>${x.description?`<p class="text-xs text-slate-500 mt-0.5">${esc(x.description)}</p>`:''}</div>
   <span class="text-[11px] px-2 py-1 rounded-full shrink-0 h-fit whitespace-nowrap ${f.statusCls}">${f.status}</span>
  </div>
  <div class="mt-3">${objTimelineHtml(f)}
   <div class="flex justify-between text-[11px] text-slate-400 mt-1">
    <span>${x.date_debut?dateFr(x.date_debut):'—'}</span>
    <span>${f.expected!==null?`Attendu ${Math.round(f.expected)}% · Réel ${Math.round(f.actual)}%`:`Réel ${Math.round(f.actual)}%`}</span>
    <span>${x.date_fin?dateFr(x.date_fin):'Sans échéance'}</span>
   </div>
  </div>
  ${proBar(x.id,'objectifs',x.progression||0)}
  <div class="flex gap-3 mt-2 text-sm">
   <button class="text-teal-600" onclick="showObjective('${x.id}')"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 15.8l.3-2.4 8.1-8.1a1.3 1.3 0 0 1 1.9 0l.1.1a1.3 1.3 0 0 1 0 1.9l-8.1 8.1-2.3.4z"/><path d="M11.4 6.4l2 2"/></svg> Modifier</button>
   <button class="text-red-600" onclick="remove('objectifs','${x.id}')">Supprimer</button>
  </div>
 </div>`;
}
function renderObjectives(){
 const obj=data.objectifs;
 const byProj={};
 const noProj=[];
 obj.forEach(o=>{
  if(o.projet_id&&data.projets.some(p=>p.id===o.projet_id))(byProj[o.projet_id]=byProj[o.projet_id]||[]).push(o);
  else noProj.push(o);
 });
 let html='';
 data.projets.forEach(p=>{
  const items=byProj[p.id];
  if(!items||!items.length)return;
  html+=`<div><div class="flex items-center gap-2 mb-2 pl-1 border-l-4 border-teal-500"><h3 class="font-bold pl-2 flex items-center gap-1.5"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.2a1 1 0 0 1 1-1h3.3l1.4 1.7H16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.2z"/></svg> ${esc(p.nom)}</h3><span class="text-xs font-normal text-slate-400">(${items.length})</span></div><div class="grid md:grid-cols-2 gap-3">${items.map(objCardHtml).join('')}</div></div>`;
 });
 if(noProj.length)html+=`<div><h3 class="font-bold mb-2 pl-1 border-l-4 border-slate-300 pl-2 text-slate-500">Objectifs généraux <span class="text-xs font-normal">(${noProj.length})</span></h3><div class="grid md:grid-cols-2 gap-3">${noProj.map(objCardHtml).join('')}</div></div>`;
 $('objList').innerHTML=html||'<p class="text-slate-500">Aucun objectif. Ajoute un objectif et relie-le à un projet pour suivre sa trajectoire dans le temps.</p>';
 renderObjOverviewChart();
}
function renderObjOverviewChart(){
 const items=data.objectifs.map(o=>({o,f:objectiveForecast(o)})).filter(({o,f})=>f.expected!==null&&o.statut==='en_cours');
 if(!items.length){$('objOverviewWrap').classList.add('hidden');charts.objOverview?.destroy();charts.objOverview=null;return}
 $('objOverviewWrap').classList.remove('hidden');
 items.sort((a,b)=>(a.f.actual-a.f.expected)-(b.f.actual-b.f.expected));
 const top=items.slice(0,10);
 const labels=top.map(({o})=>{const p=data.projets.find(pr=>pr.id===o.projet_id);return p?`${p.nom} — ${o.titre}`:o.titre;});
 const deltas=top.map(({f})=>Math.round(f.actual-f.expected));
 const dark=document.documentElement.classList.contains('dark');
 const ticks=dark?'#b3dade':'#3a6370',grid=dark?'#1b3542':'#eef2f7';
 charts.objOverview?.destroy();
 charts.objOverview=new Chart($('objOverviewChart'),{
  type:'bar',
  data:{labels,datasets:[{data:deltas,backgroundColor:deltas.map(d=>d<0?'#dc2626':'#0f766e'),borderRadius:6,maxBarThickness:22}]},
  options:{
   indexAxis:'y',responsive:true,maintainAspectRatio:false,
   plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.parsed.x>=0?'+':''}${c.parsed.x} pts vs trajectoire prévue`}}},
   scales:{
    x:{ticks:{color:ticks,callback:v=>v+' pts'},grid:{color:grid}},
    y:{ticks:{color:ticks,font:{size:11}},grid:{display:false}}
   }
  }
 });
}

function renderExcelTable(){
 const projSel=$('excelFilterProjet');
 if(projSel){
  const prevVal=projSel.value;
  projSel.innerHTML='<option value="">— Tous les projets —</option>'+data.projets.map(p=>`<option value="${p.id}">${esc(p.nom)}</option>`).join('');
  if(prevVal&&data.projets.some(p=>p.id===prevVal))projSel.value=prevVal;
 }
 const rows=excelFilteredSorted();
 excelRenderProjectSummary(rows);
 const prioOpts=[['urgente','Urgente'],['haute','Haute'],['moyenne','Moyenne'],['faible','Faible']];
 const statutOpts=[['a_faire','À faire'],['en_cours','En cours'],['complete','Complète']];
 const projOpts=[['','—'],...data.projets.map(p=>[p.id,p.nom])];
 const opt=(opts,val)=>opts.map(o=>`<option value="${o[0]}" ${o[0]===(val||'')?'selected':''}>${o[1]}</option>`).join('');
 // Purge selected ids no longer present (e.g. filtered out or deleted)
 const visibleIds=new Set(rows.map(r=>r.id));
 [...excelSelected].forEach(id=>{if(!data.taches.some(t=>t.id===id))excelSelected.delete(id)});
 $('excelBody').innerHTML=rows.length?rows.map(x=>{
  const proj=data.projets.find(pr=>pr.id===x.projet_id);
  const remain=proj&&proj.budget?Number(proj.budget)-projectSpent(proj.id):null;
  const budgetTitle=remain!==null?`Restant sur "${esc(proj.nom)}" : ${money(remain)}`:'';
  return `<tr class="border-t dark:border-slate-800" data-id="${x.id}">
  <td class="p-1 text-center"><input type="checkbox" class="excelRowCheck" data-id="${x.id}" ${excelSelected.has(x.id)?'checked':''}></td>
  <td class="p-1"><input value="${esc(x.titre||'')}" class="excel-cell w-full p-1.5 border rounded dark:bg-slate-800 dark:border-slate-700" data-field="titre" data-debounce="1"></td>
  <td class="p-1"><select class="excel-cell w-full p-1.5 border rounded dark:bg-slate-800 dark:border-slate-700" data-field="priorite">${opt(prioOpts,x.priorite||'moyenne')}</select></td>
  <td class="p-1"><input type="number" step="0.01" value="${x.budget??''}" title="${budgetTitle}" class="excel-cell w-24 p-1.5 border rounded dark:bg-slate-800 dark:border-slate-700 ${remain!==null&&remain<0?'border-red-400':''}" data-field="budget"></td>
  <td class="p-1"><select class="excel-cell w-full p-1.5 border rounded dark:bg-slate-800 dark:border-slate-700" data-field="projet_id">${opt(projOpts,x.projet_id||'')}</select></td>
  <td class="p-1"><input type="number" min="0" max="100" value="${x.progression||0}" class="excel-cell w-20 p-1.5 border rounded dark:bg-slate-800 dark:border-slate-700" data-field="progression"></td>
  <td class="p-1"><input type="date" value="${x.date_echeance||''}" class="excel-cell w-full p-1.5 border rounded dark:bg-slate-800 dark:border-slate-700" data-field="date_echeance"></td>
  <td class="p-1"><select class="excel-cell w-full p-1.5 border rounded dark:bg-slate-800 dark:border-slate-700" data-field="statut">${opt(statutOpts,x.statut||'a_faire')}</select></td>
  <td class="p-1 text-center"><button class="text-red-600" onclick="excelDeleteRow('${x.id}')" title="Supprimer"><svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12"/><path d="M8 6V4.6c0-.6.4-1 1-1h2c.6 0 1 .4 1 1V6"/><path d="M5.5 6l.6 9.4c0 .6.5 1 1 1h5.8c.5 0 1-.4 1-1L15.5 6"/><path d="M8.3 9v4.4M11.7 9v4.4"/></svg></button></td>
 </tr>`}).join(''):'<tr><td colspan="9" class="p-4 text-center text-slate-500">Aucune ligne. Cliquez sur « + Ajouter une ligne ».</td></tr>';
 let debounceTimers={};
 document.querySelectorAll('#excelBody .excel-cell').forEach(el=>{
  if(el.dataset.debounce){
   el.addEventListener('input',()=>{
    const id=el.closest('tr').dataset.id,field=el.dataset.field,val=el.value;
    clearTimeout(debounceTimers[id+field]);
    debounceTimers[id+field]=setTimeout(()=>excelUpdateCell(id,field,val),500);
   });
  }else{
   el.addEventListener('change',()=>excelUpdateCell(el.closest('tr').dataset.id,el.dataset.field,el.value));
  }
 });
 document.querySelectorAll('.excelRowCheck').forEach(cb=>{
  cb.addEventListener('change',()=>{
   if(cb.checked)excelSelected.add(cb.dataset.id);else excelSelected.delete(cb.dataset.id);
   $('excelSelectAll').checked=rows.length>0&&rows.every(r=>excelSelected.has(r.id));
   excelUpdateBulkBar();
  });
 });
 $('excelSelectAll').checked=rows.length>0&&rows.every(r=>excelSelected.has(r.id));
 document.querySelectorAll('.sortArrow').forEach(s=>{s.textContent=s.dataset.col===excelSort.col?(excelSort.dir==='asc'?'▲':'▼'):''});
 excelUpdateBulkBar();
 $('excelTotalCount').textContent=`${rows.length} ligne(s)`;
 $('excelTotalBudget').textContent=money(rows.reduce((s,x)=>s+Number(x.budget||0),0));
 $('excelTotalProgress').textContent=rows.length?`${Math.round(rows.reduce((s,x)=>s+(x.progression||0),0)/rows.length)}% moyen`:'';
}
async function excelUpdateCell(id,field,value){
 const st=$('excelSaveStatus');
 if(st){st.textContent='Enregistrement…';st.className='text-xs font-normal text-slate-400'}
 const payload={};
 if(field==='budget')payload.budget=value===''?null:+value;
 else if(field==='progression')payload.progression=Math.max(0,Math.min(100,+value||0));
 else if(field==='projet_id')payload.projet_id=value||null;
 else if(field==='date_echeance')payload.date_echeance=value||null;
 else payload[field]=value;
 const {error,offline}=await writeUpdate('taches',id,payload);
 if(error){toast('Erreur Supabase : '+friendlyError(error));if(st){st.textContent='Erreur';st.className='text-xs font-normal text-red-600'}return}
 if(st){
  st.textContent=offline?'Hors ligne — en attente':'Enregistré ✓';
  st.className='text-xs font-normal '+(offline?'text-amber-600':'text-emerald-600');
  setTimeout(()=>{if(st.textContent==='Enregistré ✓'||st.textContent==='Hors ligne — en attente')st.textContent=''},2500);
 }
 render();
}
async function excelAddRow(){
 const currentProj=$('excelFilterProjet')?.value||null;
 const payload={user_id:user.id,workspace_id:currentEspaceId,titre:'Nouvelle tâche',priorite:'moyenne',statut:'a_faire',progression:0,date_echeance:today(),projet_id:currentProj||null};
 const {error,offline}=await writeInsert('taches',payload);
 if(error){toast('Erreur Supabase : '+friendlyError(error));return}
 if(offline)toast('Hors ligne — cette ligne sera synchronisée au retour de la connexion.','warn',3500);
 render();
}
async function excelDeleteRow(id){
 if(!(await confirmDialog('Supprimer cette ligne ?')))return;
 const {error,offline}=await writeDelete('taches',id);
 if(error){toast(friendlyError(error));return}
 excelSelected.delete(id);
 if(offline)toast('Suppression enregistrée hors ligne.','warn',3000);
 render();
}
async function excelDeleteSelected(){
 const ids=[...excelSelected];if(!ids.length)return;
 if(!(await confirmDialog(`Supprimer ${ids.length} ligne(s) sélectionnée(s) ?`)))return;
 if(navigator.onLine){
  const {error}=await db.from('taches').delete().in('id',ids).eq('workspace_id',currentEspaceId);
  if(!error){data.taches=data.taches.filter(x=>!ids.includes(x.id));excelSelected.clear();render();return}
  if(!isNetworkError(error)){toast(friendlyError(error));return}
 }
 for(const id of ids)await writeDelete('taches',id);
 excelSelected.clear();render();
 toast('Suppression enregistrée hors ligne — sera synchronisée au retour de la connexion.','warn',4000);
}
function excelExportCSV(){
 const rows=excelFilteredSorted();
 const head=['Tâche','Priorité','Budget','Projet','Progression','Date','Statut'];
 const lines=[head.join(',')];
 rows.forEach(x=>{
  const proj=(data.projets.find(p=>p.id===x.projet_id)||{}).nom||'';
  const cells=[x.titre||'',x.priorite||'',x.budget??'',proj,x.progression||0,x.date_echeance||'',x.statut||''];
  lines.push(cells.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(','));
 });
 const blob=new Blob(['\uFEFF'+lines.join('\n')],{type:'text/csv;charset=utf-8;'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='tableau_excel.csv';a.click();URL.revokeObjectURL(url);
}
document.querySelectorAll('#excel th[data-sort]').forEach(th=>{
 th.onclick=()=>{
  const col=th.dataset.sort;
  if(excelSort.col===col)excelSort.dir=excelSort.dir==='asc'?'desc':'asc';
  else excelSort={col,dir:'asc'};
  renderExcelTable();
 };
});
$('excelAddRow').onclick=excelAddRow;
$('excelExport').onclick=excelExportCSV;
$('excelSearch').oninput=renderExcelTable;
$('excelFilterStatut').onchange=renderExcelTable;
$('excelFilterPrio').onchange=renderExcelTable;
$('excelFilterProjet').onchange=renderExcelTable;
$('excelBulkDelete').onclick=excelDeleteSelected;
$('excelSelectAll').onchange=()=>{
 const rows=excelFilteredSorted();
 if($('excelSelectAll').checked)rows.forEach(r=>excelSelected.add(r.id));
 else rows.forEach(r=>excelSelected.delete(r.id));
 renderExcelTable();
};

// ==== Graphiques du tableau de bord (Chart.js) ====
function renderCharts(){
 const avg=arr=>arr.length?Math.round(arr.reduce((s,x)=>s+(Number(x.progression)||0),0)/arr.length):0;
 const dark=document.documentElement.classList.contains('dark');
 const ticks=dark?'#b3dade':'#3a6370';
 const grid=dark?'rgba(148,163,184,.13)':'rgba(100,116,139,.14)';
 const fontLabel={family:"'Inter',system-ui,sans-serif",size:11,weight:'600'};
 Chart.defaults.font.family="'Inter',system-ui,sans-serif"; Chart.defaults.color=ticks;
 if(window.ChartDataLabels&&!window.__datalabelsRegistered){Chart.register(ChartDataLabels);Chart.defaults.set('plugins.datalabels',{display:false});window.__datalabelsRegistered=true;}
 const tooltipBase={backgroundColor:dark?'#102331':'#102331',titleColor:'#fff',bodyColor:'#d2ebed',padding:11,cornerRadius:10,displayColors:false,titleFont:{family:"'Inter',system-ui,sans-serif",size:12,weight:'700'},bodyFont:{family:"'Inter',system-ui,sans-serif",size:12}};
 const teal='#0f766e', teal2='#14b8a6', amber='#d97706', violet='#7c3aed';
 const gradient=(top,bottom)=>(ctx)=>{const a=ctx.chart.chartArea;if(!a)return top;const g=ctx.chart.ctx.createLinearGradient(0,a.top,0,a.bottom);g.addColorStop(0,top);g.addColorStop(1,bottom);return g};
 const gradientByIndex=(pairs)=>(ctx)=>{const a=ctx.chart.chartArea;const [top,bottom]=pairs[ctx.dataIndex%pairs.length]||pairs[0];if(!a)return top;const g=ctx.chart.ctx.createLinearGradient(0,a.top,0,a.bottom);g.addColorStop(0,top);g.addColorStop(1,bottom);return g};
 const shared=isSharedSpace();
 const labels=shared?data.projets.map(x=>x.nom):['Objectifs','Tâches','Projets'];
 const values=shared?data.projets.map(x=>Math.max(0,Math.min(100,Number(x.progression)||0))):[avg(data.objectifs),avg(data.taches),avg(data.projets)];
 charts.progress?.destroy();
 const progressHorizontal=shared&&labels.length>4;
 charts.progress=new Chart($('progressChart'),{
  type:'bar',data:{labels,datasets:[{data:values,backgroundColor:shared?gradient('#2dd4bf','#0f766e'):gradientByIndex([['#2dd4bf','#0f766e'],['#5eead4','#0d9488'],['#67e8f9','#0e7490']]),borderRadius:9,maxBarThickness:progressHorizontal?28:42,categoryPercentage:.62,barPercentage:.85,datalabels:{display:true,anchor:'end',align:'end',offset:3,color:ticks,font:{...fontLabel,weight:'700'},formatter:v=>v+'%'}}]},
  options:{responsive:true,maintainAspectRatio:false,indexAxis:progressHorizontal?'y':'x',animation:{duration:650,easing:'easeOutQuart'},layout:{padding:{top:20,right:progressHorizontal?30:6,left:progressHorizontal?6:2,bottom:4}},scales:{x:{min:progressHorizontal?0:undefined,max:progressHorizontal?100:undefined,beginAtZero:true,grid:{color:grid,drawTicks:false},ticks:{display:progressHorizontal,color:ticks,font:fontLabel,callback:v=>v+'%'},border:{display:false}},y:{min:progressHorizontal?undefined:0,max:progressHorizontal?undefined:100,beginAtZero:true,grid:{color:grid,drawTicks:false},ticks:{display:true,color:ticks,font:fontLabel,autoSkip:true,maxRotation:progressHorizontal?0:(shared?28:0)},border:{display:false}}},plugins:{legend:{display:false},tooltip:{...tooltipBase,callbacks:{label:c=>` Progression : ${progressHorizontal?c.parsed.x:c.parsed.y}%`}}}}
 });

 const done=data.taches.filter(x=>x.terminee||x.statut==='complete').length, active=Math.max(0,data.taches.length-done), total=done+active;
 const center={id:'centerTextProfessional',afterDraw(chart){if(chart.canvas.id!=='taskChart'||!chart.chartArea)return;const {ctx,chartArea}=chart,cx=(chartArea.left+chartArea.right)/2,cy=(chartArea.top+chartArea.bottom)/2;ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=dark?'#f6fbfc':'#102331';ctx.font="800 26px 'Inter',system-ui,sans-serif";ctx.fillText(total,cx,cy-8);ctx.fillStyle=dark?'#7daeba':'#528391';ctx.font="600 11px 'Inter',system-ui,sans-serif";ctx.fillText(total===1?'tâche':'tâches',cx,cy+15);ctx.restore()}};
 charts.task?.destroy();
 charts.task=new Chart($('taskChart'),{type:'doughnut',data:{labels:['Terminées','À faire'],datasets:[{data:total?[done,active]:[1,0],backgroundColor:total?[teal, dark?'#78350f':'#fde68a']:[dark?'#3f2d0a':'#fef3c7'],borderColor:dark?'#102331':'#fff',borderWidth:3,hoverOffset:5,datalabels:{display:v=>total>0&&v.dataset.data[v.dataIndex]>0,color:'#fff',font:{size:12,weight:'700'},formatter:v=>Math.round(v/total*100)+'%'}}]},options:{responsive:true,maintainAspectRatio:false,cutout:'70%',layout:{padding:6},plugins:{legend:{position:'bottom',labels:{color:ticks,font:fontLabel,usePointStyle:true,pointStyle:'circle',padding:16}},tooltip:{...tooltipBase,callbacks:{label:c=>` ${c.label} : ${c.parsed}`}}}},plugins:[center]});

 const budgets=data.projets.map(x=>({n:x.nom,budget:Number(x.budget||0),spent:Math.max(0,projectSpent(x.id))})).filter(x=>x.budget>0);
 const totalBudget=budgets.reduce((s,x)=>s+x.budget,0); $('budgetTotal').textContent=money(totalBudget);
 charts.budget?.destroy();
 if(!budgets.length){
  const canvas=$('budgetChart'); const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); const w=canvas.clientWidth||600;canvas.width=w*2;canvas.height=180;const c=canvas.getContext('2d');c.scale(2,2);c.fillStyle=dark?'#7daeba':'#528391';c.font="600 13px Inter, sans-serif";c.textAlign='center';c.fillText('Aucun budget de projet à afficher',w/2,60);c.font="400 11px Inter, sans-serif";c.fillText('Ajoute un budget à un projet pour activer ce graphique.',w/2,84); return;
 }
 const compact=n=>{if(Math.abs(n)>=1000000)return (n/1000000).toLocaleString('fr-CA',{maximumFractionDigits:1})+' M$';if(Math.abs(n)>=1000)return (n/1000).toLocaleString('fr-CA',{maximumFractionDigits:1})+' k$';return money(n)};
 charts.budget=new Chart($('budgetChart'),{type:'bar',data:{labels:budgets.map(x=>x.n),datasets:[{label:'Budget',data:budgets.map(x=>x.budget),backgroundColor:gradient('#2dd4bf','#0f766e'),borderRadius:8,maxBarThickness:30},{label:'Dépensé',data:budgets.map(x=>Math.min(x.spent,x.budget)),backgroundColor:gradient('#c4b5fd','#7c3aed'),borderRadius:8,maxBarThickness:30}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:budgets.length>3?'y':'x',animation:{duration:650},layout:{padding:{top:16,right:8,left:4,bottom:2}},scales:{y:{beginAtZero:true,grid:{color:grid},ticks:{color:ticks,font:fontLabel,callback:v=>compact(v)},border:{display:false}},x:{beginAtZero:true,grid:{color:grid},ticks:{color:ticks,font:fontLabel,callback:v=>compact(v)},border:{display:false}}},plugins:{legend:{position:'bottom',labels:{color:ticks,font:fontLabel,usePointStyle:true,pointStyle:'circle',padding:15}},tooltip:{...tooltipBase,callbacks:{label:c=>` ${c.dataset.label} : ${money(c.parsed[budgets.length>3?'x':'y'])}`}}}}});
}

// ==== Chargement des données depuis Supabase (+ repli hors ligne) ====
async function loadData(){
 if(!user||!currentEspaceId){setSync(false);return}
 if(!navigator.onLine){applyOfflineSnapshotIfAny();updatePendingBadge();return}
 const tables=['objectifs','taches','projets','planning','rappel','notes'];
 const results=await Promise.all(tables.map(t=>db.from(t).select('*').eq('workspace_id',currentEspaceId).order('created_at',{ascending:false})));
 let failed=results.find(x=>x.error);
 if(failed){
  console.error(failed.error);setSync(false);
  if(isNetworkError(failed.error)){applyOfflineSnapshotIfAny();return}
  toast('Erreur de chargement Supabase : '+friendlyError(failed.error));return;
 }
 data.objectifs=results[0].data||[];data.taches=results[1].data||[];data.projets=results[2].data||[];data.planning=results[3].data||[];data.rappels=results[4].data||[];data.notes=results[5].data||[];
 // Table optionnelle (plan d'affaires structuré) : ne bloque pas le reste si absente/pas encore créée
 const bp=await db.from('business_plans').select('*').eq('workspace_id',currentEspaceId);
 data.businessPlans=bp.error?[]:(bp.data||[]);
 if(bp.error)console.warn('Table business_plans indisponible :',bp.error.message);
 // Table optionnelle (documents multiples par projet) : idem, tant que le script SQL
 // documents_multiples_setup.sql n'a pas été exécuté, ça reste juste vide.
 const docs=await db.from('projet_documents').select('*').eq('workspace_id',currentEspaceId).order('uploaded_at',{ascending:false});
 data.documentsOk=!docs.error;data.documents=docs.error?[]:(docs.data||[]);
 if(docs.error)console.warn('Table projet_documents indisponible :',docs.error.message);
 saveOfflineSnapshot();
 render();setSync(true);updatePendingBadge();checkReminders();
 if(pendingOps.length)syncPendingOps();
}
function applyOfflineSnapshotIfAny(){
 const snap=loadOfflineSnapshot();
 if(!snap||snap.currentEspaceId!==currentEspaceId){toast('Hors ligne — aucune donnée locale disponible pour cet espace.','warn',4000);return}
 data=snap.data;
 render();
 toast('Hors ligne — affichage des dernières données synchronisées.','warn',4000);
}
// ==== Rappels : vérification locale pendant que l'app est ouverte (notification navigateur) ====
function checkReminders(){
 if(!('Notification'in window)||Notification.permission!=='granted')return;
 const now=new Date(), ds=now.toISOString().slice(0,10), tm=now.toTimeString().slice(0,5);
 data.rappels.filter(r=>r.is_active&&r.date_rappel===ds&&r.heure_rappel===tm&&!r.notification_envoyee).forEach(async r=>{new Notification('⏱ '+r.titre,{body:r.description||'Rappel'});await db.from('rappel').update({notification_envoyee:true}).eq('id',r.id).eq('workspace_id',currentEspaceId)});
}
// ==== Recherche globale (objectifs, tâches, projets, notes...) ====
function globalSearchRun(inputId='globalSearch',resultsId='globalSearchResults'){
 const q=$(inputId).value.toLowerCase().trim();
 if(!q){$(resultsId).classList.add('hidden');return}
 const results=[];
 data.taches.forEach(x=>(x.titre||'').toLowerCase().includes(q)&&results.push({icon:'<svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M6.8 10.2l2 2 4.4-4.6"/></svg>',label:x.titre,tab:'taches'}));
 data.objectifs.forEach(x=>(x.titre||'').toLowerCase().includes(q)&&results.push({icon:'<svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="6.4"/><circle cx="10" cy="10" r="3.3"/><circle cx="10" cy="10" r="0.7" fill="currentColor" stroke="none"/></svg>',label:x.titre,tab:'objectifs'}));
 data.projets.forEach(x=>(x.nom||'').toLowerCase().includes(q)&&results.push({icon:'<svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.2a1 1 0 0 1 1-1h3.3l1.4 1.7H16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.2z"/></svg>',label:x.nom,tab:'projets'}));
 data.projets.forEach(x=>(x.notes||'').toLowerCase().includes(q)&&results.push({icon:'<svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 15.8l.3-2.4 8.1-8.1a1.3 1.3 0 0 1 1.9 0l.1.1a1.3 1.3 0 0 1 0 1.9l-8.1 8.1-2.3.4z"/><path d="M11.4 6.4l2 2"/></svg>',label:'Note — '+x.nom,tab:'projets'}));
 data.planning.forEach(x=>(x.titre||'').toLowerCase().includes(q)&&results.push({icon:'<svg viewBox="0 0 20 20" class="inline-block w-4 h-4 align-[-3px]" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="4.4" width="13.6" height="12" rx="1.4"/><path d="M3.2 8h13.6"/><path d="M7 3v2.8M13 3v2.8"/></svg>',label:x.titre,tab:'planning'}));
 const top=results.slice(0,8);
 const box=$(resultsId);
 box.innerHTML=top.length?top.map(r=>`<button type="button" class="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2" data-tab="${r.tab}">${r.icon} <span class="truncate">${esc(r.label||'(sans titre)')}</span></button>`).join(''):'<div class="px-3 py-2 text-sm text-slate-500">Aucun résultat</div>';
 box.classList.remove('hidden');
 box.querySelectorAll('button[data-tab]').forEach(b=>b.onclick=()=>{openTab(b.dataset.tab);box.classList.add('hidden');$(inputId).value='';if(inputId==='globalSearchMobile')$('mobileSearchRow').classList.add('hidden')});
}
$('globalSearch').oninput=()=>globalSearchRun('globalSearch','globalSearchResults');
$('globalSearchMobile').oninput=()=>globalSearchRun('globalSearchMobile','globalSearchResultsMobile');
$('mobileSearchBtn').onclick=()=>{
 const row=$('mobileSearchRow');
 row.classList.toggle('hidden');
 if(!row.classList.contains('hidden')){$('globalSearchMobile').focus()}
};
document.addEventListener('click',e=>{
 if(!e.target.closest('#globalSearch')&&!e.target.closest('#globalSearchResults'))$('globalSearchResults').classList.add('hidden');
 if(!e.target.closest('#globalSearchMobile')&&!e.target.closest('#globalSearchResultsMobile'))$('globalSearchResultsMobile').classList.add('hidden');
});

let realtimeDebounce=null;
function scheduleReload(){clearTimeout(realtimeDebounce);realtimeDebounce=setTimeout(loadData,400)}

let inactivityTimer=null,inactivityWarnTimer=null,inactivityCountdownInterval=null;
const INACTIVITY_LIMIT_MS=5*60*1000;
const INACTIVITY_WARNING_MS=30*1000;
// ==== Déconnexion automatique après inactivité, avec avertissement ====
async function handleInactivityTimeout(){
 if(!user)return;
 hideInactivityWarning();
 await db.auth.signOut();
 toast('Session fermée après 5 minutes d’inactivité.','info',6000);
 location.reload();
}
function showInactivityWarning(){
 if(!user)return;
 let remaining=Math.round(INACTIVITY_WARNING_MS/1000);
 $('inactivityCountdown').textContent=remaining;
 $('inactivityWarning').classList.remove('hidden');
 clearInterval(inactivityCountdownInterval);
 inactivityCountdownInterval=setInterval(()=>{
  remaining--;
  if(remaining<=0){clearInterval(inactivityCountdownInterval);return}
  $('inactivityCountdown').textContent=remaining;
 },1000);
}
function hideInactivityWarning(){
 $('inactivityWarning')?.classList.add('hidden');
 clearInterval(inactivityCountdownInterval);
}
function resetInactivityTimer(){
 if(!user)return;
 hideInactivityWarning();
 clearTimeout(inactivityTimer);clearTimeout(inactivityWarnTimer);
 inactivityWarnTimer=setTimeout(showInactivityWarning,INACTIVITY_LIMIT_MS-INACTIVITY_WARNING_MS);
 inactivityTimer=setTimeout(handleInactivityTimeout,INACTIVITY_LIMIT_MS);
}
$('stayLoggedInBtn').onclick=()=>resetInactivityTimer();
['mousemove','mousedown','keydown','touchstart','scroll','click'].forEach(evt=>document.addEventListener(evt,resetInactivityTimer,{passive:true}));

// ==== Option d'affichage : Mosaïque / Liste ====
const VIEW_TARGETS=['objList','projectList'];
const VIEW_GRID_CLASS='grid md:grid-cols-2 gap-3';
const VIEW_LIST_CLASS='flex flex-col gap-3';
// ==== Préférences d'affichage (grille/liste, thème clair/sombre) ====
function applyViewMode(mode){
 VIEW_TARGETS.forEach(id=>{const el=$(id);if(el)el.className=mode==='list'?VIEW_LIST_CLASS:VIEW_GRID_CLASS});
 localStorage.setItem('organisateur_view',mode);
 if($('viewIconGrid'))$('viewIconGrid').classList.toggle('hidden',mode==='list');
 if($('viewIconList'))$('viewIconList').classList.toggle('hidden',mode!=='list');
}
function initViewMode(){applyViewMode(localStorage.getItem('organisateur_view')||'grid')}
$('viewToggle').onclick=()=>{const cur=localStorage.getItem('organisateur_view')||'grid';applyViewMode(cur==='grid'?'list':'grid')};
initViewMode();

$('addObj').onclick=()=>showObjective();$('addTask').onclick=()=>showTask();$('addProject').onclick=()=>showProject();$('addPlanning').onclick=()=>showPlanning();
function setTaskView(mode){
 localStorage.setItem('orbis_task_view',mode);
 $('taskListView').classList.toggle('hidden',mode!=='list');
 $('taskBoardView').classList.toggle('hidden',mode!=='board');
 $('taskViewList').className='px-3 py-2 flex items-center gap-1.5'+(mode==='list'?' bg-teal-600 text-white':' bg-white dark:bg-slate-800');
 $('taskViewBoard').className='px-3 py-2 flex items-center gap-1.5 border-l dark:border-slate-700'+(mode==='board'?' bg-teal-600 text-white':' bg-white dark:bg-slate-800');
 if(mode==='board')renderTaskBoard();
}
$('taskViewList').onclick=()=>setTaskView('list');
$('taskViewBoard').onclick=()=>setTaskView('board');
$('taskBoardFilterProjet').onchange=renderTaskBoard;
setTaskView(localStorage.getItem('orbis_task_view')||'list');
function setDarkIcon(d){if($('darkIconSun'))$('darkIconSun').classList.toggle('hidden',!d);if($('darkIconMoon'))$('darkIconMoon').classList.toggle('hidden',d)}
$('darkToggle').onclick=()=>{const d=document.documentElement.classList.toggle('dark');localStorage.setItem('organisateur_dark',d?'1':'0');setDarkIcon(d);renderCharts()};
function applyDark(){const d=localStorage.getItem('organisateur_dark')==='1';document.documentElement.classList.toggle('dark',d);setDarkIcon(d)}applyDark();
$('refreshBtn').onclick=async()=>{if(pendingOps.length&&navigator.onLine)await syncPendingOps();else await loadData()};$('logoutBtn').onclick=async()=>{await db.auth.signOut();location.reload()};
$('showForgotBtn').onclick=()=>{$('loginForm').classList.add('hidden');$('forgotForm').classList.remove('hidden')};
$('backToLoginBtn').onclick=()=>{$('forgotForm').classList.add('hidden');$('loginForm').classList.remove('hidden')};
$('showSignupBtn').onclick=()=>{$('loginForm').classList.add('hidden');$('signupForm').classList.remove('hidden')};
$('backToLoginFromSignupBtn').onclick=()=>{$('signupForm').classList.add('hidden');$('loginForm').classList.remove('hidden')};
$('signupBtn').onclick=async()=>{
 const username=$('signupUsername').value.trim(),email=$('signupEmail').value.trim(),password=$('signupPassword').value;
 if(!username){$('signupMsg').textContent='Nom d\'utilisateur requis.';return}
 if(!email||password.length<6){$('signupMsg').textContent='Courriel valide et mot de passe de 6 caractères min. requis.';return}
 $('signupBtn').disabled=true;$('signupMsg').textContent='Création du compte…';
 const {data,error}=await db.auth.signUp({email,password,options:{data:{username}}});
 $('signupBtn').disabled=false;
 if(error){$('signupMsg').textContent='Erreur : '+friendlyError(error);return}
 if(data.session){boot()}
 else{$('signupMsg').textContent='✅ Compte créé ! Vérifiez votre courriel pour confirmer, puis connectez-vous.';}
};
$('sendResetBtn').onclick=async()=>{const email=$('forgotEmail').value.trim();if(!email)return;const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.href});$('forgotMsg').textContent=error?friendlyError(error):'Lien envoyé. Vérifie ton courriel.'};
$('saveNewPasswordBtn').onclick=async()=>{const p=$('newPassword').value;if(p.length<6)return $('resetMsg').textContent='Minimum 6 caractères.';const {error}=await db.auth.updateUser({password:p});$('resetMsg').textContent=error?friendlyError(error):'Mot de passe mis à jour.'};
$('loginBtn').onclick=async()=>{const email=$('loginEmail').value.trim(),password=$('loginPassword').value;$('loginError').classList.add('hidden');const {error}=await db.auth.signInWithPassword({email,password});if(error){$('loginError').textContent=friendlyError(error);$('loginError').classList.remove('hidden')}else boot()};
// ==== Espaces de travail (privé / commun, invitations, changement d'espace) ====
async function loadEspaces(){
 if(!navigator.onLine){espaces=loadOfflineEspaces()||[];return}
 // Garantit que l'espace privé existe, puis rattache les anciennes données (sans effet si déjà fait)
 try{
  await db.rpc('ensure_private_workspace');
  await db.rpc('claim_legacy_data');
  const {data:ws,error}=await db.rpc('get_my_workspaces');
  if(error||!ws){
   console.error(error);
   espaces=(error&&isNetworkError(error))?(loadOfflineEspaces()||[]):[];
   return;
  }
  espaces=ws.map(w=>({id:w.id,nom:w.name,type:w.is_private?'prive':'commun',invite_code:w.invite_code}));
  espaces.sort((a,b)=>(a.type==='prive'?-1:1)-(b.type==='prive'?-1:1));
  try{localStorage.setItem('orbis_offline_espaces',JSON.stringify(espaces))}catch{}
 }catch(e){espaces=loadOfflineEspaces()||[]}
}
function loadOfflineEspaces(){try{return JSON.parse(localStorage.getItem('orbis_offline_espaces')||'null')}catch{return null}}
function isSharedSpace(){const c=espaces.find(e=>e.id===currentEspaceId);return !!c&&c.type==='commun'}
function applyTabVisibility(){
 const shared=isSharedSpace();
 $('navBizplanGroup').classList.toggle('hidden',shared);
 $('navBizplanFlatBtn').classList.toggle('hidden',!shared);
 $('navBizplanFlatBtn').classList.toggle('flex',shared);
 $('navRapportFlatBtn').classList.toggle('hidden',!shared);
 $('navRapportFlatBtn').classList.toggle('flex',shared);
 $('navPlanningGroup').classList.toggle('hidden',shared);
 if($('progressChartTitle'))$('progressChartTitle').innerHTML=$('progressChartTitle').innerHTML.replace(/Progression( par projet)?/,'Progression'+(shared?' par projet':''));
 if(shared){
  const openId=document.querySelector('.tab:not(.hidden)')?.id;
  if(['excel','planning'].includes(openId))openTab('dashboard');
 }
 requestAnimationFrame(moveTabIndicator);
}
function renderEspaceSelector(){
 const sel=$('espaceSelect');
 if(!espaces.length){sel.innerHTML='<option>Aucun espace</option>';return}
 sel.innerHTML=espaces.map(e=>`<option value="${e.id}" ${e.id===currentEspaceId?'selected':''}>${esc(e.type==='prive'?'👤 Mon espace':'👥 '+e.nom)}</option>`).join('');
 const current=espaces.find(e=>e.id===currentEspaceId);
 $('inviteBtn').classList.toggle('hidden',!current||current.type!=='commun');
 $('inviteBtn').classList.toggle('flex',!!current&&current.type==='commun');
 $('deleteSpaceBtn').classList.toggle('hidden',!current||current.type!=='commun');
 $('deleteSpaceBtn').classList.toggle('flex',!!current&&current.type==='commun');
 applyTabVisibility();
}
$('espaceSelect').onchange=async()=>{currentEspaceId=$('espaceSelect').value;localStorage.setItem('orbis_espace',currentEspaceId);renderEspaceSelector();await loadData()};
function openInviteModal(){
 const current=espaces.find(e=>e.id===currentEspaceId);
 if(!current)return;
 modal('Inviter un ami dans « '+esc(current.nom)+' »',
 `<p class="text-sm text-slate-500 mb-3">La personne recevra un courriel pour créer son compte, ou sera ajoutée directement si elle a déjà un compte Orbis.</p>`+
 input('f_inviteEmail','Courriel de la personne à inviter','','email')+
 `<div id="inviteMsg" class="text-sm mb-3"></div>`+
 `<div class="flex gap-2 mb-4"><button id="sendInviteBtn" class="flex-1 bg-teal-600 text-white p-2.5 rounded-lg font-semibold">Envoyer l'invitation</button><button onclick="closeModal()" class="flex-1 border p-2.5 rounded-lg">Fermer</button></div>`+
 (current.invite_code?`<div class="border-t pt-3 dark:border-slate-700 text-sm"><p class="text-slate-500 mb-1">Ou partagez ce code (si votre ami a déjà un compte) :</p><code class="block bg-slate-100 dark:bg-slate-800 rounded px-2 py-1.5 font-mono text-center tracking-wider">${esc(current.invite_code)}</code></div>`:''));
 $('sendInviteBtn').onclick=async()=>{
  const email=$('f_inviteEmail').value.trim();
  if(!email)return;
  $('sendInviteBtn').disabled=true;$('inviteMsg').textContent='Envoi en cours…';
  try{
   const {data:out,error:fnErr}=await db.functions.invoke('invite-member',{
    body:{email,workspace_id:currentEspaceId,redirectTo:location.href}
   });
   if(fnErr)throw new Error(fnErr.context?.error||fnErr.message||'Erreur inconnue');
   if(out?.error)throw new Error(out.error);
   $('inviteMsg').textContent=out.status==='ajoute_directement'?'✅ Cette personne avait déjà un compte : elle a été ajoutée à l’espace.':'✅ Invitation envoyée par courriel.';
   $('f_inviteEmail').value='';
  }catch(e){$('inviteMsg').textContent='Erreur : '+friendlyError(e);}
  $('sendInviteBtn').disabled=false;
 };
}
function openNewSpaceModal(){
 modal('Espace commun',
 `<p class="text-sm text-slate-500 mb-3">Créez un nouvel espace commun pour collaborer, ou rejoignez celui d'un ami avec son code.</p>`+
 `<div class="mb-5"><label class="block text-sm font-medium mb-1">Créer un nouvel espace</label>`+
 input('f_newSpaceName','Nom de l\'espace (ex: Nos projets)')+
 `<button id="createSpaceBtn" class="w-full bg-teal-600 text-white p-2.5 rounded-lg font-semibold">Créer</button></div>`+
 `<div class="border-t pt-4 dark:border-slate-700"><label class="block text-sm font-medium mb-1">Rejoindre avec un code</label>`+
 input('f_joinCode','Code reçu d\'un ami')+
 `<button id="joinSpaceBtn" class="w-full border p-2.5 rounded-lg font-semibold mb-3">Rejoindre</button></div>`+
 `<div id="newSpaceMsg" class="text-sm"></div>`);
 $('createSpaceBtn').onclick=async()=>{
  const name=$('f_newSpaceName').value.trim();
  if(!name)return;
  $('newSpaceMsg').textContent='Création…';
  const {data:w,error}=await db.rpc('create_shared_workspace',{p_name:name});
  if(error){$('newSpaceMsg').textContent='Erreur : '+friendlyError(error);return}
  await loadEspaces();currentEspaceId=w.id;localStorage.setItem('orbis_espace',currentEspaceId);renderEspaceSelector();closeModal();await loadData();
  openInviteModal();
 };
 $('joinSpaceBtn').onclick=async()=>{
  const code=$('f_joinCode').value.trim();
  if(!code)return;
  $('newSpaceMsg').textContent='Connexion…';
  const {data:w,error}=await db.rpc('join_shared_workspace',{p_invite_code:code});
  if(error){$('newSpaceMsg').textContent='Erreur : '+friendlyError(error);return}
  await loadEspaces();currentEspaceId=w.id;localStorage.setItem('orbis_espace',currentEspaceId);renderEspaceSelector();closeModal();await loadData();
 };
}
// ==== Export de toutes les données de l'espace courant (fichier JSON) ====
async function exportAllData(){
 const current=espaces.find(e=>e.id===currentEspaceId);
 const payload={
  export_version:1,
  exporte_le:new Date().toISOString(),
  espace:current?{nom:current.nom,type:current.type}:null,
  objectifs:data.objectifs,
  taches:data.taches,
  projets:data.projets,
  planning:data.planning,
  rappels:data.rappels,
  notes:data.notes
 };
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 const filename=`orbis-sauvegarde-${(current?.nom||'espace').replace(/[^a-z0-9]+/gi,'-')}-${today()}.json`;
 if(IS_IOS){
  window.open(url,'_blank');
 }else{
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
 }
 setTimeout(()=>URL.revokeObjectURL(url),60000);
 toast('Export terminé : '+filename,'success',4000);
}
$('exportDataBtn').onclick=()=>{$('spaceActionsMenu').classList.add('hidden');exportAllData();};
$('spaceActionsBtn').onclick=e=>{e.stopPropagation();$('spaceActionsMenu').classList.toggle('hidden')};
// ==== Notifications push (rappels) ====
// Clé publique VAPID générée une fois côté serveur (voir push_reminders_setup.sql
// et supabase_send_push.ts). Tant qu'elle n'est pas renseignée ici, le bouton
// "Activer les notifications" explique pourquoi ça ne marche pas encore, plutôt
// que d'échouer silencieusement.
const VAPID_PUBLIC_KEY='BE7D_y-xlRBDPaGivz14jP2V2Y8UITkfnpW1ubdBcB_w_s5eSbynrJoeU8sFxHYCiIiptfBdCTkG144yCEKZGRo';
// PushManager.subscribe() attend la clé serveur en Uint8Array, pas en texte :
// cette fonction convertit le format base64url renvoyé par `web-push generate-vapid-keys`.
function urlBase64ToUint8Array(base64String){
 const padding='='.repeat((4-base64String.length%4)%4);
 const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
 const raw=atob(base64);
 return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}
async function enablePushNotifications(){
 if(!('serviceWorker'in navigator)||!('PushManager'in window)){toast('Les notifications ne sont pas prises en charge sur cet appareil ou ce navigateur.','warn',5000);return}
 if(!VAPID_PUBLIC_KEY||VAPID_PUBLIC_KEY.startsWith('REMPLACE_')){toast('Notifications pas encore configurées côté serveur (voir push_reminders_setup.sql et supabase_send_push.ts).','warn',7000);return}
 const perm=await Notification.requestPermission();
 if(perm!=='granted'){toast('Notifications refusées — tu peux les autoriser plus tard dans les réglages du navigateur.','warn',5000);return}
 try{
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});
  const {error}=await db.from('push_subscriptions').upsert({user_id:user.id,workspace_id:currentEspaceId,endpoint:sub.endpoint,subscription:sub.toJSON(),updated_at:new Date().toISOString()},{onConflict:'endpoint'});
  if(error){toast(friendlyError(error));return}
  toast('Notifications activées pour les rappels de cet espace.','success',3500);
 }catch(e){toast('Impossible d\u2019activer les notifications : '+friendlyError(e),'warn',5000)}
}
$('enablePushBtn').onclick=()=>{$('spaceActionsMenu').classList.add('hidden');enablePushNotifications();};

if('serviceWorker' in navigator){
 // ?v=SW_BUILD force le navigateur (et le CDN de GitHub Pages) à retélécharger sw.js
 // au lieu de servir une copie mise en cache : à incrémenter à chaque modification de sw.js.
 const SW_BUILD='11';
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register('./sw.js?v='+SW_BUILD).then(reg=>{
   reg.addEventListener('updatefound',()=>{
    const nw=reg.installing;
    nw?.addEventListener('statechange',()=>{
     if(nw.state==='activated'){toast('Orbis a été mis à jour — rechargement…','info',2000);setTimeout(()=>location.reload(),1200);}
    });
   });
  }).catch(()=>{});
 });
}

let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',(e)=>{
 e.preventDefault();
 deferredInstallPrompt=e;
 $('installDivider').classList.remove('hidden');
 $('installAppBtn').classList.remove('hidden');
 $('installAppBtn').classList.add('flex');
});
$('installAppBtn').onclick=async()=>{
 $('spaceActionsMenu').classList.add('hidden');
 if(!deferredInstallPrompt)return;
 deferredInstallPrompt.prompt();
 const {outcome}=await deferredInstallPrompt.userChoice;
 if(outcome==='accepted')toast('Application installée avec succès.','success',3000);
 deferredInstallPrompt=null;
 $('installDivider').classList.add('hidden');
 $('installAppBtn').classList.add('hidden');
};
window.addEventListener('appinstalled',()=>{
 $('installDivider').classList.add('hidden');
 $('installAppBtn').classList.add('hidden');
 deferredInstallPrompt=null;
});
document.addEventListener('click',e=>{if(!e.target.closest('#spaceActionsGroup'))$('spaceActionsMenu').classList.add('hidden')});
$('newSpaceBtn').onclick=()=>{$('spaceActionsMenu').classList.add('hidden');openNewSpaceModal()};
$('inviteBtn').onclick=()=>{$('spaceActionsMenu').classList.add('hidden');openInviteModal()};
$('deleteSpaceBtn').onclick=async()=>{
 $('spaceActionsMenu').classList.add('hidden');
 const current=espaces.find(e=>e.id===currentEspaceId);
 if(!current||current.type!=='commun')return;
 if(!(await confirmDialog('Toutes les données de cet espace (projets, tâches, notes, etc.) seront supprimées définitivement pour tous les membres.',{title:'Supprimer l\u2019espace « '+current.nom+' » ?',confirmLabel:'Supprimer l\u2019espace'})))return;
 $('deleteSpaceBtn').disabled=true;
 const {error}=await db.rpc('delete_workspace',{p_workspace_id:currentEspaceId});
 $('deleteSpaceBtn').disabled=false;
 if(error){toast('Erreur : '+friendlyError(error));return}
 await loadEspaces();
 currentEspaceId=espaces[0]?.id||null;
 localStorage.setItem('orbis_espace',currentEspaceId||'');
 renderEspaceSelector();
 await loadData();
};
// ==== Démarrage : session utilisateur, abonnement temps réel, minuteries ====
async function boot(){const {data:{session}}=await db.auth.getSession();if(!session){$('loginScreen').classList.remove('hidden');return}user=session.user;$('loginScreen').classList.add('hidden');$('appRoot').classList.remove('hidden');$('welcomeUser').textContent=user.user_metadata?.username||(user.email?user.email.split('@')[0]:'');loadPendingOps();await loadEspaces();const remembered=localStorage.getItem('orbis_espace');currentEspaceId=(espaces.find(e=>e.id===remembered)?remembered:espaces[0]?.id)||null;renderEspaceSelector();updatePendingBadge();await loadData();db.channel('organisateur-v3').on('postgres_changes',{event:'*',schema:'public'},()=>scheduleReload()).subscribe();setInterval(checkReminders,30000);resetInactivityTimer()}
db.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){$('loginScreen').classList.remove('hidden');$('appRoot').classList.add('hidden');$('loginForm').classList.add('hidden');$('signupForm').classList.add('hidden');$('forgotForm').classList.add('hidden');$('resetForm').classList.remove('hidden')}});
boot();
