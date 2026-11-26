/* Parts Stash PWA — the spare parts on the shelf, with a home.
 *
 * No build step, no dependencies, no account, no server. Parts live
 * in this device's localStorage and move as one plain JSON file.
 *
 * Bikes live in the SHARED Pocket Garage roster (the "pocket-garage-
 * bikes" key, via the vendored bike-profile.js — the same b1/b2/b3
 * roster the other apps use). This app never invents a second bike
 * model: a part points at a roster key, or at "" for a general part
 * that belongs to no bike in particular (a box of bolts, shop stock).
 * Add a bike here and it is added to the shared roster; there is no
 * delete-bike here in v1 — roster management belongs to the landing
 * dashboard (Phase 2), so a bike you mistype is removed there, not
 * here.
 *
 * User-entered figures only, stated plainly wherever a number
 * appears: every part number, price, quantity, and fitment is one
 * the rider typed in. Nothing is invented, and no part number,
 * price, or fitment is ever suggested. A part with no cost entered
 * has no value in the totals — the summary says how many parts are
 * unpriced instead of guessing. Value of a part = quantity × cost
 * each, both typed in. A part's cost is per unit, never a total.
 */
'use strict';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */
var STORAGE_KEY = 'parts-stash-v1';
var VERSION = 1;

/* The only condition labels the app knows. These are the app's own
 * shelf labels, not facts about a part — a part's condition is picked
 * by the rider from this list. */
var CONDITIONS = ['New', 'Used — good', 'Used — needs work', 'For parts only'];

/* Category suggestions for the form's datalist — suggestions only.
 * A rider can type any category; the list just saves typing. */
var CATEGORY_SUGGESTIONS = [
  'Engine', 'Transmission', 'Primary', 'Brakes', 'Suspension',
  'Electrical', 'Carb/Fuel', 'Wheels/Tires', 'Frame/Body',
  'Gaskets/Seals', 'Hardware', 'Controls', 'Other'
];

/* ------------------------------------------------------------------ */
/* Small pure helpers                                                  */
/* ------------------------------------------------------------------ */
function round2(x) { return Math.round(x * 100) / 100; }

