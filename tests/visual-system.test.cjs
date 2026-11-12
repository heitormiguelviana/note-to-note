const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const crypto=require('node:crypto');const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const names=['Central','Roleta','Configuracoes','Diario.Musical','Monitor','Relatorio'];
const marker=/\n\/\* NTN VISUAL BETA — START \*\/[\s\S]*?\/\* NTN VISUAL BETA — END \*\/\n/;
function normalize(s){return s.replace('// NOTE TO NOTE — BETA VISUAL 1 (base oficial preservada)\n','').replace(marker,'').replace(/ ntn-visual-beta/g,'').replace(', "ntn-visual-beta"','').replace(/ root.addClass\("ntn-visual-beta"\);/g,'').replaceAll('roleta-v04-visual-beta-style','roleta-v04-style').replaceAll('musical-config-v25-visual-beta-style','musical-config-v25-style');}
for(const name of names)test(name+': compilação, isolamento e identidade funcional',()=>{
 const base=fs.readFileSync('betas/backups/pre-release-v1.3.0/'+name+'.md','utf8'),beta=fs.readFileSync('betas/'+name+'-Beta.md','utf8');
 for(const source of [base,beta])new AsyncFunction('dv','app',source.replace(/^```dataviewjs\s*/,'').replace(/\s*```\s*$/,''));
 assert.equal(normalize(beta),base,'somente CSS e classe de escopo devem mudar');
 const css=beta.match(marker)?.[0];assert.ok(css);assert.ok(css.includes('prefers-reduced-motion'));assert.ok(css.includes('focus-visible'));assert.ok(css.includes('max-width:650px'));
 assert.ok(!/(^|\n)\s*(body|html|button|input|\*)\s*[{,]/m.test(css));
 assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
});
test('backups exatos, oficiais não promovidos preservados e manifesto canônico',()=>{
 const records=JSON.parse(fs.readFileSync('betas/backups/pre-padronizacao/index.json'));
 for(const r of records){assert.equal(crypto.createHash('sha256').update(fs.readFileSync(r.backup)).digest('hex'),r.sha256);if(r.source.startsWith('src/')&&!['src/Central.md','src/Roleta.md'].includes(r.source))assert.deepEqual(fs.readFileSync(r.source.replace('src/','betas/backups/pre-release-v1.3.0/')),fs.readFileSync(r.backup));}
 const manifest=JSON.parse(fs.readFileSync('docs/references/manifest-v1.2.1.json'));const config=fs.readFileSync('src/Configuracoes.md','utf8');
 for(const c of manifest.components){assert.ok(fs.existsSync('src/'+c.source));assert.ok(fs.existsSync('betas/'+c.source.replace('.md','-Beta.md')));assert.ok(config.includes(c.destination));}
});
test('oficiais provêm das betas aprovadas com transformação apenas de apresentação',()=>{
 const {versions,promote}=require('../tools/release-source.cjs');
 for(const name of Object.keys(versions))assert.equal(fs.readFileSync('src/'+name+'.md','utf8'),promote(name,fs.readFileSync('betas/'+name+'-Beta.md','utf8')));
});
