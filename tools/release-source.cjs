// Transformação de apresentação/versionamento. Nenhum algoritmo ou dado persistido muda.
const versions={Central:'1.9.0',Roleta:'1.2.0',Configuracoes:'2.6.0','Diario.Musical':'1.4.0',Monitor:'1.31.0',Relatorio:'3.7.0'};
function promote(name,source){
 let s=source.replace('// NOTE TO NOTE — BETA VISUAL 1 (base oficial preservada)\n','')
   .replace('NTN VISUAL BETA — START','NTN VISUAL — START').replace('NTN VISUAL BETA — END','NTN VISUAL — END');
 if(name==='Central')s=s.replace('CENTRAL MUSICAL — V1.9','CENTRAL MUSICAL — V1.9.0');
 if(name==='Roleta')s=s.replace('ROLETA MUSICAL — V1.2','ROLETA MUSICAL — V1.2.0');
 if(name==='Configuracoes')s=s.replaceAll('V2.5.0','V2.6.0');
 if(name==='Diario.Musical')s=s.replace('🎧 DIÁRIO MUSICAL','🎧 DIÁRIO MUSICAL — V1.4.0');
 if(name==='Monitor')s=s.replace('V1.30 — NOVA INTERFACE, MOTOR V1.29','V1.31.0 — INTERFACE UNIFICADA, MOTOR PRESERVADO').replace('version: "1.30"','version: "1.31.0"');
 if(name==='Relatorio')s=s.replace('RELATÓRIO MUSICAL V3.6.1 — CORREÇÃO DE RECUPERAÇÃO DE PERÍODOS','RELATÓRIO MUSICAL V3.7.0 — INTERFACE UNIFICADA');
 return s;
}
module.exports={versions,promote};
