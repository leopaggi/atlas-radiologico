// Quebras de linha (tópicos) da apresentação clínica são preservadas ao exibir
// (card do caso, lightbox e Quiz). pre-line mantém \n e continua juntando espaços.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('FALHOU:', m); } else console.log('ok -', m); };

ok(/\.clinical-case-presentation\{white-space:pre-line;\}/.test(html), 'CSS: apresentação do caso (card e lightbox) usa white-space:pre-line');
ok(/<div style="white-space:pre-line;"><b>História clínica:<\/b> \$\{esc\(c\.presentation\)\}<\/div>/.test(html), 'Quiz: História clínica preserva quebras de linha');
ok(/<div style="white-space:pre-line;"><b>Observações:<\/b> \$\{esc\(c\.notes\)\}<\/div>/.test(html), 'Quiz: Observações preserva quebras de linha');
ok(/function clinicalCasePresentationHtml\(text\)\{[\s\S]*?esc\(t\)/.test(html), 'texto continua escapado (esc) — só muda a exibição, nunca o dado');
ok(/\.lightbox-clinical-host \.clinical-case-presentation\.is-clamped\{max-height:30vh;overflow-y:auto;/.test(html), 'lightbox mostra a apresentação completa (sem cortar em 2 linhas)');
process.exit(fails ? 1 : 0);
