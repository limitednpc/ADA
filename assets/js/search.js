/* ==========================================================================
   ADA · search.js — bulanık (fuzzy) arama + alan filtreleri
   Sorgu dili:  serbest metin  #etiket  tur:makale  durum:incelenecek
                yazar:kant  kaynak:nature  once:2024-01  sonra:2023
   Türkçe aksan/İ-ı farkları yok sayılır: "gorusme" → "görüşme" bulur.
   ========================================================================== */
(function () {
  'use strict';

  var ADA = (window.ADA = window.ADA || {});

  var FOLD = { 'ı': 'i', 'İ': 'i', 'ş': 's', 'Ş': 's', 'ğ': 'g', 'Ğ': 'g',
               'ü': 'u', 'Ü': 'u', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c',
               'â': 'a', 'î': 'i', 'û': 'u' };

  function fold(s) {
    s = String(s == null ? '' : s);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      out += FOLD[ch] !== undefined ? FOLD[ch] : ch;
    }
    return out.toLowerCase();
  }
  ADA.fold = fold;

  /* ------------------------------ sorgu ayrıştırma ------------------------- */

  function parse(q) {
    var out = { text: '', words: [], tags: [], types: [], statuses: [],
                author: '', source: '', before: '', after: '' };
    var rest = [];
    String(q || '').split(/\s+/).forEach(function (tok) {
      if (!tok) return;
      var m;
      if (tok[0] === '#' && tok.length > 1) { out.tags.push(tok.slice(1)); return; }
      if ((m = /^(tur|tür|type):(.+)$/i.exec(tok))) { out.types.push(fold(m[2])); return; }
      if ((m = /^(durum|status):(.+)$/i.exec(tok))) { out.statuses.push(fold(m[2])); return; }
      if ((m = /^(yazar|author):(.+)$/i.exec(tok))) { out.author = fold(m[2]); return; }
      if ((m = /^(kaynak|source):(.+)$/i.exec(tok))) { out.source = fold(m[2]); return; }
      if ((m = /^(once|önce|before):(.+)$/i.exec(tok))) { out.before = m[2]; return; }
      if ((m = /^(sonra|after):(.+)$/i.exec(tok))) { out.after = m[2]; return; }
      rest.push(tok);
    });
    out.text = rest.join(' ');
    out.words = rest.map(fold).filter(Boolean);
    return out;
  }

  /* ------------------------------- bulanık eşleşme ------------------------- */

  // 0 = eşleşme yok. Tam alt dizi > kelime başı > dağınık harf eşleşmesi.
  function fuzzy(needle, hay) {
    if (!needle) return 0;
    var h = fold(hay), n = fold(needle);
    if (!h) return 0;
    var idx = h.indexOf(n);
    if (idx === 0) return 100;
    if (idx > 0) return h[idx - 1] === ' ' || h[idx - 1] === '/' ? 80 : 60;

    // dağınık (subsequence) eşleşme
    var hi = 0, ni = 0, score = 0, streak = 0, first = -1;
    while (hi < h.length && ni < n.length) {
      if (h[hi] === n[ni]) {
        if (first < 0) first = hi;
        streak++;
        score += 3 + streak;
        if (hi === 0 || h[hi - 1] === ' ') score += 4;
        ni++;
      } else { streak = 0; }
      hi++;
    }
    if (ni < n.length) return 0;
    var max = n.length * 8;
    return Math.max(4, Math.round((score / max) * 42)) - Math.min(10, Math.floor(first / 12));
  }

  /* --------------------------------- puanlama ------------------------------ */

  var W = { title: 6, tags: 3.4, meta: 2.4, body: 1 };

  function scoreNote(p, note) {
    // katı filtreler
    var i;
    if (p.types.length) {
      var t = fold(note.type), tl = fold(ADA.typeById(note.type).label), ok = false;
      for (i = 0; i < p.types.length; i++) if (t.indexOf(p.types[i]) === 0 || tl.indexOf(p.types[i]) === 0) ok = true;
      if (!ok) return -1;
    }
    if (p.statuses.length) {
      var s = fold(note.status), sl = fold(ADA.statusLabel(note.status)), ok2 = false;
      for (i = 0; i < p.statuses.length; i++) if (s.indexOf(p.statuses[i]) === 0 || sl.indexOf(p.statuses[i]) === 0) ok2 = true;
      if (!ok2) return -1;
    }
    var noteTags = ADA.tagsOf ? ADA.tagsOf(note) : (note.tags || []);
    if (p.tags.length) {
      for (i = 0; i < p.tags.length; i++) {
        var want = fold(p.tags[i]);
        var hit = noteTags.some(function (tg) {
          var f = fold(tg);
          return f === want || f.indexOf(want + '/') === 0 || f.indexOf(want) === 0;
        });
        if (!hit) return -1;
      }
    }
    var meta = note.meta || {};
    if (p.author && fold(meta.author || '').indexOf(p.author) === -1) return -1;
    if (p.source && fold(meta.source || '').indexOf(p.source) === -1) return -1;
    if (p.after) {
      var a = dateOf(note, meta);
      if (!a || a < p.after) return -1;
    }
    if (p.before) {
      var b = dateOf(note, meta);
      if (!b || b > p.before + '￿') return -1;
    }
    if (!p.words.length) return 1; // yalnız filtre varsa hepsi geçer

    var metaText = [meta.author, meta.source, meta.publisher, meta.doi, meta.url].filter(Boolean).join(' ');
    var tagText = noteTags.join(' ');
    var total = 0;
    for (i = 0; i < p.words.length; i++) {
      var w = p.words[i];
      var best = Math.max(
        fuzzy(w, note.title) * W.title,
        fuzzy(w, tagText) * W.tags,
        fuzzy(w, metaText) * W.meta,
        (fold(note.body || '').indexOf(w) >= 0 ? 70 : 0) * W.body
      );
      if (best <= 0) return -1; // her kelime bir yerde geçmeli (AND)
      total += best;
    }
    // tazelik primi
    var days = (Date.now() - (note.updatedAt || 0)) / 86400000;
    return total + Math.max(0, 24 - days) * 0.6;
  }

  function dateOf(note, meta) {
    if (meta && meta.date) return String(meta.date);
    return new Date(note.createdAt || Date.now()).toISOString().slice(0, 10);
  }

  /* --------------------------------- snippet ------------------------------- */

  function snippet(note, words, len) {
    len = len || 130;
    var body = (note.body || '').replace(/\s+/g, ' ').trim();
    if (!body) return '';
    var fb = fold(body), at = -1;
    for (var i = 0; i < words.length && at < 0; i++) at = fb.indexOf(words[i]);
    var start = at < 0 ? 0 : Math.max(0, at - 45);
    var text = body.slice(start, start + len);
    if (start > 0) text = '…' + text;
    if (start + len < body.length) text += '…';
    return highlight(text, words);
  }

  function highlight(text, words) {
    var raw = String(text == null ? '' : text);
    if (!words || !words.length) return ADA.md.esc(raw);
    // İşaretleme ham metin üzerinde yapılır, kaçış tek tek uygulanır:
    // böylece &amp; gibi varlıkların ortasına <b> girmez.
    var folded = fold(raw), used = new Array(raw.length), out = '', open = false;
    words.forEach(function (w) {
      if (!w) return;
      var from = 0, i;
      while ((i = folded.indexOf(w, from)) >= 0) {
        for (var k = i; k < i + w.length; k++) used[k] = true;
        from = i + w.length;
      }
    });
    for (var i2 = 0; i2 < raw.length; i2++) {
      if (used[i2] && !open) { out += '<b>'; open = true; }
      if (!used[i2] && open) { out += '</b>'; open = false; }
      out += ADA.md.esc(raw[i2]);
    }
    if (open) out += '</b>';
    return out;
  }

  /* ----------------------------------- API --------------------------------- */

  function run(query, notes, limit) {
    var p = parse(query);
    var out = [];
    notes = notes || ADA.store.all();
    for (var i = 0; i < notes.length; i++) {
      var sc = scoreNote(p, notes[i]);
      if (sc >= 0) out.push({ note: notes[i], score: sc, parsed: p });
    }
    out.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (b.note.updatedAt || 0) - (a.note.updatedAt || 0);
    });
    if (limit) out = out.slice(0, limit);
    out.forEach(function (r) { r.snippet = snippet(r.note, p.words); });
    return out;
  }

  ADA.search = { parse: parse, fuzzy: fuzzy, run: run, snippet: snippet, highlight: highlight, fold: fold };
})();
