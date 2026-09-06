/* ==========================================================================
   ADA · graph.js — düğüm ağı (canvas üzerinde kuvvet yönelimli yerleşim)
   Bağımlılık yok; ~600 düğüme kadar akıcı çalışır.
   ========================================================================== */
(function () {
  'use strict';

  var ADA = (window.ADA = window.ADA || {});

  function Graph(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.links = [];
    this.byId = {};
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
    this.alpha = 1;
    this.spread = 120;
    this.showLabels = true;
    this.running = false;
    this.hover = null;
    this.dragNode = null;
    this.panning = false;
    this.onSelect = null;
    this.onHover = null;
    this._bind();
  }

  Graph.prototype._bind = function () {
    var g = this, c = this.canvas;

    function pos(e) {
      var r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function toWorld(p) { return { x: (p.x - g.ox) / g.scale, y: (p.y - g.oy) / g.scale }; }

    c.addEventListener('mousedown', function (e) {
      var w = toWorld(pos(e));
      var n = g.pick(w.x, w.y);
      if (n) { g.dragNode = n; n.fixed = true; }
      else { g.panning = true; g.panStart = pos(e); g.panOrigin = { x: g.ox, y: g.oy }; }
      g.alpha = Math.max(g.alpha, 0.35);
      g.start();
    });

    window.addEventListener('mousemove', function (e) {
      if (g.dragNode) {
        var w = toWorld(pos(e));
        g.dragNode.x = w.x; g.dragNode.y = w.y; g.dragNode.vx = 0; g.dragNode.vy = 0;
        g.alpha = Math.max(g.alpha, 0.25); g.start();
        return;
      }
      if (g.panning) {
        var p = pos(e);
        g.ox = g.panOrigin.x + (p.x - g.panStart.x);
        g.oy = g.panOrigin.y + (p.y - g.panStart.y);
        g.draw();
        return;
      }
      if (!c.isConnected || !c.offsetParent) return;
      var wp = toWorld(pos(e));
      var hit = g.pick(wp.x, wp.y);
      if (hit !== g.hover) {
        g.hover = hit;
        c.style.cursor = hit ? 'pointer' : 'grab';
        if (g.onHover) g.onHover(hit);
        g.draw();
      }
    });

    window.addEventListener('mouseup', function () {
      if (g.dragNode) { g.dragNode.fixed = false; g.dragNode = null; }
      g.panning = false;
    });

    c.addEventListener('click', function (e) {
      var w = toWorld(pos(e));
      var n = g.pick(w.x, w.y);
      if (n && g.onSelect) g.onSelect(n);
    });

    c.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = pos(e);
      var factor = Math.exp(-e.deltaY * 0.0016);
      var next = Math.min(4, Math.max(0.15, g.scale * factor));
      // imlecin altındaki nokta sabit kalsın
      g.ox = p.x - (p.x - g.ox) * (next / g.scale);
      g.oy = p.y - (p.y - g.oy) * (next / g.scale);
      g.scale = next;
      g.draw();
    }, { passive: false });
  };

  Graph.prototype.setData = function (nodes, links) {
    var old = this.byId;
    var map = {};
    var w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 600;
    this.nodes = nodes.map(function (n, i) {
      var prev = old[n.id];
      var a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      var node = Object.assign({
        vx: 0, vy: 0,
        x: prev ? prev.x : w / 2 + Math.cos(a) * (80 + Math.random() * 160),
        y: prev ? prev.y : h / 2 + Math.sin(a) * (80 + Math.random() * 160),
        deg: 0
      }, n);
      map[n.id] = node;
      return node;
    });
    this.byId = map;
    var self = this;
    this.links = links.filter(function (l) {
      return map[l.source] && map[l.target] && l.source !== l.target;
    }).map(function (l) {
      var s = map[l.source], t = map[l.target];
      s.deg++; t.deg++;
      return { s: s, t: t, kind: l.kind || 'link' };
    });
    this.nodes.forEach(function (n) {
      n.r = n.kind === 'tag' ? 4 + Math.min(9, n.deg) : 5 + Math.min(13, n.deg * 1.6);
      if (!self.byId[n.id]) self.byId[n.id] = n;
    });
    this.alpha = 1;
    this.start();
  };

  Graph.prototype.pick = function (x, y) {
    for (var i = this.nodes.length - 1; i >= 0; i--) {
      var n = this.nodes[i];
      var dx = n.x - x, dy = n.y - y;
      var r = (n.r + 6);
      if (dx * dx + dy * dy <= r * r) return n;
    }
    return null;
  };

  Graph.prototype.resize = function () {
    var c = this.canvas;
    var dpr = window.devicePixelRatio || 1;
    var w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  };

  Graph.prototype.reset = function () {
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!this.nodes.length) { this.scale = 1; this.ox = 0; this.oy = 0; this.draw(); return; }
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    this.nodes.forEach(function (n) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    });
    var pad = 70;
    var sx = (w - pad * 2) / Math.max(1, maxX - minX);
    var sy = (h - pad * 2) / Math.max(1, maxY - minY);
    this.scale = Math.min(2, Math.max(0.2, Math.min(sx, sy)));
    this.ox = w / 2 - ((minX + maxX) / 2) * this.scale;
    this.oy = h / 2 - ((minY + maxY) / 2) * this.scale;
    this.draw();
  };

  Graph.prototype.step = function () {
    var nodes = this.nodes, links = this.links;
    var n = nodes.length;
    if (!n) return;
    var w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 600;
    var cx = w / 2, cy = h / 2;
    var k = this.spread;
    var repel = k * k * 0.9;

    // itme (her çift)
    for (var i = 0; i < n; i++) {
      var a = nodes[i];
      for (var j = i + 1; j < n; j++) {
        var b = nodes[j];
        var dx = a.x - b.x, dy = a.y - b.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < 1) { d2 = 1; dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); }
        if (d2 > 640000) continue; // uzaktakileri boşver
        var f = repel / d2;
        var d = Math.sqrt(d2);
        var fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
    }

    // yay (bağlantılar)
    for (var l = 0; l < links.length; l++) {
      var s = links[l].s, t = links[l].t;
      var ddx = t.x - s.x, ddy = t.y - s.y;
      var dist = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
      var force = (dist - k) * 0.045;
      var ux = (ddx / dist) * force, uy = (ddy / dist) * force;
      s.vx += ux; s.vy += uy; t.vx -= ux; t.vy -= uy;
    }

    // merkeze çekim
    for (var m = 0; m < n; m++) {
      var p = nodes[m];
      p.vx += (cx - p.x) * 0.0035;
      p.vy += (cy - p.y) * 0.0035;
      if (p.fixed) { p.vx = 0; p.vy = 0; continue; }
      p.vx *= 0.86; p.vy *= 0.86;
      var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      var cap = 14;
      if (sp > cap) { p.vx = p.vx / sp * cap; p.vy = p.vy / sp * cap; }
      p.x += p.vx * this.alpha;
      p.y += p.vy * this.alpha;
    }
    this.alpha *= 0.985;
  };

  Graph.prototype.draw = function () {
    var ctx = this.ctx, c = this.canvas;
    var w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    var css = getComputedStyle(document.body);
    var line = css.getPropertyValue('--line-2').trim() || '#ccc';
    var fg = css.getPropertyValue('--fg-2').trim() || '#333';
    var fg3 = css.getPropertyValue('--fg-3').trim() || '#888';
    var accent = css.getPropertyValue('--accent').trim() || '#a2571f';
    var warn = css.getPropertyValue('--warn').trim() || '#b8860b';

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);

    // bağlantılar
    ctx.lineWidth = 1 / this.scale;
    for (var i = 0; i < this.links.length; i++) {
      var l = this.links[i];
      var active = this.hover && (l.s === this.hover || l.t === this.hover);
      ctx.strokeStyle = active ? accent : line;
      ctx.globalAlpha = active ? 0.95 : (l.kind === 'tag' ? 0.28 : 0.55);
      if (l.kind === 'tag') ctx.setLineDash([3 / this.scale, 3 / this.scale]);
      ctx.beginPath();
      ctx.moveTo(l.s.x, l.s.y);
      ctx.lineTo(l.t.x, l.t.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;

    // düğümler
    for (var j = 0; j < this.nodes.length; j++) {
      var n = this.nodes[j];
      var isHover = n === this.hover;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = n.kind === 'tag' ? 'transparent' : (n.color || accent);
      ctx.globalAlpha = n.dim ? 0.28 : 1;
      ctx.fill();
      if (n.orphan) {
        ctx.setLineDash([2.6 / this.scale, 2.6 / this.scale]);
        ctx.strokeStyle = warn;
        ctx.lineWidth = 1.6 / this.scale;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (n.kind === 'tag') {
        ctx.strokeStyle = fg3; ctx.lineWidth = 1.2 / this.scale;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.stroke();
      }
      if (isHover) {
        ctx.strokeStyle = accent; ctx.lineWidth = 2 / this.scale;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 5, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if ((this.showLabels && this.scale > 0.55) || isHover) {
        var fs = Math.max(9, 11 / this.scale);
        ctx.font = fs + 'px -apple-system, system-ui, sans-serif';
        ctx.fillStyle = isHover ? fg : fg3;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        var label = n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label;
        ctx.fillText(label, n.x, n.y + n.r + 3 / this.scale);
      }
    }
    ctx.restore();
  };

  Graph.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    var g = this;
    function frame() {
      if (!g.running) return;
      if (g.alpha > 0.008 || g.dragNode) { g.step(); g.draw(); }
      else {
        g.running = false;
        // Yerleşim durulunca bir kez çerçeveye sığdır.
        if (g.fitOnSettle) { g.fitOnSettle = false; g.reset(); }
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  Graph.prototype.stop = function () { this.running = false; };
  Graph.prototype.reheat = function (a) { this.alpha = Math.max(this.alpha, a || 0.8); this.start(); };

  ADA.Graph = Graph;
})();
