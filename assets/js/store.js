/* ==========================================================================
   ADA · store.js — veri modeli, yerel depolama (local-first) ve olay yayını
   Notlar localStorage'da JSON olarak, ekli dosyalar IndexedDB'de blob olarak
   tutulur. Hiçbir veri dışarı gönderilmez.
   ========================================================================== */
(function () {
  'use strict';

  var ADA = (window.ADA = window.ADA || {});

  var LS_KEY = 'ada.db.v1';
  var DB_NAME = 'ada-files';
  var DB_STORE = 'files';

  /* ---------------------------- sabit tanımlar ---------------------------- */

  // Her tür kendi künye alanlarını taşır: akademik makale ile kitap aynı
  // metadata'yı istemez.
  ADA.TYPES = [
    { id: 'kavram', label: 'Kavram', icon: '◆', color: '#6f8fd6', fields: [] },
    { id: 'fikir', label: 'Fikir', icon: '✦', color: '#c9a227', fields: [] },
    { id: 'makale', label: 'Makale', icon: '▤', color: '#c2703a', fields: [
      { key: 'author', label: 'Yazar(lar)' },
      { key: 'source', label: 'Dergi / Yayın' },
      { key: 'date', label: 'Yayın tarihi', type: 'date' },
      { key: 'doi', label: 'DOI' },
      { key: 'pages', label: 'Sayfa aralığı' },
      { key: 'url', label: 'URL', type: 'url' }
    ] },
    { id: 'kitap', label: 'Kitap', icon: '▣', color: '#8a5fa8', fields: [
      { key: 'author', label: 'Yazar' },
      { key: 'source', label: 'Kitap adı' },
      { key: 'publisher', label: 'Yayınevi' },
      { key: 'date', label: 'Basım tarihi', type: 'date' },
      { key: 'pages', label: 'Sayfa / bölüm' },
      { key: 'isbn', label: 'ISBN' }
    ] },
    { id: 'ders', label: 'Ders notu', icon: '▥', color: '#3f8f7a', fields: [
      { key: 'author', label: 'Anlatan' },
      { key: 'source', label: 'Ders / Kurum' },
      { key: 'date', label: 'Tarih', type: 'date' },
      { key: 'url', label: 'Kayıt URL', type: 'url' }
    ] },
    { id: 'deney', label: 'Deney / Gözlem', icon: '⚗', color: '#5f9ea0', fields: [
      { key: 'source', label: 'Düzenek / Ortam' },
      { key: 'date', label: 'Tarih', type: 'date' },
      { key: 'author', label: 'Yürüten' },
      { key: 'pages', label: 'Protokol no' }
    ] },
    { id: 'web', label: 'Web kaynağı', icon: '⚭', color: '#4f86c6', fields: [
      { key: 'author', label: 'Yazar / Site' },
      { key: 'source', label: 'Başlık' },
      { key: 'date', label: 'Erişim tarihi', type: 'date' },
      { key: 'url', label: 'URL', type: 'url' }
    ] },
    { id: 'proje', label: 'Proje', icon: '⬢', color: '#b4694f', fields: [
      { key: 'source', label: 'Proje / Bağlam' },
      { key: 'date', label: 'Hedef tarih', type: 'date' },
      { key: 'url', label: 'Bağlantı', type: 'url' }
    ] }
  ];

  ADA.STATUSES = [
    { id: 'gelen', label: 'Gelen kutusu' },
    { id: 'incelenecek', label: 'İncelenecek' },
    { id: 'okunuyor', label: 'Okunuyor' },
    { id: 'islendi', label: 'İşlendi' },
    { id: 'tamamlandi', label: 'Tamamlandı' },
    { id: 'arsiv', label: 'Arşiv' }
  ];

  // Profil = varsayılan tür + öneri etiketleri + yeni not şablonu.
  ADA.PROFILES = {
    akademik: {
      label: 'Akademik / bilimsel makale',
      type: 'makale',
      tags: ['okuma/literatur', 'yontem', 'bulgu', 'tartisma', 'incelenecek'],
      template:
        '> Buraya kaynaktan **ham alıntıyı** yapıştır (s. …)\n\n' +
        ':: Bu alıntı benim sorumla nasıl ilişkileniyor? Kendi cümlelerinle yaz.\n\n' +
        '### Yöntem\n\n### Bulgular\n\n### İtirazlar / açık uçlar\n\n' +
        'İlgili: [[ ]]\n'
    },
    metin: {
      label: 'Kitap & metin analizi',
      type: 'kitap',
      tags: ['okuma', 'motif', 'karakter', 'baglam', 'incelenecek'],
      template:
        '> “Alıntı” (s. …)\n\n' +
        ':: Yorum: bu pasaj hangi izleği kuruyor?\n\n' +
        '### Bağlam\n\n### İzlek / motif\n\n### Bağlanan kavramlar\n\nİlgili: [[ ]]\n'
    },
    proje: {
      label: 'Genel proje fikirleri',
      type: 'fikir',
      tags: ['fikir', 'deneme', 'yapilacak', 'incelenecek'],
      template:
        ':: Fikrin özü tek cümlede:\n\n### Neden şimdi?\n\n### İlk adım\n\n### Riskler\n\nİlgili: [[ ]]\n'
    }
  };

  ADA.typeById = function (id) {
    for (var i = 0; i < ADA.TYPES.length; i++) if (ADA.TYPES[i].id === id) return ADA.TYPES[i];
    return ADA.TYPES[0];
  };
  ADA.statusLabel = function (id) {
    for (var i = 0; i < ADA.STATUSES.length; i++) if (ADA.STATUSES[i].id === id) return ADA.STATUSES[i].label;
    return id || '';
  };

  /* ------------------------------ yardımcılar ----------------------------- */

  function uid(prefix) {
    return (prefix || 'n') + '-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 8);
  }
  ADA.uid = uid;

  // Türkçe duyarlı normalizasyon: başlık eşleştirmede İ/ı sorunlarını çözer.
  function norm(s) {
    return String(s == null ? '' : s)
      .trim()
      .toLocaleLowerCase('tr')
      .replace(/\s+/g, ' ');
  }
  ADA.norm = norm;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* -------------------------------- durum --------------------------------- */

  function emptyState() {
    return {
      version: 1,
      profile: 'akademik',
      settings: { theme: 'auto', sort: 'updated', editorMode: 'split' },
      notes: {},
      log: [],
      desk: { left: null, right: null }
    };
  }

  var state = emptyState();
  var listeners = [];
  var saveTimer = null;

  function emit(reason) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](reason, state); } catch (e) { console.error(e); }
    }
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 350);
  }

  function saveNow() {
    saveTimer = null;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('kayıt hatası', e);
      ADA.onSaveError && ADA.onSaveError(e);
    }
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { /* özel mod */ }
    if (!raw) return false;
    try {
      var data = JSON.parse(raw);
      state = migrate(data);
      return true;
    } catch (e) {
      console.error('bozuk veri', e);
      return false;
    }
  }

  function migrate(data) {
    var base = emptyState();
    var out = Object.assign(base, data || {});
    out.settings = Object.assign(base.settings, data && data.settings);
    out.desk = Object.assign(base.desk, data && data.desk);
    out.notes = out.notes || {};
    out.log = out.log || [];
    Object.keys(out.notes).forEach(function (id) {
      var n = out.notes[id];
      n.id = n.id || id;
      n.title = n.title || '';
      n.body = n.body || '';
      n.type = n.type || 'kavram';
      n.status = n.status || 'gelen';
      n.tags = Array.isArray(n.tags) ? n.tags : [];
      n.meta = n.meta || {};
      n.files = Array.isArray(n.files) ? n.files : [];
      n.createdAt = n.createdAt || Date.now();
      n.updatedAt = n.updatedAt || n.createdAt;
    });
    return out;
  }

  /* ------------------------------ not işlemleri ---------------------------- */

  function all() {
    var ids = Object.keys(state.notes), out = [];
    for (var i = 0; i < ids.length; i++) out.push(state.notes[ids[i]]);
    return out;
  }

  function get(id) { return state.notes[id] || null; }

  function byTitle(title) {
    var k = norm(title);
    if (!k) return null;
    var list = all();
    for (var i = 0; i < list.length; i++) if (norm(list[i].title) === k) return list[i];
    return null;
  }

  function create(patch, opts) {
    var now = Date.now();
    var profile = ADA.PROFILES[state.profile] || ADA.PROFILES.akademik;
    var note = Object.assign({
      id: uid('n'),
      title: '',
      body: '',
      type: profile.type,
      status: 'gelen',
      tags: [],
      meta: {},
      files: [],
      createdAt: now,
      updatedAt: now
    }, patch || {});
    note.id = note.id || uid('n');
    state.notes[note.id] = note;
    if (!opts || opts.log !== false) {
      log((opts && opts.kind) || 'note.create', note.id,
        (opts && opts.text) || ('Not oluşturuldu: ' + (note.title || 'Başlıksız')));
    }
    scheduleSave();
    emit('note.create');
    return note;
  }

  var lastEditLog = {};

  function update(id, patch, opts) {
    var n = state.notes[id];
    if (!n) return null;
    var before = { title: n.title, body: n.body, status: n.status };
    Object.assign(n, patch);
    n.updatedAt = Date.now();

    if (patch && patch.status && patch.status !== before.status) {
      log('note.status', id, 'Durum → ' + ADA.statusLabel(patch.status) + ': ' + (n.title || 'Başlıksız'));
    } else if (!opts || opts.log !== false) {
      // Aynı not için 12 dakikadan sık günlük kaydı tutma; zaman çizelgesi boğulmasın.
      var last = lastEditLog[id] || 0;
      if (Date.now() - last > 12 * 60 * 1000) {
        lastEditLog[id] = Date.now();
        log('note.edit', id, 'Üzerinde çalışıldı: ' + (n.title || 'Başlıksız'));
      }
    }
    scheduleSave();
    emit('note.update');
    return n;
  }

  function remove(id) {
    var n = state.notes[id];
    if (!n) return;
    delete state.notes[id];
    log('note.delete', null, 'Not silindi: ' + (n.title || 'Başlıksız'));
    (n.files || []).forEach(function (fid) { ADA.files.remove(fid); });
    scheduleSave();
    emit('note.delete');
  }

  /* ----------------------------- bağlantı ağı ------------------------------ */

  var linkCache = null, linkCacheStamp = -1;

  function stamp() {
    // Basit geçersizleştirme: not sayısı + en son güncelleme zamanı.
    var list = all(), s = list.length;
    for (var i = 0; i < list.length; i++) s += list[i].updatedAt || 0;
    return s;
  }

  function linkIndex() {
    var st = stamp();
    if (linkCache && linkCacheStamp === st) return linkCache;
    var out = { out: {}, in: {}, broken: {} };
    var list = all();
    var byName = {};
    list.forEach(function (n) { if (n.title) byName[norm(n.title)] = n.id; });
    list.forEach(function (n) {
      out.out[n.id] = out.out[n.id] || [];
      var targets = ADA.md.extractLinks(n.body || '');
      var seen = {};
      targets.forEach(function (t) {
        var key = norm(t);
        if (!key || seen[key]) return;
        seen[key] = 1;
        var tid = byName[key];
        if (tid && tid !== n.id) {
          out.out[n.id].push(tid);
          (out.in[tid] = out.in[tid] || []).push(n.id);
        } else if (!tid) {
          (out.broken[n.id] = out.broken[n.id] || []).push(t);
        }
      });
    });
    linkCache = out; linkCacheStamp = st;
    return out;
  }

  function backlinks(id) {
    var idx = linkIndex();
    return (idx.in[id] || []).map(get).filter(Boolean);
  }
  function outlinks(id) {
    var idx = linkIndex();
    return (idx.out[id] || []).map(get).filter(Boolean);
  }
  function brokenlinks(id) {
    return (linkIndex().broken[id] || []);
  }
  function orphans() {
    var idx = linkIndex();
    return all().filter(function (n) {
      return (idx.out[n.id] || []).length === 0 && (idx.in[n.id] || []).length === 0;
    });
  }

  /* -------------------------------- etiketler ------------------------------ */

  // Notun etiketleri = künyedeki yapılandırılmış etiketler + metin içindeki #etiketler
  ADA.tagsOf = function (n) {
    var out = (n.tags || []).slice();
    var inline = (ADA.md && ADA.md.extractTags) ? ADA.md.extractTags(n.body || '') : [];
    inline.forEach(function (t) { if (out.indexOf(t) === -1) out.push(t); });
    return out;
  };

  function tagCounts() {
    var map = {};
    all().forEach(function (n) {
      ADA.tagsOf(n).forEach(function (t) {
        map[t] = (map[t] || 0) + 1;
        // hiyerarşi: felsefe/etik → "felsefe" de sayılsın
        var parts = t.split('/');
        for (var i = 1; i < parts.length; i++) {
          var parent = parts.slice(0, i).join('/');
          map[parent] = map[parent] || 0;
        }
      });
    });
    return map;
  }

  /* --------------------------------- günlük -------------------------------- */

  function log(kind, noteId, text, extra) {
    state.log.unshift(Object.assign({
      id: uid('l'), ts: Date.now(), kind: kind, noteId: noteId || null, text: text || ''
    }, extra || {}));
    if (state.log.length > 3000) state.log.length = 3000;
    scheduleSave();
  }

  function noteLog(id) {
    return state.log.filter(function (e) { return e.noteId === id; });
  }

  /* ------------------------- dosya deposu (IndexedDB) ---------------------- */

  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('IndexedDB yok'));
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }

  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(DB_STORE, mode);
        var store = t.objectStore(DB_STORE);
        var req = fn(store);
        t.oncomplete = function () { resolve(req && req.result); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  ADA.files = {
    add: function (file, noteId) {
      var rec = {
        id: uid('f'), name: file.name, type: file.type || 'application/octet-stream',
        size: file.size, noteId: noteId || null, addedAt: Date.now(), blob: file
      };
      return tx('readwrite', function (s) { return s.put(rec); }).then(function () {
        var meta = Object.assign({}, rec); delete meta.blob;
        return meta;
      });
    },
    get: function (id) { return tx('readonly', function (s) { return s.get(id); }); },
    remove: function (id) { return tx('readwrite', function (s) { return s.delete(id); }); },
    meta: function (id) {
      return ADA.files.get(id).then(function (r) {
        if (!r) return null;
        var m = Object.assign({}, r); delete m.blob; return m;
      });
    },
    url: function (id) {
      return ADA.files.get(id).then(function (r) {
        return r ? URL.createObjectURL(r.blob) : null;
      });
    },
    all: function () {
      return db().then(function (d) {
        return new Promise(function (resolve, reject) {
          var out = [];
          var t = d.transaction(DB_STORE, 'readonly');
          t.objectStore(DB_STORE).openCursor().onsuccess = function (e) {
            var c = e.target.result;
            if (c) { var m = Object.assign({}, c.value); delete m.blob; out.push(m); c.continue(); }
          };
          t.oncomplete = function () { resolve(out); };
          t.onerror = function () { reject(t.error); };
        });
      });
    }
  };

  /* ------------------------------ dışa/içe aktarım -------------------------- */

  function exportJSON() {
    return JSON.stringify({
      app: 'ADA', version: state.version, exportedAt: new Date().toISOString(),
      profile: state.profile, notes: state.notes, log: state.log
    }, null, 2);
  }

  function importJSON(text, mode) {
    var data = JSON.parse(text);
    var notes = data.notes || {};
    if (Array.isArray(notes)) {
      var map = {}; notes.forEach(function (n) { map[n.id || uid('n')] = n; }); notes = map;
    }
    if (mode === 'replace') { state.notes = {}; state.log = []; }
    var count = 0;
    Object.keys(notes).forEach(function (k) {
      var n = notes[k];
      if (!n) return;
      n.id = n.id || k || uid('n');
      if (state.notes[n.id] && mode !== 'replace') n.id = uid('n');
      state.notes[n.id] = n;
      count++;
    });
    if (Array.isArray(data.log) && mode === 'replace') state.log = data.log;
    if (data.profile && ADA.PROFILES[data.profile]) state.profile = data.profile;
    state = migrate(state);
    log('import', null, count + ' not içe aktarıldı');
    saveNow(); emit('import');
    return count;
  }

  function wipe() {
    state = emptyState();
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    ADA.files.all().then(function (list) {
      list.forEach(function (f) { ADA.files.remove(f.id); });
    }).catch(function () {});
    saveNow(); emit('wipe');
  }

  /* --------------------------------- API ----------------------------------- */

  ADA.store = {
    get state() { return state; },
    load: load,
    save: saveNow,
    subscribe: function (fn) { listeners.push(fn); return function () {
      listeners = listeners.filter(function (f) { return f !== fn; });
    }; },
    emit: emit,
    all: all,
    get: get,
    byTitle: byTitle,
    create: create,
    update: update,
    remove: remove,
    linkIndex: linkIndex,
    backlinks: backlinks,
    outlinks: outlinks,
    brokenlinks: brokenlinks,
    orphans: orphans,
    tagCounts: tagCounts,
    log: log,
    noteLog: noteLog,
    setProfile: function (p) {
      if (!ADA.PROFILES[p]) return;
      state.profile = p; scheduleSave(); emit('profile');
    },
    setSetting: function (k, v) { state.settings[k] = v; scheduleSave(); },
    setDesk: function (side, id) { state.desk[side] = id; scheduleSave(); },
    exportJSON: exportJSON,
    importJSON: importJSON,
    wipe: wipe,
    clone: clone
  };
})();
