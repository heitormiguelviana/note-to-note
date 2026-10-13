```dataviewjs
/*
 * Note to Note — Bootstrap v1.0.2
 * Instala apenas a Central de Configurações.
 * Requer Dataview com execução JavaScript habilitada.
 */
const REPO = "heitormiguelviana/note-to-note";
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const TARGET = "Musicas/Sistema/Configurações.md";
const BACKUP_DIR = "Musicas/Sistema/Backups/Note to Note";
const MAX_BYTES = 200000;
const root = dv.container;
root.replaceChildren();

const appRef = app;
const vault = appRef.vault;
const adapter = vault.adapter;
const el = (tag, parent, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  parent.appendChild(node);
  return node;
};
const panel = el("div", root, undefined, "ntn-bootstrap");
el("h2", panel, "Note to Note — Instalador inicial");
el("p", panel, "Instala a Central de Configurações a partir da última release estável do GitHub. Os demais módulos serão gerenciados por ela.");
const info = el("p", panel, "Clique em Verificar release para começar.");
const details = el("div", panel);
const actions = el("div", panel, undefined, "ntn-actions");
const checkButton = el("button", actions, "Verificar release");
const installButton = el("button", actions, "Instalar Central de Configurações");
installButton.disabled = true;
const log = el("pre", panel, "");
log.style.whiteSpace = "pre-wrap";
log.style.fontSize = "0.85em";
const style = el("style", panel);
style.textContent = `
.ntn-bootstrap {max-width:720px; padding:16px; border:1px solid var(--background-modifier-border);border-radius:12px}
.ntn-bootstrap h2 {margin-top:0}
.ntn-actions {display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}
.ntn-bootstrap pre {padding:12px;background:var(--background-secondary);border-radius:8px}
`;
let selected = null;
let busy = false;
const status = (message) => { info.textContent = message; log.textContent = message; };
const setBusy = (value) => {
  busy = value;
  checkButton.disabled = value;
  installButton.disabled = value || !selected;
};
function fail(message) {
  status("Erro: " + (message?.message || String(message)));
  new Notice("Note to Note: falha na operação. Veja a nota instaladora.");
}
async function fetchResponse(url, asJson = false) {
  const headers = asJson
    ? {"Accept":"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28"}
    : {"Accept":"application/octet-stream"};
  const result = await requestUrl({url, method:"GET", throw:false, headers});
  if (result.status < 200 || result.status >= 300) throw Error(`HTTP ${result.status} em ${url}`);
  return result;
}
function bytesOf(response) {
  if (response.arrayBuffer) return new Uint8Array(response.arrayBuffer);
  return new TextEncoder().encode(response.text);
}
function hex(bytes) {
  return Array.from(bytes, b=>b.toString(16).padStart(2,"0")).join("");
}
async function sha256(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) return hex(new Uint8Array(await subtle.digest("SHA-256", bytes)));
  if (!Platform.isMobile) return require("crypto").createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  throw Error("SHA-256 indisponível neste dispositivo; instalação cancelada.");
}
async function mkdirs(path) {
  let current = "";
  for (const segment of path.split("/").filter(Boolean)) {
    current = current ? current + "/" + segment : segment;
    if (!(await adapter.exists(current))) await adapter.mkdir(current);
  }
}
function validHash(value) {return typeof value==="string" && /^[a-f0-9]{64}$/i.test(value);}
function validTag(tag) {return /^v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(tag);}
function getAsset(release, name) {
  return release.assets?.find(a=>a.name===name && a.state==="uploaded" && typeof a.browser_download_url==="string");
}
async function loadRelease() {
  const response = await fetchResponse(API, true);
  const release = JSON.parse(response.text);
  if (!release || release.draft || release.prerelease || !validTag(release.tag_name)) throw Error("Nenhuma release estável válida.");
  const manifestAsset = getAsset(release, "manifest.json");
  if (!manifestAsset) throw Error("A release não possui manifest.json.");
  const manifestResponse = await fetchResponse(manifestAsset.browser_download_url);
  if (bytesOf(manifestResponse).byteLength > 100000) throw Error("Manifesto excede o tamanho permitido.");
  const manifest = JSON.parse(manifestResponse.text);
  if (manifest.schemaVersion !== 1 || manifest.project !== "Note to Note") throw Error("Manifesto desconhecido.");
  if (manifest.release !== release.tag_name.slice(1)) throw Error("Versão do manifesto não corresponde à release.");
  const component = manifest.components?.find(c=>c.id==="configuracoes");
  if (!component || component.destination!==TARGET || !validHash(component.sha256) ||
      !Number.isSafeInteger(component.sizeBytes) || component.sizeBytes<1 || component.sizeBytes>MAX_BYTES ||
      !/^[A-Za-z0-9._-]+\.md$/.test(component.source)) throw Error("Entrada da Central de Configurações inválida.");
  const asset = getAsset(release, component.source);
  if (!asset || asset.size!==component.sizeBytes) throw Error("Arquivo da Central ausente ou tamanho divergente.");
  return {release, component, asset};
}
checkButton.onclick = async () => {
  if (busy) return;
  selected = null;
  setBusy(true);
  try {
    status("Consultando a última release estável...");
    const data = await loadRelease();
    selected = data;
    const exists = await adapter.exists(TARGET);
    details.replaceChildren();
    el("p", details, `Release: ${data.release.tag_name} · Central de Configurações: v${data.component.version}`);
    el("p", details, `Destino: ${TARGET}`);
    el("p", details, exists ? "Já existe uma nota no destino. Uma cópia de segurança será criada antes da substituição." : "A Central ainda não existe no destino.");
    status("Verificação concluída. Nenhum arquivo foi alterado.");
  } catch (error) {
    fail(error);
  } finally { setBusy(false); }
};
installButton.onclick = async () => {
  if (busy || !selected) return;
  setBusy(true);
  try {
    // Revalida a release e o manifesto para evitar instalar metadados desatualizados.
    status("Validando a release e preparando o download...");
    const {release, component, asset} = await loadRelease();
    if (release.tag_name!==selected.release.tag_name || component.sha256!==selected.component.sha256) {
      selected = null;
      throw Error("A release mudou. Clique em Verificar release novamente.");
    }
    const response = await fetchResponse(asset.browser_download_url);
    const bytes = bytesOf(response);
    if (bytes.byteLength !== component.sizeBytes) throw Error("Tamanho do arquivo não confere.");
    if ((await sha256(bytes)).toLowerCase() !== component.sha256.toLowerCase()) throw Error("Hash SHA-256 não confere. Instalação cancelada.");
    const content = new TextDecoder("utf-8",{fatal:true}).decode(bytes);
    if (!content.trimStart().startsWith("```dataviewjs")) throw Error("O arquivo baixado não parece ser uma nota DataviewJS.");
    const exists = await adapter.exists(TARGET);
    if (exists) {
      const confirmed = window.confirm(`A nota ${TARGET} já existe.\n\nDeseja criar um backup e substituí-la pela versão ${component.version}?\n\nAs configurações pessoais não serão modificadas.`);
      if (!confirmed) {status("Instalação cancelada. Nenhum arquivo foi alterado.");return;}
    } else {
      const confirmed = window.confirm(`Instalar a Central de Configurações v${component.version} em:\n${TARGET}?\n\nA instalação não modificará Configuracoes.json nem notas de álbuns.`);
      if (!confirmed) {status("Instalação cancelada. Nenhum arquivo foi alterado.");return;}
    }
    await mkdirs("Musicas/Sistema");
    let backupPath = null;
    if (exists) {
      await mkdirs(BACKUP_DIR);
      const stamp = new Date().toISOString().replace(/[:.]/g,"-");
      backupPath = `${BACKUP_DIR}/Configuracoes-${stamp}.md`;
      let n=1;
      while (await adapter.exists(backupPath)) backupPath=`${BACKUP_DIR}/Configuracoes-${stamp}-${n++}.md`;
      const oldContent = await adapter.read(TARGET);
      await adapter.write(backupPath,oldContent);
      if (await adapter.read(backupPath)!==oldContent) throw Error("Backup não pôde ser validado. Nenhum arquivo foi substituído.");
    }
    // Usa a API do Vault para permitir que o Obsidian detecte a nota atualizada.
    const existingFile = vault.getAbstractFileByPath(TARGET);
    if (existingFile && existingFile.path === TARGET && existingFile.extension === "md") await vault.modify(existingFile,content);
    else if (existingFile) throw Error("O destino não é um arquivo Markdown.");
    else if (await adapter.exists(TARGET)) await adapter.write(TARGET,content);
    else await vault.create(TARGET,content);
    status(`Instalação concluída!\nVersão: ${component.version}\nNota: ${TARGET}${backupPath?`\nBackup: ${backupPath}`:""}\n\nAbra a Central de Configurações no Obsidian.`);
    new Notice("Note to Note: Central de Configurações instalada.");
  } catch (error) { fail(error); }
  finally {setBusy(false);}
};
```