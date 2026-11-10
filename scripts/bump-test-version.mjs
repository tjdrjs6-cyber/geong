// Run before packaging the next update: node scripts/bump-test-version.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../index.html', import.meta.url);
const html = readFileSync(file, 'utf8');
const match = html.match(/id="geongi-version"[^>]*>test(\d{2,})<\/div>/);
if (!match) throw new Error('Cannot find test version badge');
const next = Number(match[1]) + 1;
const version = `test${String(next).padStart(2, '0')}`;
const updated = html.replace(/(<div id="geongi-version" aria-label=")[^"]*("[^>]*>)[^<]*(<\/div>)/, (_whole, a, b, c) => `${a}테스트 버전 ${version}${b}${version}${c}`);
writeFileSync(file, updated);
console.log(version);
