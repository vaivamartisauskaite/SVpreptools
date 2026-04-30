// ============================================================
// LocApp — main app logic. All data flow goes through:
//   sb.*  → Supabase (sets, locations, comments, likes, viewed, activity)
//   gs.*  → Apps Script proxy (Komanda, Drive photos, uploads, email)
// ============================================================

const sbClient = supabase.createClient(window.CFG.SUPABASE_URL, window.CFG.SUPABASE_ANON, {
  auth: {
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'implicit'
  }
});

// ── small helpers ─────────────────────────────────────
const $  = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);
function escHtml(str){
  if(str===null||str===undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function showToast(msg){
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2400);
}
function fmtDateTime(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = (n)=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
}
function uuid(){
  return crypto.randomUUID();
}

// ── Apps Script proxy ─────────────────────────────────
const gs = {
  async get(action, params={}) {
    const u = new URL(window.CFG.APPS_SCRIPT_URL);
    u.searchParams.set('action', action);
    Object.keys(params).forEach(k => u.searchParams.set(k, params[k]));
    const r = await fetch(u.toString());
    return r.json();
  },
  async post(action, body={}) {
    const r = await fetch(window.CFG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },  // avoid CORS preflight
      body: JSON.stringify({ action, secret: window.CFG.SHARED_SECRET, ...body })
    });
    return r.json();
  }
};

// ── auth ──────────────────────────────────────────────
async function init() {
  // If we just came back from Google with #access_token=... in the URL,
  // wait for the Supabase client to process the hash before checking session.
  // detectSessionInUrl handles this asynchronously on script load.
  if (window.location.hash.includes('access_token')) {
    // Give the client a moment to ingest the hash, then clean the URL.
    for (let i = 0; i < 20; i++) {
      const { data: { session } } = await sbClient.auth.getSession();
      if (session) {
        // strip the hash so a refresh doesn't re-trigger anything weird
        history.replaceState(null, '', window.location.pathname + window.location.search);
        return loadApp(session);
      }
      await new Promise(r => setTimeout(r, 100));
    }
    // gave up waiting → fall through to normal session check
  }

  const { data: { session } } = await sbClient.auth.getSession();
  if (!session) return showSignIn();
  return loadApp(session);
}

function showSignIn(errMsg) {
  $('loading').style.display = 'none';
  $('signinScreen').style.display = 'flex';
  if (errMsg) {
    const e = $('signinError');
    e.textContent = errMsg;
    e.classList.add('show');
  }
}

async function signIn() {
  const { error } = await sbClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href.split('#')[0] }
  });
  if (error) showSignIn('Klaida: ' + error.message);
}

async function signOut() {
  await sbClient.auth.signOut();
  window.location.reload();
}

async function loadApp(session) {
  S.user.email = session.user.email.toLowerCase();

  // verify in Komanda via Apps Script
  const km = await gs.get('komanda', { email: S.user.email });
  if (!km.ok || !km.member) {
    return showSignIn('Jūsų el. paštas (' + S.user.email + ') nerastas Komandos sąraše. Kreipkitės į administratorių.');
  }
  if (!km.member.active) {
    return showSignIn('Jūsų vartotojas nėra aktyvus. Kreipkitės į administratorių.');
  }
  S.user.name = km.member.name || S.user.email;
  S.user.member = km.member;

  $('userName').textContent = S.user.name;

  // load initial bundle (sets + first set's locations)
  await loadInitialBundle();

  $('loading').style.display = 'none';
  $('appShell').style.display = 'flex';
}

// ── state ─────────────────────────────────────────────
const S = {
  user: { email:'', name:'', member:null },
  sets: [],
  locations: [],
  locationCounts: {},
  currentSet: null,
  currentSetId: null,
  drivePhotos: {},
  pendingAttach: {},
  activityRead: {},
  subview: 'k',
  loadedSets: {},
  allLoaded: false,
  currentGalLocationId: null,
  currentGalFileId: null
};
let _selectSetCallback = null;

// ── initial load ──────────────────────────────────────
async function loadInitialBundle() {
  // sets ordered by order_index
  const { data: sets, error: e1 } = await sbClient
    .from('loc_sets').select('*').order('order_index');
  if (e1) { console.error(e1); return; }
  S.sets = sets;

  // counts per set (one query)
  const { data: locStub, error: e2 } = await sbClient
    .from('loc_locations').select('id, set_id');
  if (!e2 && locStub) {
    S.locationCounts = {};
    locStub.forEach(l => {
      const set = S.sets.find(s => s.id === l.set_id);
      if (set) S.locationCounts[set.name] = (S.locationCounts[set.name]||0) + 1;
    });
  }

  // first set's full locations
  if (sets.length) {
    S.currentSet = sets[0].name;
    S.currentSetId = sets[0].id;
    await loadSetLocations(sets[0].id, sets[0].name);
  }

  // new locations badge
  await refreshNewBadge();
  await refreshActivityBadge();

  renderSetList();
  if (sets.length) renderSetHeader(sets[0]);
  showPanel('aktyvumas');
}

async function loadSetLocations(setId, setName) {
  const { data, error } = await sbClient
    .from('loc_locations').select('*').eq('set_id', setId);
  if (error) { console.error(error); return; }

  // attach likes for current user + counts
  const ids = data.map(l => l.id);
  let likeMap = {};
  if (ids.length) {
    const { data: likes } = await sbClient
      .from('loc_likes').select('location_id, user_email').in('location_id', ids);
    (likes||[]).forEach(lk => {
      if (!likeMap[lk.location_id]) likeMap[lk.location_id] = { count:0, mine:false };
      likeMap[lk.location_id].count++;
      if (lk.user_email === S.user.email) likeMap[lk.location_id].mine = true;
    });
  }
  data.forEach(l => {
    l.likeCount = likeMap[l.id] ? likeMap[l.id].count : 0;
    l.userLiked = likeMap[l.id] ? likeMap[l.id].mine  : false;
  });

  // merge into S.locations (replace by set)
  S.locations = S.locations.filter(l => l.set_id !== setId).concat(data);
  S.locationCounts[setName] = data.length;
  S.loadedSets[setName] = true;

  // prefetch thumbs for first ~8
  const urlMap = {};
  data.slice(0, 8).forEach(l => {
    if (l.drive_url && !S.drivePhotos[l.id]) urlMap[l.id] = l.drive_url;
  });
  if (Object.keys(urlMap).length) {
    const r = await gs.post('photosBatch', { urlMap });
    if (r.ok) Object.assign(S.drivePhotos, r.photos);
  }
}

// ── nav ───────────────────────────────────────────────
function mainNav(id) {
  $$('.view').forEach(v => v.classList.remove('act'));
  $$('.ntab').forEach(t => t.classList.remove('act'));
  $('v-'+id).classList.add('act');
  $('nt-'+id).classList.add('act');

  const isStatus = ['atrinkta','scoutuota','pat','nepat'].includes(id);
  if (!isStatus) return;

  if (S.allLoaded) return renderTabById(id);

  const wraps = { atrinkta:'atrinktaWrap', scoutuota:'scoutuotaWrap', pat:'patWrap', nepat:'nepatWrap' };
  $(wraps[id]).innerHTML = '<div style="padding:30px;text-align:center"><div class="spinner" style="margin:auto"></div></div>';

  loadAllLocations().then(() => renderTabById(id));
}

async function loadAllLocations() {
  const { data, error } = await sbClient.from('loc_locations').select('*');
  if (error) { console.error(error); return; }
  // attach likes
  const { data: likes } = await sbClient
    .from('loc_likes').select('location_id, user_email');
  const likeMap = {};
  (likes||[]).forEach(lk => {
    if (!likeMap[lk.location_id]) likeMap[lk.location_id] = { count:0, mine:false };
    likeMap[lk.location_id].count++;
    if (lk.user_email === S.user.email) likeMap[lk.location_id].mine = true;
  });
  data.forEach(l => {
    l.likeCount = likeMap[l.id] ? likeMap[l.id].count : 0;
    l.userLiked = likeMap[l.id] ? likeMap[l.id].mine  : false;
  });
  // merge: replace fully
  const existing = {};
  S.locations.forEach(l => existing[l.id] = l);
  data.forEach(l => existing[l.id] = l);
  S.locations = Object.values(existing);

  // recompute counts
  S.locationCounts = {};
  S.locations.forEach(l => {
    const set = S.sets.find(s => s.id === l.set_id);
    if (set) S.locationCounts[set.name] = (S.locationCounts[set.name]||0) + 1;
  });
  S.allLoaded = true;
  renderSetList();

  // prefetch any photos we don't have yet
  const urlMap = {};
  S.locations.forEach(l => {
    if (l.drive_url && !S.drivePhotos[l.id]) urlMap[l.id] = l.drive_url;
  });
  if (Object.keys(urlMap).length) {
    const r = await gs.post('photosBatch', { urlMap });
    if (r.ok) Object.assign(S.drivePhotos, r.photos);
  }
}

