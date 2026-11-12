const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const crypto=require('node:crypto');
test('snapshots preservam seus hashes e último snapshot corresponde ao principal',()=>{
 const root='betas/central-musical/';const hashes=JSON.parse(fs.readFileSync(root+'snapshots.json'));
 for(const [name,hash]of Object.entries(hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(root+name)).digest('hex'),hash,name);
 assert.deepEqual(fs.readFileSync(root+Object.keys(hashes).at(-1)),fs.readFileSync('betas/backups/pre-padronizacao/betas-originais/Central-Musical-Beta.md'));
});
