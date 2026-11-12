// Valida o contrato real do bootstrap/gerenciador e prepara apenas os oito assets oficiais.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {versions}=require('./release-source.cjs');
const manifest=JSON.parse(fs.readFileSync('manifest.json'));
const previous=JSON.parse(fs.readFileSync('docs/references/manifest-v1.2.1.json'));
const canonical=new Map(previous.components.map(c=>[c.id,c]));
if(manifest.schemaVersion!==1||manifest.project!=='Note to Note'||manifest.channel!=='stable'||manifest.release!=='1.3.0')throw Error('Cabeçalho do manifesto inválido');
if(manifest.components.length!==6)throw Error('São necessários seis módulos');
const ids=new Set();
for(const c of manifest.components){
 const ref=canonical.get(c.id);if(!ref||ids.has(c.id)||c.source!==ref.source||c.destination!==ref.destination||c.required!==ref.required)throw Error('Contrato inválido: '+c.id);ids.add(c.id);
 const bytes=fs.readFileSync(path.join('src',c.source));
 if(c.version!==versions[c.source.replace('.md','')]||!/^\d+\.\d+\.\d+$/.test(c.version))throw Error('Versão divergente: '+c.id);
 if(c.sizeBytes!==bytes.length||c.sha256!==crypto.createHash('sha256').update(bytes).digest('hex'))throw Error('Integridade divergente: '+c.id);
 if(c.sizeBytes>250000||(c.id==='configuracoes'&&c.sizeBytes>200000))throw Error('Limite do instalador excedido');
 if(!bytes.toString().startsWith('```dataviewjs'))throw Error('Nota DataviewJS inválida');
}
if(!fs.existsSync('CHANGELOG.md'))throw Error('Changelog ausente');
if(process.argv[2]==='--output'){
 if(!process.argv[3])throw Error('Informe diretório de saída');
 const output=path.resolve(process.argv[3]);fs.mkdirSync(output,{recursive:true});
 for(const c of manifest.components)fs.copyFileSync(path.join('src',c.source),path.join(output,c.source));
 for(const f of ['manifest.json','CHANGELOG.md'])fs.copyFileSync(f,path.join(output,f));
 console.log('Oito assets preparados em '+output);
}
console.log('Manifesto e seis módulos válidos para v'+manifest.release);
