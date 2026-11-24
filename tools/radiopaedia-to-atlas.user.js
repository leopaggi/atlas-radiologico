// ==UserScript==
// @name         Radiopaedia → Atlas Radiológico (MVP, metadata-only)
// @namespace    atlas-radiologico
// @version      1.5.3
// @description  Adiciona um botão discreto "📥 Enviar ao Atlas" nas páginas de casos do Radiopaedia. Coleta SOMENTE metadados visíveis (título, URL, idade/sexo, modalidade, apresentação) e entrega o caso à aba do Atlas já aberta (ou abre o Atlas com o payload no fragmento da URL). O botão "📸 Enviar com imagens" (1.5.0) também baixa as imagens do caso (uma por série), reduz cada uma e entrega ao Atlas só para APROVAÇÃO — nada é salvo sem você. Não traduz, não inventa campos.
// @author       Atlas Radiológico
// @match        https://radiopaedia.org/cases/*
// @match        https://www.radiopaedia.org/cases/*
// @match        https://leopaggi.github.io/atlas-radiologico/*
// @homepageURL  https://github.com/leopaggi/atlas-radiologico
// @updateURL    https://raw.githubusercontent.com/leopaggi/atlas-radiologico/main/tools/radiopaedia-to-atlas.user.js
// @downloadURL  https://raw.githubusercontent.com/leopaggi/atlas-radiologico/main/tools/radiopaedia-to-atlas.user.js
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_xmlhttpRequest
// @connect      prod-images-static.radiopaedia.org
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // URL alvo do Atlas: sempre o site publicado.
  // ---------------------------------------------------------------------------
  var ATLAS_URL = 'https://leopaggi.github.io/atlas-radiologico/';

  var MAX_FIELD = 500;

  function cleanText(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD);
  }

  function firstText(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);
        if (el && el.innerText && el.innerText.trim()) return cleanText(el.innerText);
      } catch (e) { /* seletor inválido neste DOM — tenta o próximo */ }
    }
    return '';
  }

  // Texto da seção que segue um cabeçalho (ex: "Presentation", "Patient Data").
  function sectionTextAfterHeading(pattern) {
    try {
      var heads = document.querySelectorAll('h1,h2,h3,h4,.case-section-title,.section-title');
      for (var i = 0; i < heads.length; i++) {
        var t = (heads[i].innerText || '').trim();
        if (pattern.test(t)) {
          var node = heads[i].nextElementSibling;
          var parts = [];
          var guard = 0;
          while (node && guard < 6 && !/^H[1-4]$/.test(node.tagName || '')) {
            if (node.innerText && node.innerText.trim()) parts.push(node.innerText.trim());
            node = node.nextElementSibling;
            guard++;
          }
          if (parts.length) return cleanText(parts.join(' '));
        }
      }
    } catch (e) { /* DOM inesperado — segue sem este campo */ }
    return '';
  }

  // PROTEÇÃO 083 — o título NUNCA pode vir de um <h1> genérico: em algumas
  // páginas o primeiro <h1> do DOM é o nome do usuário/autor (bug real:
  // "Leonardo Paggi Andrade" virava o título do caso). O slug da URL do caso
  // (/cases/<slug>) é derivado do título clínico pelo próprio Radiopaedia e
  // serve de âncora: candidato sem nenhum termo em comum com o slug, ou igual
  // a um nome de autor/perfil, é descartado.
  // 091f: helper CENTRAL — remove o branding do Radiopaedia do FIM do título
  // ("| Radiology Case | Radiopaedia.org", "| Radiopaedia.org",
  // "- Radiology Case | Radiopaedia.org"...), tolerando caracteres invisíveis,
  // barra de largura total e maiúsculas/minúsculas. Não toca no meio do título.
  // O Atlas aplica a MESMA regra ao receber (userscripts antigos instalados).
  function normalizeRadiopaediaCaseTitle(title) {
    var t = String(title || '')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[\uFF5C\u00A6]/g, '|')
      .replace(/\s+/g, ' ')
      .trim();
    var prev;
    do {
      prev = t;
      t = t.replace(/\s*[|–—-]\s*Radiopaedia(?:\.org)?\s*$/i, '')
        .replace(/\s*[|–—-]\s*Radiology\s+(?:Case|Reference\s+Article)\s*$/i, '')
        .trim();
    } while (t !== prev);
    return t;
  }

  function stripSiteSuffix(s) {
    return cleanText(normalizeRadiopaediaCaseTitle(s));
  }

  function titleTokens(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/).filter(function (t) { return t.length >= 3; });
  }

  // "/cases/polyethylene-wear-1" -> "Polyethylene wear" ('' se o slug não tem palavra).
  function slugTitleFromUrl(url) {
    try {
      var m = /\/cases\/([^\/?#]+)/.exec(new URL(url).pathname);
      if (!m) return '';
      var words = decodeURIComponent(m[1]).replace(/-\d+$/, '').split('-').filter(Boolean);
      if (!words.some(function (w) { return /[a-z]{3,}/i.test(w); })) return '';
      var t = words.join(' ');
      return t.charAt(0).toUpperCase() + t.slice(1);
    } catch (e) { return ''; }
  }

  // Nomes de autor/perfil visíveis na página — nunca podem virar título.
  function authorNames() {
    var out = [];
    var sels = ['meta[name="author"]', '[rel="author"]', 'a[href*="/users/"]', '.author', '.byline', '.user-name', '.username'];
    for (var i = 0; i < sels.length; i++) {
      try {
        var els = document.querySelectorAll(sels[i]);
        for (var j = 0; j < els.length; j++) {
          var v = cleanText((els[j].getAttribute && els[j].getAttribute('content')) || els[j].innerText || '');
          if (v) out.push(v.toLowerCase());
        }
      } catch (e) { /* seletor inválido neste DOM — segue */ }
    }
    return out;
  }

  function extractTitle() {
    var candidates = [];
    try {
      var og = document.querySelector('meta[property="og:title"]');
      if (og) candidates.push(og.getAttribute('content') || '');
    } catch (e) {}
    candidates.push(firstText(['h1.case-title', '.case-title h1', 'h1.header-title']));
    candidates.push(document.title || '');
    var slugTitle = slugTitleFromUrl(extractSourceUrl());
    var slugTokens = titleTokens(slugTitle);
    var authors = authorNames();
    for (var i = 0; i < candidates.length; i++) {
      var c = stripSiteSuffix(candidates[i]);
      if (!c) continue;
      if (authors.indexOf(c.toLowerCase()) >= 0) continue;
      if (slugTokens.length && !titleTokens(c).some(function (t) { return slugTokens.indexOf(t) >= 0; })) continue;
      return c.slice(0, 300);
    }
    // Sem candidato confiável: o slug do próprio caso (dado real da URL) ou nada.
    return slugTitle.slice(0, 300);
  }

  function extractSourceUrl() {
    try {
      var canon = document.querySelector('link[rel="canonical"]');
      if (canon && canon.getAttribute('href')) return canon.getAttribute('href').split('?')[0];
    } catch (e) {}
    return String(window.location.href).split('?')[0];
  }

  function extractPatientData() {
    var out = { age: '', sex: '' };
    var blob = sectionTextAfterHeading(/patient\s*data/i) || '';
    if (!blob) {
      try { blob = cleanText(document.body ? document.body.innerText.slice(0, 20000) : ''); } catch (e) {}
    }
    var mAge = blob.match(/Age:\s*([0-9]{1,3})/i);
    if (mAge) out.age = mAge[1];
    var mSex = blob.match(/Gender:\s*(Male|Female)/i);
    if (mSex) out.sex = mSex[1].charAt(0).toUpperCase() + mSex[1].slice(1).toLowerCase();
    return out;
  }

  function extractModality() {
    var blob = '';
    try { blob = cleanText(document.body ? document.body.innerText.slice(0, 20000) : ''); } catch (e) {}
    var m = blob.match(/\b(x-ray|CT|MRI|ultrasound|mammograph\w*|angiograph\w*|PET(?:-CT|-CT)?|fluoroscopy|nuclear medicine)\b/i);
    // Sem tradução: devolve o termo como aparece na página.
    return m ? m[1].slice(0, 60) : '';
  }

  function extractPresentation() {
    return sectionTextAfterHeading(/presentation/i);
  }

  // Monta o payload EXATO que o Atlas valida (ver validateExternalImportPayload
  // no index.html). Campos ausentes são omitidos — nunca inventados.
  function buildExternalPayload(parts) {
    var payload = { source: 'Radiopaedia' };
    var title = normalizeRadiopaediaCaseTitle(parts.title); // 091f: payload NUNCA leva o branding
    if (title) payload.title = title.slice(0, 300);
    if (parts.sourceUrl) payload.sourceUrl = String(parts.sourceUrl).slice(0, 500);
    if (parts.patientAge) payload.patientAge = String(parts.patientAge).slice(0, 20);
    if (parts.patientSex) payload.patientSex = String(parts.patientSex).slice(0, 20);
    if (parts.modality) payload.modality = String(parts.modality).slice(0, 60);
    if (parts.presentation) payload.presentation = String(parts.presentation).slice(0, MAX_FIELD);
    return payload;
  }

  function encodePayload(payload) {
    var json = JSON.stringify(payload);
    var bytes = new TextEncoder().encode(json);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return encodeURIComponent(btoa(bin));
  }

  function collectCase() {
    var patient = extractPatientData();
    return buildExternalPayload({
      title: extractTitle(),
      sourceUrl: extractSourceUrl(),
      patientAge: patient.age,
      patientSex: patient.sex,
      modality: extractModality(),
      presentation: extractPresentation()
    });
  }


  /* 1.5.0 — IMAGENS DO CASO (só para aprovação no Atlas).
     Coleta as miniaturas de cada série do caso, converte para a versão grande
     (dr-thumb -> dr-original; visualizador antigo: _thumb.jpeg -> .jpg), baixa
     pelo navegador do usuário, REDUZ (lado maior 800px, JPEG, ~110 KB cada) e
     entrega ao Atlas junto com o caso. O Atlas abre o construtor de quadro com
     elas; nada é salvo/enviado ao Cloudinary antes da aprovação. */
  var IMG_MAX_COUNT = 8;
  var IMG_SIDES = [800, 680, 580, 500];
  var IMG_TARGET_CHARS = 110 * 1024;

  function radiopaediaFullImageUrl(src) {
    var s = String(src || '');
    var m = /^(https:\/\/prod-images-static\.radiopaedia\.org\/images\/\d+\/)dr-thumb\.(?:jpg|jpeg|png)$/i.exec(s);
    if (m) return m[1] + 'dr-original.jpg';
    m = /^(https:\/\/prod-images-static\.radiopaedia\.org\/images\/\d+\/[0-9a-f]+)_thumb\.jpe?g$/i.exec(s);
    if (m) return m[1] + '.jpg';
    return '';
  }

  // 1.5.1 — qualquer imagem de caso (prod-images-static/images/<id>/<arquivo>):
  // dr-thumb/_thumb viram a versão grande; "_gallery" sobe para "_big_gallery";
  // o resto (ex.: "0..png", "x._big_gallery.jpeg", "<hash>.jpg") vale como está.
  // Banners e imagens de interface (fora de /images/<id>/) são ignorados.
  function radiopaediaImageId(src) {
    var m = /^https:\/\/prod-images-static\.radiopaedia\.org\/images\/(\d+)\/[^\/?#]+$/i.exec(String(src || ''));
    return m ? m[1] : '';
  }
  function radiopaediaBestImageUrl(src) {
    var s = String(src || '');
    if (!radiopaediaImageId(s)) return '';
    var full = radiopaediaFullImageUrl(s);
    if (full) return full;
    if (/\._gallery\.jpe?g$/i.test(s)) return s.replace(/\._gallery\.jpe?g$/i, '._big_gallery.jpeg');
    return s;
  }

  // Varre os blocos de exame (.case-study). Rótulo = título do exame só quando
  // o caso tem mais de um exame (ex.: "FU US after 7 days"); com um exame só o
  // rótulo fica vazio (o usuário escolhe a sequência no Atlas).
  function collectImageCandidates(root) {
    var items = [], seen = {}, total = 0, studies = [];
    try { studies = root.querySelectorAll('.case-study'); } catch (e) {}
    var multi = studies.length > 1;
    for (var i = 0; i < studies.length; i++) {
      try {
        var mod0 = studies[i].querySelector('.study-modality');
        if (mod0 && SKIP_MODALITIES.test(mod0.innerText || '')) continue;
      } catch (e) {}
      var label = '';
      if (multi) {
        try {
          var h = studies[i].querySelector('h2');
          label = cleanText(h && h.innerText ? h.innerText : '').slice(0, 40);
          if (!label) { var mo = studies[i].querySelector('.study-modality'); label = cleanText(mo && mo.innerText ? mo.innerText : '').slice(0, 40); }
        } catch (e) {}
      }
      var imgs = [];
      try { imgs = studies[i].querySelectorAll('img'); } catch (e) {}
      for (var j = 0; j < imgs.length; j++) {
        var src = imgs[j].currentSrc || (imgs[j].getAttribute && imgs[j].getAttribute('src')) || '';
        var id = radiopaediaImageId(src);
        var full = radiopaediaBestImageUrl(src);
        if (!id || !full || seen[id]) continue;
        seen[id] = true;
        total++;
        if (items.length < IMG_MAX_COUNT) items.push({ full: full, fallback: String(src), seq: label });
      }
    }
    return { items: items, total: total };
  }


  /* 1.5.2 — LISTA COMPLETA DO EXAME. A página só mostra a "capa" de cada exame;
     as demais imagens carregam ao rolar. O próprio site busca a lista inteira em
     /studies/<id>/annotated_viewer_json.json (study.series[].frames[] + o nome
     do arquivo em encodings.thumbnailed_files[i].original). Lemos essa lista,
     pulamos exames que não são de imagem (patologia, fotos, ilustrações) e
     escolhemos no máximo 8 imagens, espaçadas ao longo do exame. */

  /* 1.5.3 — DESCRIÇÃO DO QUADRO. Junta, em texto simples, o que o Radiopaedia
     escreve sobre as imagens (achados + legenda de cada exame, vindos do mesmo
     JSON) e a discussão do caso (seção "Discussion" da página, quando existe),
     mais a linha de fonte/crédito. Vai para o campo "Descrição geral do
     quadro" (editável antes de salvar). Texto continua em inglês, como na fonte. */
  var DESC_BLOCK_MAX = 1500;
  var DESC_TOTAL_MAX = 4000;

  function htmlToPlainText(h) {
    var t = String(h == null ? '' : h)
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'").replace(/&amp;/gi, '&');
    return t.split('\n').map(function (l) { return l.replace(/[ \t\u00a0]+/g, ' ').trim(); })
      .filter(function (l) { return l; }).join('\n');
  }

  function clipText(t, max) {
    t = String(t || '');
    if (t.length <= max) return t;
    var cut = t.slice(0, max);
    var sp = cut.lastIndexOf(' ');
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut) + '…';
  }

  // Texto (com parágrafos) da seção que segue o cabeçalho; '' se não houver.
  function sectionTextWithBreaks(pattern, root) {
    try {
      var heads = (root || document).querySelectorAll('h1,h2,h3,h4,.case-section-title,.section-title');
      for (var i = 0; i < heads.length; i++) {
        var t = (heads[i].innerText || '').trim();
        if (!pattern.test(t)) continue;
        var node = heads[i].nextElementSibling, parts = [], guard = 0;
        while (node && guard < 8 && !/^H[1-4]$/.test(node.tagName || '')) {
          var it = (node.innerText || '').trim();
          if (it) parts.push(it.split('\n').map(function (l) { return l.replace(/[ \t\u00a0]+/g, ' ').trim(); })
            .filter(function (l) { return l; }).join('\n'));
          node = node.nextElementSibling; guard++;
        }
        if (parts.length) return parts.join('\n');
      }
    } catch (e) { /* DOM inesperado — segue sem este campo */ }
    return '';
  }

  // blocks: {findings, caption, modality}[]; discussion: texto; src: {title,url,author}
  function buildImageDescription(blocks, discussion, src) {
    var out = [];
    (blocks || []).forEach(function (b) {
      var tag = b.modality ? ' (' + b.modality + ')' : '';
      var f = clipText(htmlToPlainText(b.findings), DESC_BLOCK_MAX);
      var c = clipText(htmlToPlainText(b.caption), DESC_BLOCK_MAX);
      if (f) out.push('**Achados de imagem' + tag + ':** ' + f);
      if (c && c !== f) out.push('**Legenda' + tag + ':** ' + c);
    });
    var d = clipText(String(discussion || '').trim(), DESC_BLOCK_MAX);
    if (d) out.push('**Discussão:** ' + d);
    var head = out.join('\n\n');
    var fonte = '';
    if (src && src.url) {
      fonte = 'Fonte: Radiopaedia' + (src.title ? ' — ' + src.title : '') + (src.author ? ', ' + src.author : '') + ' — ' + src.url;
    }
    if (!head) return '';
    head = clipText(head, DESC_TOTAL_MAX - (fonte ? fonte.length + 2 : 0));
    return fonte ? head + '\n\n' + fonte : head;
  }

  var IMG_BASE = 'https://prod-images-static.radiopaedia.org/images/';
  var SKIP_MODALITIES = /patholog|histolog|photograph|illustration|diagram/i;

  // n quadros espaçados (com n=1, o quadro "current" ou o do meio)
  function pickFrames(frames, n) {
    if (!frames || !frames.length || n < 1) return [];
    if (n === 1) {
      for (var i = 0; i < frames.length; i++) if (frames[i] && frames[i].current) return [frames[i]];
      return [frames[Math.floor((frames.length - 1) / 2)]];
    }
    if (frames.length <= n) return frames.slice();
    var out = [], used = {};
    for (var k = 0; k < n; k++) {
      var idx = Math.round(k * (frames.length - 1) / (n - 1));
      if (!used[idx]) { used[idx] = true; out.push(frames[idx]); }
    }
    return out;
  }

  function safeImageFile(name) { return /^[A-Za-z0-9._-]+$/.test(String(name || '')) ? String(name) : ''; }

  // JSON de um exame -> { items:[{full,fallback,seq}], total, skipped }
  function imagesFromStudyJson(j, maxTotal, label) {
    var st = j && j.study;
    var res = { items: [], total: 0, skipped: false };
    if (!st || !Array.isArray(st.series)) return res;
    if (SKIP_MODALITIES.test(String(st.modality || ''))) { res.skipped = true; return res; }
    var series = st.series.slice(0, maxTotal);
    var per = Math.max(1, Math.floor(maxTotal / Math.max(1, series.length)));
    for (var s = 0; s < series.length; s++) {
      var se = series[s] || {};
      var frames = Array.isArray(se.frames) ? se.frames : [];
      var files = (se.encodings && Array.isArray(se.encodings.thumbnailed_files)) ? se.encodings.thumbnailed_files : [];
      res.total += frames.length;
      var picked = pickFrames(frames, per);
      for (var i = 0; i < picked.length; i++) {
        var f = picked[i];
        if (!f || !/^\d+$/.test(String(f.id))) continue;
        var file = files[frames.indexOf(f)] || {};
        var orig = safeImageFile(file.original) || 'dr-original.jpg';
        var small = safeImageFile(file.small) || safeImageFile(file.thumb);
        res.items.push({
          full: IMG_BASE + f.id + '/' + orig,
          fallback: small ? IMG_BASE + f.id + '/' + small : '',
          seq: label || ''
        });
      }
    }
    return res;
  }

  function studyIdsFromPage(root) {
    var ids = [];
    try {
      var els = root.querySelectorAll('.main-study-desc');
      for (var i = 0; i < els.length; i++) {
        var m = /^study-(\d+)$/.exec(els[i].id || '');
        if (m && ids.indexOf(m[1]) < 0) ids.push(m[1]);
      }
    } catch (e) {}
    return ids;
  }

  // Promise -> {items,total} | null (null = não deu; usa a coleta antiga da página)
  function collectImagesViaStudyJson(root) {
    var ids = studyIdsFromPage(root);
    if (!ids.length || typeof fetch !== 'function') return Promise.resolve(null);
    return Promise.all(ids.map(function (id) {
      return fetch('/studies/' + id + '/annotated_viewer_json.json?lang=us', { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch(function () { return null; });
    })).then(function (jsons) {
      if (jsons.every(function (j) { return !j; })) return null;
      var kept = jsons.filter(function (j) { return j && j.study && !SKIP_MODALITIES.test(String(j.study.modality || '')); });
      var budget = Math.max(1, Math.floor(IMG_MAX_COUNT / Math.max(1, kept.length)));
      var items = [], total = 0, blocks = [];
      kept.forEach(function (j) {
        blocks.push({ findings: j.study.findings, caption: j.study.caption, modality: kept.length > 1 ? cleanText(String(j.study.modality || '')) : '', author: j.study.contributor_login || '' });
        var label = kept.length > 1 ? cleanText(String(j.study.modality || '')).slice(0, 40) : '';
        var r = imagesFromStudyJson(j, budget, label);
        total += r.total;
        items = items.concat(r.items);
      });
      return { items: items.slice(0, IMG_MAX_COUNT), total: total, blocks: blocks };
    });
  }

  function fetchImageBlob(url) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'GET', url: url, responseType: 'blob', timeout: 30000,
        onload: function (r) { if (r.status >= 200 && r.status < 300 && r.response) resolve(r.response); else reject(new Error('HTTP ' + r.status)); },
        onerror: function () { reject(new Error('rede')); },
        ontimeout: function () { reject(new Error('timeout')); }
      });
    });
  }

  // Reduz até caber em ~IMG_TARGET_CHARS (data URL). Tenta lados menores e
  // qualidades decrescentes; devolve a menor versão se nada couber.
  function shrinkToJpegDataUrl(bitmap) {
    var best = '';
    for (var s = 0; s < IMG_SIDES.length; s++) {
      var scale = Math.min(1, IMG_SIDES[s] / Math.max(bitmap.width, bitmap.height));
      var w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bitmap, 0, 0, w, h);
      for (var q = 0.85; q >= 0.45; q -= 0.08) {
        best = cv.toDataURL('image/jpeg', Math.round(q * 100) / 100);
        if (best.length <= IMG_TARGET_CHARS) return best;
      }
    }
    return best;
  }

  function downloadAndShrink(item) {
    // tenta a versão grande; se não existir, cai para a imagem como aparece na página
    return fetchImageBlob(item.full).catch(function (err) {
      if (item.fallback && item.fallback !== item.full) return fetchImageBlob(item.fallback);
      throw err;
    })
      .then(function (blob) { return createImageBitmap(blob); })
      .then(function (bmp) { var d = shrinkToJpegDataUrl(bmp); try { bmp.close(); } catch (e) {} return { url: d, seq: item.seq }; })
      .catch(function () { return null; });
  }

  function sendToAtlasWithImages() {
    var payload;
    try { payload = collectCase(); } catch (e) { alert('Atlas: não foi possível ler os metadados desta página.'); return; }
    if (!payload.title || !payload.sourceUrl) { alert('Atlas: título ou URL do caso não encontrados nesta página. Nada foi enviado.'); return; }
    if (typeof GM_xmlhttpRequest !== 'function' || typeof createImageBitmap !== 'function') {
      alert('Atlas: este navegador/Tampermonkey não permite baixar as imagens. Use o botão "📥 Enviar ao Atlas" (só o caso).');
      return;
    }
    var descriptionText = '';
    collectImagesViaStudyJson(document).catch(function () { return null; }).then(function (found) {
      if (!found || !found.items.length) found = collectImageCandidates(document);
      var blocks = found.blocks || [];
      descriptionText = buildImageDescription(blocks, sectionTextWithBreaks(/^(case\s+)?discussion$/i), {
        title: payload.title, url: payload.sourceUrl, author: blocks.length && blocks[0].author ? blocks[0].author : ''
      });
      if (!found.items.length) { alert('Atlas: não encontrei imagens de exame nesta página (exames de patologia/foto são ignorados). Use o botão "📥 Enviar ao Atlas" (só o caso).'); return null; }
      showSentNotice('Baixando ' + found.items.length + ' imagem(ns)…' + (found.total > found.items.length ? ' (amostra de ' + found.total + ')' : ''));
      return Promise.all(found.items.map(downloadAndShrink));
    }).then(function (list) {
      if (!list) return;
      var images = list.filter(function (x) { return x && x.url; });
      if (!images.length) { alert('Atlas: não foi possível baixar as imagens. Nada foi enviado.'); return; }
      var base = ATLAS_URL.replace(/\/+$/, '') + '/';
      var url = base + '#external-import=' + encodePayload(payload);
      try { sendToAtlasViaBridge(payload, url, defaultBridgeEnv(), images, descriptionText); } catch (e) { openAtlasWindow(url); }
    });
  }

  function sendToAtlas() {
    var payload;
    try {
      payload = collectCase();
    } catch (e) {
      alert('Atlas: não foi possível ler os metadados desta página.');
      return;
    }
    if (!payload.title || !payload.sourceUrl) {
      alert('Atlas: título ou URL do caso não encontrados nesta página. Nada foi enviado.');
      return;
    }
    var base = ATLAS_URL.replace(/\/+$/, '') + '/';
    var url = base + '#external-import=' + encodePayload(payload);
    // 1.4.2: a ponte (091g) só é tocada AQUI, depois do clique. Qualquer
    // erro nela cai no fallback da 1.3.0 (alvo nomeado da 091e).
    try {
      sendToAtlasViaBridge(payload, url, defaultBridgeEnv());
    } catch (e) {
      openAtlasWindow(url);
    }
  }

  /* 091g — PONTE para a aba do Atlas já aberta. BroadcastChannel só liga
     abas da MESMA origem, então a aba do Radiopaedia não fala direto com o
     Atlas: este mesmo userscript também roda na página do Atlas (@match) e
     as duas instâncias conversam pelo armazenamento do Tampermonkey
     (GM_setValue + GM_addValueChangeListener, compartilhado entre abas). Na
     aba do Atlas a ponte repassa pelo BroadcastChannel da própria origem
     ('atlas-radiologico-import'), que o index.html escuta.
     Radiopaedia: ping -> (ponte pergunta à página) -> pong -> envia o caso
     SÓ para a aba que respondeu primeiro. Sem pong a tempo (Atlas fechado,
     página antiga, navegador/gerenciador sem suporte): abre como antes. */
  var BRIDGE_PING_KEY = 'atlasBridge.ping';
  var BRIDGE_PONG_KEY = 'atlasBridge.pong';
  var BRIDGE_IMPORT_KEY = 'atlasBridge.import';
  var ATLAS_IMPORT_CHANNEL = 'atlas-radiologico-import';
  var BRIDGE_TIMEOUT_MS = 700;

  function newRequestId() {
    return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function defaultBridgeEnv() {
    var hasGM = false;
    try { hasGM = typeof GM_setValue === 'function' && typeof GM_addValueChangeListener === 'function'; } catch (_) {}
    return {
      available: hasGM,
      setValue: hasGM ? function (k, v) { GM_setValue(k, v); } : null,
      addListener: hasGM ? function (k, fn) { return GM_addValueChangeListener(k, fn); } : null,
      removeListener: function (id) { try { if (typeof GM_removeValueChangeListener === 'function') GM_removeValueChangeListener(id); } catch (_) {} },
      setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
      openWindow: openAtlasWindow,
      notify: showSentNotice,
      timeoutMs: BRIDGE_TIMEOUT_MS,
      BroadcastChannel: (function () { try { return typeof BroadcastChannel === 'function' ? BroadcastChannel : null; } catch (_) { return null; } })()
    };
  }

  // Aba do Radiopaedia: pergunta se há uma aba do Atlas; com pong, entrega o
  // caso a ELA (nenhum window.open); sem pong, fallback. Nunca os dois.
  function sendToAtlasViaBridge(payload, url, env, images, description) {
    if (!env || !env.available) { env && env.openWindow ? env.openWindow(url) : openAtlasWindow(url); return 'fallback'; }
    var requestId = newRequestId();
    var settled = false;
    var listenerId = null;
    function finish() {
      settled = true;
      if (listenerId !== null) env.removeListener(listenerId);
    }
    try {
      listenerId = env.addListener(BRIDGE_PONG_KEY, function (name, oldV, v) {
        if (settled || !v || v.requestId !== requestId) return;
        finish();
        env.setValue(BRIDGE_IMPORT_KEY, { requestId: requestId, tabId: v.tabId, payload: payload, images: images || null, description: description || '', at: Date.now() });
        env.notify(images ? '✓ Caso e imagens enviados para a aba do Atlas já aberta — alterne para ela.' : '✓ Caso enviado para a aba do Atlas já aberta — alterne para ela.');
      });
      env.setValue(BRIDGE_PING_KEY, { requestId: requestId, at: Date.now() });
    } catch (e) {
      finish();
      env.openWindow(url);
      return 'fallback';
    }
    env.setTimeout(function () {
      if (settled) return;
      finish();
      env.openWindow(url);
      if (images) env.notify('Atlas não estava aberto: o caso foi enviado, mas as imagens não. Com o Atlas aberto, clique em "📸 Enviar com imagens" de novo.');
    }, env.timeoutMs);
    return 'pending';
  }

  // Aba do Atlas: responde ao ping só se uma PÁGINA do Atlas confirmar
  // (pong real do index.html) e repassa o caso pelo canal com o tabId
  // escolhido — só a página com esse tabId importa (as outras ignoram).
  function startAtlasBridge(env) {
    if (!env || !env.available || !env.BroadcastChannel) return null; // sem suporte: Radiopaedia cai no fallback
    var bc;
    try { bc = new env.BroadcastChannel(ATLAS_IMPORT_CHANNEL); } catch (e) { return null; }
    var waiting = {};
    bc.onmessage = function (ev) {
      var d = ev && ev.data;
      if (!d || d.type !== 'pong' || !waiting[d.requestId]) return;
      var cb = waiting[d.requestId];
      delete waiting[d.requestId];
      cb(d);
    };
    env.addListener(BRIDGE_PING_KEY, function (name, oldV, v, remote) {
      if (remote === false || !v || !v.requestId) return;
      waiting[v.requestId] = function (pong) {
        env.setValue(BRIDGE_PONG_KEY, { requestId: v.requestId, tabId: pong.tabId, ready: !!pong.ready, at: Date.now() });
      };
      bc.postMessage({ type: 'ping', requestId: v.requestId });
    });
    env.addListener(BRIDGE_IMPORT_KEY, function (name, oldV, v, remote) {
      if (remote === false || !v || !v.tabId) return;
      bc.postMessage({ type: 'external-import', requestId: v.requestId, tabId: v.tabId, payload: v.payload, images: v.images || null, description: v.description || '' });
    });
    return bc;
  }

  function showSentNotice(text) {
    try {
      var n = document.createElement('div');
      n.textContent = text;
      n.style.cssText = 'position:fixed;right:16px;bottom:112px;z-index:999999;padding:8px 12px;border-radius:8px;'
        + 'background:#0e7490;color:#fff;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,.18);';
      (document.body || document.documentElement).appendChild(n);
      setTimeout(function () { try { n.remove(); } catch (_) {} }, 4000);
    } catch (_) {}
  }

  function isAtlasPage() {
    try { return String(window.location.href).indexOf(ATLAS_URL) === 0; } catch (e) { return false; }
  }

  // 091e: alvo NOMEADO (mesmo nome que o Atlas define em window.name) —
  // reutiliza a aba do Atlas já aberta por este fluxo em vez de abrir uma
  // nova a cada envio. Sem 'noopener': com ele o navegador não devolve a
  // janela (não dá para focar) nem a reencontra pelo nome no envio seguinte.
  var ATLAS_WINDOW_NAME = 'atlas-radiologico';
  function openAtlasWindow(url) {
    var atlasWindow = window.open(url, ATLAS_WINDOW_NAME);
    if (atlasWindow) {
      try { atlasWindow.focus(); } catch (_) {}
    }
    return atlasWindow;
  }

  function mountButton() {
    if (document.getElementById('atlas-send-btn') && document.getElementById('atlas-send-img-btn')) return;
    if (document.getElementById('atlas-send-btn')) { try { document.getElementById('atlas-send-btn').remove(); } catch (e) {} }
    var btn = document.createElement('button');
    btn.id = 'atlas-send-btn';
    btn.type = 'button';
    btn.textContent = '📥 Enviar ao Atlas';
    btn.title = 'Enviar metadados deste caso ao Atlas Radiológico (sem imagens)';
    btn.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:999999;'
      + 'padding:10px 14px;border-radius:10px;border:1px solid #0e7490;'
      + 'background:#ecfeff;color:#0e7490;font-size:14px;cursor:pointer;'
      + 'box-shadow:0 2px 10px rgba(0,0,0,.18);';
    btn.addEventListener('click', sendToAtlas);
    (document.body || document.documentElement).appendChild(btn);
    var imgBtn = document.createElement('button');
    imgBtn.id = 'atlas-send-img-btn';
    imgBtn.type = 'button';
    imgBtn.textContent = '📸 Enviar com imagens';
    imgBtn.title = 'Enviar este caso E as imagens das séries ao Atlas (você aprova no quadro de imagens antes de salvar)';
    imgBtn.style.cssText = 'position:fixed;right:16px;bottom:64px;z-index:999999;'
      + 'padding:10px 14px;border-radius:10px;border:1px solid #0e7490;'
      + 'background:#0e7490;color:#fff;font-size:14px;cursor:pointer;'
      + 'box-shadow:0 2px 10px rgba(0,0,0,.18);';
    imgBtn.addEventListener('click', sendToAtlasWithImages);
    (document.body || document.documentElement).appendChild(imgBtn);
  }

  // 1.4.2: o boot do botão é o da 1.3.0, sem nada da ponte antes dele.
  var onAtlasPage = false;
  try { onAtlasPage = isAtlasPage(); } catch (_) {}

  if (!onAtlasPage) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountButton);
    } else {
      mountButton();
    }
    // Radiopaedia usa navegação parcial em alguns fluxos — reinsere se sumir.
    setInterval(mountButton, 5000);
  }
  // Diagnóstico (DevTools do Chrome): confirma que o script rodou nesta página.
  try { console.info('[Atlas userscript 1.5.3] ativo — ' + (onAtlasPage ? 'ponte do Atlas' : 'botão Enviar ao Atlas')); } catch (_) {}

  // 091g: na página do Atlas este script é SÓ a ponte (sem botão). Isolada:
  // qualquer erro aqui fica aqui (o Radiopaedia cai no fallback por timeout).
  if (onAtlasPage) {
    try { startAtlasBridge(defaultBridgeEnv()); } catch (_) {}
  }
})();
