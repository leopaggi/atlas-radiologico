// Busca: "limpar filtros" aparece ao digitar, ✕ da busca e atalho no detalhe.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FALHOU:', m); } else console.log('ok -', m); };

ok(/function countActiveFilters\(\)\{[\s\S]*?searchTerm\.trim\(\)\?1:0/.test(html), 'countActiveFilters conta a busca');
ok(/function clearAllFilters\(\)\{[\s\S]*?searchTerm = '';[\s\S]*?scope = \{section:null, site:null\};[\s\S]*?renderAll\(\)/.test(html), 'clearAllFilters zera busca, escopo e re-renderiza');
ok(/clr\.onclick = clearAllFilters/.test(html), 'botão da barra usa clearAllFilters');
ok(/addEventListener\('input', \(e\)=>\{ searchTerm = e\.target\.value; renderResults\(\); renderTagbar\(\);/.test(html), 'digitar na busca atualiza a barra (botão limpar filtros aparece)');
ok(/id="search-clear"/.test(html) && /getElementById\('search-clear'\)\.addEventListener\('click'/.test(html), '✕ da busca existe e está ligado');
ok(/id="btn-clear-filters"/.test(html) && /clearFiltersBtn\.onclick = \(\)=>\{ closeOverlay\(\); clearAllFilters\(\); \}/.test(html), 'detalhe tem atalho de limpar filtros e voltar às seções');
ok(/typeof countActiveFilters==='function' && countActiveFilters\(\)>0\) \? `<button class="btn btn-ghost" id="btn-clear-filters"/.test(html), 'atalho só aparece com filtro ativo e fora de "imagens de hoje"');
process.exit(fails ? 1 : 0);
