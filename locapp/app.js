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

// ── icons (mirrors the IC object from the original Apps Script HTML) ──
const IC = {
  milestone:        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8"/><path d="M12 3v3"/><path d="M18.172 6a2 2 0 0 1 1.414.586l2.06 2.06a1.207 1.207 0 0 1 0 1.708l-2.06 2.06a2 2 0 0 1-1.414.586H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/></svg>',
  circleDotDashed:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.1 2.18a9.93 9.93 0 0 1 3.8 0"/><path d="M17.6 3.71a9.95 9.95 0 0 1 2.69 2.7"/><path d="M21.82 10.1a9.93 9.93 0 0 1 0 3.8"/><path d="M20.29 17.6a9.95 9.95 0 0 1-2.7 2.69"/><path d="M13.9 21.82a9.94 9.94 0 0 1-3.8 0"/><path d="M6.4 20.29a9.95 9.95 0 0 1-2.69-2.7"/><path d="M2.18 13.9a9.93 9.93 0 0 1 0-3.8"/><path d="M3.71 6.4a9.95 9.95 0 0 1 2.7-2.69"/><circle cx="12" cy="12" r="1"/></svg>',
  squarePen:        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>',
  mapPinPlus:       '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.914 11.105A7.298 7.298 0 0 0 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32.197 32.197 0 0 0 .813-.728"/><circle cx="12" cy="10" r="3"/><path d="M16 18h6"/><path d="M19 15v6"/></svg>',
  mapPin:           '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  bell:             '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  circleCheckBig:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg>',
  squareCheckBig:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  scanEye:          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-11.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 11.888 0"/></svg>',
  user:             '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  close:            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  send:             '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z"/><path d="M6 12h16"/></svg>',
  mapPlus:          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 19-1.106-.552a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0l4.212 2.106a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619V12"/><path d="M15 5.764V12"/><path d="M18 15v6"/><path d="M21 18h-6"/><path d="M9 3.236v15"/></svg>',
  paperclip:        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/></svg>',
  pencilLine:       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 21h8"/><path d="m15 5 4 4"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>',
  messageWarning:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
  // Smaller variants used in cards/badges
  pencilLineSmall:  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 21h8"/><path d="m15 5 4 4"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>',
  cameraSmall:      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>',
  paperclipSmall:   '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/></svg>',
  // Status/priority icons used in badges (matches getStatusIcon in original)
  statusPatvirtinta:    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg>',
  statusSiuloma:        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  statusAtrinkta:       '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  statusScoutuota:      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-11.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 11.888 0"/></svg>',
  statusAtmesta:        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>',
  // Heart icons for like button (filled = liked)
  heartFilled:      '<svg width="13" height="13" viewBox="0 0 13 13" fill="#D4537E" stroke="#D4537E" stroke-width="0.5"><path d="M6.5 11C6.5 11 1.5 7.5 1.5 4.5C1.5 3 2.8 2 4 2C5 2 6 2.5 6.5 3.3C7 2.5 8 2 9 2C10.2 2 11.5 3 11.5 4.5C11.5 7.5 6.5 11 6.5 11Z"/></svg>',
  heartEmpty:       '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M6.5 11C6.5 11 1.5 7.5 1.5 4.5C1.5 3 2.8 2 4 2C5 2 6 2.5 6.5 3.3C7 2.5 8 2 9 2C10.2 2 11.5 3 11.5 4.5C11.5 7.5 6.5 11 6.5 11Z"/></svg>',
  // CSV / data icons
  download:         '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  upload:           '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  zap:              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  calendar:         '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  refreshCw:        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  imagePh:          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
  // Diff symbols (for CSV preview)
  plusBig:          '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  minusBig:         '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>',
  rotate:           '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>'
};

function getStatusIcon(s){
  const m = {
    'Patvirtinta':      IC.statusPatvirtinta,
    'Scoutuota':        IC.statusScoutuota,
    'Atrinkta scoutui': IC.statusAtrinkta,
    'Siūloma':          IC.statusSiuloma,
    'Atmesta':          IC.statusAtmesta
  };
  return m[s] || '';
}

// ── komanda cache (email → display name) ───────────────
const _komandaByEmail = {};