function renderTabById(id) {
  if (id === 'atrinkta') renderGroupedView('Atrinkta scoutui', 'atrinktaWrap');
  if (id === 'scoutuota') renderGroupedView('Scoutuota', 'scoutuotaWrap');
  if (id === 'pat') renderGroupedView('Patvirtinta', 'patWrap');
  if (id === 'nepat') renderNepatvirtinti();
}

function showPanel(id) {
  $$('.panel').forEach(p => p.classList.remove('act'));
  $$('.nb').forEach(b => b.classList.remove('act'));
  $('panel-'+id).classList.add('act');
  const nb = $('nb-'+id); if (nb) nb.classList.add('act');
  if (id === 'naujos') loadNewLocations();
  if (id === 'aktyvumas') loadActivity();
}

function subview(v) {
  S.subview = v;
  const k = $('cardsArea'), s = $('sanArea');
  if (v === 'k') {
    k.style.display = 'flex'; s.style.display = 'none';
    $('vbk').classList.add('act'); $('vbs').classList.remove('act');
    if (S.currentSetId) renderCards(S.locations.filter(l => l.set_id === S.currentSetId));
  } else {
    k.style.display = 'none'; s.style.display = 'flex';
    $('vbk').classList.remove('act'); $('vbs').classList.add('act');
    renderSantrauka();
  }
}

function handleSetaiTab() {
  if (window.innerWidth <= 600) { mainNav('setai'); openDrawer(); }
  else mainNav('setai');
}

function openDrawer() {
  $('sidebar').classList.add('open');
  $('drawerOverlay').classList.add('open');
}
function closeDrawer() {
  $('sidebar').classList.remove('open');
  $('drawerOverlay').classList.remove('open');
}

// ── set list / header ────────────────────────────────
function renderSetList() {
  const list = $('setList');
  const frag = document.createDocumentFragment();
  S.sets.forEach((set, idx) => {
    const name = set.name;
    const loaded = S.locations.filter(l => l.set_id === set.id).length;
    const count = loaded > 0 ? loaded : (S.locationCounts[name] || 0);
    const div = document.createElement('div');
    div.className = 'si' + (S.currentSetId === set.id ? ' act' : '');
    div.dataset.setid = set.id;
    div.dataset.idx = idx;
    div.innerHTML = `<span class="si-n" id="sn-${idx}">${escHtml(name)}</span>
      <div class="si-acts"><button class="si-edit" data-idx="${idx}">✎</button></div>
      <span class="si-c">${count}</span>`;
    div.onclick = (e) => {
      if (e.target.classList.contains('si-edit')) return;
      selectSet(set.id, set.name);
    };
    div.querySelector('.si-edit').onclick = (e) => { e.stopPropagation(); renameSetInline(idx); };
    frag.appendChild(div);
  });
  list.innerHTML = '';
  list.appendChild(frag);
}

function renderSetHeader(set) {
  if (!set) return;
  const c = S.locationCounts[set.name] || 0;
  $('setTitle').textContent = set.name;
  $('setDesc').textContent = (set.int_ext||'') + ' · ' + c + ' variant' + (c===1?'as':'ai') +
    (set.scenes ? ' · Scenos: ' + set.scenes : '');
}

async function selectSet(setId, name) {
  S.currentSet = name;
  S.currentSetId = setId;
  renderSetList();
  showPanel('set');
  $$('.panel').forEach(p => p.classList.remove('act'));
  $('panel-set').classList.add('act');
  closeDrawer();
  const set = S.sets.find(s => s.id === setId);
  renderSetHeader(set);
  $('cardsArea').innerHTML = '<div class="empty-state"><div class="spinner" style="margin:auto"></div></div>';
  if (!S.loadedSets[name]) await loadSetLocations(setId, name);
  renderSetHeader(set);  // refresh counts
  if (S.subview === 'k') renderCards(S.locations.filter(l => l.set_id === setId));
  else renderSantrauka();
  if (typeof _selectSetCallback === 'function') {
    const cb = _selectSetCallback; _selectSetCallback = null;
    setTimeout(cb, 100);
  }
}

async function renameSetInline(idx) {
  const span = $('sn-'+idx);
  const oldName = span.textContent;
  const set = S.sets[idx];
  const inp = document.createElement('input');
  inp.className = 'si-n-input'; inp.value = oldName;
  span.replaceWith(inp); inp.focus(); inp.select();
  const done = async () => {
    const newName = inp.value.trim() || oldName;
    const ns = document.createElement('span'); ns.className = 'si-n'; ns.id = 'sn-'+idx; ns.textContent = newName;
    inp.replaceWith(ns);
    if (newName !== oldName) {
      const { error } = await sbClient.from('loc_sets').update({ name: newName }).eq('id', set.id);
      if (error) { showToast('Klaida: ' + error.message); return; }
      set.name = newName;
      if (S.locationCounts[oldName] !== undefined) {
        S.locationCounts[newName] = S.locationCounts[oldName];
        delete S.locationCounts[oldName];
      }
      if (S.currentSet === oldName) S.currentSet = newName;
      renderSetList();
      showToast('Setas pervadintas: ' + newName);
    }
  };
  inp.onblur = done;
  inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = oldName; inp.blur(); } };
}

// ── badges ────────────────────────────────────────────
async function refreshNewBadge() {
  const { data: locIds } = await sbClient.from('loc_locations').select('id');
  const { data: viewed } = await sbClient
    .from('loc_viewed').select('location_id').eq('user_email', S.user.email);
  const seen = new Set((viewed||[]).map(v => v.location_id));
  const total = (locIds||[]).filter(l => !seen.has(l.id)).length;
  setBadge('badge-n', total);
}

async function refreshActivityBadge() {
  const { data, error } = await sbClient
    .from('loc_activity')
    .select('id, actor_email, read_by')
    .neq('actor_email', S.user.email);
  if (error) return;
  const cnt = (data||[]).filter(a => !(a.read_by||[]).includes(S.user.email)).length;
  setBadge('badge-a', Math.min(cnt, 99));
}

function setBadge(id, n) {
  const el = $(id);
  if (n > 0) { el.textContent = n; el.style.display = ''; }
  else el.style.display = 'none';
}

// ── status / priority helpers ─────────────────────────
function getBadgeCls(status) {
  return ({ 'Siūloma':'b-sug','Atrinkta scoutui':'b-atr','Scoutuota':'b-sco','Patvirtinta':'b-pat','Atmesta':'b-atm' })[status] || 'b-sug';
}
function getPriCls(p) {
  return ({ 'Pagrindinis':'b-pgr','Atsarginis':'b-ats','Žemas prioritetas':'b-zem' })[p] || 'b-zem';
}
function getStatusIcon(s) {
  const m = {
    'Patvirtinta': '✓', 'Scoutuota': '👁', 'Atrinkta scoutui': '✓', 'Siūloma': '?', 'Atmesta': '⊘'
  };
  return m[s] || '';
}

// ── cards ─────────────────────────────────────────────
function renderCards(locs) {
  const area = $('cardsArea');
  if (!locs.length) { area.innerHTML = '<div class="empty-state"><p>Šiam setui variantų dar nėra</p></div>'; return; }
  const priOrd = { 'Pagrindinis':0, 'Atsarginis':1, 'Žemas prioritetas':2 };
  const stOrd  = { 'Patvirtinta':0, 'Scoutuota':1, 'Atrinkta scoutui':2, 'Siūloma':3, 'Atmesta':4 };
  const sorted = locs.slice().sort((a,b) => {
    const ap = priOrd[a.priority] ?? 3, bp = priOrd[b.priority] ?? 3;
    if (ap !== bp) return ap - bp;
    return (stOrd[a.status] ?? 3) - (stOrd[b.status] ?? 3);
  });
  area.innerHTML = '';
  const frag = document.createDocumentFragment();
  sorted.forEach(loc => frag.appendChild(buildCard(loc)));
  area.appendChild(frag);
}

