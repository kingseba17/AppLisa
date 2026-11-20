// Base de datos local (IndexedDB). Todo queda en el teléfono; nada se sube a internet.
const NOMBRE_DB = 'applisa';
const VERSION_DB = 1;

let dbPromesa = null;

function abrir() {
  if (dbPromesa) return dbPromesa;
  dbPromesa = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOMBRE_DB, VERSION_DB);
    // onupgradeneeded solo corre al crear la base o al subir VERSION_DB.
    // Nunca borra datos: solo agrega lo que falte.
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('registros')) {
        const s = db.createObjectStore('registros', { keyPath: 'id' });
        s.createIndex('fecha', 'fecha');
        s.createIndex('tipo', 'tipo');
      }
      if (!db.objectStoreNames.contains('perfil')) db.createObjectStore('perfil', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'clave' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromesa;
}

function promesa(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function fin(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transacción cancelada'));
  });
}

async function store(nombre, modo = 'readonly') {
  const db = await abrir();
  return db.transaction(nombre, modo).objectStore(nombre);
}

// ---------- registros ----------
export async function todosLosRegistros() {
  const lista = await promesa((await store('registros')).getAll());
  return lista.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

export async function guardarRegistro(r) {
  const s = await store('registros', 'readwrite');
  await promesa(s.put(r));
  await fin(s.transaction);
}

export async function borrarRegistro(id) {
  const s = await store('registros', 'readwrite');
  await promesa(s.delete(id));
  await fin(s.transaction);
}

// ---------- perfil ----------
export async function leerPerfil() {
  return (await promesa((await store('perfil')).get('lisa'))) || { id: 'lisa', nombre: 'Lisa' };
}

export async function guardarPerfil(p) {
  const s = await store('perfil', 'readwrite');
  await promesa(s.put({ ...p, id: 'lisa' }));
  await fin(s.transaction);
}

// ---------- meta (fecha del último respaldo, avisos vistos, etc.) ----------
export async function leerMeta(clave) {
  const fila = await promesa((await store('meta')).get(clave));
  return fila ? fila.valor : undefined;
}

export async function guardarMeta(clave, valor) {
  const s = await store('meta', 'readwrite');
  await promesa(s.put({ clave, valor }));
  await fin(s.transaction);
}

async function todaLaMeta() {
  return promesa((await store('meta')).getAll());
}

// ---------- respaldo completo ----------
export async function exportarTodo() {
  return {
    app: 'AppLisa',
    formato: 1,
    creado: new Date().toISOString(),
    perfil: await leerPerfil(),
    registros: await todosLosRegistros(),
    meta: (await todaLaMeta()).filter(m => m.clave !== 'ultimoRespaldo'),
  };
}

// Reemplaza todo en UNA sola transacción: si algo falla, no se borra nada.
export async function reemplazarTodo(datos) {
  const db = await abrir();
  const tx = db.transaction(['registros', 'perfil', 'meta'], 'readwrite');
  const reg = tx.objectStore('registros');
  const per = tx.objectStore('perfil');
  const met = tx.objectStore('meta');
  reg.clear();
  per.clear();
  for (const r of datos.registros || []) reg.put(r);
  if (datos.perfil) per.put({ ...datos.perfil, id: 'lisa' });
  for (const m of datos.meta || []) if (m && m.clave && m.clave !== 'ultimoRespaldo') met.put(m);
  await fin(tx);
}