function isDateISO(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function todayISO() {
  var d = new Date();
  var m = '' + (d.getMonth() + 1);
  var day = '' + d.getDate();
  return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
}

function fmtMoney(x) {
  if (x === null || x === undefined) return '—';
  return '$' + (Math.round(x * 100) / 100).toFixed(2);
}

function slugify(name) {
  var s = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'bike';
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */
function emptyStore() {
  return { version: VERSION, parts: [] };
}

/* A part, validated. Throws with a plain message on bad input.
 * name is required (a part with no name is unfindable). quantity is
 * a whole number, 0 or more — 0 means out of stock but still listed
 * (a reminder to reorder). cost is per unit, optional: blank means
 * unknown, and the part carries no value in the totals. bike_key is
 * '' for a general part, or a roster key. part_number, bin, category,
 * and notes are free text, trimmed. condition is one of the four
 * labels above, defaulting to 'New' when not given. date_added
 * defaults to today when not given. */
function validatePartFields(p) {
  if (!p || typeof p !== 'object') throw new Error('part must be an object');
  var name = typeof p.name === 'string' ? p.name.trim() : '';
  if (!name) throw new Error('part needs a name');
  if (typeof p.bike_key !== 'string') throw new Error('part needs a bike (or none)');
  var q = Number(p.quantity);
  if (p.quantity === '' || p.quantity === null || p.quantity === undefined || isNaN(q) || q < 0 || Math.floor(q) !== q)
    throw new Error('quantity must be a whole number, 0 or more');
  var cost = null;
  if (p.cost !== '' && p.cost !== null && p.cost !== undefined) {
    cost = Number(p.cost);
    if (isNaN(cost) || cost < 0) throw new Error('cost must be $0 or more, or left blank');
    cost = round2(cost);
  }
  var date = p.date_added;
  if (date === '' || date === null || date === undefined) date = todayISO();
  if (!isDateISO(date)) throw new Error('date added must be a real date (YYYY-MM-DD)');
  var cond = typeof p.condition === 'string' ? p.condition : 'New';
  if (CONDITIONS.indexOf(cond) < 0) cond = 'New';
  return {
    bike_key: p.bike_key,
    name: name,
    part_number: typeof p.part_number === 'string' ? p.part_number.trim() : '',
    category: typeof p.category === 'string' ? p.category.trim() : '',
    quantity: q,
    cost: cost,
    bin: typeof p.bin === 'string' ? p.bin.trim() : '',
    condition: cond,
    date_added: date,
    notes: typeof p.notes === 'string' ? p.notes : ''
  };
}

function nextPartId(store) {
  var max = 0;
  store.parts.forEach(function (p) {
    var m = /^p(\d+)$/.exec(p.id || '');
    if (m && +m[1] > max) max = +m[1];
  });
  return 'p' + (max + 1);
}

function addPart(store, fields) {
  var p = validatePartFields(fields);
  p.id = nextPartId(store);
  store.parts.push(p);
  return p;
}

function updatePart(store, id, fields) {
  for (var i = 0; i < store.parts.length; i++) {
    if (store.parts[i].id === id) {
      var merged = validatePartFields(Object.assign({}, store.parts[i], fields));
      merged.id = id;
      store.parts[i] = merged;
      return merged;
    }
  }
  return null;
}

function deletePart(store, id) {
  for (var i = 0; i < store.parts.length; i++) {
    if (store.parts[i].id === id) { store.parts.splice(i, 1); return true; }
  }
  return false;
}

function getPart(store, id) {
  for (var i = 0; i < store.parts.length; i++) {
    if (store.parts[i].id === id) return store.parts[i];
  }
  return null;
}

/* Same bike + same name + same part number: the same part typed
 * twice. The sample loader uses this so tapping "Load example data"
 * twice never doubles the stash. */
function hasPart(store, bikeKey, name, partNumber) {
  var n = String(name || '').trim().toLowerCase();
  var pn = String(partNumber || '').trim().toLowerCase();
  return store.parts.some(function (p) {
    return p.bike_key === bikeKey &&
      String(p.name).trim().toLowerCase() === n &&
      String(p.part_number || '').trim().toLowerCase() === pn;
  });
}

/* ------------------------------------------------------------------ */
/* Search / filter                                                     */
/* ------------------------------------------------------------------ */
/* filters: { bikeKey: '' | 'general' | 'b1'..., query: string,
 * category: '' }. bikeKey '' means all bikes (general parts included);
 * 'general' means general parts only. query matches name or part
 * number, case-insensitive, substring. category matches exactly
 * (case-insensitive). Results come back name-sorted for the shelf. */
function filterParts(store, filters) {
  filters = filters || {};
  var q = String(filters.query || '').trim().toLowerCase();
  var cat = String(filters.category || '').trim().toLowerCase();
  var bk = filters.bikeKey === undefined ? '' : filters.bikeKey;
  return store.parts.filter(function (p) {
    if (bk === 'general') { if (p.bike_key !== '') return false; }
    else if (bk) { if (p.bike_key !== bk) return false; }
    if (cat && String(p.category || '').trim().toLowerCase() !== cat) return false;
    if (q) {
      var hay = (p.name + ' ' + (p.part_number || '')).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }).sort(function (a, b) {
    var an = a.name.toLowerCase(), bn = b.name.toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

function categoriesInUse(store) {
  var seen = {};
  var out = [];
  store.parts.forEach(function (p) {
    var c = String(p.category || '').trim();
    if (c && !seen[c.toLowerCase()]) { seen[c.toLowerCase()] = true; out.push(c); }
  });
  return out.sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
}

/* ------------------------------------------------------------------ */
/* Totals — the stash at a glance                                      */
/* ------------------------------------------------------------------ */
/* Value counts priced parts only: a part with no cost entered has no
 * value, and the summary says how many parts are unpriced instead of
 * guessing. partCount is distinct parts; totalQty is units on hand. */
function stashStats(store, bikeKey) {
  var parts = bikeKey === undefined || bikeKey === '' || bikeKey === null
    ? store.parts
    : (bikeKey === 'general'
      ? store.parts.filter(function (p) { return p.bike_key === ''; })
      : store.parts.filter(function (p) { return p.bike_key === bikeKey; }));
  var stats = {
    bike_key: bikeKey === undefined ? '' : bikeKey,
    parts: parts.length, totalQty: 0, totalValue: 0,
    pricedParts: 0, unpricedParts: 0
  };
  parts.forEach(function (p) {
    stats.totalQty += p.quantity;
    if (p.cost !== null && p.cost !== undefined) {
      stats.totalValue = round2(stats.totalValue + p.quantity * p.cost);
      stats.pricedParts++;
    } else {
      stats.unpricedParts++;
    }
  });
  return stats;
}

function allStashStats(store) {
  return stashStats(store, '');
}

function categoryCounts(store, bikeKey) {
  var parts = bikeKey === undefined || bikeKey === '' || bikeKey === null
    ? store.parts
    : (bikeKey === 'general'
      ? store.parts.filter(function (p) { return p.bike_key === ''; })
      : store.parts.filter(function (p) { return p.bike_key === bikeKey; }));
  var counts = {};
  parts.forEach(function (p) {
    var c = String(p.category || '').trim() || 'Uncategorized';
    counts[c] = (counts[c] || 0) + 1;
  });
  return Object.keys(counts).sort(function (a, b) {
    if (counts[b] !== counts[a]) return counts[b] - counts[a];
    return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
  }).map(function (c) { return { category: c, parts: counts[c] }; });
}

/* ------------------------------------------------------------------ */
/* Import / export                                                     */
/* ------------------------------------------------------------------ */
function validateImport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('import must be a JSON object');
  if (!Array.isArray(data.parts)) throw new Error('import needs a parts array');
  var out = emptyStore();
  data.parts.forEach(function (raw) {
    if (!raw || typeof raw !== 'object') throw new Error('each part must be an object');
    var p = validatePartFields(raw);
    /* Ids are re-minted on import in sequence, so a file that was
     * edited by hand with duplicate or missing ids still loads. */
    p.id = nextPartId(out);
    out.parts.push(p);
  });
  return out;
}

function bikePartsExport(store, bikeKey) {
  var parts = stashStats(store, bikeKey);
  var list = (bikeKey === 'general'
    ? store.parts.filter(function (p) { return p.bike_key === ''; })
    : store.parts.filter(function (p) { return p.bike_key === bikeKey; }))
    .slice().sort(function (a, b) {
      var an = a.name.toLowerCase(), bn = b.name.toLowerCase();
      if (an !== bn) return an < bn ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
  return {
    app: 'parts-stash', version: VERSION, bike_key: bikeKey,
    exported: todayISO(), stats: parts,
    parts: list.map(function (p) {
      return {
        id: p.id, name: p.name, part_number: p.part_number,
        category: p.category, quantity: p.quantity,
        cost: p.cost, value: (p.cost === null || p.cost === undefined) ? null : round2(p.quantity * p.cost),
        bin: p.bin, condition: p.condition,
        date_added: p.date_added, notes: p.notes
      };
    })
  };
}

function bikePartsText(store, bikeKey, bikeName) {
  var exp = bikePartsExport(store, bikeKey);
  var s = exp.stats;
  var lines = [];
  lines.push('Parts stash — ' + (bikeName || bikeKey));
  lines.push('Exported ' + exp.exported);
  lines.push('');
  lines.push(s.parts + ' parts — ' + s.totalQty + ' units on hand — value ' +
    fmtMoney(s.totalValue) + ' (' + s.pricedParts + ' priced' +
    (s.unpricedParts ? ', ' + s.unpricedParts + ' without a price' : '') + ')');
  lines.push('');
  exp.parts.forEach(function (p) {
    lines.push(p.name +
      (p.part_number ? ' [' + p.part_number + ']' : '') +
      ' — qty ' + p.quantity +
      (p.cost !== null ? ' @ ' + fmtMoney(p.cost) + ' ea — ' + fmtMoney(p.value) : ' — no price entered') +
      ' — ' + p.condition +
      (p.bin ? ' — ' + p.bin : '') +
      (p.category ? ' — ' + p.category : '') +
      (p.notes ? ' — ' + p.notes : ''));
  });
  lines.push('');
  lines.push('Every part number, price, and quantity here is one the rider typed in. ' +
    'A part with no price entered has no value in the totals.');
  return lines.join('\n') + '\n';
}

function exportFilename(bikeName, ext) {
  return 'parts-stash-' + slugify(bikeName) + '-parts.' + ext;
}

/* ------------------------------------------------------------------ */
/* Sample data — example parts only. The two part numbers below are
 * the only ones printed, and both are real numbers from the garage
 * library's own interchange research (EBC FA400 brake pads; Big Twin
 * stator 29970-88C). Every other sample part carries no part number
 * — the field is optional and blank is honest. All sample prices are
 * example prices only; totals and values are computed by the same
 * code the app runs on real parts.                                 */
/* ------------------------------------------------------------------ */
function sampleStore() {
  var s = emptyStore();
  var rows = [
    { bike_key: 'b1', name: 'Rear brake pads', part_number: 'FA400', category: 'Brakes', quantity: 1, cost: 24.99, bin: 'Shelf A, bin 2', condition: 'New', date_added: '2026-11-01', notes: '' },
    { bike_key: 'b1', name: 'Primary chaincase gasket', part_number: '', category: 'Gaskets/Seals', quantity: 2, cost: 8.50, bin: 'Shelf A, bin 4', condition: 'New', date_added: '2026-11-02', notes: '' },
    { bike_key: 'b2', name: 'Clutch cable', part_number: '', category: 'Controls', quantity: 1, cost: 18.95, bin: 'Shelf B, bin 1', condition: 'New', date_added: '2026-11-05', notes: '' },
    { bike_key: 'b1', name: 'Used stator', part_number: '29970-88C', category: 'Electrical', quantity: 1, cost: null, bin: 'Garage shelf C', condition: 'Used — good', date_added: '2026-11-08', notes: 'off a parts bike, tests good' },
    { bike_key: 'b1', name: 'Oil filter', part_number: '', category: 'Engine', quantity: 3, cost: 6.99, bin: 'Shelf A, bin 1', condition: 'New', date_added: '2026-11-10', notes: '' },
    { bike_key: '', name: 'Assorted stainless bolts', part_number: '', category: 'Hardware', quantity: 12, cost: 0.50, bin: 'Parts drawer 2', condition: 'New', date_added: '2026-11-12', notes: '' }
  ];
  rows.forEach(function (r) { addPart(s, r); });
  return s;
}

/* ------------------------------------------------------------------ */
/* DOM layer — browser only. The pure logic above runs in Node tests. */
/* ------------------------------------------------------------------ */
if (typeof document !== 'undefined') {
  var BikeProfile = (typeof window !== 'undefined' && window.PG_BikeProfile) ? window.PG_BikeProfile : null;
  var SWUpdate = (typeof window !== 'undefined' && window.PG_SWUpdate) ? window.PG_SWUpdate : null;

  var storage = (function () {
    try {
      if (typeof localStorage !== 'undefined') { localStorage.getItem('__parts_stash_probe__'); return localStorage; }
    } catch (e) { /* private mode / blocked storage: memory only */ }
    var mem = {};
    return {
      getItem: function (k) { return mem.hasOwnProperty(k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; }
    };
  })();

  var profile = BikeProfile ? BikeProfile.create(storage) : null;
  var store = emptyStore();
  var editingId = null;

  function loadStore() {
    try {
      var raw = storage.getItem(STORAGE_KEY);
      if (raw) store = validateImport(JSON.parse(raw));
    } catch (e) { store = emptyStore(); }
  }
  function saveStore() {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) { /* quota: keep the in-memory copy */ }
  }

  function bikes() {
    if (!profile) return [];
    try { return profile.listBikes(); } catch (e) { return []; }
  }
  function bikeName(key) {
    if (key === '' || key === null || key === undefined) return 'General (no bike)';
    var b = null;
    try { b = profile ? profile.getBike(key) : null; } catch (e) { b = null; }
    return b ? b.name : key;
  }

  function el(id) { return document.getElementById(id); }
  function toast(msg) {
    var t = el('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function bikeOptions(includeGeneral, includeAll) {
    var list = bikes();
    var opts = '';
    if (includeAll) opts += '<option value="">All bikes</option>';
    if (includeGeneral) opts += '<option value="__general__">General (no bike)</option>';
    list.forEach(function (b) {
      opts += '<option value="' + escapeHtml(b.key) + '">' + escapeHtml(b.name) + '</option>';
    });
    return opts;
  }

  function fillBikeSelects() {
    var stashSel = el('stash-bike');
    if (stashSel) {
      var keep = stashSel.value;
      stashSel.innerHTML = '<option value="">All bikes</option><option value="general">General (no bike) only</option>' +
        bikes().map(function (b) {
          return '<option value="' + escapeHtml(b.key) + '">' + escapeHtml(b.name) + '</option>';
        }).join('');
      if (keep) stashSel.value = keep;
    }
    var formSel = el('p-bike');
    if (formSel) {
      var keepF = formSel.value;
      formSel.innerHTML = '<option value="">General (no bike)</option>' +
        bikes().map(function (b) {
          return '<option value="' + escapeHtml(b.key) + '">' + escapeHtml(b.name) + '</option>';
        }).join('');
      if (keepF) formSel.value = keepF;
    }
    var summarySel = el('summary-bike');
    if (summarySel) {
      var keepS = summarySel.value;
      summarySel.innerHTML = '<option value="">All bikes</option><option value="general">General (no bike)</option>' +
        bikes().map(function (b) {
          return '<option value="' + escapeHtml(b.key) + '">' + escapeHtml(b.name) + '</option>';
        }).join('');
      if (keepS) summarySel.value = keepS;
    }
    var exportSel = el('export-bike');
    if (exportSel) {
      var keepE = exportSel.value;
      exportSel.innerHTML = '<option value="general">General (no bike)</option>' +
        bikes().map(function (b) {
          return '<option value="' + escapeHtml(b.key) + '">' + escapeHtml(b.name) + '</option>';
        }).join('');
      if (keepE) exportSel.value = keepE;
    }
  }

  function fillCategorySelect() {
    var sel = el('stash-category');
    if (!sel) return;
    var keep = sel.value;
    var cats = categoriesInUse(store);
    sel.innerHTML = '<option value="">All categories</option>' +
      cats.map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'; }).join('');
    if (keep) sel.value = keep;
  }

  function renderStash() {
    var bk = el('stash-bike').value;
    var q = el('stash-search').value;
    var cat = el('stash-category').value;
    var rows = filterParts(store, { bikeKey: bk, query: q, category: cat });
    var html = '';
    if (!store.parts.length) {
      html = '<p class="muted">No parts on the shelf yet. Add the first one below — name and quantity are all it takes, the rest is optional.</p>';
    } else if (!rows.length) {
      html = '<p class="muted">Nothing matches that search. Clear the search or the filters and the shelf comes back.</p>';
    } else {
      html = '<table><thead><tr><th>Part</th><th>Bike</th><th class="num">Qty</th><th>Bin</th><th class="num">Cost ea</th><th class="num">Value</th><th></th></tr></thead><tbody>';
      rows.forEach(function (p) {
        var val = (p.cost === null || p.cost === undefined) ? null : round2(p.quantity * p.cost);
        html += '<tr><td><b>' + escapeHtml(p.name) + '</b>' +
          (p.part_number ? '<br><span class="muted">' + escapeHtml(p.part_number) + '</span>' : '') +
          (p.category ? '<br><span class="badge">' + escapeHtml(p.category) + '</span>' : '') +
          '<br><span class="muted">' + escapeHtml(p.condition) + '</span>' +
          (p.notes ? '<br><span class="muted">' + escapeHtml(p.notes) + '</span>' : '') +
          '</td><td>' + escapeHtml(bikeName(p.bike_key)) + '</td>' +
          '<td class="num">' + p.quantity + '</td>' +
          '<td>' + escapeHtml(p.bin || '—') + '</td>' +
          '<td class="num">' + fmtMoney(p.cost) + '</td>' +
          '<td class="num">' + fmtMoney(val) + '</td>' +
          '<td><button class="mini" data-edit="' + p.id + '">Edit</button> ' +
          '<button class="mini danger" data-del="' + p.id + '">Delete</button></td></tr>';
      });
      html += '</tbody></table>';
      var st = stashStats(store, bk === 'general' ? 'general' : (bk || ''));
      html += '<p class="muted">' + rows.length + ' part' + (rows.length === 1 ? '' : 's') + ' shown — ' +
        st.totalQty + ' units — value ' + fmtMoney(st.totalValue) +
        (st.unpricedParts ? ' (' + st.unpricedParts + ' part' + (st.unpricedParts === 1 ? '' : 's') + ' without a price)' : '') + '.</p>';
    }
    el('parts-list').innerHTML = html;
    el('parts-list').querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (deletePart(store, btn.getAttribute('data-del'))) { saveStore(); renderAll(); toast('Part deleted.'); }
      });
    });
    el('parts-list').querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { startEdit(btn.getAttribute('data-edit')); });
    });
  }

  function renderSummary() {
    var key = el('summary-bike').value;
    var html = '';
    var showCard = function (label, s) {
      var h = '<div class="card"><h3>' + escapeHtml(label) + '</h3>' +
        '<p>' + s.parts + ' part' + (s.parts === 1 ? '' : 's') + ' — ' + s.totalQty + ' units — value ' +
        fmtMoney(s.totalValue) + ' (' + s.pricedParts + ' priced' +
        (s.unpricedParts ? ', ' + s.unpricedParts + ' without a price' : '') + ')</p>';
      var cats = categoryCounts(store, s.bike_key);
      if (cats.length) {
        h += '<p class="muted">' + cats.map(function (c) { return escapeHtml(c.category) + ' ' + c.parts; }).join(' · ') + '</p>';
      }
      return h + '</div>';
    };
    if (!key) {
      html += showCard('All bikes', allStashStats(store));
      bikes().forEach(function (b) {
        var s = stashStats(store, b.key);
        if (!s.parts) return;
        html += showCard(b.name, s);
      });
      var g = stashStats(store, 'general');
      if (g.parts) html += showCard('General (no bike)', g);
      if (!allStashStats(store).parts) html += '<p class="muted">No parts yet. Add one on the Stash tab and the numbers start here.</p>';
    } else if (key === 'general') {
      html += showCard('General (no bike)', stashStats(store, 'general'));
    } else {
      html += showCard(bikeName(key), stashStats(store, key));
    }
    el('summary-cards').innerHTML = html;
  }

  function renderBikes() {
    var list = bikes();
    var html = '';
    if (!list.length) {
      html = '<p class="muted">No bikes yet. The shared roster starts with the 1995 Fat Boy, the 1990 Softail, and the 1947 Knucklehead — add yours below.</p>';
    } else {
      html = '<ul class="bike-list">';
      list.forEach(function (b) {
        var s = stashStats(store, b.key);
        html += '<li><b>' + escapeHtml(b.name) + '</b>' +
          (b.year ? ' (' + escapeHtml(String(b.year)) + ')' : '') +
          (b.model ? ' — ' + escapeHtml(b.model) : '') +
          '<br><span class="muted">' + s.parts + ' part' + (s.parts === 1 ? '' : 's') +
          (s.parts ? ' — ' + s.totalQty + ' units — value ' + fmtMoney(s.totalValue) : '') + '</span></li>';
      });
      html += '</ul>';
    }
    el('bikes-list').innerHTML = html;
  }

  function renderData() {
    var total = allStashStats(store);
    el('data-counts').textContent = total.parts + ' parts — ' +
      total.totalQty + ' units — value ' + fmtMoney(total.totalValue) +
      (total.unpricedParts ? ' (' + total.unpricedParts + ' without a price)' : '') +
      ' — ' + bikes().length + ' bikes on the shared roster.';
  }

  function renderAll() {
    fillBikeSelects();
    fillCategorySelect();
    renderStash();
    renderSummary();
    renderBikes();
    renderData();
  }

  function showView(name) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + name); });
    document.querySelectorAll('.navbtn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === name); });
  }

  function resetForm() {
    editingId = null;
    el('part-form').reset();
    el('p-date').value = todayISO();
    el('part-submit').textContent = 'Add part';
    el('part-cancel').style.display = 'none';
    el('form-heading').textContent = 'Add a part';
  }

  function startEdit(id) {
    var p = getPart(store, id);
    if (!p) return;
    editingId = id;
    el('p-name').value = p.name;
    el('p-number').value = p.part_number || '';
    el('p-bike').value = p.bike_key || '';
    el('p-category').value = p.category || '';
    el('p-quantity').value = p.quantity;
    el('p-cost').value = (p.cost === null || p.cost === undefined) ? '' : p.cost;
    el('p-bin').value = p.bin || '';
    el('p-condition').value = p.condition;
    el('p-date').value = p.date_added;
    el('p-notes').value = p.notes || '';
    el('part-submit').textContent = 'Save changes';
    el('part-cancel').style.display = '';
    el('form-heading').textContent = 'Edit part';
    document.getElementById('view-stash').scrollIntoView();
    el('p-name').focus();
  }

  document.querySelectorAll('.navbtn').forEach(function (b) {
    b.addEventListener('click', function () { showView(b.getAttribute('data-view')); });
  });

  el('stash-bike').addEventListener('change', renderStash);
  el('stash-category').addEventListener('change', renderStash);
  el('stash-search').addEventListener('input', renderStash);

  el('part-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var fields = {
      bike_key: el('p-bike').value,
      name: el('p-name').value,
      part_number: el('p-number').value,
      category: el('p-category').value,
      quantity: el('p-quantity').value,
      cost: el('p-cost').value,
      bin: el('p-bin').value,
      condition: el('p-condition').value,
      date_added: el('p-date').value,
      notes: el('p-notes').value
    };
    try {
      if (editingId) {
        updatePart(store, editingId, fields);
        toast('Part updated.');
      } else {
        var p = addPart(store, fields);
        toast('Part added — ' + p.name + '.');
      }
      saveStore();
      resetForm();
      renderAll();
    } catch (err) { toast(err.message); }
  });
  el('part-cancel').addEventListener('click', function () { resetForm(); });

  el('bike-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!profile) { toast('Bike roster unavailable on this device.'); return; }
    var name = el('bike-name').value.trim();
    if (!name) { toast('Give the bike a name.'); return; }
    var year = el('bike-year').value.trim();
    var key = profile.addBike({
      name: name,
      year: year ? parseInt(year, 10) : null,
      model: el('bike-model').value.trim(),
      carb: '',
      notes: el('bike-notes').value.trim()
    });
    el('bike-form').reset();
    renderAll();
    toast('Bike added to the shared roster (' + key + ').');
  });

  el('export-btn').addEventListener('click', function () {
    download('parts-stash-backup.json', JSON.stringify(store, null, 2));
    toast('Backup downloaded.');
  });
  el('copy-export-btn').addEventListener('click', function () {
    var done = function () { toast('Backup copied.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(JSON.stringify(store, null, 2)).then(done, function () { toast('Copy failed — use Download instead.'); });
    } else { toast('Clipboard unavailable — use Download instead.'); }
  });
  el('export-json-btn').addEventListener('click', function () {
    var key = el('export-bike').value;
    download(exportFilename(bikeName(key), 'json'), JSON.stringify(bikePartsExport(store, key), null, 2));
  });
  el('export-text-btn').addEventListener('click', function () {
    var key = el('export-bike').value;
    download(exportFilename(bikeName(key), 'txt'), bikePartsText(store, key, bikeName(key)), 'text/plain');
  });
  el('copy-text-btn').addEventListener('click', function () {
    var key = el('export-bike').value;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(bikePartsText(store, key, bikeName(key))).then(function () { toast('Copied.'); }, function () { toast('Copy failed — use Download instead.'); });
    } else { toast('Clipboard unavailable — use Download instead.'); }
  });
  el('import-btn').addEventListener('click', function () {
    var file = el('import-file').files && el('import-file').files[0];
    var text = el('import-text').value.trim();
    var apply = function (raw) {
      try {
        var next = validateImport(JSON.parse(raw));
        store = next;
        saveStore();
        renderAll();
        toast('Imported ' + next.parts.length + ' parts. (Replaces the old stash.)');
      } catch (err) { toast('Import failed: ' + err.message); }
    };
    if (file) {
      var reader = new FileReader();
      reader.onload = function () { apply(String(reader.result)); };
      reader.readAsText(file);
    } else if (text) {
      apply(text);
    } else {
      toast('Pick a file or paste JSON first.');
    }
  });
  el('sample-btn').addEventListener('click', function () {
    var sample = sampleStore();
    var added = 0;
    sample.parts.forEach(function (p) {
      if (hasPart(store, p.bike_key, p.name, p.part_number)) return; /* already there: tapping twice never doubles the stash */
      try { addPart(store, p); added++; } catch (e) { /* a sample row that collides with existing data is skipped, not forced */ }
    });
    saveStore();
    renderAll();
    toast(added ? 'Example parts loaded on the shelf.' : 'Example parts are already in the stash.');
  });
  el('clear-btn').addEventListener('click', function () {
    if (!window.confirm('Delete all parts-stash parts? The shared bike roster is NOT touched — only this app\u2019s parts go.')) return;
    store = emptyStore();
    saveStore();
    resetForm();
    renderAll();
    toast('Parts stash cleared. Bikes are untouched.');
  });

  loadStore();
  el('p-date').value = todayISO();
  renderAll();
  if (SWUpdate) SWUpdate.init({ container: document.body });
}

if (typeof module !== 'undefined' && module.exports) {
  var BikeProfileModule = null;
  try { BikeProfileModule = require('./bike-profile.js'); } catch (e) { BikeProfileModule = null; }
  module.exports = {
    STORAGE_KEY: STORAGE_KEY, VERSION: VERSION,
    CONDITIONS: CONDITIONS, CATEGORY_SUGGESTIONS: CATEGORY_SUGGESTIONS,
    round2: round2, isDateISO: isDateISO, todayISO: todayISO,
    fmtMoney: fmtMoney, slugify: slugify, escapeHtml: escapeHtml,
    emptyStore: emptyStore, validatePartFields: validatePartFields,
    nextPartId: nextPartId, addPart: addPart, updatePart: updatePart,
    deletePart: deletePart, getPart: getPart, hasPart: hasPart,
    filterParts: filterParts, categoriesInUse: categoriesInUse,
    stashStats: stashStats, allStashStats: allStashStats,
    categoryCounts: categoryCounts,
    validateImport: validateImport,
    bikePartsExport: bikePartsExport, bikePartsText: bikePartsText,
    exportFilename: exportFilename, sampleStore: sampleStore,
    BikeProfile: BikeProfileModule
  };
}