function buildCard(loc) {
  const card = document.createElement('div');
  card.className = 'loc-card' + (loc.status === 'Patvirtinta' ? ' lc-pat' : '');
  card.id = 'card-' + loc.id;

  const pCls = getPriCls(loc.priority);
  const sCls = getBadgeCls(loc.status);
  const heart = loc.userLiked ? '♥' : '♡';

  card.innerHTML = `
    <div class="card-top">
      <div class="card-top-inner">
        <div class="card-thumbs-col" id="thumbs-${loc.id}"><div class="spinner" style="margin:auto"></div></div>
        <div class="card-info-col">
          <div class="ct-row1">
            <div class="loc-name">${escHtml(loc.variant_name)}</div>
            <div class="ct-acts">
              <button class="like-btn ${loc.userLiked?'liked':''}" data-id="${loc.id}">${heart} <span>${loc.likeCount||0}</span></button>
              <button class="icon-btn" data-id="${loc.id}" data-action="edit">✎ <span class="btn-lbl">Redaguoti</span></button>
            </div>
          </div>
          <div class="loc-meta">
            ${loc.address ? `<span class="loc-addr">${escHtml(loc.address)}</span>` : ''}
            ${loc.distance_km ? `<span class="loc-dist">${loc.distance_km < 15 ? 'Vilnius' : 'Atstumas iki Vilniaus ±'+loc.distance_km+' km'}</span>` : ''}
          </div>
          <div class="badge-row">
            <span class="badge ${pCls} bc" data-action="pri">${escHtml(loc.priority||'—')} ▾</span>
            <span class="badge ${sCls} bc" data-action="stat">${getStatusIcon(loc.status)} ${escHtml(loc.status||'—')} ▾</span>
          </div>
          <div class="loc-links">
            ${loc.maps_url ? `<a class="loc-link" href="${escHtml(loc.maps_url)}" target="_blank" onclick="event.stopPropagation()">📍 Google Maps</a>` : ''}
            ${loc.drive_url ? `<button class="loc-link" data-action="gallery">📸 Nuotraukų galerija</button>` : ''}
          </div>
        </div>
      </div>
    </div>
    <div class="pdrop" id="pdrop-${loc.id}">
      ${['Pagrindinis','Atsarginis','Žemas prioritetas'].map(p => `<div class="pd-i ${loc.priority===p?'cur':''}" data-pri="${p}">● ${p}</div>`).join('')}
    </div>
    <div class="pdrop" id="statdrop-${loc.id}">
      ${['Patvirtinta','Scoutuota','Atrinkta scoutui','Siūloma','Atmesta'].map(s => `<div class="pd-i ${loc.status===s?'cur':''}" data-stat="${s}">${getStatusIcon(s)} ${s}</div>`).join('')}
    </div>
    <div class="card-body" id="cb-${loc.id}">
      <div class="avail-row">
        <div class="abox"><div class="alabel">Scouto datos</div><div class="aval">${escHtml(loc.scout_dates||'—')}</div></div>
        <div class="abox"><div class="alabel">Filmavimo galimybės</div><div class="aval">${escHtml(loc.shoot_dates||'—')}</div></div>
      </div>
      ${loc.notes ? `<div class="notes-box"><div class="notes-lbl">Pastabos</div><div class="notes-val">${escHtml(loc.notes)}</div></div>` : ''}
      <hr class="hdiv"><div class="clabel">Komentarai</div>
      <div id="coms-${loc.id}"><div style="font-size:11px;color:#888">Kraunama...</div></div>
      <div class="cin-wrap">
        <div class="cin-row">
          <input class="cin" id="ci-${loc.id}" placeholder="Rašyti komentarą...">
          <button class="cin-attach" data-id="${loc.id}">📎</button>
          <button class="cin-send" data-id="${loc.id}">➤</button>
        </div>
        <div class="attach-preview" id="ap-${loc.id}"><span id="ap-name-${loc.id}"></span><button class="attach-rm" data-id="${loc.id}">×</button></div>
        <div class="c-progress" id="cp-${loc.id}"><div class="c-progress-bar-wrap"><div class="c-progress-bar" id="cpb-${loc.id}"></div></div><span class="c-progress-label" id="cpl-${loc.id}"></span></div>
        <input type="file" id="fi-${loc.id}" style="display:none">
      </div>
    </div>
  `;

  // wire events
  card.querySelector('.card-top').addEventListener('click', (e) => {
    if (e.target.closest('.ct-acts')) return;
    if (e.target.dataset.action === 'gallery') { e.stopPropagation(); openGallery(loc.id); return; }
    toggleBody(loc.id);
  });
  card.querySelector('.like-btn').addEventListener('click', e => { e.stopPropagation(); doLike(loc.id); });
  card.querySelector('[data-action="edit"]').addEventListener('click', e => { e.stopPropagation(); openEditModal(loc.id); });
  card.querySelector('[data-action="pri"]').addEventListener('click', e => { e.stopPropagation(); openPd(e, loc.id, 'pdrop'); });
  card.querySelector('[data-action="stat"]').addEventListener('click', e => { e.stopPropagation(); openPd(e, loc.id, 'statdrop'); });
  card.querySelectorAll('#pdrop-'+loc.id+' .pd-i').forEach(el => {
    el.addEventListener('click', () => setPri(loc.id, el.dataset.pri));
  });
  card.querySelectorAll('#statdrop-'+loc.id+' .pd-i').forEach(el => {
    el.addEventListener('click', () => setStat(loc.id, el.dataset.stat));
  });
  const galBtn = card.querySelector('[data-action="gallery"]');
  if (galBtn) galBtn.addEventListener('click', e => { e.stopPropagation(); openGallery(loc.id); });
  card.querySelector('.cin-send').addEventListener('click', () => sendComment(loc.id));
  card.querySelector('.cin-attach').addEventListener('click', () => $('fi-'+loc.id).click());
  card.querySelector('#fi-'+loc.id).addEventListener('change', e => handleFileSelect(e, loc.id));
  card.querySelector('.attach-rm').addEventListener('click', () => clearAttach(loc.id));
  card.querySelector('.cin').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(loc.id); }
  });

  // thumbnails
  setTimeout(() => renderThumbs(loc.id, S.drivePhotos[loc.id], loc.drive_url), 0);

  return card;
}

async function renderThumbs(locId, photos, driveUrl) {
  const col = $('thumbs-'+locId);
  if (!col) return;
  if (!driveUrl) { col.innerHTML = '<span style="font-size:10px;color:#888">—</span>'; return; }
  if (!photos) {
    // lazy load
    const r = await gs.get('drivePhotos', { url: driveUrl });
    if (r.ok) S.drivePhotos[locId] = r.photos;
    photos = S.drivePhotos[locId] || [];
  }
  col.innerHTML = '';
  if (!photos.length) { col.innerHTML = '<span style="font-size:10px;color:#888">—</span>'; return; }
  for (let i = 0; i < 3; i++) {
    const div = document.createElement('div');
    div.className = 'card-thumb' + (photos[i] ? '' : ' card-thumb-blank');
    if (photos[i]) {
      const img = document.createElement('img');
      img.src = photos[i].thumbUrl;
      img.onerror = function() { this.parentNode.innerHTML = '🖼'; };
      div.appendChild(img);
      div.addEventListener('click', e => { e.stopPropagation(); openGalleryAt(locId, photos[i].id); });
    }
    col.appendChild(div);
  }
}

function toggleBody(locId) {
  const body = $('cb-'+locId);
  const wasOpen = body.classList.contains('open');
  body.classList.toggle('open');
  if (!wasOpen) {
    loadComments(locId);
    markViewedSilent(locId);
  }
}

// ── comments ─────────────────────────────────────────
async function loadComments(locId) {
  const c = $('coms-'+locId);
  const { data, error } = await sbClient
    .from('loc_comments').select('*').eq('location_id', locId).order('created_at');
  if (error) { c.innerHTML = '<div style="color:#791F1F">Klaida</div>'; return; }
  if (!data.length) { c.innerHTML = '<div style="font-size:11px;color:#888">Komentarų dar nėra</div>'; return; }
  c.innerHTML = data.map(cm => commentHtml(cm)).join('');
}

function commentHtml(cm) {
  const ini = (cm.author_name || cm.author_email || '?').substring(0,2).toUpperCase();
  let attach = '';
  if (cm.attachment_drive_id) {
    const isImg = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(cm.attachment_name || '');
    if (isImg) {
      attach = `<a class="cattach" href="https://drive.google.com/file/d/${cm.attachment_drive_id}/view" target="_blank"><img src="https://drive.google.com/thumbnail?id=${cm.attachment_drive_id}&sz=w400" style="width:120px;height:80px;object-fit:cover;border-radius:6px;margin-top:6px"></a>`;
    } else {
      attach = `<a class="cattach" href="https://drive.google.com/file/d/${cm.attachment_drive_id}/view" target="_blank">📎 ${escHtml(cm.attachment_name||'Priedas')}</a>`;
    }
  }
  return `<div class="comment"><div class="cav">${escHtml(ini)}</div>
    <div><span class="cauth">${escHtml(cm.author_name || cm.author_email)}</span>
    <span class="ctime">${fmtDateTime(cm.created_at)}</span>
    <div class="ctext">${escHtml(cm.message)}</div>${attach}</div></div>`;
}

function handleFileSelect(e, locId) {
  const f = e.target.files[0]; if (!f) return;
  S.pendingAttach[locId] = f;
  $('ap-name-'+locId).textContent = f.name;
  $('ap-'+locId).classList.add('show');
}
function clearAttach(locId) {
  delete S.pendingAttach[locId];
  $('ap-'+locId).classList.remove('show');
  $('fi-'+locId).value = '';
}

