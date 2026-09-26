// ==UserScript==
// @name         Radiopaedia → Atlas Radiológico (MVP, metadata-only)
// @namespace    atlas-radiologico
// @version      1.4.2
// @description  Adiciona um botão discreto "📥 Enviar ao Atlas" nas páginas de casos do Radiopaedia. Coleta SOMENTE metadados visíveis (título, URL, idade/sexo, modalidade, apresentação) e entrega o caso à aba do Atlas já aberta (ou abre o Atlas com o payload no fragmento da URL). Não captura imagens, não traduz, não inventa campos.
// @author       Atlas Radiológico
// @match        https://radiopaedia.org/cases/*
// @match        https://www.radiopaedia.org/cases/*
// @match        https://leopaggi.github.io/atlas-radiologico/*
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
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
  function sendToAtlasViaBridge(payload, url, env) {
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
        env.setValue(BRIDGE_IMPORT_KEY, { requestId: requestId, tabId: v.tabId, payload: payload, at: Date.now() });
        env.notify('✓ Caso enviado para a aba do Atlas já aberta — alterne para ela.');
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
      bc.postMessage({ type: 'external-import', requestId: v.requestId, tabId: v.tabId, payload: v.payload });
    });
    return bc;
  }

  function showSentNotice(text) {
    try {
      var n = document.createElement('div');
      n.textContent = text;
      n.style.cssText = 'position:fixed;right:16px;bottom:64px;z-index:999999;padding:8px 12px;border-radius:8px;'
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
    if (document.getElementById('atlas-send-btn')) return;
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
  try { console.info('[Atlas userscript 1.4.2] ativo — ' + (onAtlasPage ? 'ponte do Atlas' : 'botão Enviar ao Atlas')); } catch (_) {}

  // 091g: na página do Atlas este script é SÓ a ponte (sem botão). Isolada:
  // qualquer erro aqui fica aqui (o Radiopaedia cai no fallback por timeout).
  if (onAtlasPage) {
    try { startAtlasBridge(defaultBridgeEnv()); } catch (_) {}
  }
})();
