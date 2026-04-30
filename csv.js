// ============================================================
// CSV import/export — sets and locations.
// Uses UUIDs as authoritative identifiers; falls back to name match
// for sets when ID is blank. Shows diff preview before committing.
// ============================================================

let _csvPending = null;

const CSV_SETS_HEADERS = ['id','order_index','name','int_ext','scenes','status'];
const CSV_LOC_HEADERS  = ['id','set_id','set_name','variant_name','address','maps_url','drive_url','priority','status','scout_dates','shoot_dates','notes','distance_km'];

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
function rowsToCsv(headers, rows) {
  const lines = [headers.join(',')];
  rows.forEach(r => lines.push(headers.map(h => csvEscape(r[h])).join(',')));
  return lines.join('\n');
}
function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// Minimal CSV parser: handles quoted fields with embedded commas/quotes/newlines.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i+1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.some(c => c !== '')).map(r => {
    const obj = {};
    headers.forEach((h, idx) => obj[h] = r[idx] !== undefined ? r[idx] : '');
    return obj;
  });
}

// ── EXPORT ─────────────────────────────────────────────
async function exportCsv(kind) {
  if (kind === 'sets') {
    const { data } = await sbClient.from('loc_sets').select('*').order('order_index');
    const rows = (data||[]).map(s => ({
      id: s.id, order_index: s.order_index,
      name: s.name, int_ext: s.int_ext, scenes: s.scenes, status: s.status
    }));
    downloadCsv('locapp_sets.csv', rowsToCsv(CSV_SETS_HEADERS, rows));
    showToast('Eksportuota: ' + rows.length + ' setų');
  } else {
    if (!S.allLoaded) await loadAllLocations();
    const rows = S.locations.map(l => {
      const set = S.sets.find(s => s.id === l.set_id);
      return {
        id: l.id, set_id: l.set_id, set_name: set?.name || '',
        variant_name: l.variant_name, address: l.address,
        maps_url: l.maps_url, drive_url: l.drive_url,
        priority: l.priority, status: l.status,
        scout_dates: l.scout_dates, shoot_dates: l.shoot_dates,
        notes: l.notes, distance_km: l.distance_km
      };
    });
    downloadCsv('locapp_locations.csv', rowsToCsv(CSV_LOC_HEADERS, rows));
    showToast('Eksportuota: ' + rows.length + ' lokacijų');
  }
}

// ── IMPORT (with diff preview) ─────────────────────────
async function importCsv(kind, file) {
  if (!file) return;
  const text = await file.text();
  const parsed = parseCsv(text);
  if (!parsed.length) { showToast('Failas tuščias arba neteisingas formatas'); return; }

  // Build diff against current Supabase state.
  let diff;
  if (kind === 'sets') diff = await diffSets(parsed);
  else                 diff = await diffLocations(parsed);

  if (!diff.add.length && !diff.update.length && !diff.del.length) {
    showToast('Pakeitimų nėra'); return;
  }
  _csvPending = { kind, diff };
  renderDiffList(diff);
  $('csv-diff-area').style.display = '';
  $('csv-close-row').style.display = 'none';
}

function renderDiffList(diff) {
  const list = $('csv-diff-list');
  let html = '';
  if (diff.add.length)    html += `<div class="diff-item diff-add">+ Pridėti: ${diff.add.length}</div>`;
  if (diff.update.length) html += `<div class="diff-item diff-upd">↻ Atnaujinti: ${diff.update.length}</div>`;
  if (diff.del.length)    html += `<div class="diff-item diff-del">− Ištrinti: ${diff.del.length}</div>`;
  html += '<div style="height:8px"></div>';
  diff.add.slice(0,40).forEach(r => html += `<div class="diff-item diff-add">+ ${escHtml(r.name || r.variant_name || '')}</div>`);
  diff.update.slice(0,40).forEach(d => html += `<div class="diff-item diff-upd">↻ ${escHtml(d.row.name || d.row.variant_name || '')} <span style="color:#888">(${d.changedFields.join(', ')})</span></div>`);
  diff.del.slice(0,40).forEach(r => html += `<div class="diff-item diff-del">− ${escHtml(r.name || r.variant_name || '')}</div>`);
  if (diff.add.length + diff.update.length + diff.del.length > 120) {
    html += '<div class="diff-item" style="color:#888">…ir daugiau</div>';
  }
  list.innerHTML = html;
}