async function loadKomandaCache() {
  // The current user we already have from loadApp.
  if (S.user.email && S.user.name) {
    _komandaByEmail[S.user.email] = S.user.name;
  }
  // Fetch the rest from Apps Script in one go.
  try {
    const r = await gs.get('komandaAll', {});
    if (r && r.ok && Array.isArray(r.team)) {
      r.team.forEach(m => {
        if (m.email) _komandaByEmail[m.email.toLowerCase()] = m.name || m.email;
      });
    }
  } catch (e) { /* non-fatal — falls back to gmail prefix */ }
}

function displayName(email) {
  if (!email) return '';
  const e = email.toLowerCase();
  if (_komandaByEmail[e]) return _komandaByEmail[e];
  // Pretty fallback: show only the part before @, no domain.
  return email.split('@')[0];
}

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
function setLoadingStage(label, pct) {
  const stage = document.getElementById('loadingStage');
  const bar = document.getElementById('loadingProgress');
  if (stage) stage.textContent = label || '';
  if (bar && pct != null) bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
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
// GET uses JSONP (script tag) to bypass CORS. POST uses fetch with
// text/plain content-type (counts as "simple request", no preflight).
let _jsonpCounter = 0;
const gs = {
  get(action, params={}) {
    return new Promise((resolve, reject) => {
      const cbName = '__gscb_' + (++_jsonpCounter) + '_' + Date.now();
      const u = new URL(window.CFG.APPS_SCRIPT_URL);
      u.searchParams.set('action', action);
      Object.keys(params).forEach(k => u.searchParams.set(k, params[k]));
      u.searchParams.set('callback', cbName);

      const script = document.createElement('script');
      const cleanup = () => {
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        clearTimeout(timer);
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Apps Script timeout')); }, 30000);

      window[cbName] = (data) => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('Apps Script load error')); };
      script.src = u.toString();
      document.head.appendChild(script);
    });
  },
  async post(action, body={}) {
    const r = await fetch(window.CFG.APPS_SCRIPT_URL, {
      method: 'POST',
      // text/plain avoids CORS preflight (it's a "simple request")
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, secret: window.CFG.SHARED_SECRET, ...body }),
      // Don't include credentials — Apps Script doesn't expect them and
      // it would force a preflight.
      credentials: 'omit'
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
  setLoadingStage('Tikriname vartotoją...', 10);

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
  setLoadingStage('Atkuriame nuotraukų atmintį...', 25);

  // Load Komanda display names in the background — used to render
  // notification author names instead of bare emails.
  loadKomandaCache();

  // Restore cached Drive thumbnails from localStorage. They might be stale
  // but show instantly; the background prefetch refreshes them.
  loadPhotoCacheFromLocal();

  // Show "Kantrybė – dorybė" after 4s if still loading.
  const subTimer = setTimeout(() => {
    const sub = document.getElementById('loadingSub');
    if (sub) sub.style.display = 'block';
  }, 4000);

  await loadInitialBundle();
  clearTimeout(subTimer);
  setLoadingStage('Beveik baigta...', 95);

  $('loading').style.display = 'none';
  $('appShell').style.display = 'flex';

  // Background: load all locations + prefetch all Drive folders so
  // every panel (Pranešimai, Naujos, status views) has thumbnails ready.
  prefetchEverythingInBackground();
}

const PHOTO_CACHE_KEY = 'locapp_photo_cache_v1';
const PHOTO_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

function loadPhotoCacheFromLocal() {
  try {
    const raw = localStorage.getItem(PHOTO_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed.savedAt || Date.now() - parsed.savedAt > PHOTO_CACHE_MAX_AGE_MS) {
      localStorage.removeItem(PHOTO_CACHE_KEY);
      return;
    }
    if (parsed.photos) Object.assign(S.drivePhotos, parsed.photos);
  } catch (e) { /* ignore corrupted */ }
}

function savePhotoCacheToLocal() {
  try {
    localStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      photos: S.drivePhotos
    }));
  } catch (e) {
    // localStorage full or disabled — non-fatal
  }
}

