/* ==========================================================================
   ADA · markdown.js — küçük ve amaca özel Markdown işleyici
   Standart Markdown'a ek olarak üç şey bilir:
     >  satır   → ALINTI bloğu (kaynaktan ham bilgi)
     :: satır   → YORUM bloğu (kendi sentezin)
     [[Kavram]] → çift yönlü not bağlantısı
     #etiket    → hiyerarşik etiket (#felsefe/etik)
     ![[dosya:ID|ad]] → yerel ek (görsel / PDF)
   ========================================================================== */
(function () {
  'use strict';

  var ADA = (window.ADA = window.ADA || {});

  var RE_WIKI = /\[\[([^\]|]+?)(?:\|([^\]]*?))?\]\]/g;
  var RE_FILE = /!\[\[dosya:([^\]|]+?)(?:\|([^\]]*?))?\]\]/g;
  var RE_TAG = /(^|<br>|[\s(【«])#([\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)/gu;
  var RE_URL = /(^|[\s(]|<br>)((?:https?:\/\/|www\.)[^\s<)"']+)/g;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  /* ------------------------------ satır içi -------------------------------- */

  function inline(text, ctx) {
    var codes = [];
    // `kod` parçalarını dokunulmaz kıl
    text = text.replace(/`([^`]+)`/g, function (m, c) {
      codes.push(c);
      return '\u0000C' + (codes.length - 1) + '\u0000';
    });

    // yerel ek (satır içi)
    text = text.replace(RE_FILE, function (m, id, name) {
      return '<a class="file-card" data-file="' + escAttr(id) + '">📎 ' + esc(name || 'ek') + '</a>';
    });

    // [[bağlantı|görünen ad]]
    text = text.replace(RE_WIKI, function (m, target, alias) {
      var t = target.trim();
      var exists = ctx && ctx.resolve ? !!ctx.resolve(t) : true;
      var href = (ctx && ctx.href) ? ctx.href(t) : null;
      return '<a class="wikilink' + (exists ? '' : ' is-broken') + '"' +
        (href ? ' href="' + escAttr(href) + '"' : '') + ' data-wiki="' +
        escAttr(t) + '" title="' + escAttr(exists ? t : t + ' — not yok, tıkla oluştur') + '">' +
        esc((alias || t).trim()) + '</a>';
    });

    // [metin](url)
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
      return '<a href="' + escAttr(url) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });

    // çıplak URL
    text = text.replace(RE_URL, function (m, pre, url) {
      if (/^<|href=/.test(pre)) return m;
      var href = /^www\./.test(url) ? 'https://' + url : url;
      return pre + '<a href="' + escAttr(href) + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });

    // #etiket
    text = text.replace(RE_TAG, function (m, pre, tag) {
      return pre + '<a class="tagref" data-tag="' + escAttr(tag) + '">#' + esc(tag) + '</a>';
    });

    text = text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
      .replace(/==([^=]+)==/g, '<mark>$1</mark>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');

    return text.replace(/\u0000C(\d+)\u0000/g, function (m, i) {
      return '<code>' + esc(codes[+i]) + '</code>';
    });
  }

  /* -------------------------------- bloklar -------------------------------- */

  function render(src, ctx) {
    ctx = ctx || {};
    if (!ctx.resolve && ADA.store) {
      ctx.resolve = function (t) { return ADA.store.byTitle(t); };
    }
    var lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [], i = 0;

    function paras(buf) {
      // blok içi metni paragraflara böl
      var html = '', para = [];
      function flush() {
        if (!para.length) return;
        html += '<p>' + inline(para.join('<br>'), ctx) + '</p>';
        para = [];
      }
      buf.forEach(function (l) {
        if (!l.trim()) flush(); else para.push(esc(l));
      });
      flush();
      return html;
    }

    while (i < lines.length) {
      var line = lines[i];

      // kod bloğu
      if (/^```/.test(line)) {
        var lang = line.slice(3).trim(), buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre><code data-lang="' + escAttr(lang) + '">' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // yalnız-satır dosya eki
      var fm = /^\s*!\[\[dosya:([^\]|]+?)(?:\|([^\]]*?))?\]\]\s*$/.exec(line);
      if (fm) {
        out.push('<figure class="file-embed" data-file="' + escAttr(fm[1]) + '">' +
          '<div class="muted">ek yükleniyor…</div>' +
          '<figcaption>' + esc(fm[2] || '') + '</figcaption></figure>');
        i++; continue;
      }

      // ALINTI
      if (/^\s*>\s?/.test(line)) {
        var q = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          q.push(lines[i].replace(/^\s*>\s?/, '')); i++;
        }
        out.push('<blockquote class="blk-quote">' + paras(q) + '</blockquote>');
        continue;
      }

      // YORUM
      if (/^\s*::\s?/.test(line)) {
        var c = [];
        while (i < lines.length && /^\s*::\s?/.test(lines[i])) {
          c.push(lines[i].replace(/^\s*::\s?/, '')); i++;
        }
        out.push('<div class="blk-comment">' + paras(c) + '</div>');
        continue;
      }

      // başlık
      var h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        var lvl = Math.min(6, h[1].length);
        out.push('<h' + lvl + '>' + inline(esc(h[2]), ctx) + '</h' + lvl + '>');
        i++; continue;
      }

      // yatay çizgi
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

      // sırasız liste
      if (/^\s*[-*+]\s+/.test(line)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          ul.push('<li>' + inline(esc(lines[i].replace(/^\s*[-*+]\s+/, '')), ctx) + '</li>'); i++;
        }
        out.push('<ul>' + ul.join('') + '</ul>');
        continue;
      }

      // sıralı liste
      if (/^\s*\d+[.)]\s+/.test(line)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          ol.push('<li>' + inline(esc(lines[i].replace(/^\s*\d+[.)]\s+/, '')), ctx) + '</li>'); i++;
        }
        out.push('<ol>' + ol.join('') + '</ol>');
        continue;
      }

      // boş satır
      if (!line.trim()) { i++; continue; }

      // paragraf
      var p = [];
      while (i < lines.length && lines[i].trim() &&
             !/^\s*(>|::|#{1,6}\s|[-*+]\s|\d+[.)]\s|```)/.test(lines[i]) &&
             !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])) {
        p.push(esc(lines[i])); i++;
      }
      if (p.length) out.push('<p>' + inline(p.join('<br>'), ctx) + '</p>');
      else i++;
    }

    return out.join('\n');
  }

  /* ------------------------------ ayıklayıcılar ---------------------------- */

  function extractLinks(src) {
    var out = [], m;
    var text = String(src || '')
      .replace(/```[\s\S]*?```/g, ' ')   // kod bloğu
      .replace(/`[^`]*`/g, ' ')          // satır içi kod
      .replace(RE_FILE, '');
    RE_WIKI.lastIndex = 0;
    while ((m = RE_WIKI.exec(text))) {
      var t = m[1].trim();
      if (t) out.push(t);
    }
    return out;
  }

  function extractTags(src) {
    var out = [], m;
    var text = String(src || '').replace(/`[^`]*`/g, ' ').replace(/^```[\s\S]*?```$/gm, ' ');
    RE_TAG.lastIndex = 0;
    while ((m = RE_TAG.exec(text))) {
      if (out.indexOf(m[2]) === -1) out.push(m[2]);
    }
    return out;
  }

  // Alıntı / yorum oranı — notun ne kadarı senin sözün?
  function balance(src) {
    var lines = String(src || '').split('\n');
    var q = 0, c = 0, o = 0;
    lines.forEach(function (l) {
      if (!l.trim()) return;
      if (/^\s*>\s?/.test(l)) q++;
      else if (/^\s*::\s?/.test(l)) c++;
      else o++;
    });
    return { quote: q, comment: c, other: o, total: q + c + o };
  }

  /* --------------------------- dışa aktarım biçimleri ---------------------- */

  function frontMatter(note) {
    var lines = ['---'];
    lines.push('title: ' + JSON.stringify(note.title || 'Başlıksız'));
    lines.push('type: ' + note.type);
    lines.push('status: ' + note.status);
    if (note.tags && note.tags.length) lines.push('tags: [' + note.tags.join(', ') + ']');
    Object.keys(note.meta || {}).forEach(function (k) {
      if (note.meta[k]) lines.push(k + ': ' + JSON.stringify(String(note.meta[k])));
    });
    lines.push('created: ' + new Date(note.createdAt).toISOString());
    lines.push('updated: ' + new Date(note.updatedAt).toISOString());
    lines.push('---', '');
    return lines.join('\n');
  }

  function toMarkdown(note, opts) {
    opts = opts || {};
    var s = '';
    if (opts.frontMatter !== false) s += frontMatter(note);
    s += '# ' + (note.title || 'Başlıksız') + '\n\n';
    s += (note.body || '').trim() + '\n';
    return s;
  }

  // Başlıktan belge içi çapa kimliği üret (dışa aktarımda kullanılır).
  function anchorId(t) {
    var map = { 'ı': 'i', 'İ': 'i', 'ş': 's', 'ğ': 'g', 'ü': 'u', 'ö': 'o', 'ç': 'c' };
    var x = String(t || '').toLocaleLowerCase('tr').replace(/[ışğüöç]/g, function (c) { return map[c] || c; });
    return 'not-' + (x.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'baslik');
  }

  function toHTMLDoc(notes, title) {
    var css =
      'body{font:16px/1.6 Georgia,serif;max-width:46em;margin:40px auto;padding:0 20px;color:#1c1a17}' +
      'h1{font-family:system-ui,sans-serif;font-size:1.5em;margin:0 0 .2em}' +
      '.doc{margin-bottom:56px;border-bottom:1px solid #e3ded4;padding-bottom:32px}' +
      '.doc-meta{font:12px/1.5 system-ui,sans-serif;color:#6b655c;margin-bottom:16px}' +
      '.blk-quote{border-left:3px solid #8a8069;background:#f4f1e8;padding:10px 14px;font-style:italic;color:#4b453a}' +
      '.blk-quote::before{content:"ALINTI";display:block;font:9px/1 system-ui,sans-serif;letter-spacing:.14em;margin-bottom:5px;font-style:normal}' +
      '.blk-comment{border-left:3px solid #2f6b76;background:#eaf2f4;padding:10px 14px;font-family:system-ui,sans-serif;font-size:.95em}' +
      '.blk-comment::before{content:"YORUM";display:block;font-size:9px;letter-spacing:.14em;color:#2f6b76;margin-bottom:5px}' +
      '.wikilink{color:#a2571f;text-decoration:none;border-bottom:1px dotted #a2571f}' +
      '.wikilink.is-broken{color:#8a857c;border-bottom-style:dashed}' +
      '.doc{scroll-margin-top:16px}' +
      '.tagref{background:#efece5;border-radius:99px;padding:0 7px;font:12px system-ui,sans-serif;color:#5b554c}' +
      'code{background:#f0ede6;padding:1px 4px;border-radius:3px;font-size:.85em}' +
      'pre{background:#f6f4ef;border:1px solid #e3ded4;padding:10px;border-radius:6px;overflow:auto}';
    // Dışa aktarılan belge kendi içinde gezilebilir olsun: her not bir çapa,
    // her [[bağlantı]] o çapaya giden bir bağlantı.
    var known = {};
    notes.forEach(function (n) { known[anchorId(n.title)] = true; });
    var ctx = {
      resolve: function (t) { return known[anchorId(t)]; },
      href: function (t) { return known[anchorId(t)] ? '#' + anchorId(t) : null; }
    };
    var body = notes.map(function (n) {
      return '<article class="doc" id="' + anchorId(n.title) + '"><h1>' + esc(n.title || 'Başlıksız') + '</h1>' +
        '<div class="doc-meta">' + esc(metaLine(n)) + '</div>' +
        render(n.body || '', ctx) + '</article>';
    }).join('\n');
    return '<!doctype html>\n<html lang="tr"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(title || 'ADA dışa aktarım') + '</title><style>' + css + '</style></head><body>' +
      '<h1 style="font-size:1.1em;color:#6b655c;font-family:system-ui,sans-serif">' + esc(title || 'ADA') + '</h1>' +
      body + '</body></html>';
  }

  function metaLine(n) {
    var t = ADA.typeById(n.type);
    var bits = [t.label];
    var m = n.meta || {};
    if (m.author) bits.push(m.author);
    if (m.source) bits.push(m.source);
    if (m.date) bits.push(m.date);
    if (m.pages) bits.push('s. ' + m.pages);
    if (m.doi) bits.push('DOI: ' + m.doi);
    if (m.url) bits.push(m.url);
    if (n.tags && n.tags.length) bits.push(n.tags.map(function (x) { return '#' + x; }).join(' '));
    bits.push('güncellendi: ' + new Date(n.updatedAt).toLocaleString('tr-TR'));
    return bits.join(' · ');
  }

  // APA benzeri kısa künye (kopyalamak için)
  function citation(n) {
    var m = n.meta || {}, out = '';
    if (m.author) out += m.author + '. ';
    var year = (m.date || '').slice(0, 4);
    if (year) out += '(' + year + '). ';
    out += (n.title || 'Başlıksız') + '. ';
    if (m.source) out += m.source + '. ';
    if (m.publisher) out += m.publisher + '. ';
    if (m.pages) out += 's. ' + m.pages + '. ';
    if (m.doi) out += 'https://doi.org/' + String(m.doi).replace(/^https?:\/\/doi\.org\//, '');
    else if (m.url) out += m.url;
    return out.trim();
  }

  ADA.md = {
    render: render,
    inline: inline,
    esc: esc,
    escAttr: escAttr,
    extractLinks: extractLinks,
    extractTags: extractTags,
    balance: balance,
    toMarkdown: toMarkdown,
    toHTMLDoc: toHTMLDoc,
    metaLine: metaLine,
    anchorId: anchorId,
    citation: citation
  };
})();
