// ==UserScript==
// @name         Radiopaedia → Atlas Radiológico (MVP, metadata-only)
// @namespace    atlas-radiologico
// @version      1.2.0
// @description  Adiciona um botão discreto "📥 Enviar ao Atlas" nas páginas de casos do Radiopaedia. Coleta SOMENTE metadados visíveis (título, URL, idade/sexo, modalidade, apresentação) e abre o Atlas com o payload no fragmento da URL. Não captura imagens, não traduz, não inventa campos.
// @author       Atlas Radiológico
// @match        https://radiopaedia.org/cases/*
// @grant        none
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
  function stripSiteSuffix(s) {
    return cleanText(String(s || '')
      .replace(/\s*\|\s*Radiology Case\s*\|\s*Radiopaedia\.org\s*$/i, '')
      .replace(/\s*[|–—-]\s*Radiopaedia(\.org)?\s*$/i, ''));
  }

  function titleTokens(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
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
    if (parts.title) payload.title = String(parts.title).slice(0, 300);
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
    openAtlasWindow(base + '#external-import=' + encodePayload(payload));
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton);
  } else {
    mountButton();
  }
  // Radiopaedia usa navegação parcial em alguns fluxos — reinsere se sumir.
  setInterval(mountButton, 5000);
})();