async function prefetchEverythingInBackground() {
  // Load every location (so Pranešimai/Naujos can match referenced IDs)
  if (!S.allLoaded) await loadAllLocations();

  // Find all locations that have a drive_url but no cached photos yet.
  const urlMap = {};
  S.locations.forEach(l => {
    if (l.drive_url && !S.drivePhotos[l.id]) urlMap[l.id] = l.drive_url;
  });
  if (!Object.keys(urlMap).length) return;

  // Batch in chunks of 25 to keep each request reasonable.
  const ids = Object.keys(urlMap);
  const CHUNK = 25;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = {};
    ids.slice(i, i+CHUNK).forEach(id => slice[id] = urlMap[id]);
    try {
      const r = await gs.post('photosBatch', { urlMap: slice });
      if (r.ok) {
        Object.assign(S.drivePhotos, r.photos);
        savePhotoCacheToLocal();
      }
    } catch (e) { /* keep going on errors */ }
  }
}

async function refreshCurrent() {
  const btn = event && event.currentTarget;
  if (btn) btn.classList.add('spinning');

  try {
    // What view is currently active?
    const activeView = document.querySelector('.view.act');
    const viewId = activeView ? activeView.id : 'v-setai';

    if (viewId === 'v-setai') {
      const activePanel = document.querySelector('.panel.act');
      const panelId = activePanel ? activePanel.id : '';
      if (panelId === 'panel-set') {
        // Re-fetch current set's locations + their photos.
        if (S.currentSetId) {
          delete S.loadedSets[S.currentSet];
          await loadSetLocations(S.currentSetId, S.currentSet);
          // Bust the cached photos for these locations so we get fresh ones.
          const setLocs = S.locations.filter(l => l.set_id === S.currentSetId);
          const urlMap = {};
          setLocs.forEach(l => { if (l.drive_url) urlMap[l.id] = l.drive_url; });
          if (Object.keys(urlMap).length) {
            const r = await gs.post('photosBatch', { urlMap, force: true });
            if (r.ok) { Object.assign(S.drivePhotos, r.photos); savePhotoCacheToLocal(); }
          }
          if (S.subview === 'k') renderCards(setLocs);
          else renderSantrauka();
          renderSetList();
        }
      } else if (panelId === 'panel-naujos') {
        await loadNewLocations();
      } else if (panelId === 'panel-aktyvumas') {
        await loadActivity();
      }
    } else {
      // status views — reload all locations and re-render the active tab
      S.allLoaded = false;
      await loadAllLocations();
      const tabId = viewId.replace('v-', '');
      renderTabById(tabId);
    }
    refreshNewBadge();
    refreshActivityBadge();
    showToast('Atnaujinta');
  } catch (e) {
    showToast('Klaida atnaujinant');
  } finally {
    if (btn) btn.classList.remove('spinning');
  }
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
  setLoadingStage('Kraunami setai...', 35);
  // sets ordered by order_index
  const { data: sets, error: e1 } = await sbClient
    .from('loc_sets').select('*').order('order_index');
  if (e1) { console.error(e1); return; }
  S.sets = sets;

  setLoadingStage('Skaičiuojami variantai...', 50);
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
    setLoadingStage('Kraunamas pirmas setas...', 65);
    S.currentSet = sets[0].name;
    S.currentSetId = sets[0].id;
    await loadSetLocations(sets[0].id, sets[0].name);
  }

  setLoadingStage('Tikrinami pranešimai...', 85);
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

  // Kick off thumbnail prefetch in the background — don't await.
  // Cards render with spinners in the thumb column; thumbs fill in
  // as the batch returns. Avoids blocking the initial loading screen.
  const urlMap = {};
  data.slice(0, 8).forEach(l => {
    if (l.drive_url && !S.drivePhotos[l.id]) urlMap[l.id] = l.drive_url;
  });
  if (Object.keys(urlMap).length) {
    gs.post('photosBatch', { urlMap }).then(r => {
      if (r.ok) {
        Object.assign(S.drivePhotos, r.photos);
        // re-render any visible thumb columns that were waiting
        Object.keys(r.photos).forEach(locId => {
          const loc = S.locations.find(l => l.id === locId);
          if (loc && document.getElementById('thumbs-'+locId)) {
            renderThumbs(locId, r.photos[locId], loc.drive_url);
          }
        });
      }
    }).catch(() => {});
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
      <div class="si-acts"><button class="si-edit" data-idx="${idx}">${IC.pencilLineSmall}</button></div>
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
  const heart = loc.userLiked ? IC.heartFilled : IC.heartEmpty;

  card.innerHTML = `
    <div class="card-top">
      <div class="card-top-inner">
        <div class="card-thumbs-col" id="thumbs-${loc.id}"><div class="spinner" style="margin:auto"></div></div>
        <div class="card-info-col">
          <div class="ct-row1">
            <div class="loc-name">${escHtml(loc.variant_name)}</div>
            <div class="ct-acts">
              <button class="like-btn ${loc.userLiked?'liked':''}" data-id="${loc.id}">${heart} <span>${loc.likeCount||0}</span></button>
              <button class="icon-btn" data-id="${loc.id}" data-action="edit">${IC.pencilLine} <span class="btn-lbl">Redaguoti</span></button>
            </div>
          </div>
          <div class="loc-meta">
            ${loc.address ? `<span class="loc-addr">${escHtml(loc.address)}</span>` : ''}
            ${loc.distance_km ? `<span class="loc-dist">${loc.distance_km < 15 ? 'Vilnius' : 'Atstumas iki Vilniaus ±'+loc.distance_km+' km'}</span>` : ''}
          </div>
          <div class="badge-row">
            <span class="badge ${pCls} bc" data-action="pri">${escHtml(loc.priority||'—')} ▾</span>
            <span class="badge ${sCls} bc" data-action="stat" style="display:inline-flex;align-items:center;gap:4px">${getStatusIcon(loc.status)} ${escHtml(loc.status||'—')} ▾</span>
          </div>
          <div class="loc-links">
            ${loc.maps_url ? `<a class="loc-link" href="${escHtml(loc.maps_url)}" target="_blank" onclick="event.stopPropagation()">${IC.mapPin} Google Maps</a>` : ''}
            ${loc.drive_url ? `<button class="loc-link" data-action="gallery">${IC.cameraSmall} Nuotraukų galerija</button>` : ''}
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
          <button class="cin-attach" data-id="${loc.id}">${IC.paperclip}</button>
          <button class="cin-send" data-id="${loc.id}">${IC.send}</button>
        </div>
        <div class="attach-preview" id="ap-${loc.id}"><span id="ap-name-${loc.id}"></span><button class="attach-rm" data-id="${loc.id}">${IC.close}</button></div>
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
      img.onerror = function() { this.parentNode.innerHTML = IC.imagePh; };
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
  const author = cm.author_name || displayName(cm.author_email);
  const ini = (author || '?').substring(0,2).toUpperCase();
  let attach = '';
  if (cm.attachment_drive_id) {
    const name = cm.attachment_name || 'Priedas';
    const isImg = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(name);
    if (isImg) {
      // Image attachment — render as a thumbnail. If Drive can't render
      // (e.g. HEIC sometimes), fall back to a paperclip link.
      const fallback = `<a class=&quot;cattach&quot; href=&quot;https://drive.google.com/file/d/${cm.attachment_drive_id}/view&quot; target=&quot;_blank&quot;>${IC.paperclipSmall.replace(/"/g,'&quot;')} ${escHtml(name).replace(/"/g,'&quot;')}</a>`;
      attach = `<a class="cattach cattach-img" href="https://drive.google.com/file/d/${cm.attachment_drive_id}/view" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px"><img src="https://drive.google.com/thumbnail?id=${cm.attachment_drive_id}&sz=w400" style="max-width:200px;max-height:140px;object-fit:cover;border-radius:6px;display:block" onerror="this.parentNode.outerHTML='${fallback}'"></a>`;
    } else {
      attach = `<a class="cattach" href="https://drive.google.com/file/d/${cm.attachment_drive_id}/view" target="_blank">${IC.paperclipSmall} ${escHtml(name)}</a>`;
    }
  }
  return `<div class="comment"><div class="cav">${escHtml(ini)}</div>
    <div><span class="cauth">${escHtml(author)}</span>
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
    btn.innerHTML = (loc.userLiked?IC.heartFilled:IC.heartEmpty) + ' <span>' + loc.likeCount + '</span>';
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
    .order('created_at', { ascending: false }).limit(120);
  if (error) { wrap.innerHTML = '<div class="empty-state">Klaida</div>'; return; }
  // Filter out events the current user has already read.
  const unread = (data||[]).filter(ev => !(ev.read_by||[]).includes(S.user.email));
  if (!unread.length) { wrap.innerHTML = '<div class="empty-state"><p>Naujų pranešimų nėra</p></div>'; return; }

  // Make sure we have location records for all referenced locations.
  const missingLocIds = [...new Set(unread
    .map(ev => ev.location_id)
    .filter(id => id && !S.locations.find(l => l.id === id))
  )];
  if (missingLocIds.length) {
    const { data: locs } = await sbClient
      .from('loc_locations').select('*').in('id', missingLocIds);
    if (locs) {
      locs.forEach(l => { l.likeCount = 0; l.userLiked = false; });
      S.locations = S.locations.concat(locs);
    }
  }

  // Prefetch thumbnails for any referenced location that doesn't have
  // them cached yet.
  const urlMap = {};
  unread.forEach(ev => {
    if (!ev.location_id) return;
    const loc = S.locations.find(l => l.id === ev.location_id);
    if (loc && loc.drive_url && !S.drivePhotos[loc.id]) {
      urlMap[loc.id] = loc.drive_url;
    }
  });
  if (Object.keys(urlMap).length) {
    const r = await gs.post('photosBatch', { urlMap });
    if (r.ok) Object.assign(S.drivePhotos, r.photos);
  }

  renderActivityList(unread);
}

function renderActivityList(data) {
  const wrap = $('aktWrap');
  wrap.innerHTML = '<div class="nv-hdr"><span class="nv-title">Aktyvumas</span></div>';
  data.forEach(ev => {
    const loc = S.locations.find(l => l.id === ev.location_id);
    const title = activityTitle(ev, loc);
    const sub = activitySub(ev);
    const time = fmtDateTime(ev.created_at);
    const photoFileId = (ev.data && ev.data.photoFileId) || '';

    // For photo_comment events, prefer the specific photo; otherwise
    // use the first thumbnail we have for the location.
    let thumbUrl = '';
    if (photoFileId) {
      thumbUrl = `https://drive.google.com/thumbnail?id=${photoFileId}&sz=w240`;
    } else if (loc && S.drivePhotos[loc.id] && S.drivePhotos[loc.id][0]) {
      thumbUrl = S.drivePhotos[loc.id][0].thumbUrl;
    }
    const thumb = thumbUrl
      ? `<div class="ai-thumb"><img src="${thumbUrl}" onerror="this.parentNode.innerHTML='<div class=&quot;ai-ic ic-c&quot;>${IC.messageWarning.replace(/"/g,'&quot;')}</div>'"></div>`
      : `<div class="ai-ic ic-c">${IC.messageWarning}</div>`;

    const div = document.createElement('div');
    div.className = 'ai';
    div.id = 'ai-'+ev.id;
    div.innerHTML = thumb +
      `<div class="ai-body">
        <div class="ai-title">${escHtml(title)}</div>
        <div class="ai-sub">${escHtml(sub)}</div>
        <div class="ai-time">${time}</div>
        <div class="ai-btns">
          <button class="ai-btn" data-act="goto">Peržiūrėti</button>
          <button class="ai-btn" data-act="read">Pažymėti kaip skaitytą</button>
        </div>
      </div>`;
    div.querySelector('[data-act="goto"]').addEventListener('click', () => {
      markActivityRead(ev.id, /*removeFromList*/ true);
      goToLocation(ev.location_id, photoFileId);
    });
    div.querySelector('[data-act="read"]').addEventListener('click', e => {
      e.stopPropagation();
      markActivityRead(ev.id, /*removeFromList*/ true);
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
  const author = (ev.data && ev.data.author) || displayName(ev.actor_email);
  if (ev.type === 'status_change') return `${author}: ${ev.data?.oldStatus||''} → ${ev.data?.newStatus||''}`;
  if (ev.type === 'comment' || ev.type === 'photo_comment') return `${author}: "${(ev.data?.message||'').substring(0,80)}"`;
  if (ev.type === 'field_update' && ev.data?.changes) {
    return author + ' atnaujino: ' + Object.keys(ev.data.changes).join(', ');
  }
  if (ev.type === 'new_location') return author + ' pridėjo naują variantą';
  return author;
}

async function markActivityRead(eventId, removeFromList) {
  const el = $('ai-'+eventId);
  if (el && removeFromList) {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => {
      el.remove();
      // If no events left, show empty state.
      const wrap = $('aktWrap');
      if (wrap && !wrap.querySelector('.ai')) {
        wrap.innerHTML = '<div class="empty-state"><p>Naujų pranešimų nėra</p></div>';
      }
    }, 260);
  }
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
  // Force Kortelės subview — the card body can only be expanded
  // there. Santrauka view has no card_DOM elements.
  if (S.subview !== 'k') subview('k');
  const after = () => {
    if (photoFileId) {
      openGalleryAt(locId, photoFileId);
      return;
    }
    // Make sure the cards are rendered for the target set so the
    // body element exists, then expand it.
    if (S.subview !== 'k') subview('k');
    const body = $('cb-'+locId);
    if (body && !body.classList.contains('open')) toggleBody(locId);
    const card = $('card-'+locId);
    if (card) card.scrollIntoView({ behavior:'smooth', block:'center' });
  };
  if (S.currentSetId === loc.set_id && $('card-'+locId)) {
    after();
  } else {
    _selectSetCallback = after;
    selectSet(loc.set_id, set?.name);
  }
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

  // Prefetch thumbnails so the cards have photos right away.
  const urlMap = {};
  fresh.forEach(loc => {
    if (loc.drive_url && !S.drivePhotos[loc.id]) urlMap[loc.id] = loc.drive_url;
  });
  if (Object.keys(urlMap).length) {
    const r = await gs.post('photosBatch', { urlMap });
    if (r.ok) Object.assign(S.drivePhotos, r.photos);
  }

  wrap.innerHTML = '<div class="nv-hdr"><span class="nv-title">Naujos lokacijos</span></div>';
  fresh.forEach(loc => {
    const set = S.sets.find(s => s.id === loc.set_id);
    const photos = S.drivePhotos[loc.id];
    const thumbUrl = (photos && photos[0]) ? photos[0].thumbUrl : '';
    const thumb = thumbUrl
      ? `<div class="ai-thumb"><img src="${thumbUrl}" onerror="this.parentNode.innerHTML='<div class=&quot;ai-ic ic-n&quot;>${IC.mapPinPlus.replace(/"/g,'&quot;')}</div>'"></div>`
      : `<div class="ai-ic ic-n">${IC.mapPinPlus}</div>`;

    const div = document.createElement('div');
    div.className = 'ai'; div.id = 'ni-'+loc.id;
    div.innerHTML = thumb +
      `<div class="ai-body">
        <div class="ai-title">${escHtml(loc.variant_name)}</div>
        <div class="ai-sub">${escHtml(set?.name||'')} ${loc.priority?' · '+escHtml(loc.priority):''} ${loc.status?' · '+escHtml(loc.status):''}</div>
        <div class="ai-time">Įkėlė: ${escHtml(displayName(loc.added_by_email))} · ${fmtDateTime(loc.created_at)}</div>
        <div class="ai-btns"><button class="ai-btn" data-id="${loc.id}" data-set="${loc.set_id}">Peržiūrėti</button><button class="ai-btn" data-mark="${loc.id}">Pažymėti kaip peržiūrėtą</button></div>
      </div>`;
    div.querySelector('[data-id]').addEventListener('click', () => {
      doMarkViewed(loc.id);
      goToLocation(loc.id, '');
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
  // Note: select <option> elements cannot contain SVG icons — keep the plain "+" prefix here.
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
          if (photos[i]) items += `<div class="rc-thumb" data-photo="${photos[i].id}" data-loc="${loc.id}"><img src="${photos[i].thumbUrl}" onerror="this.parentNode.innerHTML='${IC.imagePh.replace(/'/g,'&#39;')}'"></div>`;
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
            ${loc.maps_url?`<a class="loc-link" href="${escHtml(loc.maps_url)}" target="_blank" onclick="event.stopPropagation()">${IC.mapPin} Maps</a>`:''}
          </div>
          <div class="rc-badges">
            <span class="badge ${getPriCls(loc.priority)}">${escHtml(loc.priority||'—')}</span>
            <span class="badge ${getBadgeCls(loc.status)}" style="display:inline-flex;align-items:center;gap:4px">${getStatusIcon(loc.status)} ${escHtml(loc.status||'—')}</span>
          </div>
        </div>
        <div class="rc-actions" style="align-self:center;margin-left:8px">
          <button class="icon-btn" data-edit="${loc.id}">${IC.pencilLine} <span class="btn-lbl">Redaguoti</span></button>
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
    if (!loc.drive_url) { setGalPlaceholder('Drive nenurodytas'); return; }
    setGalPlaceholder('<div class="spinner"></div>', true);
    const r = await gs.get('drivePhotos', { url: loc.drive_url });
    if (r.ok) photos = S.drivePhotos[locId] = r.photos;
    else { setGalPlaceholder('Klaida'); return; }
  }
  if (!photos || !photos.length) { setGalPlaceholder('Nuotraukų nerasta'); return; }
  renderGalleryStrip(locId, photos);
  const first = startPhotoId ? photos.find(p => p.id === startPhotoId) : photos[0];
  if (first) selectGalPhoto(locId, first.id);
}

// Set placeholder text inside galMainImg without removing the nav buttons.
function setGalPlaceholder(html, asHtml) {
  const main = $('galMainImg');
  if (!main) return;
  main.querySelectorAll('img, .gal-img-ph').forEach(el => el.remove());
  const ph = document.createElement('div');
  ph.className = 'gal-img-ph';
  if (asHtml) ph.innerHTML = html; else ph.textContent = html;
  main.insertBefore(ph, main.querySelector('.gal-nav'));
  // Hide nav arrows when there's no real image.
  main.querySelectorAll('.gal-nav').forEach(b => b.style.display = 'none');
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

  // Update only the placeholder/img inside galMainImg, preserving nav buttons.
  const main = $('galMainImg');
  // Remove any prior placeholder or image (but not the nav buttons)
  main.querySelectorAll('img, .gal-img-ph').forEach(el => el.remove());
  const img = document.createElement('img');
  img.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
  img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain';
  img.onerror = function() {
    img.remove();
    const ph = document.createElement('div');
    ph.className = 'gal-img-ph';
    ph.textContent = 'Nepavyko užkrauti';
    main.insertBefore(ph, main.querySelector('.gal-nav'));
  };
  main.insertBefore(img, main.querySelector('.gal-nav'));

  // Set up the download button — uc?export=download streams the
  // original file. Suggest a sensible filename based on the photo's
  // Drive name (falls back to <id>.jpg if the name is missing).
  const dlBtn = document.getElementById('galDownloadBtn');
  if (dlBtn) {
    const photos = S.drivePhotos[locId] || [];
    const meta = photos.find(p => p.id === fileId);
    let filename = (meta && meta.name) ? meta.name : (fileId + '.jpg');
    // If the filename has no extension, append .jpg
    if (!/\.[a-z0-9]{2,4}$/i.test(filename)) filename += '.jpg';
    dlBtn.href = `https://drive.google.com/uc?export=download&id=${fileId}`;
    dlBtn.setAttribute('download', filename);
    dlBtn.style.display = 'inline-flex';
  }

  loadPhotoComments(fileId);
  updateGalNavState();
}

function updateGalNavState() {
  const photos = S.drivePhotos[S.currentGalLocationId] || [];
  const cur = photos.findIndex(p => p.id === S.currentGalFileId);
  const prev = $('galMainImg')?.querySelector('.gal-nav-prev');
  const next = $('galMainImg')?.querySelector('.gal-nav-next');
  if (!prev || !next) return;
  if (photos.length <= 1) {
    prev.style.display = 'none';
    next.style.display = 'none';
  } else {
    prev.style.display = '';
    next.style.display = '';
    prev.style.opacity = cur <= 0 ? '0.4' : '1';
    next.style.opacity = cur >= photos.length - 1 ? '0.4' : '1';
    prev.disabled = cur <= 0;
    next.disabled = cur >= photos.length - 1;
  }
}

function closeGallery() {
  $('modal-gal').classList.remove('open');
  const dl = document.getElementById('galDownloadBtn');
  if (dl) dl.style.display = 'none';
}

// Move gallery selection by ±1 (or any delta).
function navGallery(delta) {
  const photos = S.drivePhotos[S.currentGalLocationId];
  if (!photos || !photos.length) return;
  const cur = photos.findIndex(p => p.id === S.currentGalFileId);
  if (cur === -1) return;
  let next = cur + delta;
  if (next < 0) next = 0;
  if (next >= photos.length) next = photos.length - 1;
  if (next !== cur) selectGalPhoto(S.currentGalLocationId, photos[next].id);
}

// Keyboard navigation when gallery is open.
document.addEventListener('keydown', (e) => {
  const gal = document.getElementById('modal-gal');
  if (!gal || !gal.classList.contains('open')) return;
  // Don't intercept arrows while typing in the comment textarea.
  if (document.activeElement && document.activeElement.id === 'galCin') return;
  if (e.key === 'ArrowLeft')  { e.preventDefault(); navGallery(-1); }
  if (e.key === 'ArrowRight') { e.preventDefault(); navGallery(1); }
  if (e.key === 'Escape')     { e.preventDefault(); closeGallery(); }
});

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
    <div class="gal-hdr">
      <span class="gal-title" id="galTitle">Nuotraukų galerija</span>
      <div style="display:flex;gap:6px;align-items:center">
        <a id="galDownloadBtn" href="#" download style="display:none;font-size:11px;padding:4px 10px;border:1px solid #b8c4b7;border-radius:6px;background:#fff;color:#1a1a18;text-decoration:none;cursor:pointer;align-items:center;gap:4px" target="_blank" rel="noopener">${IC.download}<span class="btn-lbl">Atsisiųsti</span></a>
        <button class="gal-close" onclick="closeGallery()">${IC.close}</button>
      </div>
    </div>
    <div class="gal-body">
      <div class="gal-photo-section">
        <div class="gal-img" id="galMainImg">
          <div class="gal-img-ph">Pasirinkite nuotrauką</div>
          <button class="gal-nav gal-nav-prev" onclick="navGallery(-1)" aria-label="Ankstesnė"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
          <button class="gal-nav gal-nav-next" onclick="navGallery(1)" aria-label="Kita"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
        </div>
        <div class="gal-strip" id="galStrip"></div>
      </div>
      <div class="gal-coms-wrap">
        <div class="gs-coms" id="galComs"></div>
        <div class="gs-inp-wrap">
          <textarea class="gs-cin" id="galCin" placeholder="Komentaras prie šios nuotraukos..." rows="3"></textarea>
          <div class="gs-btns">
            <button class="gs-attach-btn" onclick="document.getElementById('galFileInput').click()">${IC.paperclip}</button>
            <button class="gs-send" onclick="sendPhotoComment()">${IC.send}</button>
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
        <div class="digest-option" id="digest-opt-iskart" onclick="selectDigest('IŠKART')">${IC.zap} Iškart</div>
        <div class="digest-option" id="digest-opt-kasdien" onclick="selectDigest('KASDIEN')">${IC.calendar} Kasdien (santrauka)</div>
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
        <button class="add-btn" onclick="exportCsv('sets')">${IC.download} Setų sąrašas</button>
        <button class="add-btn" onclick="exportCsv('locations')">${IC.download} Lokacijos</button>
      </div>
    </div>
    <div class="fr">
      <label style="font-weight:600;color:#1a1a18;margin-top:14px">Importas</label>
      <div class="csv-btn-row">
        <button class="add-btn" onclick="document.getElementById('csv-import-sets').click()">${IC.upload} Setų sąrašas</button>
        <button class="add-btn" onclick="document.getElementById('csv-import-locs').click()">${IC.upload} Lokacijos</button>
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

// ── populate icons in HTML buttons defined statically ───
(function fillStaticIcons() {
  const map = {
    'btn-add-variant':     IC.mapPlus,
    'btn-mark-all-viewed': IC.squareCheckBig,
    'btn-mark-all-act':    IC.squareCheckBig
  };
  Object.keys(map).forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      const slot = btn.querySelector('.btn-ic');
      if (slot) slot.innerHTML = map[id];
    }
  });
})();

// ── kick off ─────────────────────────────────────────
init();