async function diffSets(rows) {
  const { data: existing } = await sbClient.from('loc_sets').select('*');
  const byId = {}, byName = {};
  (existing||[]).forEach(s => { byId[s.id] = s; byName[s.name] = s; });
  const seenIds = new Set();
  const add = [], update = [];
  rows.forEach((r, idx) => {
    const id = (r.id||'').trim();
    let cur = id ? byId[id] : null;
    if (!cur && r.name && byName[r.name]) cur = byName[r.name];
    const candidate = {
      name: r.name || '',
      int_ext: r.int_ext || null,
      scenes: r.scenes || null,
      status: r.status || null,
      order_index: parseInt(r.order_index) || (idx+1)
    };
    if (!cur) { add.push(Object.assign({}, candidate)); return; }
    seenIds.add(cur.id);
    const changed = [];
    ['name','int_ext','scenes','status','order_index'].forEach(k => {
      if ((cur[k]||'') !== (candidate[k]||'')) changed.push(k);
    });
    if (changed.length) update.push({ id: cur.id, row: candidate, changedFields: changed });
  });
  const del = (existing||[]).filter(s => !seenIds.has(s.id));
  return { add, update, del };
}

async function diffLocations(rows) {
  const { data: existing } = await sbClient.from('loc_locations').select('*');
  const { data: setsList } = await sbClient.from('loc_sets').select('id, name');
  const setByName = {};
  (setsList||[]).forEach(s => setByName[s.name] = s.id);
  const byId = {};
  (existing||[]).forEach(l => byId[l.id] = l);
  const seen = new Set();
  const add = [], update = [], errors = [];

  rows.forEach(r => {
    let setId = (r.set_id||'').trim();
    if (!setId && r.set_name) setId = setByName[r.set_name];
    if (!setId) { errors.push(r); return; }
    const cand = {
      set_id: setId,
      variant_name: r.variant_name || '',
      address: r.address || null,
      maps_url: r.maps_url || null,
      drive_url: r.drive_url || null,
      priority: r.priority || null,
      status: r.status || null,
      scout_dates: r.scout_dates || null,
      shoot_dates: r.shoot_dates || null,
      notes: r.notes || null,
      distance_km: r.distance_km ? parseInt(r.distance_km) : null
    };
    const id = (r.id||'').trim();
    const cur = id ? byId[id] : null;
    if (!cur) { add.push(cand); return; }
    seen.add(cur.id);
    const changed = [];
    Object.keys(cand).forEach(k => {
      if ((cur[k]||'') !== (cand[k]||'')) changed.push(k);
    });
    if (changed.length) update.push({ id: cur.id, row: cand, changedFields: changed });
  });
  const del = (existing||[]).filter(l => !seen.has(l.id));
  if (errors.length) showToast(errors.length + ' eilučių praleista (nerastas setas)');
  return { add, update, del };
}

async function confirmCsvImport() {
  if (!_csvPending) return;
  const { kind, diff } = _csvPending;
  const table = kind === 'sets' ? 'loc_sets' : 'loc_locations';
  let added = 0, updated = 0, deleted = 0;

  // Inserts
  if (diff.add.length) {
    const { data, error } = await sbClient.from(table).insert(diff.add).select();
    if (error) { showToast('Klaida pridedant: '+error.message); return; }
    added = (data||[]).length;
  }
  // Updates
  for (const u of diff.update) {
    const { error } = await sbClient.from(table).update(u.row).eq('id', u.id);
    if (error) { showToast('Klaida atnaujinant: '+error.message); return; }
    updated++;
  }
  // Deletes
  for (const d of diff.del) {
    const { error } = await sbClient.from(table).delete().eq('id', d.id);
    if (error) {
      // sets with attached locations → trigger blocks deletion. surface clearly.
      if (kind === 'sets' && error.message && error.message.includes('locations still attached')) {
        showToast('Setas „' + d.name + '" turi prijungtų lokacijų — neištrintas');
        continue;
      }
      showToast('Klaida šalinant: '+error.message); return;
    }
    deleted++;
  }
  closeCsvMenu();
  showToast(`Importuota: +${added}, ↻${updated}, −${deleted}`);
  // Reload
  S.allLoaded = false;
  S.locations = [];
  S.loadedSets = {};
  await loadInitialBundle();
}