async function sendComment(locId) {
  const inp = $('ci-'+locId);
  const msg = inp.value.trim();
  if (!msg) return;
  const file = S.pendingAttach[locId];
  const prog = $('cp-'+locId), bar = $('cpb-'+locId), lbl = $('cpl-'+locId);
  const setProg = (p, t) => { prog.classList.add('show'); bar.style.width = p+'%'; lbl.textContent = t; };
  const hideProg = () => setTimeout(() => { prog.classList.remove('show'); bar.style.width = '0%'; }, 800);
  inp.disabled = true;

  let attachId = '', attachName = '';
  if (file) {
    setProg(20, 'Įkeliamas failas...');
    const b64 = await fileToBase64(file);
    const up = await gs.post('uploadAttachment', { base64: b64, filename: file.name, mimeType: file.type });
    if (up.ok) { attachId = up.fileId; attachName = up.fileName; }
  }
  setProg(70, 'Išsaugoma...');

  const { error } = await sbClient.from('loc_comments').insert({
    location_id: locId,
    author_email: S.user.email,
    author_name: S.user.name,
    message: msg,
    attachment_name: attachName || null,
    attachment_drive_id: attachId || null
  });
  if (error) { inp.disabled = false; showToast('Klaida: '+error.message); prog.classList.remove('show'); return; }

  // log activity
  const loc = S.locations.find(l => l.id === locId);
  await logActivity('comment', locId, loc?.variant_name||'', { message: msg.substring(0,100), hasAttachment: !!attachId });

  // notify
  await gs.post('notify', {
    eventType: 'new_comment',
    senderEmail: S.user.email,
    data: {
      locationId: locId, locationName: loc?.variant_name||'',
      author: S.user.name, message: msg.substring(0, 200),
      driveUrl: loc?.drive_url
    }
  });

  setProg(100, 'Išsaugota ✓');
  inp.value = ''; inp.disabled = false;
  clearAttach(locId);
  hideProg();
  loadComments(locId);
  showToast('Komentaras išsiųstas');
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ── likes ────────────────────────────────────────────
async function doLike(locId) {
  const loc = S.locations.find(l => l.id === locId);
  if (!loc) return;
  if (loc.userLiked) {
    await sbClient.from('loc_likes').delete().eq('location_id', locId).eq('user_email', S.user.email);
    loc.userLiked = false; loc.likeCount = Math.max(0, loc.likeCount - 1);
    showToast('Balsas pašalintas');
  } else {
    await sbClient.from('loc_likes').insert({ location_id: locId, user_email: S.user.email });
    loc.userLiked = true; loc.likeCount++;
    showToast('Pažymėta');
  }
  // update button without full re-render
  const card = $('card-'+locId);
  if (card) {
    const btn = card.querySelector('.like-btn');
    btn.classList.toggle('liked', loc.userLiked);
    btn.innerHTML = (loc.userLiked?'♥':'♡') + ' <span>' + loc.likeCount + '</span>';
  }
}

// ── priority / status dropdowns ──────────────────────
function openPd(e, locId, prefix) {
  $$('.pdrop').forEach(d => d.classList.remove('open'));
  const drop = $(prefix+'-'+locId);
  if (!drop) return;
  drop.classList.add('open');
  const badge = e.currentTarget;
  drop.style.top = (badge.offsetTop + badge.offsetHeight + 2) + 'px';
  drop.style.left = badge.offsetLeft + 'px';
}
document.addEventListener('click', () => $$('.pdrop').forEach(d => d.classList.remove('open')));

async function setPri(locId, label) {
  const loc = S.locations.find(l => l.id === locId);
  const oldPri = loc.priority;
  loc.priority = label;
  $$('.pdrop').forEach(d => d.classList.remove('open'));

  const { error } = await sbClient.from('loc_locations').update({ priority: label }).eq('id', locId);
  if (error) { loc.priority = oldPri; showToast('Klaida'); return; }
  showToast('Prioritetas: ' + label);
  // re-render this card's badge
  const card = $('card-'+locId);
  if (card) {
    const badge = card.querySelector('[data-action="pri"]');
    badge.className = 'badge ' + getPriCls(label) + ' bc';
    badge.dataset.action = 'pri';
    badge.innerHTML = label + ' ▾';
  }
}

async function setStat(locId, label) {
  const loc = S.locations.find(l => l.id === locId);
  const oldStat = loc.status;
  loc.status = label;
  $$('.pdrop').forEach(d => d.classList.remove('open'));

  const { error } = await sbClient.from('loc_locations').update({ status: label }).eq('id', locId);
  if (error) { loc.status = oldStat; showToast('Klaida'); return; }
  showToast('Statusas: ' + label);

  await logActivity('status_change', locId, loc.variant_name, { oldStatus: oldStat, newStatus: label });
  await gs.post('notify', {
    eventType: 'status_change',
    senderEmail: S.user.email,
    data: {
      locationId: locId, locationName: loc.variant_name,
      oldStatus: oldStat, newStatus: label,
      changedBy: S.user.name, driveUrl: loc.drive_url
    }
  });

  const card = $('card-'+locId);
  if (card) {
    card.className = 'loc-card' + (label === 'Patvirtinta' ? ' lc-pat' : '');
    const badge = card.querySelector('[data-action="stat"]');
    badge.className = 'badge ' + getBadgeCls(label) + ' bc';
    badge.dataset.action = 'stat';
    badge.innerHTML = getStatusIcon(label) + ' ' + label + ' ▾';
  }
}

// ── activity ─────────────────────────────────────────
async function logActivity(type, locId, locName, data) {
  await sbClient.from('loc_activity').insert({
    type, location_id: locId || null, location_name: locName || null,
    actor_email: S.user.email, data: data || {}, read_by: []
  });
}

async function loadActivity() {
  const wrap = $('aktWrap');
  wrap.innerHTML = '<div style="padding:20px;color:#888">Kraunama...</div>';
  const { data, error } = await sbClient
    .from('loc_activity').select('*')
    .neq('actor_email', S.user.email)
    .order('created_at', { ascending: false }).limit(60);
  if (error) { wrap.innerHTML = '<div class="empty-state">Klaida</div>'; return; }
  if (!data.length) { wrap.innerHTML = '<div class="empty-state"><p>Naujų pranešimų nėra</p></div>'; return; }

  wrap.innerHTML = '<div class="nv-hdr"><span class="nv-title">Aktyvumas</span></div>';
  data.forEach(ev => {
    const isRead = (ev.read_by||[]).includes(S.user.email);
    const loc = S.locations.find(l => l.id === ev.location_id);
    const title = activityTitle(ev, loc);
    const sub = activitySub(ev);
    const time = fmtDateTime(ev.created_at);
    const photoFileId = (ev.data && ev.data.photoFileId) || '';
    let thumb = '';
    if (loc && S.drivePhotos[loc.id] && S.drivePhotos[loc.id][0]) {
      thumb = `<div class="ai-thumb"><img src="${S.drivePhotos[loc.id][0].thumbUrl}" onerror="this.style.display='none'"></div>`;
    } else {
      thumb = `<div class="ai-ic ic-c">!</div>`;
    }

    const div = document.createElement('div');
    div.className = 'ai' + (isRead?' read':'');
    div.id = 'ai-'+ev.id;
    div.innerHTML = thumb +
      `<div class="ai-body">
        <div class="ai-title">${escHtml(title)}</div>
        <div class="ai-sub">${escHtml(sub)}</div>
        <div class="ai-time">${time}</div>
        <div class="ai-btns">
          <button class="ai-btn" data-act="goto">Peržiūrėti</button>
          <button class="ai-btn" data-act="read">Pažymėti kaip skaityta</button>
        </div>
      </div>`;
    div.querySelector('[data-act="goto"]').addEventListener('click', () => {
      markActivityRead(ev.id);
      goToLocation(ev.location_id, photoFileId);
    });
    div.querySelector('[data-act="read"]').addEventListener('click', e => {
      e.stopPropagation(); markActivityRead(ev.id);
    });
    wrap.appendChild(div);
  });
}

function activityTitle(ev, loc) {
  const name = loc?.variant_name || ev.location_name || '';
  const titles = {
    new_location:  'Nauja lokacija — ' + name,
    status_change: 'Statusas pakeistas — ' + name,
    field_update:  'Atnaujinta informacija — ' + name,
    update:        'Atnaujinta informacija — ' + name,
    comment:       'Komentaras — ' + name,
    photo_comment: 'Komentaras prie nuotraukos — ' + name
  };
  return titles[ev.type] || ev.type;
}
function activitySub(ev) {
  const a = ev.data && ev.data.author || ev.actor_email;
  if (ev.type === 'status_change') return `${a}: ${ev.data?.oldStatus||''} → ${ev.data?.newStatus||''}`;
  if (ev.type === 'comment' || ev.type === 'photo_comment') return `${a}: "${(ev.data?.message||'').substring(0,80)}"`;
  if (ev.type === 'field_update' && ev.data?.changes) {
    return a + ' atnaujino: ' + Object.keys(ev.data.changes).join(', ');
  }
  return a + '';
}

async function markActivityRead(eventId) {
  const el = $('ai-'+eventId); if (el) el.classList.add('read');
  // append email to read_by array
  const { data } = await sbClient.from('loc_activity').select('read_by').eq('id', eventId).single();
  if (!data) return;
  const newRead = (data.read_by||[]).concat(S.user.email);
  await sbClient.from('loc_activity').update({ read_by: newRead }).eq('id', eventId);
  refreshActivityBadge();
}
async function markAllActivity() {
  const { data } = await sbClient.from('loc_activity').select('id, read_by')
    .neq('actor_email', S.user.email);
  if (!data) return;
  for (const a of data) {
    if (!(a.read_by||[]).includes(S.user.email)) {
      await sbClient.from('loc_activity').update({ read_by: (a.read_by||[]).concat(S.user.email) }).eq('id', a.id);
    }
  }
  loadActivity();
  refreshActivityBadge();
}

async function goToLocation(locId, photoFileId) {
  const loc = S.locations.find(l => l.id === locId);
  if (!loc && !S.allLoaded) {
    await loadAllLocations();
    return goToLocation(locId, photoFileId);
  }
  if (!loc) return showToast('Lokacija nerasta');
  mainNav('setai');
  const set = S.sets.find(s => s.id === loc.set_id);
  const after = () => {
    if (photoFileId) openGalleryAt(locId, photoFileId);
    else {
      const body = $('cb-'+locId);
      if (body && !body.classList.contains('open')) toggleBody(locId);
      const card = $('card-'+locId);
      if (card) card.scrollIntoView({ behavior:'smooth', block:'center' });
    }
  };
  if (S.currentSetId === loc.set_id && $('card-'+locId)) after();
  else { _selectSetCallback = after; selectSet(loc.set_id, set?.name); }
}

// ── new locations ────────────────────────────────────
async function loadNewLocations() {
  const wrap = $('naujosWrap');
  wrap.innerHTML = '<div style="padding:20px;color:#888">Kraunama...</div>';
  const { data: viewed } = await sbClient
    .from('loc_viewed').select('location_id').eq('user_email', S.user.email);
  const seen = new Set((viewed||[]).map(v => v.location_id));
  const { data: locs } = await sbClient
    .from('loc_locations').select('*').order('created_at', { ascending: false });
  const fresh = (locs||[]).filter(l => !seen.has(l.id));
  setBadge('badge-n', fresh.length);
  if (!fresh.length) { wrap.innerHTML = '<div class="empty-state"><p>Visos lokacijos peržiūrėtos</p></div>'; return; }

  wrap.innerHTML = '<div class="nv-hdr"><span class="nv-title">Naujos lokacijos</span></div>';
  fresh.forEach(loc => {
    const set = S.sets.find(s => s.id === loc.set_id);
    const div = document.createElement('div');
    div.className = 'ai'; div.id = 'ni-'+loc.id;
    div.innerHTML = `<div class="ai-ic ic-n">📍</div>
      <div class="ai-body">
        <div class="ai-title">${escHtml(loc.variant_name)}</div>
        <div class="ai-sub">${escHtml(set?.name||'')} ${loc.priority?' · '+escHtml(loc.priority):''} ${loc.status?' · '+escHtml(loc.status):''}</div>
        <div class="ai-time">Įkėlė: ${escHtml(loc.added_by_email||'')} · ${fmtDateTime(loc.created_at)}</div>
        <div class="ai-btns"><button class="ai-btn" data-id="${loc.id}" data-set="${loc.set_id}">Peržiūrėti</button><button class="ai-btn" data-mark="${loc.id}">Pažymėti kaip peržiūrėtą</button></div>
      </div>`;
    div.querySelector('[data-id]').addEventListener('click', () => {
      doMarkViewed(loc.id);
      mainNav('setai');
      selectSet(loc.set_id, set?.name);
    });
    div.querySelector('[data-mark]').addEventListener('click', e => { e.stopPropagation(); doMarkViewed(loc.id); });
    wrap.appendChild(div);
  });
}

async function doMarkViewed(locId) {
  await markViewedSilent(locId);
  const el = $('ni-'+locId);
  if (el) { el.style.transition='opacity .3s'; el.style.opacity=0; setTimeout(()=>el.remove(),300); }
  refreshNewBadge();
}

async function markViewedSilent(locId) {
  await sbClient.from('loc_viewed').upsert(
    { location_id: locId, user_email: S.user.email },
    { onConflict: 'location_id,user_email' }
  );
}

async function markAllViewedFn() {
  const { data: locs } = await sbClient.from('loc_locations').select('id');
  const rows = (locs||[]).map(l => ({ location_id: l.id, user_email: S.user.email }));
  if (rows.length) await sbClient.from('loc_viewed').upsert(rows, { onConflict: 'location_id,user_email' });
  showToast('Visos pažymėtos');
  loadNewLocations();
  refreshNewBadge();
}

// ── add / edit / delete locations ────────────────────
function openAddModal() {
  ensureModals();
  const sel = $('aset');
  sel.innerHTML = S.sets.map(s => `<option value="${s.id}" ${s.id===S.currentSetId?'selected':''}>${escHtml(s.name)}</option>`).join('') +
    '<option value="new">+ Pridėti naują setą...</option>';
  $('modal-add').classList.add('open');
}
function closeAddModal() { $('modal-add').classList.remove('open'); }
function checkNewSet(sel) { $('ns-row').classList.toggle('show', sel.value === 'new'); }
async function confirmNewSet() {
  const name = $('ns-name').value.trim();
  if (!name) return;
  const maxOrder = Math.max(0, ...S.sets.map(s=>s.order_index||0));
  const { data, error } = await sbClient.from('loc_sets').insert({
    name, int_ext: 'EXT', order_index: maxOrder + 1
  }).select().single();
  if (error) { showToast('Klaida: '+error.message); return; }
  S.sets.push(data);
  S.locationCounts[name] = 0;
  const sel = $('aset');
  const opt = document.createElement('option');
  opt.value = data.id; opt.textContent = name; opt.selected = true;
  sel.insertBefore(opt, sel.lastElementChild);
  sel.value = data.id;
  $('ns-row').classList.remove('show');
  renderSetList();
  showToast('Setas pridėtas: '+name);
}

function calcDistance(mapsUrl) {
  if (!mapsUrl) return null;
  const m = mapsUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
            mapsUrl.match(/[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  const R = 6371;
  const dLat = (lat - window.CFG.VILNIUS.lat) * Math.PI/180;
  const dLng = (lng - window.CFG.VILNIUS.lng) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(window.CFG.VILNIUS.lat*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

async function saveLocation() {
  const setId = $('aset').value;
  if (setId === 'new') { showToast('Pirmiausia patvirtinkite seto pavadinimą'); return; }
  const name = $('an').value.trim();
  if (!name) { $('an').focus(); return; }
  const btn = $('btn-add-save'); btn.textContent = 'Saugoma...'; btn.disabled = true;

  const mapsUrl = $('amap').value;
  const newRow = {
    set_id: setId, variant_name: name,
    address: $('aa').value || null,
    maps_url: mapsUrl || null,
    drive_url: $('adrv').value || null,
    priority: $('apri').value, status: $('astat').value,
    scout_dates: $('asd').value || null,
    shoot_dates: $('ash').value || null,
    notes: $('anotes').value || null,
    added_by_email: S.user.email,
    distance_km: calcDistance(mapsUrl)
  };
  const { data, error } = await sbClient.from('loc_locations').insert(newRow).select().single();
  btn.textContent = 'Išsaugoti'; btn.disabled = false;
  if (error) { showToast('Klaida: '+error.message); return; }
  data.likeCount = 0; data.userLiked = false;
  S.locations.push(data);
  const set = S.sets.find(s => s.id === setId);
  S.locationCounts[set.name] = (S.locationCounts[set.name]||0) + 1;
  closeAddModal();
  if (S.currentSetId === setId) renderCards(S.locations.filter(l => l.set_id === setId));
  renderSetList();
  await markViewedSilent(data.id);
  await logActivity('new_location', data.id, name, { setName: set.name });
  await gs.post('notify', {
    eventType: 'new_location',
    senderEmail: S.user.email,
    data: {
      locationId: data.id, locationName: name, setName: set.name,
      addedBy: S.user.name, driveUrl: data.drive_url
    }
  });
  showToast('Lokacija pridėta: ' + name);
  ['an','aa','amap','adrv','asd','ash','anotes'].forEach(id => $(id).value = '');
}

function openEditModal(locId) {
  ensureModals();
  const loc = S.locations.find(l => l.id === locId);
  if (!loc) return;
  $('edit-id').value = locId;
  $('en').value = loc.variant_name || '';
  $('ea').value = loc.address || '';
  $('esd').value = loc.scout_dates || '';
  $('esh').value = loc.shoot_dates || '';
  $('emap').value = loc.maps_url || '';
  $('edrv').value = loc.drive_url || '';
  $('enotes').value = loc.notes || '';
  $('epri').value = loc.priority || 'Pagrindinis';
  $('estat').value = loc.status || 'Siūloma';
  const eset = $('eset');
  eset.innerHTML = S.sets.map(s => `<option value="${s.id}" ${s.id===loc.set_id?'selected':''}>${escHtml(s.name)}</option>`).join('');
  $('modal-edit').classList.add('open');
}
function closeEditModal() { $('modal-edit').classList.remove('open'); }

async function saveEdit() {
  const id = $('edit-id').value;
  const loc = S.locations.find(l => l.id === id);
  if (!loc) return;
  const newSetId = $('eset').value;
  const newRow = {
    set_id: newSetId,
    variant_name: $('en').value,
    address: $('ea').value || null,
    priority: $('epri').value,
    status: $('estat').value,
    scout_dates: $('esd').value || null,
    shoot_dates: $('esh').value || null,
    maps_url: $('emap').value || null,
    drive_url: $('edrv').value || null,
    notes: $('enotes').value || null,
    distance_km: calcDistance($('emap').value)
  };

  // detect what actually changed for activity log
  const changes = {};
  const fieldLabels = {
    variant_name:'Pavadinimas', address:'Adresas', priority:'Prioritetas',
    scout_dates:'Scouto datos', shoot_dates:'Filmavimo galimybės',
    maps_url:'Google Maps', drive_url:'Drive aplankas', notes:'Pastabos'
  };
  Object.keys(fieldLabels).forEach(k => {
    if ((loc[k]||'') !== (newRow[k]||'')) changes[fieldLabels[k]] = { old: loc[k], new: newRow[k] };
  });
  const oldStatus = loc.status;
  const oldSetId = loc.set_id;

  const { error } = await sbClient.from('loc_locations').update(newRow).eq('id', id);
  if (error) { showToast('Klaida: '+error.message); return; }

  Object.assign(loc, newRow);
  if (oldSetId !== newSetId) {
    const oldSet = S.sets.find(s => s.id === oldSetId);
    const newSet = S.sets.find(s => s.id === newSetId);
    if (oldSet && S.locationCounts[oldSet.name] > 0) S.locationCounts[oldSet.name]--;
    if (newSet) S.locationCounts[newSet.name] = (S.locationCounts[newSet.name]||0) + 1;
  }
  closeEditModal();

  if (oldStatus !== newRow.status) {
    await logActivity('status_change', id, loc.variant_name, { oldStatus, newStatus: newRow.status });
    await gs.post('notify', {
      eventType: 'status_change',
      senderEmail: S.user.email,
      data: {
        locationId: id, locationName: loc.variant_name,
        oldStatus, newStatus: newRow.status,
        changedBy: S.user.name, driveUrl: loc.drive_url
      }
    });
  }
  if (Object.keys(changes).length) {
    await logActivity('field_update', id, loc.variant_name, { changes, author: S.user.name });
    await gs.post('notify', {
      eventType: 'field_update',
      senderEmail: S.user.email,
      data: {
        locationId: id, locationName: loc.variant_name,
        changes, author: S.user.name, driveUrl: loc.drive_url
      }
    });
  }

  if (S.currentSetId === loc.set_id) renderCards(S.locations.filter(l => l.set_id === loc.set_id));
  renderSetList();
  showToast('Pakeitimai išsaugoti');
}

async function confirmDelete() {
  const id = $('edit-id').value;
  const loc = S.locations.find(l => l.id === id);
  if (!loc) return;
  if (!confirm('Pašalinti "' + loc.variant_name + '"? Veiksmo atšaukti negalima.')) return;
  const { error } = await sbClient.from('loc_locations').delete().eq('id', id);
  if (error) { showToast('Klaida: '+error.message); return; }
  S.locations = S.locations.filter(l => l.id !== id);
  const set = S.sets.find(s => s.id === loc.set_id);
  if (set && S.locationCounts[set.name] > 0) S.locationCounts[set.name]--;
  $('card-'+id)?.remove();
  closeEditModal();
  renderSetList();
  showToast('Variantas pašalintas');
}

// ── santrauka ────────────────────────────────────────
function renderSantrauka() {
  const area = $('sanArea');
  const locs = S.currentSetId ? S.locations.filter(l => l.set_id === S.currentSetId) : S.locations;
  const order = ['Patvirtinta','Scoutuota','Atrinkta scoutui','Siūloma','Atmesta'];
  const dots = { Patvirtinta:'#3B6D11', Scoutuota:'#185FA5', 'Atrinkta scoutui':'#BA7517', Siūloma:'#888', Atmesta:'#791F1F' };
  area.innerHTML = '';
  order.forEach(status => {
    const group = locs.filter(l => l.status === status);
    if (!group.length) return;
    const sec = document.createElement('div');
    sec.innerHTML = `<div class="sg-hdr"><div class="sg-dot" style="background:${dots[status]}"></div><span class="sg-title">${status}</span><span class="sg-count">${group.length}</span></div>`;
    group.forEach(loc => {
      const set = S.sets.find(s => s.id === loc.set_id);
      sec.innerHTML += `<div class="lv">
        <div><div class="lv-name">${escHtml(loc.variant_name)}</div>
        <div class="lv-set">${escHtml(set?.name||'')} · ${escHtml(loc.priority||'')}</div>
        <div class="lv-bgs"><span class="badge ${getBadgeCls(loc.status)}">${escHtml(loc.status||'')}</span></div></div>
        <div><div class="ll">Filmavimo galimybės</div><div class="lv-val">${escHtml(loc.shoot_dates||'—')}</div></div>
        <div><div class="ll">Pastabos</div><div class="lv-val">${escHtml(loc.notes||'—')}</div></div>
      </div>`;
    });
    area.appendChild(sec);
  });
}

// ── grouped status views ─────────────────────────────
function renderGroupedView(status, wrapId) {
  const wrap = $(wrapId);
  const locs = S.locations.filter(l => l.status === status);
  if (!locs.length) { wrap.innerHTML = '<div class="empty-state"><p>Lokacijų nerasta</p></div>'; return; }
  const groups = {};
  locs.forEach(l => {
    const set = S.sets.find(s => s.id === l.set_id);
    const sn = set?.name || '';
    if (!groups[sn]) groups[sn] = { set, locs: [] };
    groups[sn].locs.push(l);
  });
  wrap.innerHTML = '';
  Object.keys(groups).sort((a,b)=>a.localeCompare(b,'lt')).forEach(sn => {
    const g = groups[sn];
    const sec = document.createElement('div');
    sec.className = 'grp-section';
    sec.innerHTML = `<div class="grp-hdr"><span class="grp-ie">${escHtml(g.set?.int_ext||'')}</span><span class="grp-setname">${escHtml(sn)}</span><span class="grp-count">${g.locs.length} variant${g.locs.length===1?'as':'ai'}</span></div>`;
    g.locs.forEach(loc => {
      const photos = (S.drivePhotos[loc.id]||[]).slice(0,3);
      let thumbs = '';
      if (loc.drive_url) {
        let items = '';
        for (let i=0; i<3; i++) {
          if (photos[i]) items += `<div class="rc-thumb" data-photo="${photos[i].id}" data-loc="${loc.id}"><img src="${photos[i].thumbUrl}" onerror="this.parentNode.innerHTML='🖼'"></div>`;
          else items += `<div class="rc-thumb rc-thumb-blank"></div>`;
        }
        thumbs = `<div class="rc-thumbs">${items}</div>`;
      }
      const row = document.createElement('div');
      row.className = 'rc';
      row.innerHTML = thumbs +
        `<div class="rc-main" style="margin-left:10px;flex:1;padding:8px 0">
          <div class="rc-name">${escHtml(loc.variant_name)}</div>
          ${loc.address?`<div class="rc-addr">${escHtml(loc.address)}</div>`:''}
          <div class="rc-meta-row">
            ${loc.distance_km?`<span class="rc-dist">${loc.distance_km<15?'Vilnius':'±'+loc.distance_km+' km'}</span>`:''}
            ${loc.maps_url?`<a class="loc-link" href="${escHtml(loc.maps_url)}" target="_blank" onclick="event.stopPropagation()">📍 Maps</a>`:''}
          </div>
          <div class="rc-badges">
            <span class="badge ${getPriCls(loc.priority)}">${escHtml(loc.priority||'—')}</span>
            <span class="badge ${getBadgeCls(loc.status)}">${escHtml(loc.status||'—')}</span>
          </div>
        </div>
        <div class="rc-actions" style="align-self:center;margin-left:8px">
          <button class="icon-btn" data-edit="${loc.id}">✎ <span class="btn-lbl">Redaguoti</span></button>
        </div>`;
      row.querySelectorAll('.rc-thumb[data-photo]').forEach(el => {
        el.addEventListener('click', e => { e.stopPropagation(); openGalleryAt(el.dataset.loc, el.dataset.photo); });
      });
      row.querySelector('[data-edit]').addEventListener('click', e => { e.stopPropagation(); openEditModal(loc.id); });
      row.addEventListener('click', () => {
        mainNav('setai');
        const set = S.sets.find(s => s.id === loc.set_id);
        selectSet(loc.set_id, set?.name);
      });
      sec.appendChild(row);
    });
    wrap.appendChild(sec);
  });
}

function renderNepatvirtinti() {
  const wrap = $('nepatWrap');
  const nepatSets = S.sets.filter(s => !s.approved_loc_id);
  if (!nepatSets.length) { wrap.innerHTML = '<div class="empty-state"><p>Visi setai patvirtinti!</p></div>'; return; }
  wrap.innerHTML = '';
  nepatSets.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'','lt')).forEach(s => {
    const c = S.locationCounts[s.name] || 0;
    const row = document.createElement('div');
    row.className = 'ss-item';
    row.style.cursor = 'pointer';
    row.innerHTML = `<span class="ss-ie">${escHtml(s.int_ext||'')}</span>
      <div class="ss-main"><div class="ss-name" style="color:#534AB7">${escHtml(s.name)}</div></div>
      <span class="np-count ${c>0?'np-count-active':''}">${c} variant${c===1?'as':'ai'}</span>`;
    row.addEventListener('click', () => { mainNav('setai'); selectSet(s.id, s.name); });
    wrap.appendChild(row);
  });
}

// ── gallery ──────────────────────────────────────────
function openGallery(locId) { openGalleryAt(locId, null); }

async function openGalleryAt(locId, startPhotoId) {
  ensureModals();
  const loc = S.locations.find(l => l.id === locId);
  if (!loc) return;
  S.currentGalLocationId = locId;
  S.currentGalFileId = startPhotoId;
  $('galTitle').textContent = 'Nuotraukų galerija – ' + loc.variant_name;
  $('modal-gal').classList.add('open');

  let photos = S.drivePhotos[locId];
  if (!photos) {
    if (!loc.drive_url) { $('galMainImg').innerHTML = '<div class="gal-img-ph">Drive nenurodytas</div>'; return; }
    $('galMainImg').innerHTML = '<div class="gal-img-ph"><div class="spinner"></div></div>';
    const r = await gs.get('drivePhotos', { url: loc.drive_url });
    if (r.ok) photos = S.drivePhotos[locId] = r.photos;
    else { $('galMainImg').innerHTML = '<div class="gal-img-ph">Klaida</div>'; return; }
  }
  if (!photos || !photos.length) { $('galMainImg').innerHTML = '<div class="gal-img-ph">Nuotraukų nerasta</div>'; return; }
  renderGalleryStrip(locId, photos);
  const first = startPhotoId ? photos.find(p => p.id === startPhotoId) : photos[0];
  if (first) selectGalPhoto(locId, first.id);
}

function renderGalleryStrip(locId, photos) {
  const strip = $('galStrip'); strip.innerHTML = '';
  photos.forEach(p => {
    const div = document.createElement('div');
    div.className = 'gs-th'; div.id = 'gth-'+p.id;
    div.innerHTML = `<img src="${p.thumbUrl}" onerror="this.style.display='none'">`;
    div.addEventListener('click', () => selectGalPhoto(locId, p.id));
    strip.appendChild(div);
  });
}

async function selectGalPhoto(locId, fileId) {
  S.currentGalFileId = fileId;
  $$('.gs-th').forEach(t => t.classList.remove('act'));
  $('gth-'+fileId)?.classList.add('act');
  $('galMainImg').innerHTML = `<img src="https://drive.google.com/thumbnail?id=${fileId}&sz=w1200" onerror="this.outerHTML='<div class=&quot;gal-img-ph&quot;>Nepavyko užkrauti</div>'">`;
  loadPhotoComments(fileId);
}

function closeGallery() { $('modal-gal').classList.remove('open'); }

async function loadPhotoComments(fileId) {
  const c = $('galComs');
  c.innerHTML = '<div style="font-size:11px;color:#888">Kraunama...</div>';
  const { data, error } = await sbClient
    .from('loc_photo_comments').select('*').eq('photo_drive_id', fileId).order('created_at');
  if (error || !data || !data.length) { c.innerHTML = '<div style="font-size:11px;color:#888">Komentarų dar nėra</div>'; return; }
  c.innerHTML = data.map(cm => commentHtml({
    author_name: cm.author_name, author_email: cm.author_email,
    created_at: cm.created_at, message: cm.message,
    attachment_drive_id: cm.attachment_drive_id, attachment_name: cm.attachment_name
  })).join('');
}

async function sendPhotoComment() {
  if (!S.currentGalFileId) { showToast('Pasirinkite nuotrauką'); return; }
  const inp = $('galCin');
  const msg = inp.value.trim(); if (!msg) return;
  inp.disabled = true;
  const fileInp = $('galFileInput');
  const file = fileInp.files[0];
  let attachId = '', attachName = '';
  if (file) {
    const b64 = await fileToBase64(file);
    const up = await gs.post('uploadAttachment', { base64: b64, filename: file.name, mimeType: file.type });
    if (up.ok) { attachId = up.fileId; attachName = up.fileName; }
  }
  const { error } = await sbClient.from('loc_photo_comments').insert({
    location_id: S.currentGalLocationId,
    photo_drive_id: S.currentGalFileId,
    author_email: S.user.email, author_name: S.user.name,
    message: msg,
    attachment_name: attachName || null,
    attachment_drive_id: attachId || null
  });
  inp.disabled = false;
  if (error) { showToast('Klaida: '+error.message); return; }
  inp.value = ''; fileInp.value = '';
  const loc = S.locations.find(l => l.id === S.currentGalLocationId);
  await logActivity('photo_comment', S.currentGalLocationId, loc?.variant_name||'', {
    message: msg.substring(0,100), photoFileId: S.currentGalFileId
  });
  await gs.post('notify', {
    eventType: 'new_photo_comment',
    senderEmail: S.user.email,
    data: {
      locationId: S.currentGalLocationId, locationName: loc?.variant_name||'',
      author: S.user.name, message: msg.substring(0,200),
      photoFileId: S.currentGalFileId, driveUrl: loc?.drive_url
    }
  });
  loadPhotoComments(S.currentGalFileId);
  showToast('Komentaras išsiųstas');
}

// ── settings modal ───────────────────────────────────
function openSettings() {
  ensureModals();
  $('settings-email').textContent = S.user.email;
  $('sn-newloc').checked  = !!S.user.member.notifyNewLocation;
  $('sn-comment').checked = !!S.user.member.notifyComment;
  $('sn-status').checked  = !!S.user.member.notifyStatusChange;
  selectDigest(S.user.member.digestType || 'IŠKART');
  $('modal-settings').classList.add('open');
}
function closeSettings() { $('modal-settings').classList.remove('open'); }
function selectDigest(v) {
  S.user.member.digestType = v;
  $('digest-opt-iskart').classList.toggle('selected', v==='IŠKART');
  $('digest-opt-kasdien').classList.toggle('selected', v==='KASDIEN');
}
async function saveSettings() {
  const btn = $('btn-save-settings'); btn.textContent = 'Saugoma...'; btn.disabled = true;
  const settings = {
    notifyNewLocation:  $('sn-newloc').checked,
    notifyComment:      $('sn-comment').checked,
    notifyStatusChange: $('sn-status').checked,
    digestType: S.user.member.digestType
  };
  const r = await gs.post('saveKomandaPrefs', { email: S.user.email, settings });
  btn.textContent = 'Išsaugoti'; btn.disabled = false;
  if (r.ok) {
    Object.assign(S.user.member, settings);
    closeSettings();
    showToast('Nustatymai išsaugoti');
  } else showToast('Klaida išsaugant');
}

// ── modal injection ──────────────────────────────────
let _modalsInjected = false;
function ensureModals() {
  if (_modalsInjected) return;
  $('modalContainer').innerHTML = MODAL_HTML;
  _modalsInjected = true;
}

const MODAL_HTML = `
<div class="modal-ov" id="modal-add" onclick="if(event.target===this)closeAddModal()">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-title">Pridėti variantą</div>
    <div class="fr"><label>Pavadinimas</label><input id="an" placeholder="pvz. Kavarsko rotušė – kiemas"></div>
    <div class="fr"><label>Setas</label><select id="aset" onchange="checkNewSet(this)"></select></div>
    <div class="ns-row" id="ns-row"><input id="ns-name" placeholder="Naujo seto pavadinimas"><button class="ns-add" onclick="confirmNewSet()">Pridėti</button></div>
    <div class="f2">
      <div class="fr"><label>Adresas</label><input id="aa"></div>
      <div class="fr"><label>INT / EXT</label><select id="aie"><option>EXT</option><option>INT</option><option>INT/EXT</option></select></div>
    </div>
    <div class="f2">
      <div class="fr"><label>Prioritetas</label><select id="apri"><option>Pagrindinis</option><option>Atsarginis</option><option>Žemas prioritetas</option></select></div>
      <div class="fr"><label>Statusas</label><select id="astat"><option>Siūloma</option><option>Atrinkta scoutui</option><option>Scoutuota</option><option>Patvirtinta</option><option>Atmesta</option></select></div>
    </div>
    <div class="f2">
      <div class="fr"><label>Scouto datos</label><input id="asd" placeholder="2026.05.10, 10:00–15:00"></div>
      <div class="fr"><label>Filmavimo galimybės</label><input id="ash"></div>
    </div>
    <div class="fr"><label>Google Maps nuoroda</label><input id="amap"></div>
    <div class="fr"><label>Drive aplanko nuoroda</label><input id="adrv"></div>
    <div class="fr"><label>Pastabos</label><textarea id="anotes"></textarea></div>
    <div class="mfooter"><button class="btn-x" onclick="closeAddModal()">Atšaukti</button><button class="btn-s" id="btn-add-save" onclick="saveLocation()">Išsaugoti</button></div>
  </div>
</div>

<div class="modal-ov" id="modal-edit" onclick="if(event.target===this)closeEditModal()">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-title">Redaguoti variantą</div>
    <input type="hidden" id="edit-id">
    <div class="fr"><label>Pavadinimas</label><input id="en"></div>
    <div class="fr"><label>Setas</label><select id="eset"></select></div>
    <div class="fr"><label>Adresas</label><input id="ea"></div>
    <div class="f2">
      <div class="fr"><label>Prioritetas</label><select id="epri"><option>Pagrindinis</option><option>Atsarginis</option><option>Žemas prioritetas</option></select></div>
      <div class="fr"><label>Statusas</label><select id="estat"><option>Patvirtinta</option><option>Scoutuota</option><option>Atrinkta scoutui</option><option>Siūloma</option><option>Atmesta</option></select></div>
    </div>
    <div class="f2">
      <div class="fr"><label>Scouto datos</label><input id="esd"></div>
      <div class="fr"><label>Filmavimo galimybės</label><input id="esh"></div>
    </div>
    <div class="fr"><label>Google Maps nuoroda</label><input id="emap"></div>
    <div class="fr"><label>Drive aplanko nuoroda</label><input id="edrv"></div>
    <div class="fr"><label>Pastabos</label><textarea id="enotes"></textarea></div>
    <div class="mfooter">
      <button class="btn-del" onclick="confirmDelete()">Pašalinti</button>
      <div style="display:flex;gap:8px"><button class="btn-x" onclick="closeEditModal()">Atšaukti</button><button class="btn-s" onclick="saveEdit()">Išsaugoti pakeitimus</button></div>
    </div>
  </div>
</div>

<div class="modal-ov" id="modal-gal" onclick="if(event.target===this)closeGallery()">
  <div class="gal-modal" onclick="event.stopPropagation()">
    <div class="gal-hdr"><span class="gal-title" id="galTitle">Nuotraukų galerija</span><button class="gal-close" onclick="closeGallery()">×</button></div>
    <div class="gal-body">
      <div class="gal-photo-section">
        <div class="gal-img" id="galMainImg"><div class="gal-img-ph">Pasirinkite nuotrauką</div></div>
        <div class="gal-strip" id="galStrip"></div>
      </div>
      <div class="gal-coms-wrap">
        <div class="gs-coms" id="galComs"></div>
        <div class="gs-inp-wrap">
          <textarea class="gs-cin" id="galCin" placeholder="Komentaras prie šios nuotraukos..." rows="3"></textarea>
          <div class="gs-btns">
            <button class="gs-attach-btn" onclick="document.getElementById('galFileInput').click()">📎</button>
            <button class="gs-send" onclick="sendPhotoComment()">➤</button>
          </div>
          <input type="file" id="galFileInput" style="display:none">
        </div>
      </div>
    </div>
  </div>
</div>

<div class="modal-ov" id="modal-settings" onclick="if(event.target===this)closeSettings()">
  <div class="settings-modal" onclick="event.stopPropagation()">
    <div class="settings-title">Pranešimų nustatymai</div>
    <div class="settings-email" id="settings-email"></div>
    <div class="settings-section">
      <div class="settings-section-label">Gauti pranešimus el. paštu apie:</div>
      <div class="settings-row"><span class="settings-row-label">Pridėtas naujas lokacijas</span><label class="toggle"><input type="checkbox" id="sn-newloc"><span class="toggle-slider"></span></label></div>
      <div class="settings-row"><span class="settings-row-label">Naujus komentarus</span><label class="toggle"><input type="checkbox" id="sn-comment"><span class="toggle-slider"></span></label></div>
      <div class="settings-row"><span class="settings-row-label">Lokacijos atnaujinimus (statusas, info)</span><label class="toggle"><input type="checkbox" id="sn-status"><span class="toggle-slider"></span></label></div>
    </div>
    <div class="settings-section">
      <div class="settings-section-label">Pranešimų tipas:</div>
      <div class="digest-options">
        <div class="digest-option" id="digest-opt-iskart" onclick="selectDigest('IŠKART')">⚡ Iškart</div>
        <div class="digest-option" id="digest-opt-kasdien" onclick="selectDigest('KASDIEN')">📅 Kasdien (santrauka)</div>
      </div>
    </div>
    <div class="settings-row" style="border-top:1px solid #eef2ee;border-bottom:none;padding-top:12px"><button class="btn-x" onclick="signOut()">Atsijungti</button></div>
    <div class="settings-footer">
      <button class="btn-x" onclick="closeSettings()">Atšaukti</button>
      <button class="btn-s" id="btn-save-settings" onclick="saveSettings()">Išsaugoti</button>
    </div>
  </div>
</div>

<div class="modal-ov" id="modal-csv" onclick="if(event.target===this)closeCsvMenu()">
  <div class="modal" onclick="event.stopPropagation()" style="width:420px">
    <div class="modal-title">CSV importas / eksportas</div>
    <div style="font-size:12px;color:#5f5e5a;margin-bottom:12px">Eksportuoti dabartinę būseną CSV formatu, redaguoti Excel'yje, ir įkelti atgal su pakeitimų patvirtinimu.</div>
    <div class="fr">
      <label style="font-weight:600;color:#1a1a18">Eksportas</label>
      <div class="csv-btn-row">
        <button class="add-btn" onclick="exportCsv('sets')">↓ Setų sąrašas</button>
        <button class="add-btn" onclick="exportCsv('locations')">↓ Lokacijos</button>
      </div>
    </div>
    <div class="fr">
      <label style="font-weight:600;color:#1a1a18;margin-top:14px">Importas</label>
      <div class="csv-btn-row">
        <button class="add-btn" onclick="document.getElementById('csv-import-sets').click()">↑ Setų sąrašas</button>
        <button class="add-btn" onclick="document.getElementById('csv-import-locs').click()">↑ Lokacijos</button>
      </div>
      <input type="file" id="csv-import-sets" accept=".csv" style="display:none" onchange="importCsv('sets', this.files[0])">
      <input type="file" id="csv-import-locs" accept=".csv" style="display:none" onchange="importCsv('locations', this.files[0])">
    </div>
    <div id="csv-diff-area" style="display:none">
      <div style="font-weight:600;color:#1a1a18;margin-top:14px;margin-bottom:6px">Pakeitimai prieš įvykdant:</div>
      <div class="diff-list" id="csv-diff-list"></div>
      <div class="mfooter">
        <button class="btn-x" onclick="cancelCsvImport()">Atšaukti</button>
        <button class="btn-s" onclick="confirmCsvImport()">Patvirtinti ir įkelti</button>
      </div>
    </div>
    <div class="mfooter" id="csv-close-row">
      <button class="btn-x" onclick="closeCsvMenu()">Uždaryti</button>
    </div>
  </div>
</div>
`;

function openCsvMenu() { ensureModals(); $('modal-csv').classList.add('open'); $('csv-diff-area').style.display='none'; $('csv-close-row').style.display=''; }
function closeCsvMenu() { $('modal-csv').classList.remove('open'); }
function cancelCsvImport() { _csvPending = null; $('csv-diff-area').style.display='none'; $('csv-close-row').style.display=''; }

// ── CSV (after MODAL_HTML defined; see csv.js for impl) ──
// Wired in csv.js — keeps app.js shorter.

// ── kick off ─────────────────────────────────────────
init();
