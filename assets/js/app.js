/* ==========================================================================
   ADA · app.js — arayüz katmanı: görünümler, editör, filtreler, dışa aktarım
   ========================================================================== */
(function () {
  'use strict';

  var ADA = window.ADA;
  var S = ADA.store;
  var MD = ADA.md;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return MD.esc(s); }
  function debounce(fn, ms) {
    var t; return function () {
      var a = arguments, c = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms);
    };
  }

  var ui = {
    view: 'notes',
    currentId: null,
    history: [],
    query: '',
    sort: 'updated',
    filters: { types: [], statuses: [], tags: [], special: null },
    fileUrls: {},
    metaOpen: null,          // null = türe göre otomatik
    graph: null,
    sessionTimer: null,
    sourceSort: { key: 'updatedAt', dir: -1 }
  };

  /* ================================ araçlar ================================ */

  function toast(msg, ms) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 2400);
  }

  function relTime(ts) {
    var d = Date.now() - ts, m = Math.round(d / 60000);
    if (m < 1) return 'az önce';
    if (m < 60) return m + ' dk önce';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' saat önce';
    var g = Math.round(h / 24);
    if (g === 1) return 'dün';
    if (g < 30) return g + ' gün önce';
    return new Date(ts).toLocaleDateString('tr-TR');
  }

  function plainText(body) {
    return String(body || '')
      .replace(/!\[\[dosya:[^\]]*\]\]/g, '')
      .replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, '$1')
      .replace(/^[>:]{1,2}\s?/gm, '')
      .replace(/[*_`#>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function download(name, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      return true;
    } catch (e) { return false; }
  }

  /* ------------------------------- modal ---------------------------------- */

  function openModal(title, bodyHTML, buttons) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHTML;
    var foot = $('#modalFoot');
    foot.innerHTML = '';
    (buttons || []).forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'btn' + (b.primary ? ' btn-accent' : '');
      btn.textContent = b.label;
      btn.onclick = function () { b.onClick && b.onClick(); };
      foot.appendChild(btn);
    });
    $('#modalOverlay').hidden = false;
  }
  function closeModal() { $('#modalOverlay').hidden = true; }

  // Dışa aktarım her ortamda çalışsın: indirme engellenirse metin ekranda kalır.
  function exportFlow(title, filename, text, mime) {
    openModal(title,
      '<p class="muted" style="margin-top:0">' + esc(filename) +
      ' · ' + (text.length / 1024).toFixed(1) + ' KB. İndir düğmesi çalışmazsa metni kopyalayabilirsin.</p>' +
      '<textarea id="exportBox" spellcheck="false"></textarea>',
      [
        { label: 'Panoya kopyala', onClick: function () {
          var box = $('#exportBox');
          box.select();
          var ok = false;
          try { ok = document.execCommand('copy'); } catch (e) {}
          if (!ok && navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast('Kopyalandı'); });
          else toast(ok ? 'Kopyalandı' : 'Kopyalanamadı, elle seç');
        } },
        { label: 'İndir', primary: true, onClick: function () {
          if (download(filename, text, mime)) toast('İndirildi: ' + filename);
          else toast('Bu ortamda indirme engelli — metni kopyala');
        } },
        { label: 'Kapat', onClick: closeModal }
      ]);
    $('#exportBox').value = text;
  }

  /* =============================== görünümler ============================== */

  function setView(v) {
    ui.view = v;
    $$('#viewNav .vtab').forEach(function (b) { b.classList.toggle('is-active', b.dataset.view === v); });
    $$('main .view').forEach(function (s) { s.classList.toggle('is-active', s.dataset.view === v); });
    if (v === 'graph') { renderGraph(); }
    else if (ui.graph) ui.graph.stop();
    if (v === 'log') renderLog();
    if (v === 'sources') renderSources();
    if (v === 'desk') renderDesk();
  }

  /* ------------------------------ not listesi ------------------------------ */

  function filteredNotes() {
    var f = ui.filters;
    var notes = S.all();
    var idx = S.linkIndex();

    if (f.types.length) notes = notes.filter(function (n) { return f.types.indexOf(n.type) >= 0; });
    if (f.statuses.length) notes = notes.filter(function (n) { return f.statuses.indexOf(n.status) >= 0; });
    if (f.tags.length) {
      notes = notes.filter(function (n) {
        var tags = ADA.tagsOf(n);
        return f.tags.every(function (want) {
          return tags.some(function (t) { return t === want || t.indexOf(want + '/') === 0; });
        });
      });
    }
    if (f.special === 'orphans') {
      notes = notes.filter(function (n) {
        return (idx.out[n.id] || []).length === 0 && (idx.in[n.id] || []).length === 0;
      });
    } else if (f.special === 'untagged') {
      notes = notes.filter(function (n) { return ADA.tagsOf(n).length === 0; });
    } else if (f.special === 'attachments') {
      notes = notes.filter(function (n) { return (n.files || []).length > 0; });
    }

    if (ui.query.trim()) {
      return ADA.search.run(ui.query, notes).map(function (r) { return r.note; });
    }
    var s = ui.sort;
    notes.sort(function (a, b) {
      if (s === 'title') return (a.title || '').localeCompare(b.title || '', 'tr');
      if (s === 'created') return (b.createdAt || 0) - (a.createdAt || 0);
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    return notes;
  }

  function renderList() {
    var list = filteredNotes();
    var host = $('#noteList');
    var words = ui.query.trim() ? ADA.search.parse(ui.query).words : [];
    host.innerHTML = list.map(function (n) {
      var t = ADA.typeById(n.type);
      var tags = ADA.tagsOf(n);
      return '<div class="note-item' + (n.id === ui.currentId ? ' is-active' : '') + '" data-id="' + n.id + '">' +
        '<div class="t">' + (words.length ? ADA.search.highlight(n.title || 'Başlıksız', words) : esc(n.title || 'Başlıksız')) + '</div>' +
        '<div class="s">' + (words.length ? ADA.search.snippet(n, words, 110) : esc(plainText(n.body).slice(0, 110))) + '</div>' +
        '<div class="r">' +
          '<span class="badge" style="color:' + t.color + '">' + t.icon + ' ' + esc(t.label) + '</span>' +
          '<span class="badge status-' + esc(n.status) + '">' + esc(ADA.statusLabel(n.status)) + '</span>' +
          (tags.length ? '<span>#' + esc(tags[0]) + (tags.length > 1 ? ' +' + (tags.length - 1) : '') + '</span>' : '') +
          ((n.files || []).length ? '<span>📎' + n.files.length + '</span>' : '') +
          '<span style="margin-left:auto">' + relTime(n.updatedAt) + '</span>' +
        '</div></div>';
    }).join('') || '<div class="empty" style="padding:26px 16px;font-size:12.5px">Bu filtreyle eşleşen not yok.</div>';

    $('#listCount').textContent = list.length + ' not' +
      (ui.query.trim() ? ' · arama' : '') +
      (S.all().length !== list.length ? ' (toplam ' + S.all().length + ')' : '');
    $('#btnClearFilters').hidden = !(ui.filters.types.length || ui.filters.statuses.length ||
      ui.filters.tags.length || ui.filters.special);
  }

  function renderFilters() {
    var counts = {};
    S.all().forEach(function (n) { counts[n.type] = (counts[n.type] || 0) + 1; });
    $('#filterTypes').innerHTML = ADA.TYPES.map(function (t) {
      return '<button class="chip' + (ui.filters.types.indexOf(t.id) >= 0 ? ' is-active' : '') +
        '" data-type="' + t.id + '"><span style="color:' + (ui.filters.types.indexOf(t.id) >= 0 ? 'inherit' : t.color) + '">' +
        t.icon + '</span> ' + esc(t.label) + '<span class="n">' + (counts[t.id] || 0) + '</span></button>';
    }).join('');

    var sc = {};
    S.all().forEach(function (n) { sc[n.status] = (sc[n.status] || 0) + 1; });
    $('#filterStatus').innerHTML = ADA.STATUSES.map(function (s) {
      return '<button class="chip' + (ui.filters.statuses.indexOf(s.id) >= 0 ? ' is-active' : '') +
        '" data-status="' + s.id + '">' + esc(s.label) + '<span class="n">' + (sc[s.id] || 0) + '</span></button>';
    }).join('');

    // hiyerarşik etiket ağacı
    var counts2 = S.tagCounts();
    var keys = Object.keys(counts2).sort(function (a, b) { return a.localeCompare(b, 'tr'); });
    $('#tagTree').innerHTML = keys.map(function (t) {
      var depth = t.split('/').length - 1;
      var label = t.split('/').pop();
      return '<div class="tag-node' + (ui.filters.tags.indexOf(t) >= 0 ? ' is-active' : '') +
        '" data-tag="' + esc(t) + '" style="padding-left:' + (6 + depth * 13) + 'px">' +
        '<span>' + (depth ? '↳ ' : '#') + esc(label) + '</span>' +
        '<span class="n">' + counts2[t] + '</span></div>';
    }).join('') || '<div class="muted" style="font-size:12px">Henüz etiket yok.</div>';

    $$('#filters .chip[data-special]').forEach(function (b) {
      b.classList.toggle('is-active', ui.filters.special === b.dataset.special);
    });
  }

  /* -------------------------------- editör -------------------------------- */

  function openNote(id, opts) {
    var n = S.get(id);
    if (!n) return;
    if (ui.currentId && ui.currentId !== id && (!opts || opts.history !== false)) {
      ui.history.push(ui.currentId);
      if (ui.history.length > 30) ui.history.shift();
    }
    ui.currentId = id;
    if (ui.view !== 'notes') setView('notes');
    renderEditor();
    renderList();
    var active = $('.note-item.is-active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function renderEditor() {
    var n = S.get(ui.currentId);
    $('#editorEmpty').hidden = !!n;
    $('#editor').hidden = !n;
    if (!n) return;

    $('#editor').dataset.mode = S.state.settings.editorMode || 'split';
    $$('#editorMode .seg-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.mode === $('#editor').dataset.mode);
    });

    if ($('#noteTitle').value !== n.title) $('#noteTitle').value = n.title;
    if ($('#noteBody').value !== n.body) $('#noteBody').value = n.body;

    // geri şeridi
    var ref = $('#refBar');
    if (ui.history.length) {
      var prev = S.get(ui.history[ui.history.length - 1]);
      ref.hidden = !prev;
      if (prev) ref.innerHTML = '<button class="btn btn-sm btn-ghost" id="btnBack">← ' +
        esc(prev.title || 'Başlıksız') + '</button><span class="muted">bağlantıdan geldin</span>';
    } else ref.hidden = true;

    renderMeta(n);
    // Künye paneli: kaynak türlerinde kendiliğinden açık, kavram/fikirde kapalı.
    var auto = ADA.typeById(n.type).fields.length > 0;
    var open = ui.metaOpen === null ? auto : ui.metaOpen;
    $('#metaPanel').hidden = !open;
    $('#btnMetaToggle').classList.toggle('is-active', open);
    renderTagBar(n);
    renderPreview(n);
    renderSide(n);
    renderStats(n);
  }

  function renderMeta(n) {
    var t = ADA.typeById(n.type);
    var html = '';
    html += '<div class="meta-field"><label>Tür</label><select data-meta="__type">' +
      ADA.TYPES.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === n.type ? ' selected' : '') + '>' + x.icon + ' ' + esc(x.label) + '</option>';
      }).join('') + '</select></div>';
    html += '<div class="meta-field"><label>Durum</label><select data-meta="__status">' +
      ADA.STATUSES.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === n.status ? ' selected' : '') + '>' + esc(x.label) + '</option>';
      }).join('') + '</select></div>';
    t.fields.forEach(function (f) {
      html += '<div class="meta-field"><label>' + esc(f.label) + '</label>' +
        '<input data-meta="' + f.key + '" type="' + (f.type === 'date' ? 'date' : 'text') + '" value="' +
        MD.escAttr(n.meta[f.key] || '') + '"></div>';
    });
    if (!t.fields.length) {
      html += '<div class="meta-field"><label>Kaynak (serbest)</label><input data-meta="source" value="' +
        MD.escAttr(n.meta.source || '') + '"></div>';
      html += '<div class="meta-field"><label>URL</label><input data-meta="url" value="' +
        MD.escAttr(n.meta.url || '') + '"></div>';
    }
    html += '<div class="meta-field" style="justify-content:flex-end"><label>&nbsp;</label>' +
      '<button class="btn btn-sm" id="btnCite">Künyeyi kopyala</button></div>';
    $('#metaPanel').innerHTML = html;
  }

  function renderTagBar(n) {
    var inline = MD.extractTags(n.body || '');
    var html = (n.tags || []).map(function (t) {
      return '<span class="tag-pill">#' + esc(t) + '<button data-rmtag="' + esc(t) + '" title="kaldır">✕</button></span>';
    }).join('');
    html += inline.filter(function (t) { return (n.tags || []).indexOf(t) < 0; }).map(function (t) {
      return '<span class="tag-pill" title="metin içinden geldi" style="opacity:.72">#' + esc(t) + '</span>';
    }).join('');
    html += '<input class="tag-add" id="tagAdd" placeholder="+ etiket (felsefe/etik)">';
    $('#tagBar').innerHTML = html;
  }

  function renderPreview(n) {
    var host = $('#preview');
    host.innerHTML = MD.render(n.body || '', { resolve: function (t) { return S.byTitle(t); } });
    hydrateFiles(host);
  }

  function renderStats(n) {
    var b = MD.balance(n.body);
    var words = plainText(n.body).split(/\s+/).filter(Boolean).length;
    var links = MD.extractLinks(n.body).length;
    $('#editorStats').textContent =
      words + ' kelime · ❝' + b.quote + ' ✎' + b.comment + ' · ' + links + ' bağlantı';
  }

  function hydrateFiles(root) {
    $$('[data-file]', root).forEach(function (el) {
      var id = el.dataset.file;
      var apply = function (url, meta) {
        if (!url) { el.innerHTML = '<span class="muted">ek bulunamadı</span>'; return; }
        if (meta && /^image\//.test(meta.type)) {
          if (el.tagName === 'FIGURE') {
            var cap = el.querySelector('figcaption');
            el.innerHTML = '<img src="' + url + '" alt="' + MD.escAttr(meta.name) + '">';
            el.appendChild(cap || document.createElement('figcaption'));
            if (!el.querySelector('figcaption').textContent) el.querySelector('figcaption').textContent = meta.name;
          } else {
            el.innerHTML = '📎 ' + esc(meta.name);
            el.dataset.url = url;
          }
        } else {
          var label = meta ? meta.name : 'ek';
          if (el.tagName === 'FIGURE') el.innerHTML = '<a class="file-card" data-url="' + url + '">📄 ' + esc(label) + '</a>';
          else { el.textContent = '📄 ' + label; el.dataset.url = url; }
        }
      };
      if (ui.fileUrls[id]) return apply(ui.fileUrls[id].url, ui.fileUrls[id].meta);
      ADA.files.get(id).then(function (rec) {
        if (!rec) return apply(null);
        var url = URL.createObjectURL(rec.blob);
        var meta = Object.assign({}, rec); delete meta.blob;
        ui.fileUrls[id] = { url: url, meta: meta };
        apply(url, meta);
      }).catch(function () { apply(null); });
    });
  }

  /* ------------------------------- sağ panel ------------------------------- */

  function contextOf(note, targetTitle) {
    var lines = (note.body || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (ADA.norm(lines[i]).indexOf(ADA.norm(targetTitle)) >= 0) {
        var raw = plainText(lines[i]);
        return raw.length > 130 ? raw.slice(0, 130) + '…' : raw;
      }
    }
    return plainText(note.body).slice(0, 100);
  }

  function renderSide(n) {
    var back = S.backlinks(n.id), out = S.outlinks(n.id), broken = S.brokenlinks(n.id);
    $('#backlinkCount').textContent = back.length;
    $('#outlinkCount').textContent = out.length;

    $('#backlinks').innerHTML = back.length ? back.map(function (b) {
      return '<div class="linkcard" data-open="' + b.id + '"><div class="t">' + esc(b.title || 'Başlıksız') +
        '</div><div class="c">' + esc(contextOf(b, n.title)) + '</div></div>';
    }).join('') : '<div class="none">Henüz kimse bu nota bağlanmadı. Ağ görünümünde yalnız duruyor.</div>';

    $('#outlinks').innerHTML = out.length ? out.map(function (b) {
      return '<div class="linkcard" data-open="' + b.id + '"><div class="t">' + esc(b.title || 'Başlıksız') + '</div></div>';
    }).join('') : '<div class="none">Bu not başka bir nota bağlanmıyor.</div>';

    $('#brokenlinks').innerHTML = broken.length ? broken.map(function (t) {
      return '<div class="linkcard" data-create="' + MD.escAttr(t) + '"><div class="t">' + esc(t) +
        '</div><div class="c">notu oluşturmak için tıkla</div></div>';
    }).join('') : '<div class="none">Yok.</div>';

    renderAttachments(n);

    var lg = S.noteLog(n.id).slice(0, 8);
    $('#noteLog').innerHTML = lg.length ? lg.map(function (e) {
      return '<div class="c muted" style="font-size:11.5px">' + relTime(e.ts) + ' · ' + esc(e.text) + '</div>';
    }).join('') : '<div class="none">Kayıt yok.</div>';
  }

  function renderAttachments(n) {
    var host = $('#attachments');
    if (!(n.files || []).length) { host.innerHTML = '<div class="none">Ek yok.</div>'; return; }
    host.innerHTML = n.files.map(function (id) {
      return '<div class="att" data-fid="' + id + '"><span class="n">yükleniyor…</span>' +
        '<button class="x" data-delfile="' + id + '" title="kaldır">✕</button></div>';
    }).join('');
    n.files.forEach(function (id) {
      ADA.files.meta(id).then(function (m) {
        var row = $('.att[data-fid="' + id + '"]', host);
        if (!row) return;
        var span = $('.n', row);
        if (!m) { span.textContent = '(kayıp dosya)'; return; }
        span.textContent = m.name + '  ·  ' + Math.max(1, Math.round(m.size / 1024)) + ' KB';
        span.dataset.openfile = id;
      });
    });
  }

  /* ------------------------------- ağ görünümü ----------------------------- */

  function renderGraph() {
    var canvas = $('#graphCanvas');
    if (!ui.graph) {
      ui.graph = new ADA.Graph(canvas);
      ui.graph.onSelect = function (n) {
        if (n.kind === 'tag') { toggleTag(n.id.replace(/^tag:/, '')); setView('notes'); return; }
        openNote(n.id);
      };
      ui.graph.onHover = function (n) {
        var info = $('#graphInfo');
        if (!n) { info.classList.remove('is-on'); return; }
        if (n.kind === 'tag') {
          info.innerHTML = '<strong>#' + esc(n.label) + '</strong><div class="muted">' + n.deg + ' not</div>';
        } else {
          var note = S.get(n.id);
          if (!note) return;
          info.innerHTML = '<strong>' + esc(note.title || 'Başlıksız') + '</strong>' +
            '<div class="muted" style="margin:3px 0">' + esc(MD.metaLine(note).slice(0, 120)) + '</div>' +
            '<div>' + esc(plainText(note.body).slice(0, 140)) + '…</div>';
        }
        info.classList.add('is-on');
      };
      window.addEventListener('resize', debounce(function () {
        if (ui.view === 'graph') ui.graph.resize();
      }, 150));
    }
    ui.graph.resize();
    buildGraphData();
    ui.graph.spread = +$('#gSpread').value;
    ui.graph.showLabels = $('#gLabels').checked;
    ui.graph.fitOnSettle = true;
    ui.graph.reheat(1);

    $('#graphLegend').innerHTML = ADA.TYPES.map(function (t) {
      return '<span class="legend-item"><span class="legend-dot" style="background:' + t.color + '"></span>' + esc(t.label) + '</span>';
    }).join('') + '<span class="legend-item"><span class="legend-dot" style="border:1.5px dashed var(--warn)"></span>bağlantısız</span>';
  }

  function buildGraphData() {
    var idx = S.linkIndex();
    var notes = S.all();
    var onlyOrphans = $('#gOrphans').checked;
    var withTags = $('#gTags').checked;

    var isOrphan = function (n) {
      return (idx.out[n.id] || []).length === 0 && (idx.in[n.id] || []).length === 0;
    };
    var use = onlyOrphans ? notes.filter(isOrphan) : notes;

    var nodes = use.map(function (n) {
      return {
        id: n.id, label: n.title || 'Başlıksız', kind: 'note',
        color: ADA.typeById(n.type).color, orphan: isOrphan(n)
      };
    });
    var links = [];
    use.forEach(function (n) {
      (idx.out[n.id] || []).forEach(function (t) { links.push({ source: n.id, target: t }); });
    });

    if (withTags) {
      var seen = {};
      use.forEach(function (n) {
        ADA.tagsOf(n).forEach(function (t) {
          var id = 'tag:' + t;
          if (!seen[id]) { seen[id] = 1; nodes.push({ id: id, label: t, kind: 'tag', color: 'transparent' }); }
          links.push({ source: n.id, target: id, kind: 'tag' });
        });
      });
    }
    ui.graph.setData(nodes, links);
  }

  /* -------------------------------- günlük --------------------------------- */

  var logFilter = 'all';

  function renderLog() {
    var log = S.state.log.slice();
    if (logFilter === 'session') log = log.filter(function (e) { return /^session/.test(e.kind); });
    else if (logFilter === 'note') log = log.filter(function (e) { return /^note/.test(e.kind); });
    else if (logFilter === 'source') log = log.filter(function (e) {
      var n = e.noteId && S.get(e.noteId);
      return n && ['makale', 'kitap', 'web', 'ders'].indexOf(n.type) >= 0;
    });

    // istatistikler
    var notes = S.all(), idx = S.linkIndex();
    var linkCount = 0;
    Object.keys(idx.out).forEach(function (k) { linkCount += idx.out[k].length; });
    var week = Date.now() - 7 * 86400000;
    var minutes = S.state.log.reduce(function (a, e) { return a + (e.minutes || 0); }, 0);
    var orph = S.orphans().length;
    $('#logStats').innerHTML = [
      ['Not', notes.length],
      ['Bu hafta eklenen', notes.filter(function (n) { return n.createdAt > week; }).length],
      ['Bağlantı', linkCount],
      ['Bağlantısız', orph],
      ['Etiket', Object.keys(S.tagCounts()).length],
      ['Toplam seans', Math.round(minutes / 60) + ' sa ' + (minutes % 60) + ' dk']
    ].map(function (p) {
      return '<div class="stat"><div class="v">' + p[1] + '</div><div class="k">' + p[0] + '</div></div>';
    }).join('');

    // güne göre grupla
    var days = {}, order = [];
    log.forEach(function (e) {
      var d = new Date(e.ts);
      var key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      if (!days[key]) { days[key] = []; order.push(key); }
      days[key].push(e);
    });

    var icons = {
      'note.create': '✚', 'note.edit': '✎', 'note.delete': '🗑', 'note.status': '◐',
      'session.start': '▶', 'session.end': '⏹', 'capture': '⚡', 'import': '⬇', 'export': '⬆'
    };

    $('#timeline').innerHTML = order.map(function (key) {
      var d = new Date(days[key][0].ts);
      var items = days[key].map(function (e) {
        var link = e.noteId && S.get(e.noteId)
          ? ' <a data-open="' + e.noteId + '">' + esc(S.get(e.noteId).title || 'Başlıksız') + '</a>' : '';
        if (e.kind === 'session.end') {
          return '<div class="tl-session"><div class="tl-item"><span class="time">' +
            new Date(e.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) +
            '</span><span class="ico">⏹</span><span class="txt"><strong>' + (e.minutes || 0) +
            ' dk seans</strong> — ' + esc(e.text) +
            ((e.touched && e.touched.length) ? ' <span class="muted">(' + e.touched.length + ' not)</span>' : '') +
            '</span></div></div>';
        }
        return '<div class="tl-item"><span class="time">' +
          new Date(e.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) +
          '</span><span class="ico">' + (icons[e.kind] || '·') + '</span>' +
          '<span class="txt">' + esc(e.text) + link + '</span></div>';
      }).join('');
      return '<div class="tl-day"><div class="tl-date">' +
        d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
        '</div>' + items + '</div>';
    }).join('') || '<div class="muted">Henüz kayıt yok. Bir seans başlat ya da not ekle.</div>';
  }

  /* ------------------------------- kaynaklar ------------------------------- */

  function renderSources() {
    var q = ($('#sourceSearch').value || '').trim();
    var notes = S.all().filter(function (n) {
      var m = n.meta || {};
      return m.author || m.source || m.url || m.doi || ['makale', 'kitap', 'web', 'ders'].indexOf(n.type) >= 0;
    });
    if (q) notes = ADA.search.run(q, notes).map(function (r) { return r.note; });

    var k = ui.sourceSort.key, dir = ui.sourceSort.dir;
    notes.sort(function (a, b) {
      var va = k === 'updatedAt' ? a.updatedAt : String((k in (a.meta || {}) ? a.meta[k] : a[k]) || '');
      var vb = k === 'updatedAt' ? b.updatedAt : String((k in (b.meta || {}) ? b.meta[k] : b[k]) || '');
      if (k === 'updatedAt') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'tr') * dir;
    });

    var cols = [['title', 'Başlık'], ['author', 'Yazar'], ['source', 'Kaynak'],
                ['date', 'Tarih'], ['type', 'Tür'], ['status', 'Durum'], ['updatedAt', 'Güncelleme']];
    $('#sourceTable').innerHTML =
      '<thead><tr>' + cols.map(function (c) {
        return '<th data-key="' + c[0] + '">' + c[1] + (ui.sourceSort.key === c[0] ? (dir > 0 ? ' ↑' : ' ↓') : '') + '</th>';
      }).join('') + '<th></th></tr></thead><tbody>' +
      notes.map(function (n) {
        var m = n.meta || {}, t = ADA.typeById(n.type);
        return '<tr data-open="' + n.id + '">' +
          '<td><strong>' + esc(n.title || 'Başlıksız') + '</strong></td>' +
          '<td>' + esc(m.author || '—') + '</td>' +
          '<td>' + esc(m.source || '—') + (m.pages ? ' <span class="muted">s. ' + esc(m.pages) + '</span>' : '') + '</td>' +
          '<td>' + esc((m.date || '').slice(0, 10) || '—') + '</td>' +
          '<td><span style="color:' + t.color + '">' + t.icon + '</span> ' + esc(t.label) + '</td>' +
          '<td>' + esc(ADA.statusLabel(n.status)) + '</td>' +
          '<td class="muted">' + relTime(n.updatedAt) + '</td>' +
          '<td>' + (m.url ? '<a href="' + MD.escAttr(m.url) + '" target="_blank" rel="noopener">↗</a>' : '') +
          ' <a data-cite="' + n.id + '" title="künyeyi kopyala">❝</a></td></tr>';
      }).join('') + '</tbody>';
    if (!notes.length) {
      $('#sourceTable').innerHTML += '<tbody><tr><td colspan="8" class="muted">Künyeli kaynak yok.</td></tr></tbody>';
    }
  }

  /* ---------------------------- çalışma masası ----------------------------- */

  function renderDesk() {
    var notes = S.all().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    var opts = function (sel) {
      return '<option value="">— not seç —</option>' + notes.map(function (n) {
        return '<option value="' + n.id + '"' + (sel === n.id ? ' selected' : '') + '>' +
          esc(n.title || 'Başlıksız') + '</option>';
      }).join('');
    };
    var d = S.state.desk;
    if (!d.right && ui.currentId) d.right = ui.currentId;
    $('#deskLeft').innerHTML = opts(d.left);
    $('#deskRight').innerHTML = opts(d.right);

    var L = S.get(d.left);
    var host = $('#deskLeftBody');
    if (L) {
      host.innerHTML = '<div class="doc-meta muted" style="font-size:11.5px;margin-bottom:10px">' +
        esc(MD.metaLine(L)) + '</div>' + MD.render(L.body || '', { resolve: function (t) { return S.byTitle(t); } });
      hydrateFiles(host);
    } else {
      host.innerHTML = '<div class="muted">Solda okuyacağın kaynağı seç.</div>';
    }
    var R = S.get(d.right);
    $('#deskRightBody').value = R ? R.body : '';
    $('#deskRightBody').disabled = !R;
  }

  /* ================================ olaylar ================================ */

  var saveBody = debounce(function () {
    var n = S.get(ui.currentId);
    if (!n) return;
    S.update(n.id, { body: $('#noteBody').value });
    renderList();
    renderSide(S.get(n.id));
    renderTagBar(S.get(n.id));
    renderFilters();
  }, 600);

  var previewLive = debounce(function () {
    var n = S.get(ui.currentId);
    if (!n) return;
    n.body = $('#noteBody').value;      // anlık önizleme için bellek içi
    renderPreview(n);
    renderStats(n);
  }, 140);

  function insertAtCursor(ta, before, after, placeholder) {
    var s = ta.selectionStart, e = ta.selectionEnd;
    var sel = ta.value.slice(s, e) || placeholder || '';
    var atLineStart = s === 0 || ta.value[s - 1] === '\n';
    var pre = (before && /^[>:\-#]/.test(before) && !atLineStart) ? '\n' : '';
    var text = pre + before + sel + (after || '');
    ta.setRangeText(text, s, e, 'end');
    if (!ta.value.slice(s, ta.selectionStart).length) ta.selectionStart = ta.selectionEnd = s + text.length;
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function toolbarAction(kind) {
    var ta = $('#noteBody');
    switch (kind) {
      case 'h2': insertAtCursor(ta, '## ', '', 'Başlık'); break;
      case 'bold': insertAtCursor(ta, '**', '**', 'kalın'); break;
      case 'italic': insertAtCursor(ta, '*', '*', 'italik'); break;
      case 'mark': insertAtCursor(ta, '==', '==', 'vurgu'); break;
      case 'quote': insertAtCursor(ta, '> ', '', 'kaynaktan ham alıntı (s. …)'); break;
      case 'comment': insertAtCursor(ta, ':: ', '', 'kendi yorumun'); break;
      case 'link': insertAtCursor(ta, '[', '](https://)', 'bağlantı'); break;
      case 'wiki': insertAtCursor(ta, '[[', ']]', 'Kavram'); break;
      case 'tag': insertAtCursor(ta, '#', '', 'etiket'); break;
      case 'list': insertAtCursor(ta, '- ', '', 'madde'); break;
      case 'code': insertAtCursor(ta, '`', '`', 'kod'); break;
      case 'file': $('#fileInput').click(); break;
    }
  }

  function toggleTag(tag) {
    var i = ui.filters.tags.indexOf(tag);
    if (i >= 0) ui.filters.tags.splice(i, 1); else ui.filters.tags.push(tag);
    renderFilters(); renderList();
  }

  function createNote(patch, focusTitle) {
    var prof = ADA.PROFILES[S.state.profile];
    var n = S.create(Object.assign({ body: prof.template }, patch || {}));
    openNote(n.id);
    renderFilters();
    if (focusTitle !== false) { $('#noteTitle').focus(); $('#noteTitle').select(); }
    return n;
  }

  function deleteCurrent() {
    var n = S.get(ui.currentId);
    if (!n) return;
    if (!confirm('“' + (n.title || 'Başlıksız') + '” silinsin mi? Bu işlem geri alınamaz.')) return;
    S.remove(n.id);
    ui.currentId = null;
    renderEditor(); renderList(); renderFilters();
    toast('Not silindi');
  }

  function renameRefs(oldTitle, newTitle) {
    if (!oldTitle || !newTitle || oldTitle === newTitle) return 0;
    var count = 0;
    S.all().forEach(function (n) {
      var re = new RegExp('\\[\\[\\s*' + oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(\\|[^\\]]*)?\\]\\]', 'g');
      if (re.test(n.body || '')) {
        n.body = n.body.replace(re, function (m, alias) { return '[[' + newTitle + (alias || '') + ']]'; });
        n.updatedAt = Date.now();
        count++;
      }
    });
    if (count) S.save();
    return count;
  }

  /* ------------------------------ hızlı not -------------------------------- */

  function openQuick() {
    $('#quickType').innerHTML = ADA.TYPES.map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === ADA.PROFILES[S.state.profile].type ? ' selected' : '') +
        '>' + t.icon + ' ' + esc(t.label) + '</option>';
    }).join('');
    $('#quickOverlay').hidden = false;
    $('#quickText').value = '';
    $('#quickSource').value = '';
    setTimeout(function () { $('#quickText').focus(); }, 20);
  }

  function saveQuick() {
    var text = $('#quickText').value.trim();
    if (!text) { $('#quickOverlay').hidden = true; return; }
    var lines = text.split('\n');
    var title = lines[0].replace(/^#+\s*/, '').slice(0, 120);
    var body = lines.slice(1).join('\n').trim();
    if (!body) { body = ''; }
    var src = $('#quickSource').value.trim();
    var meta = {};
    if (src) { if (/^(https?:\/\/|www\.)/i.test(src)) meta.url = src; else meta.source = src; }
    var n = S.create({
      title: title, body: body, type: $('#quickType').value,
      status: 'gelen', meta: meta
    }, { kind: 'capture', text: 'Hızlı not: ' + title });
    $('#quickOverlay').hidden = true;
    renderList(); renderFilters();
    if ($('#quickOpen').checked) openNote(n.id);
    toast('Kaydedildi → Gelen kutusu');
  }

  /* ---------------------------- komut paleti ------------------------------- */

  var paletteItems = [], paletteSel = 0;

  var COMMANDS = [
    { label: 'Yeni not', hint: 'Ctrl/⌘ N', run: function () { createNote(); } },
    { label: 'Hızlı not', hint: 'Ctrl/⌘ ⇧ K', run: openQuick },
    { label: 'Seans başlat / bitir', run: toggleSession },
    { label: 'Ağ görünümü', run: function () { setView('graph'); } },
    { label: 'Araştırma günlüğü', run: function () { setView('log'); } },
    { label: 'Kaynak künyeleri', run: function () { setView('sources'); } },
    { label: 'Çalışma masası', run: function () { setView('desk'); } },
    { label: 'Bağlantısız notları göster', run: function () { ui.filters.special = 'orphans'; setView('notes'); renderFilters(); renderList(); } },
    { label: 'JSON yedeği indir', run: function () { cmd('export-json'); } },
    { label: 'Tümünü Markdown dışa aktar', run: function () { cmd('export-md'); } },
    { label: 'PDF / Yazdır', run: function () { cmd('export-pdf'); } },
    { label: 'Temayı değiştir', run: cycleTheme },
    { label: 'Kısayollar', run: function () { cmd('help'); } }
  ];

  function openPalette() {
    $('#paletteOverlay').hidden = false;
    $('#paletteInput').value = '';
    renderPalette('');
    setTimeout(function () { $('#paletteInput').focus(); }, 20);
  }

  function renderPalette(q) {
    var items = [];
    var ql = ADA.fold(q.trim());
    COMMANDS.forEach(function (c) {
      if (!ql || ADA.fold(c.label).indexOf(ql) >= 0) items.push({ kind: 'cmd', label: c.label, hint: c.hint || 'komut', run: c.run });
    });
    var res = ADA.search.run(q, S.all(), 12);
    res.forEach(function (r) {
      items.push({
        kind: 'note', label: r.note.title || 'Başlıksız',
        hint: ADA.typeById(r.note.type).label, sub: r.snippet,
        run: function () { openNote(r.note.id); }
      });
    });
    if (q.trim() && !res.some(function (r) { return ADA.norm(r.note.title) === ADA.norm(q); })) {
      items.push({
        kind: 'new', label: '“' + q.trim() + '” başlıklı yeni not', hint: 'oluştur',
        run: function () { createNote({ title: q.trim(), body: '' }, false); }
      });
    }
    paletteItems = items;
    paletteSel = 0;
    drawPalette();
  }

  function drawPalette() {
    var lastKind = null;
    $('#paletteList').innerHTML = paletteItems.map(function (it, i) {
      var head = '';
      if (it.kind !== lastKind) {
        lastKind = it.kind;
        head = '<div class="palette-group">' +
          (it.kind === 'cmd' ? 'Komutlar' : it.kind === 'note' ? 'Notlar' : 'Yeni') + '</div>';
      }
      return head + '<div class="palette-item' + (i === paletteSel ? ' is-sel' : '') + '" data-i="' + i + '">' +
        '<span class="t">' + esc(it.label) + '</span>' +
        (it.sub ? '<span class="c">' + it.sub + '</span>' : '') +
        '<span class="m">' + esc(it.hint || '') + '</span></div>';
    }).join('');
    var sel = $('.palette-item.is-sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  /* -------------------------------- seans ---------------------------------- */

  function toggleSession() {
    if (S.state.session) endSession(); else {
      S.sessionStart();
      renderSessionBar();
      toast('Seans başladı — ne yaptığını şeride yazabilirsin');
    }
  }

  function endSession() {
    var s = S.state.session;
    if (!s) return;
    s.note = $('#sessionNote').value.trim();
    var r = S.sessionEnd();
    renderSessionBar();
    if (r) toast(r.minutes + ' dk · ' + r.touched + ' not — günlüğe işlendi');
    if (ui.view === 'log') renderLog();
  }

  function renderSessionBar() {
    var s = S.state.session;
    $('#sessionBar').hidden = !s;
    $('#btnSession').textContent = s ? '⏹ Seans' : '▶ Seans';
    $('#btnSession').classList.toggle('is-active', !!s);
    if (ui.sessionTimer) { clearInterval(ui.sessionTimer); ui.sessionTimer = null; }
    if (!s) return;
    $('#sessionNote').value = s.note || '';
    var tick = function () {
      var d = Date.now() - s.startedAt;
      var mm = Math.floor(d / 60000), ss = Math.floor(d / 1000) % 60;
      $('#sessionTimer').textContent = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
      $('#sessionTouched').textContent = s.touched.length + ' not';
    };
    tick();
    ui.sessionTimer = setInterval(tick, 1000);
  }

  /* ------------------------------- dışa aktarım ---------------------------- */

  function printNotes(notes, title) {
    $('#printArea').innerHTML = notes.map(function (n) {
      return '<article class="doc"><h1>' + esc(n.title || 'Başlıksız') + '</h1>' +
        '<div class="doc-meta">' + esc(MD.metaLine(n)) + '</div>' +
        MD.render(n.body || '', { resolve: function () { return true; } }) + '</article>';
    }).join('');
    document.title = (title || 'ADA') + ' — ' + new Date().toLocaleDateString('tr-TR');
    window.print();
    setTimeout(function () {
      $('#printArea').innerHTML = '';
      document.title = 'ADA · Araştırma & Düşünce Atölyesi';
    }, 800);
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function cmd(name) {
    var n = S.get(ui.currentId);
    switch (name) {
      case 'new': createNote(); break;
      case 'seed':
        if (S.all().length && !confirm('Örnek veri mevcut notlara eklenecek. Devam?')) return;
        ADA.seed(); renderAll(); toast('Örnek veri yüklendi');
        break;
      case 'wipe':
        if (!confirm('TÜM notlar, günlük ve ekler silinecek. Emin misin?')) return;
        if (!confirm('Son onay: veriler kalıcı olarak silinsin mi?')) return;
        S.wipe(); ui.currentId = null; ui.fileUrls = {}; renderAll(); toast('Her şey silindi');
        break;
      case 'export-json':
        exportFlow('JSON yedeği', 'ada-yedek-' + stamp() + '.json', S.exportJSON(), 'application/json');
        S.log('export', null, 'JSON yedeği alındı');
        break;
      case 'import-json': $('#importInput').click(); break;
      case 'export-md': {
        var all = S.all().sort(function (a, b) { return a.createdAt - b.createdAt; });
        var text = all.map(function (x) { return MD.toMarkdown(x); }).join('\n\n<!-- ─────────────── -->\n\n');
        exportFlow('Markdown dışa aktarım', 'ada-notlar-' + stamp() + '.md', text, 'text/markdown');
        S.log('export', null, all.length + ' not Markdown olarak dışa aktarıldı');
        break;
      }
      case 'export-html': {
        var html = MD.toHTMLDoc(S.all().sort(function (a, b) { return a.createdAt - b.createdAt; }), 'ADA araştırma defteri');
        exportFlow('HTML dışa aktarım', 'ada-notlar-' + stamp() + '.html', html, 'text/html');
        break;
      }
      case 'export-pdf': printNotes(filteredNotes(), 'ADA defteri'); break;
      case 'note-md': if (n) exportFlow('Markdown', slug(n.title) + '.md', MD.toMarkdown(n), 'text/markdown'); break;
      case 'note-html': if (n) exportFlow('HTML', slug(n.title) + '.html', MD.toHTMLDoc([n], n.title), 'text/html'); break;
      case 'note-print': if (n) printNotes([n], n.title); break;
      case 'note-copy':
        if (!n) break;
        copyText(MD.toMarkdown(n, { frontMatter: false }));
        break;
      case 'note-desk':
        if (!n) break;
        S.setDesk('left', n.id); setView('desk');
        break;
      case 'note-duplicate':
        if (!n) break;
        var c = S.create({
          title: n.title + ' (kopya)', body: n.body, type: n.type, status: n.status,
          tags: (n.tags || []).slice(), meta: Object.assign({}, n.meta)
        });
        openNote(c.id); renderList();
        break;
      case 'note-delete': deleteCurrent(); break;
      case 'help': showHelp(); break;
    }
  }

  function slug(t) {
    return (ADA.fold(t || 'not').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'not').slice(0, 60);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Panoya kopyalandı'); },
        function () { fallbackCopy(text); });
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    toast(ok ? 'Panoya kopyalandı' : 'Kopyalanamadı');
  }

  function showHelp() {
    var rows = [
      ['Komut paleti / arama', 'Ctrl/⌘ + K'],
      ['Hızlı not', 'Ctrl/⌘ + Shift + K'],
      ['Yeni not', 'Ctrl/⌘ + N'],
      ['Yazım / ikili / okuma', 'Ctrl/⌘ + E'],
      ['Alıntı bloğu', 'Ctrl/⌘ + Shift + A'],
      ['Yorum bloğu', 'Ctrl/⌘ + Shift + Y'],
      ['Not bağlantısı [[ ]]', 'Ctrl/⌘ + L'],
      ['Kalın / italik', 'Ctrl/⌘ + B · I'],
      ['Kaydet (otomatik zaten)', 'Ctrl/⌘ + S'],
      ['Kapat / geri', 'Esc']
    ];
    var syntax = [
      ['&gt; metin', 'ALINTI bloğu — kaynaktan ham bilgi'],
      [':: metin', 'YORUM bloğu — senin sentezin'],
      ['[[Kavram]]', 'çift yönlü not bağlantısı (yoksa tıkla oluştur)'],
      ['[[Kavram|görünen]]', 'takma adlı bağlantı'],
      ['#felsefe/etik', 'hiyerarşik etiket'],
      ['==vurgu== **kalın** *italik*', 'metin biçimleri'],
      ['- madde · 1. madde · ```kod```', 'liste ve kod'],
      ['![[dosya:ID|ad]]', 'ek dosya (📎 düğmesiyle otomatik eklenir)']
    ];
    openModal('Kısayollar ve söz dizimi',
      '<div class="help-grid"><div>' +
      '<div class="side-head">Kısayollar</div>' +
      rows.map(function (r) { return '<div class="help-row"><span>' + r[0] + '</span><kbd>' + r[1] + '</kbd></div>'; }).join('') +
      '</div><div><div class="side-head">Söz dizimi</div>' +
      syntax.map(function (r) { return '<div class="help-row"><kbd>' + r[0] + '</kbd><span class="muted" style="text-align:right">' + r[1] + '</span></div>'; }).join('') +
      '</div></div>' +
      '<p class="muted" style="margin-bottom:0">Veriler yalnızca bu tarayıcıda saklanır (localStorage + IndexedDB). ' +
      'Düzenli olarak <b>JSON yedeği</b> almayı unutma.</p>',
      [{ label: 'Kapat', primary: true, onClick: closeModal }]);
  }

  /* -------------------------------- tema ----------------------------------- */

  function applyTheme() {
    var t = S.state.settings.theme || 'auto';
    if (t === 'auto') {
      var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', t);
    }
    if (ui.graph && ui.view === 'graph') ui.graph.draw();
  }
  function cycleTheme() {
    var order = ['auto', 'light', 'dark'];
    var i = order.indexOf(S.state.settings.theme || 'auto');
    var next = order[(i + 1) % order.length];
    S.setSetting('theme', next);
    applyTheme();
    toast('Tema: ' + ({ auto: 'sistem', light: 'açık', dark: 'koyu' })[next]);
  }

  /* ================================ bağlama ================================ */

  function renderAll() {
    renderFilters();
    renderList();
    renderEditor();
    renderSessionBar();
    if (ui.view === 'log') renderLog();
    if (ui.view === 'sources') renderSources();
    if (ui.view === 'desk') renderDesk();
    if (ui.view === 'graph') { buildGraphData(); ui.graph && ui.graph.reheat(0.7); }
  }

  function bind() {
    // görünüm sekmeleri
    $('#viewNav').addEventListener('click', function (e) {
      var b = e.target.closest('.vtab');
      if (b) setView(b.dataset.view);
    });

    // arama
    var onSearch = debounce(function () {
      ui.query = $('#globalSearch').value;
      renderList();
      if (ui.view !== 'notes') setView('notes');
    }, 160);
    $('#globalSearch').addEventListener('input', onSearch);
    $('#globalSearch').addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { $('#globalSearch').value = ''; ui.query = ''; renderList(); $('#globalSearch').blur(); }
      if (e.key === 'Enter') {
        var first = $('.note-item');
        if (first) openNote(first.dataset.id);
      }
    });

    // liste
    $('#noteList').addEventListener('click', function (e) {
      var it = e.target.closest('.note-item');
      if (it) openNote(it.dataset.id);
    });
    $('#listSort').addEventListener('click', function (e) {
      var b = e.target.closest('.seg-btn');
      if (!b) return;
      ui.sort = b.dataset.sort;
      S.setSetting('sort', ui.sort);
      $$('#listSort .seg-btn').forEach(function (x) { x.classList.toggle('is-active', x === b); });
      renderList();
    });
    $('#btnNew').addEventListener('click', function () { createNote(); });

    // filtreler
    $('#filters').addEventListener('click', function (e) {
      var t = e.target.closest('[data-type]');
      if (t) { arrToggle(ui.filters.types, t.dataset.type); renderFilters(); renderList(); return; }
      var s = e.target.closest('[data-status]');
      if (s) { arrToggle(ui.filters.statuses, s.dataset.status); renderFilters(); renderList(); return; }
      var g = e.target.closest('[data-tag]');
      if (g) { toggleTag(g.dataset.tag); return; }
      var sp = e.target.closest('[data-special]');
      if (sp) {
        ui.filters.special = ui.filters.special === sp.dataset.special ? null : sp.dataset.special;
        renderFilters(); renderList();
      }
    });
    $('#btnClearFilters').addEventListener('click', function () {
      ui.filters = { types: [], statuses: [], tags: [], special: null };
      renderFilters(); renderList();
    });

    // editör: başlık
    var titleBefore = '';
    $('#noteTitle').addEventListener('focus', function () { titleBefore = $('#noteTitle').value; });
    $('#noteTitle').addEventListener('input', debounce(function () {
      if (!ui.currentId) return;
      S.update(ui.currentId, { title: $('#noteTitle').value });
      renderList();
    }, 400));
    $('#noteTitle').addEventListener('blur', function () {
      var n = S.get(ui.currentId);
      if (!n || !titleBefore || titleBefore === n.title) return;
      var refs = 0;
      S.all().forEach(function (x) {
        if (new RegExp('\\[\\[\\s*' + titleBefore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(\\|[^\\]]*)?\\]\\]').test(x.body || '')) refs++;
      });
      if (refs && confirm(refs + ' notta “' + titleBefore + '” bağlantısı var. Yeni başlığa güncellensin mi?')) {
        var c = renameRefs(titleBefore, n.title);
        toast(c + ' notta bağlantı güncellendi');
        renderAll();
      }
      titleBefore = n.title;
    });
    $('#noteTitle').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('#noteBody').focus(); }
    });

    // editör: gövde
    $('#noteBody').addEventListener('input', function () { previewLive(); saveBody(); });
    $('#noteBody').addEventListener('keydown', function (e) {
      if (e.key === 'Tab') { e.preventDefault(); insertAtCursor(this, '  ', ''); }
    });

    // mod
    $('#editorMode').addEventListener('click', function (e) {
      var b = e.target.closest('.seg-btn');
      if (!b) return;
      S.setSetting('editorMode', b.dataset.mode);
      $('#editor').dataset.mode = b.dataset.mode;
      $$('#editorMode .seg-btn').forEach(function (x) { x.classList.toggle('is-active', x === b); });
    });

    $('#btnMetaToggle').addEventListener('click', function () {
      var p = $('#metaPanel');
      p.hidden = !p.hidden;
      ui.metaOpen = !p.hidden;
      this.classList.toggle('is-active', !p.hidden);
    });
    $('#btnMore').addEventListener('click', function (e) {
      e.stopPropagation();
      $('#notePopover').hidden = !$('#notePopover').hidden;
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#notePopover') && !e.target.closest('#btnMore')) $('#notePopover').hidden = true;
      if (!e.target.closest('.menu')) $$('.menu[open]').forEach(function (m) { m.open = false; });
    });
    $('#notePopover').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cmd]');
      if (!b) return;
      $('#notePopover').hidden = true;
      cmd(b.dataset.cmd);
    });

    // künye alanları
    $('#metaPanel').addEventListener('change', onMetaChange);
    $('#metaPanel').addEventListener('input', debounce(onMetaChange, 500));
    $('#metaPanel').addEventListener('click', function (e) {
      if (e.target.id === 'btnCite') {
        var n = S.get(ui.currentId);
        if (n) copyText(MD.citation(n));
      }
    });

    // etiketler
    $('#tagBar').addEventListener('click', function (e) {
      var b = e.target.closest('[data-rmtag]');
      if (!b) return;
      var n = S.get(ui.currentId);
      if (!n) return;
      S.update(n.id, { tags: n.tags.filter(function (t) { return t !== b.dataset.rmtag; }) }, { log: false });
      renderTagBar(S.get(n.id)); renderFilters(); renderList();
    });
    $('#tagBar').addEventListener('keydown', function (e) {
      if (e.target.id !== 'tagAdd' || e.key !== 'Enter') return;
      var val = e.target.value.trim().replace(/^#/, '').replace(/\s+/g, '-');
      var n = S.get(ui.currentId);
      if (!val || !n) return;
      if (n.tags.indexOf(val) < 0) S.update(n.id, { tags: n.tags.concat([val]) }, { log: false });
      e.target.value = '';
      renderTagBar(S.get(n.id)); renderFilters(); renderList();
      setTimeout(function () { var i = $('#tagAdd'); if (i) i.focus(); }, 0);
    });

    // önizleme etkileşimleri
    ['#preview', '#deskLeftBody'].forEach(function (sel) {
      $(sel).addEventListener('click', function (e) {
        var w = e.target.closest('[data-wiki]');
        if (w) {
          e.preventDefault();
          var t = w.dataset.wiki;
          var found = S.byTitle(t);
          if (found) openNote(found.id);
          else {
            var nn = S.create({ title: t, body: ':: ' + t + ' için ilk notun…\n' });
            toast('“' + t + '” oluşturuldu');
            openNote(nn.id); renderFilters();
          }
          return;
        }
        var tg = e.target.closest('[data-tag]');
        if (tg) { e.preventDefault(); toggleTag(tg.dataset.tag); return; }
        var f = e.target.closest('[data-url]');
        if (f) {
          e.preventDefault();
          var w2 = window.open(f.dataset.url, '_blank');
          if (!w2) toast('Tarayıcı yeni sekmeyi engelledi');
        }
      });
    });

    // sağ panel
    $('#paneRight').addEventListener('click', function (e) {
      var o = e.target.closest('[data-open]');
      if (o) { openNote(o.dataset.open); return; }
      var c = e.target.closest('[data-create]');
      if (c) {
        var t = c.dataset.create;
        var n = S.create({ title: t, body: '' });
        openNote(n.id); renderFilters();
        return;
      }
      var d = e.target.closest('[data-delfile]');
      if (d) {
        var note = S.get(ui.currentId);
        var fid = d.dataset.delfile;
        if (!note || !confirm('Ek kaldırılsın mı?')) return;
        ADA.files.remove(fid);
        S.update(note.id, { files: note.files.filter(function (x) { return x !== fid; }) }, { log: false });
        renderAttachments(S.get(note.id));
        return;
      }
      var of = e.target.closest('[data-openfile]');
      if (of) {
        var id = of.dataset.openfile;
        (ui.fileUrls[id] ? Promise.resolve(ui.fileUrls[id].url) : ADA.files.url(id)).then(function (url) {
          if (!url) return toast('Dosya bulunamadı');
          var w3 = window.open(url, '_blank');
          if (!w3) toast('Tarayıcı yeni sekmeyi engelledi');
        });
      }
    });

    $('#btnAttach').addEventListener('click', function () { $('#fileInput').click(); });
    $('#fileInput').addEventListener('change', function () {
      var files = Array.prototype.slice.call(this.files || []);
      var n = S.get(ui.currentId);
      if (!n || !files.length) return;
      Promise.all(files.map(function (f) { return ADA.files.add(f, n.id); })).then(function (metas) {
        var ids = metas.map(function (m) { return m.id; });
        var ins = metas.map(function (m) { return '![[dosya:' + m.id + '|' + m.name + ']]'; }).join('\n');
        var body = ($('#noteBody').value + '\n\n' + ins + '\n').replace(/\n{3,}/g, '\n\n');
        S.update(n.id, { files: (n.files || []).concat(ids), body: body });
        $('#noteBody').value = body;
        renderEditor();
        toast(metas.length + ' ek eklendi');
      }).catch(function (err) {
        console.error(err);
        toast('Ek eklenemedi (tarayıcı depolaması kapalı olabilir)');
      });
      this.value = '';
    });

    document.body.addEventListener('click', function (e) {
      var b = e.target.closest('#editorEmpty [data-cmd]');
      if (b) cmd(b.dataset.cmd);
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('#btnBack');
      if (b) {
        var prev = ui.history.pop();
        if (prev) openNote(prev, { history: false });
      }
    });

    // üst menü
    $('.menu-panel').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cmd]');
      if (!b) return;
      $$('.menu[open]').forEach(function (m) { m.open = false; });
      cmd(b.dataset.cmd);
    });
    $('#profileSelect').addEventListener('change', function () {
      S.setProfile(this.value);
      toast('Profil: ' + ADA.PROFILES[this.value].label);
    });

    $('#btnQuick').addEventListener('click', openQuick);
    $('#btnSession').addEventListener('click', toggleSession);
    $('#btnSessionEnd').addEventListener('click', endSession);
    $('#sessionNote').addEventListener('input', function () {
      if (S.state.session) S.state.session.note = this.value;
    });
    $('#btnTheme').addEventListener('click', cycleTheme);

    // hızlı not
    $('#quickSave').addEventListener('click', saveQuick);
    $('#quickText').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveQuick(); }
      if (e.key === 'Escape') $('#quickOverlay').hidden = true;
    });
    $('#quickOverlay').addEventListener('mousedown', function (e) {
      if (e.target === this) this.hidden = true;
    });

    // palet
    $('#paletteInput').addEventListener('input', function () { renderPalette(this.value); });
    $('#paletteInput').addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); paletteSel = Math.min(paletteItems.length - 1, paletteSel + 1); drawPalette(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); paletteSel = Math.max(0, paletteSel - 1); drawPalette(); }
      else if (e.key === 'Enter') {
        var it = paletteItems[paletteSel];
        $('#paletteOverlay').hidden = true;
        if (it) it.run();
      } else if (e.key === 'Escape') $('#paletteOverlay').hidden = true;
    });
    $('#paletteList').addEventListener('click', function (e) {
      var it = e.target.closest('.palette-item');
      if (!it) return;
      $('#paletteOverlay').hidden = true;
      paletteItems[+it.dataset.i].run();
    });
    $('#paletteOverlay').addEventListener('mousedown', function (e) { if (e.target === this) this.hidden = true; });

    // modal
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalOverlay').addEventListener('mousedown', function (e) { if (e.target === this) closeModal(); });

    // araç çubuğu
    $('#toolbar').addEventListener('click', function (e) {
      var b = e.target.closest('[data-ins]');
      if (b) toolbarAction(b.dataset.ins);
    });

    // ağ denetimleri
    ['gTags', 'gOrphans'].forEach(function (id) {
      $('#' + id).addEventListener('change', function () {
        buildGraphData();
        ui.graph.fitOnSettle = true;
        ui.graph.reheat(1);
      });
    });
    $('#gLabels').addEventListener('change', function () { ui.graph.showLabels = this.checked; ui.graph.draw(); });
    $('#gSpread').addEventListener('input', function () { ui.graph.spread = +this.value; ui.graph.reheat(0.6); });
    $('#gReset').addEventListener('click', function () { ui.graph.reset(); });

    // günlük
    $('#logFilter').addEventListener('click', function (e) {
      var b = e.target.closest('.seg-btn');
      if (!b) return;
      logFilter = b.dataset.log;
      $$('#logFilter .seg-btn').forEach(function (x) { x.classList.toggle('is-active', x === b); });
      renderLog();
    });
    $('#timeline').addEventListener('click', function (e) {
      var a = e.target.closest('[data-open]');
      if (a) openNote(a.dataset.open);
    });

    // kaynaklar
    $('#sourceSearch').addEventListener('input', debounce(renderSources, 180));
    $('#sourceTable').addEventListener('click', function (e) {
      var th = e.target.closest('th[data-key]');
      if (th) {
        if (ui.sourceSort.key === th.dataset.key) ui.sourceSort.dir *= -1;
        else ui.sourceSort = { key: th.dataset.key, dir: 1 };
        renderSources();
        return;
      }
      var cite = e.target.closest('[data-cite]');
      if (cite) { e.stopPropagation(); copyText(MD.citation(S.get(cite.dataset.cite))); return; }
      if (e.target.closest('a[href]')) return;
      var tr = e.target.closest('tr[data-open]');
      if (tr) openNote(tr.dataset.open);
    });

    // çalışma masası
    $('#deskLeft').addEventListener('change', function () { S.setDesk('left', this.value); renderDesk(); });
    $('#deskRight').addEventListener('change', function () { S.setDesk('right', this.value); renderDesk(); });
    $('#deskSwap').addEventListener('click', function () {
      var d = S.state.desk, l = d.left;
      S.setDesk('left', d.right); S.setDesk('right', l);
      renderDesk();
    });
    $('#deskRightBody').addEventListener('input', debounce(function () {
      var id = S.state.desk.right;
      if (!id) return;
      S.update(id, { body: $('#deskRightBody').value });
      if (id === ui.currentId) { $('#noteBody').value = $('#deskRightBody').value; }
    }, 500));
    $('#deskQuote').addEventListener('click', function () {
      var sel = String(window.getSelection());
      var L = S.get(S.state.desk.left);
      var ta = $('#deskRightBody');
      if (!S.state.desk.right) return toast('Önce sağ panelde bir not seç');
      if (!sel.trim()) return toast('Soldan bir metin seç, sonra bu düğmeye bas');
      var cite = L ? MD.citation(L) : '';
      var block = '\n\n> ' + sel.trim().replace(/\n+/g, '\n> ') + '\n' +
        (cite ? '> — ' + cite + '\n' : '') +
        (L ? '\n:: [[' + L.title + ']] hakkında yorumun…\n' : '\n:: Yorumun…\n');
      ta.value = (ta.value + block).replace(/\n{3,}/g, '\n\n');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
      toast('Alıntı künyesiyle aktarıldı');
    });

    // içe aktarma girdisi
    var imp = document.createElement('input');
    imp.type = 'file'; imp.accept = '.json,application/json'; imp.id = 'importInput'; imp.hidden = true;
    document.body.appendChild(imp);
    imp.addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var replace = confirm('TAMAM: mevcut verilerin yerine geçsin.\nİPTAL: mevcutlara eklensin (birleştir).');
          var c = S.importJSON(String(r.result), replace ? 'replace' : 'merge');
          ui.currentId = null;
          renderAll();
          toast(c + ' not içe aktarıldı');
        } catch (err) { console.error(err); toast('Dosya okunamadı: geçerli bir ADA yedeği mi?'); }
      };
      r.readAsText(f);
      this.value = '';
    });

    // klavye
    document.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      var inField = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) ;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (e.shiftKey) openQuick(); else openPalette();
        return;
      }
      if (mod && e.key.toLowerCase() === 'n' && !e.shiftKey) { e.preventDefault(); createNote(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); S.save(); toast('Kaydedildi'); return; }
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        var order = ['write', 'split', 'read'];
        var cur = $('#editor').dataset.mode || 'split';
        var next = order[(order.indexOf(cur) + 1) % 3];
        S.setSetting('editorMode', next);
        $('#editor').dataset.mode = next;
        $$('#editorMode .seg-btn').forEach(function (x) { x.classList.toggle('is-active', x.dataset.mode === next); });
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'a' && document.activeElement === $('#noteBody')) {
        e.preventDefault(); toolbarAction('quote'); return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'y' && document.activeElement === $('#noteBody')) {
        e.preventDefault(); toolbarAction('comment'); return;
      }
      if (mod && e.key.toLowerCase() === 'l' && document.activeElement === $('#noteBody')) {
        e.preventDefault(); toolbarAction('wiki'); return;
      }
      if (mod && e.key.toLowerCase() === 'b' && document.activeElement === $('#noteBody')) {
        e.preventDefault(); toolbarAction('bold'); return;
      }
      if (mod && e.key.toLowerCase() === 'i' && document.activeElement === $('#noteBody')) {
        e.preventDefault(); toolbarAction('italic'); return;
      }
      if (e.key === 'Escape') {
        if (!$('#modalOverlay').hidden) closeModal();
        else if (!$('#paletteOverlay').hidden) $('#paletteOverlay').hidden = true;
        else if (!$('#quickOverlay').hidden) $('#quickOverlay').hidden = true;
        return;
      }
      if (!inField && e.key === '/') { e.preventDefault(); $('#globalSearch').focus(); }
    });

    window.addEventListener('beforeunload', function () { S.save(); });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () {
        if ((S.state.settings.theme || 'auto') === 'auto') applyTheme();
      });
    }
  }

  function onMetaChange(e) {
    var n = S.get(ui.currentId);
    if (!n || !e.target.dataset || !e.target.dataset.meta) return;
    var key = e.target.dataset.meta, val = e.target.value;
    if (key === '__type') {
      S.update(n.id, { type: val });
      renderMeta(S.get(n.id)); renderList(); renderFilters();
    } else if (key === '__status') {
      S.update(n.id, { status: val });
      renderList(); renderFilters();
      if (ui.view === 'log') renderLog();
    } else {
      var meta = Object.assign({}, n.meta);
      meta[key] = val;
      S.update(n.id, { meta: meta }, { log: false });
      renderList();
    }
  }

  function arrToggle(arr, v) {
    var i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1); else arr.push(v);
  }

  /* ================================= açılış ================================= */

  function init() {
    var had = S.load();
    ui.sort = S.state.settings.sort || 'updated';
    $$('#listSort .seg-btn').forEach(function (b) { b.classList.toggle('is-active', b.dataset.sort === ui.sort); });
    $('#profileSelect').value = S.state.profile;
    applyTheme();
    bind();

    if (!had || !S.all().length) {
      // ilk açılış: veri yok — kullanıcı örnek kümeyi kendisi yükler
      S.log('note.create', null, 'ADA ilk kez açıldı');
    }
    // yarım kalmış seans varsa şeridi göster
    renderAll();
    if (S.state.session) renderSessionBar();

    var first = filteredNotes()[0];
    if (first) openNote(first.id, { history: false });

    S.subscribe(function (reason) {
      if (reason === 'profile') $('#profileSelect').value = S.state.profile;
    });

    ADA.onSaveError = function () {
      toast('Kayıt yapılamadı: depolama dolu ya da kapalı. JSON yedeği al!', 6000);
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
