#!/usr/bin/env node
/**
 * ADA · tek dosya derleyici
 *
 *   node tools/build-single.mjs              → dist/ada.html   (çift tıklayıp açılan tam sürüm)
 *   node tools/build-single.mjs --artifact   → dist/ada.artifact.html
 *                                              (<title> + <style> + gövde; dış kabuk yok)
 *
 * CSS ve JS dosyalarını index.html içine gömer. Hiçbir bağımlılık indirmez;
 * çıktı çevrimdışı, tek başına çalışır.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artifact = process.argv.includes('--artifact');

let html = readFileSync(join(root, 'index.html'), 'utf8');

// CSS gömme
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
  const css = readFileSync(join(root, href), 'utf8');
  return '<style>\n' + css + '\n</style>';
});

// JS gömme (sıra korunur)
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const js = readFileSync(join(root, src), 'utf8');
  return '<script>\n' + js + '\n</script>';
});

mkdirSync(join(root, 'dist'), { recursive: true });

if (!artifact) {
  const out = join(root, 'dist', 'ada.html');
  writeFileSync(out, html, 'utf8');
  report(out, html);
} else {
  const title = (html.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
  const style = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const body = (html.match(/<body>([\s\S]*)<\/body>/) || [null, ''])[1];
  const out = join(root, 'dist', 'ada.artifact.html');
  const content = title + '\n' + style + '\n' + body.trim() + '\n';
  writeFileSync(out, content, 'utf8');
  report(out, content);
}

function report(path, text) {
  console.log(path.replace(root + '/', '') + '  ·  ' + (Buffer.byteLength(text) / 1024).toFixed(1) + ' KB');
}
