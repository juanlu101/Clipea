// Almacenamiento local (IndexedDB) y archivo de proyecto (.vproj)
const DB_NAME = 'editor-video-aula';
let dbp = null;

function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('projects', { keyPath: 'id' });
      const m = d.createObjectStore('media', { keyPath: 'id' });
      m.createIndex('projectId', 'projectId');
      d.createObjectStore('assets', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  return dbp;
}

function tx(store, mode, fn) {
  return db().then(d => new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(v => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Operación cancelada (¿sin espacio?)'));
  }));
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const listProjects = () => tx('projects', 'readonly', s => req(s.getAll())).then(a => a.sort((x, y) => y.updatedAt - x.updatedAt));
export const getProject = id => tx('projects', 'readonly', s => req(s.get(id)));
export const saveProject = p => tx('projects', 'readwrite', s => { s.put(JSON.parse(JSON.stringify(p))); });
export const putMedia = (id, projectId, blob) => tx('media', 'readwrite', s => { s.put({ id, projectId, blob }); });
export const getMediaBlob = id => tx('media', 'readonly', s => req(s.get(id))).then(r => r?.blob || null);
export const deleteMedia = id => Promise.all([tx('media', 'readwrite', s => { s.delete(id); }), tx('assets', 'readwrite', s => { s.delete(id); })]);
export const putAssets = (id, a) => tx('assets', 'readwrite', s => { s.put({ id, ...a }); });
export const getAssets = id => tx('assets', 'readonly', s => req(s.get(id)));

const mediaIdsOf = projectId => tx('media', 'readonly', s => req(s.index('projectId').getAllKeys(projectId)));

export async function deleteProject(id) {
  await tx('projects', 'readwrite', s => { s.delete(id); });
  for (const mid of await mediaIdsOf(id)) await deleteMedia(mid);
}

// Borra archivos que ya no usa el proyecto (p. ej. importados y luego deshechos)
export async function cleanupOrphans(p) {
  const used = new Set(p.media.map(m => m.id));
  for (const mid of await mediaIdsOf(p.id)) if (!used.has(mid)) await deleteMedia(mid);
}

export async function duplicateProject(id, uid) {
  const p = await getProject(id);
  const np = JSON.parse(JSON.stringify(p));
  np.id = uid(); np.name = p.name + ' (copia)'; np.createdAt = np.updatedAt = Date.now();
  const map = {};
  for (const m of np.media) {
    const nid = uid(); map[m.id] = nid;
    const blob = await getMediaBlob(m.id);
    if (blob) await putMedia(nid, np.id, blob);
    const a = await getAssets(m.id);
    if (a) { delete a.id; await putAssets(nid, a); }
    m.id = nid;
  }
  for (const c of np.clips) if (c.mediaId) c.mediaId = map[c.mediaId] || c.mediaId;
  await saveProject(np);
  return np;
}

export async function storageEstimate() {
  try { const e = await navigator.storage.estimate(); return e; } catch { return null; }
}

// --------- Archivo de proyecto: cabecera JSON + blobs concatenados ---------
const MAGIC = 'VEDAULA1';
export async function exportProjectFile(project) {
  const parts = [], index = [];
  let offset = 0;
  for (const m of project.media) {
    const blob = await getMediaBlob(m.id);
    if (!blob) continue;
    index.push({ id: m.id, offset, size: blob.size, type: blob.type });
    parts.push(blob); offset += blob.size;
  }
  const header = new TextEncoder().encode(JSON.stringify({ project, index }));
  const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, header.length);
  return new Blob([MAGIC, len, header, ...parts], { type: 'application/octet-stream' });
}

export async function importProjectFile(file, uid) {
  const head = new TextDecoder().decode(await file.slice(0, 8).arrayBuffer());
  if (head !== MAGIC) throw new Error('El archivo no es un proyecto del editor');
  const len = new DataView(await file.slice(8, 12).arrayBuffer()).getUint32(0);
  const { project, index } = JSON.parse(new TextDecoder().decode(await file.slice(12, 12 + len).arrayBuffer()));
  const base = 12 + len;
  project.id = uid();
  const map = {};
  for (const it of index) {
    const nid = uid(); map[it.id] = nid;
    await putMedia(nid, project.id, file.slice(base + it.offset, base + it.offset + it.size, it.type));
  }
  for (const m of project.media) m.id = map[m.id] || m.id;
  for (const c of project.clips) if (c.mediaId) c.mediaId = map[c.mediaId] || c.mediaId;
  project.updatedAt = Date.now();
  await saveProject(project);
  return project;
}
