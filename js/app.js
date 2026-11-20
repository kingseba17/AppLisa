import * as db from './db.js';
import { comprimir } from './fotos.js';
import { VERSION } from './version.js';

// ================= Tipos de registro =================
// Cada tipo define qué campos muestra el formulario.
const TIPOS = {
  peso:            { e: '⚖️', n: 'Peso',         valor: { label: 'Peso', unidad: 'kg', paso: '0.01' } },
  comida:          { e: '🍖', n: 'Comida',       titulo: 'Qué comió', valor: { label: 'Cantidad', unidad: 'g', paso: '1' } },
  paseo:           { e: '🦮', n: 'Paseo',        valor: { label: 'Duración', unidad: 'min', paso: '1' }, titulo: 'Lugar (opcional)' },
  vacuna:          { e: '💉', n: 'Vacuna',       titulo: 'Vacuna', monto: true, proxima: 'Próxima dosis', fotos: 'Comprobante' },
  desparasitacion: { e: '🪱', n: 'Desparasit.',  titulo: 'Producto', monto: true, proxima: 'Próxima dosis' },
  medicamento:     { e: '💊', n: 'Remedio',      titulo: 'Medicamento', detalle: 'Dosis / frecuencia', proxima: 'Próxima toma o fin' },
  veterinario:     { e: '🩺', n: 'Veterinario',  titulo: 'Motivo', detalle: 'Clínica / veterinario', monto: true, proxima: 'Próximo control', fotos: 'Boleta / receta' },
  salud:           { e: '🤒', n: 'Salud',        titulo: 'Qué notaste', fotos: 'Fotos' },
  bano:            { e: '🛁', n: 'Baño/peluq.',  titulo: 'Qué se hizo', monto: true, proxima: 'Próximo baño' },
  gasto:           { e: '🧾', n: 'Gasto',        titulo: 'Concepto', detalle: 'Dónde', monto: true, fotos: 'Boleta' },
  nota:            { e: '📝', n: 'Nota / foto',  titulo: 'Título', fotos: 'Fotos' },
};
const RAPIDOS = ['peso', 'comida', 'paseo', 'veterinario'];

// ================= Utilidades =================
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const vista = $('#vista');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ahoraLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const hoyISO = () => ahoraLocal().slice(0, 10);
const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const dinero = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const num = (n, dec = 2) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: dec }).format(n);

function aFecha(iso) { // 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm' -> Date local
  if (!iso) return null;
  const [d, t = '00:00'] = iso.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return new Date(y, m - 1, dd, hh || 0, mm || 0);
}
function fechaCorta(iso, conHora = true) {
  const d = aFecha(iso); if (!d) return '';
  const f = d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  return conHora && iso.includes('T') ? `${f}, ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : f;
}
function diasEntre(a, b) { return Math.round((aFecha(b.slice(0, 10)) - aFecha(a.slice(0, 10))) / 86400000); }
function edad(nac) {
  if (!nac) return '';
  const n = aFecha(nac), h = new Date();
  let meses = (h.getFullYear() - n.getFullYear()) * 12 + h.getMonth() - n.getMonth();
  if (h.getDate() < n.getDate()) meses--;
  if (meses < 0) return '';
  if (meses < 12) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  const a = Math.floor(meses / 12), m = meses % 12;
  return `${a} ${a === 1 ? 'año' : 'años'}${m ? ` y ${m} ${m === 1 ? 'mes' : 'meses'}` : ''}`;
}

let toastTimer;
function toast(msg) {
  const t = $('#aviso');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

// ================= Hoja inferior (formularios) =================
const hoja = $('#hoja'), velo = $('#velo');
let alCerrarHoja = null;
function abrirHoja(titulo, html) {
  hoja.innerHTML = `<div class="asa"></div><div class="hoja-cab"><h3>${esc(titulo)}</h3><button class="cerrar" data-cerrar aria-label="Cerrar">✕</button></div>${html}`;
  hoja.hidden = false; velo.hidden = false;
  document.body.style.overflow = 'hidden';
  return hoja;
}
function cerrarHoja() {
  hoja.hidden = true; velo.hidden = true; hoja.innerHTML = '';
  document.body.style.overflow = '';
  const f = alCerrarHoja; alCerrarHoja = null; if (f) f();
  window.dispatchEvent(new Event('hojaCerrada'));
}
velo.addEventListener('click', cerrarHoja);
hoja.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) cerrarHoja(); });
const hojaAbierta = () => !hoja.hidden;

// ================= Estado y navegación =================
const estado = { tab: 'inicio', filtro: 'todos', buscar: '', registros: [], perfil: null };
const TITULOS = { inicio: '', historial: 'Historial', graficos: 'Gráficos', ajustes: 'Ajustes' };

async function cargar() {
  [estado.registros, estado.perfil] = await Promise.all([db.todosLosRegistros(), db.leerPerfil()]);
}

document.querySelector('.tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  if (b.dataset.tab === 'nuevo') return formularioRegistro();
  irA(b.dataset.tab);
});

function irA(tab) {
  estado.tab = tab;
  document.querySelectorAll('.tabbar button[data-tab]').forEach(b => b.classList.toggle('activo', b.dataset.tab === tab));
  render();
  window.scrollTo(0, 0);
}

async function render() {
  $('#titulo').textContent = TITULOS[estado.tab] || estado.perfil?.nombre || 'Lisa';
  if (graficos.length) { graficos.forEach(g => g.destroy()); graficos = []; }
  if (estado.tab === 'inicio') vista.innerHTML = await vistaInicio();
  if (estado.tab === 'historial') vista.innerHTML = vistaHistorial();
  if (estado.tab === 'graficos') { vista.innerHTML = vistaGraficos(); dibujarGraficos(); }
  if (estado.tab === 'ajustes') vista.innerHTML = await vistaAjustes();
}

// ================= Recordatorios =================
// Para cada vacuna/remedio/control, se toma el registro más reciente con ese nombre.
function recordatorios() {
  const ultimo = new Map();
  for (const r of estado.registros) { // vienen ordenados del más nuevo al más viejo
    if (!TIPOS[r.tipo]?.proxima) continue;
    const clave = r.tipo + '|' + (r.titulo || '').trim().toLowerCase();
    if (!ultimo.has(clave)) ultimo.set(clave, r);
  }
  return [...ultimo.values()].filter(r => r.proxima).sort((a, b) => a.proxima.localeCompare(b.proxima));
}

// ================= Avisos de respaldo e instalación =================
const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

async function avisoRespaldo() {
  if (!estado.registros.length) return '';
  const ultimo = await db.leerMeta('ultimoRespaldo');
  const dias = ultimo ? diasEntre(ultimo.slice(0, 10), hoyISO()) : null;
  if (dias !== null && dias <= 30) return '';
  return `<div class="banner warn"><b>💾 ${ultimo ? `Tu último respaldo fue hace ${dias} días` : 'Aún no tienes un respaldo'}</b>
    Haz uno para no perder los datos de ${esc(estado.perfil.nombre || 'Lisa')} si cambias o pierdes el celular.
    <div><button class="btn" data-acc="exportar">Exportar respaldo</button></div></div>`;
}

function avisoInstalar() {
  if (instalada || !esIOS) return '';
  return `<div class="banner info"><b>📲 Instala la app en tu iPhone</b>
    En Safari toca <b style="display:inline">Compartir</b> → <b style="display:inline">Agregar a pantalla de inicio</b>.
    Úsala siempre desde el ícono: Safari y el ícono guardan datos por separado.</div>`;
}

// ================= Vista: Inicio =================
function itemHTML(r, extraClase = '') {
  const t = TIPOS[r.tipo] || TIPOS.nota;
  const titulo = r.titulo || t.n;
  const partes = [fechaCorta(r.fecha)];
  if (r.detalle) partes.push(r.detalle);
  if (r.notas) partes.push(r.notas);
  let valor = '';
  if (r.valor != null && r.valor !== '' && t.valor) valor = `${num(r.valor)} ${t.valor.unidad}`;
  else if (r.monto) valor = dinero.format(r.monto);
  const mini = r.fotos?.length ? `<img class="mini" src="${r.fotos[0]}" alt="">` : '';
  return `<li class="item ${extraClase}" data-acc="ver" data-id="${esc(r.id)}">
    <span class="e">${t.e}</span>
    <div class="grow"><div class="t">${esc(titulo)}</div><div class="s">${esc(partes.join(' · '))}</div></div>
    ${mini}${valor ? `<span class="v">${esc(valor)}</span>` : ''}</li>`;
}

async function vistaInicio() {
  const p = estado.perfil;
  const regs = estado.registros;
  const pesos = regs.filter(r => r.tipo === 'peso' && r.valor);
  const ultPeso = pesos[0];
  const inicioMes = hoyISO().slice(0, 7);
  const gastoMes = regs.filter(r => r.monto && r.fecha?.startsWith(inicioMes)).reduce((s, r) => s + Number(r.monto), 0);
  const hace7 = new Date(Date.now() - 7 * 864e5);
  const paseos7 = regs.filter(r => r.tipo === 'paseo' && aFecha(r.fecha) >= hace7);
  const minPaseo = paseos7.reduce((s, r) => s + (Number(r.valor) || 0), 0);

  const recs = recordatorios().filter(r => diasEntre(hoyISO(), r.proxima) <= 45);
  const recHTML = recs.map(r => {
    const d = diasEntre(hoyISO(), r.proxima);
    const txt = d < 0 ? `Atrasado ${-d} ${-d === 1 ? 'día' : 'días'}` : d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `En ${d} días (${fechaCorta(r.proxima, false)})`;
    const t = TIPOS[r.tipo];
    return `<li class="item ${d < 0 ? 'vencido' : d <= 7 ? 'pronto' : ''}" data-acc="ver" data-id="${esc(r.id)}">
      <span class="e">${t.e}</span><div class="grow"><div class="t">${esc(t.proxima)}: ${esc(r.titulo || t.n)}</div><div class="s">${esc(txt)}</div></div></li>`;
  }).join('');

  return `
    ${avisoInstalar()}
    ${await avisoRespaldo()}
    <div class="card perfil-card" data-acc="perfil">
      ${p.foto ? `<img class="avatar" src="${p.foto}" alt="Foto de ${esc(p.nombre)}">` : '<div class="avatar">🐶</div>'}
      <div class="grow">
        <h3>${esc(p.nombre || 'Lisa')}</h3>
        <div class="muted small">${esc([p.especie, p.raza, edad(p.nacimiento)].filter(Boolean).join(' · ') || 'Toca para completar su perfil')}</div>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><b>${ultPeso ? num(ultPeso.valor) + ' kg' : '—'}</b><span>${ultPeso ? 'Peso · ' + fechaCorta(ultPeso.fecha, false) : 'Peso'}</span></div>
      <div class="stat"><b>${paseos7.length}</b><span>Paseos (7 días)${minPaseo ? ` · ${minPaseo} min` : ''}</span></div>
      <div class="stat"><b>${dinero.format(gastoMes)}</b><span>Gastos del mes</span></div>
    </div>
    <div class="rapidos">${RAPIDOS.map(k => `<button class="rapido" data-acc="nuevo" data-tipo="${k}"><span class="e">${TIPOS[k].e}</span>${TIPOS[k].n}</button>`).join('')}</div>
    ${recHTML ? `<h2>Próximos</h2><ul class="lista">${recHTML}</ul>` : ''}
    <h2>Últimos registros</h2>
    ${regs.length ? `<ul class="lista">${regs.slice(0, 6).map(r => itemHTML(r)).join('')}</ul>
      ${regs.length > 6 ? `<button class="btn sec block" data-acc="tab" data-tab="historial">Ver todo el historial</button>` : ''}`
      : `<div class="card vacio">Aún no hay registros.<br>Toca <b>+</b> para agregar el primero.</div>`}
  `;
}

// ================= Vista: Historial =================
function vistaHistorial() {
  const q = estado.buscar.trim().toLowerCase();
  const lista = estado.registros.filter(r =>
    (estado.filtro === 'todos' || r.tipo === estado.filtro) &&
    (!q || [r.titulo, r.detalle, r.notas, TIPOS[r.tipo]?.n].join(' ').toLowerCase().includes(q)));
  const usados = new Set(estado.registros.map(r => r.tipo));
  const chips = ['todos', ...Object.keys(TIPOS).filter(k => usados.has(k))]
    .map(k => `<button class="chip ${estado.filtro === k ? 'on' : ''}" data-acc="filtro" data-tipo="${k}">${k === 'todos' ? 'Todos' : TIPOS[k].e + ' ' + TIPOS[k].n}</button>`).join('');
  let html = '', mesActual = '';
  for (const r of lista) {
    const m = r.fecha.slice(0, 7);
    if (m !== mesActual) {
      if (mesActual) html += '</ul>';
      mesActual = m;
      const d = aFecha(m + '-01');
      html += `<div class="mes">${d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}</div><ul class="lista">`;
    }
    html += itemHTML(r);
  }
  if (mesActual) html += '</ul>';
  return `
    <input type="search" id="buscar" placeholder="Buscar en el historial…" value="${esc(estado.buscar)}" style="margin-bottom:10px">
    <div class="chips">${chips}</div>
    <div id="resultados">${html || `<div class="card vacio">${estado.registros.length ? 'Nada coincide con la búsqueda.' : 'Aún no hay registros.'}</div>`}</div>`;
}

// ================= Vista: Gráficos =================
let graficos = [];
function vistaGraficos() {
  return `
    <h2>⚖️ Peso</h2><div class="card"><div class="grafico"><canvas id="gPeso"></canvas></div><p class="muted small" id="gPesoInfo"></p></div>
    <h2>💸 Gastos por mes</h2><div class="card"><div class="grafico"><canvas id="gGastos"></canvas></div><p class="muted small" id="gGastosInfo"></p></div>
    <h2>🦮 Paseos por semana (minutos)</h2><div class="card"><div class="grafico"><canvas id="gPaseos"></canvas></div></div>`;
}

function dibujarGraficos() {
  if (!window.Chart) return;
  const css = getComputedStyle(document.documentElement);
  const acento = css.getPropertyValue('--accent').trim();
  const tinta = css.getPropertyValue('--muted').trim();
  const linea = css.getPropertyValue('--line').trim();
  Chart.defaults.color = tinta;
  Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const ejes = { x: { grid: { display: false } }, y: { grid: { color: linea }, beginAtZero: false } };
  const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: ejes };

  // Peso
  const pesos = estado.registros.filter(r => r.tipo === 'peso' && r.valor).slice().reverse();
  graficos.push(new Chart($('#gPeso'), {
    type: 'line',
    data: { labels: pesos.map(r => fechaCorta(r.fecha, false)), datasets: [{ data: pesos.map(r => Number(r.valor)), borderColor: acento, backgroundColor: acento, tension: .3, pointRadius: 4 }] },
    options: { ...base, plugins: { ...base.plugins, tooltip: { callbacks: { label: c => `${num(c.parsed.y)} kg` } } } },
  }));
  $('#gPesoInfo').textContent = pesos.length
    ? `Último: ${num(pesos.at(-1).valor)} kg${pesos.length > 1 ? ` · Cambio desde el primero: ${(pesos.at(-1).valor - pesos[0].valor >= 0 ? '+' : '')}${num(pesos.at(-1).valor - pesos[0].valor)} kg` : ''}`
    : 'Registra el peso para ver su evolución.';

  // Gastos: últimos 12 meses
  const meses = [];
  const h = new Date();
  for (let i = 11; i >= 0; i--) { const d = new Date(h.getFullYear(), h.getMonth() - i, 1); meses.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }
  const suma = Object.fromEntries(meses.map(m => [m, 0]));
  for (const r of estado.registros) if (r.monto && suma[r.fecha?.slice(0, 7)] !== undefined) suma[r.fecha.slice(0, 7)] += Number(r.monto);
  graficos.push(new Chart($('#gGastos'), {
    type: 'bar',
    data: { labels: meses.map(m => aFecha(m + '-01').toLocaleDateString('es-CL', { month: 'short' })), datasets: [{ data: meses.map(m => suma[m]), backgroundColor: acento, borderRadius: 6 }] },
    options: { ...base, scales: { ...ejes, y: { ...ejes.y, beginAtZero: true, ticks: { callback: v => dinero.format(v) } } }, plugins: { ...base.plugins, tooltip: { callbacks: { label: c => dinero.format(c.parsed.y) } } } },
  }));
  const total = Object.values(suma).reduce((a, b) => a + b, 0);
  $('#gGastosInfo').textContent = `Total últimos 12 meses: ${dinero.format(total)}`;

  // Paseos: últimas 12 semanas
  const semanas = [];
  const lunes = new Date(h.getFullYear(), h.getMonth(), h.getDate() - ((h.getDay() + 6) % 7));
  for (let i = 11; i >= 0; i--) semanas.push(new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() - i * 7));
  const mins = semanas.map(() => 0);
  for (const r of estado.registros) {
    if (r.tipo !== 'paseo') continue;
    const i = Math.floor((aFecha(r.fecha) - semanas[0]) / (7 * 864e5));
    if (i >= 0 && i < semanas.length) mins[i] += Number(r.valor) || 0;
  }
  graficos.push(new Chart($('#gPaseos'), {
    type: 'bar',
    data: { labels: semanas.map(d => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })), datasets: [{ data: mins, backgroundColor: acento, borderRadius: 6 }] },
    options: { ...base, scales: { ...ejes, y: { ...ejes.y, beginAtZero: true } } },
  }));
}

// ================= Vista: Ajustes =================
async function vistaAjustes() {
  const ultimo = await db.leerMeta('ultimoRespaldo');
  const dias = ultimo ? diasEntre(ultimo.slice(0, 10), hoyISO()) : null;
  let almacen = 'No disponible en este navegador';
  if (navigator.storage?.persisted) {
    const persistido = await navigator.storage.persisted();
    almacen = persistido ? '✅ Persistente (iOS no debería borrarlo)' : '⚠️ No persistente todavía';
  }
  let uso = '';
  if (navigator.storage?.estimate) {
    const { usage } = await navigator.storage.estimate();
    if (usage != null) uso = `${num(usage / 1048576, 1)} MB usados`;
  }
  const nFotos = estado.registros.reduce((s, r) => s + (r.fotos?.length || 0), 0) + (estado.perfil.foto ? 1 : 0);
  return `
    ${await avisoRespaldo()}
    <h2>Perfil</h2>
    <button class="btn sec block" data-acc="perfil">🐶 Editar perfil de ${esc(estado.perfil.nombre || 'Lisa')}</button>

    <h2>Respaldo</h2>
    <div class="card">
      <dl class="datos">
        <dt>Último respaldo</dt><dd>${ultimo ? `${fechaCorta(ultimo.slice(0, 16))} (hace ${dias} ${dias === 1 ? 'día' : 'días'})` : 'Nunca'}</dd>
        <dt>Contenido</dt><dd>${estado.registros.length} registros · ${nFotos} fotos</dd>
      </dl>
      <div class="btns" style="margin-top:12px">
        <button class="btn block" data-acc="exportar">⬆️ Exportar respaldo</button>
        <label class="btn sec block">⬇️ Importar respaldo<input type="file" id="importar" hidden></label>
      </div>
      <p class="muted small">El respaldo es un archivo .json con todo: registros, perfil y fotos. Guárdalo en Archivos / iCloud Drive, o envíalo por AirDrop o WhatsApp. En el celular nuevo, usa “Importar respaldo”.</p>
    </div>

    <div class="banner danger">
      <b>⚠️ Importante</b>
      Tus datos viven solo en este iPhone, dentro de la app. Si borras el ícono de la pantalla de inicio, <b style="display:inline">se borran todos los datos</b> y no se pueden recuperar, salvo que tengas un respaldo.
    </div>

    <h2>Almacenamiento</h2>
    <div class="card">
      <dl class="datos"><dt>Estado</dt><dd>${almacen}</dd>${uso ? `<dt>Espacio</dt><dd>${uso}</dd>` : ''}</dl>
    </div>

    <h2>Acerca de</h2>
    <div class="card"><dl class="datos">
      <dt>Versión</dt><dd>${esc(VERSION)}</dd>
      <dt>Instalada</dt><dd>${instalada ? 'Sí, desde el ícono' : 'No (abierta en el navegador)'}</dd>
    </dl>
    <p class="muted small">La app se actualiza sola cuando hay una versión nueva y no toca tus datos.</p></div>`;
}

// ================= Formulario de registro =================
function formularioRegistro(tipo = null, existente = null, plantilla = {}) {
  if (!tipo && !existente) {
    const h = abrirHoja('Nuevo registro', `<div class="tipos">${Object.entries(TIPOS).map(([k, t]) =>
      `<button class="rapido" data-tipo="${k}"><span class="e">${t.e}</span>${t.n}</button>`).join('')}</div>`);
    h.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => formularioRegistro(b.dataset.tipo)));
    return;
  }
  const r = existente || { ...plantilla, id: nuevoId(), tipo, fecha: ahoraLocal(), fotos: [] };
  const t = TIPOS[r.tipo] || TIPOS.nota;
  let fotos = [...(r.fotos || [])];

  // Sugerencias para el título según lo ya registrado (ej. nombres de vacunas)
  const sugerencias = [...new Set(estado.registros.filter(x => x.tipo === r.tipo && x.titulo).map(x => x.titulo))].slice(0, 30);

  const h = abrirHoja(`${t.e} ${existente ? 'Editar' : t.n}`, `
    <form id="fReg" autocomplete="off">
      <label class="campo"><span>Fecha y hora</span><input type="datetime-local" name="fecha" value="${esc(r.fecha)}" required></label>
      ${t.titulo ? `<label class="campo"><span>${esc(t.titulo)}</span><input name="titulo" list="sugTitulo" value="${esc(r.titulo)}"></label>
        <datalist id="sugTitulo">${sugerencias.map(s => `<option value="${esc(s)}">`).join('')}</datalist>` : ''}
      ${t.valor ? `<label class="campo"><span>${esc(t.valor.label)} (${t.valor.unidad})</span><input name="valor" type="number" inputmode="decimal" step="${t.valor.paso}" min="0" value="${esc(r.valor)}" ${r.tipo === 'peso' ? 'required' : ''}></label>` : ''}
      ${t.detalle ? `<label class="campo"><span>${esc(t.detalle)}</span><input name="detalle" value="${esc(r.detalle)}"></label>` : ''}
      ${t.monto || t.proxima ? `<div class="dos-col">
        ${t.monto ? `<label class="campo"><span>Costo ($)</span><input name="monto" type="number" inputmode="numeric" min="0" step="1" value="${esc(r.monto)}"></label>` : ''}
        ${t.proxima ? `<label class="campo"><span>${esc(t.proxima)}</span><input name="proxima" type="date" value="${esc(r.proxima)}"></label>` : ''}
      </div>` : ''}
      <label class="campo"><span>Notas</span><textarea name="notas">${esc(r.notas)}</textarea></label>
      <span class="muted small" style="font-weight:600;display:block;margin:0 2px 5px">${esc(t.fotos || 'Fotos (opcional)')}</span>
      <div class="fotos" id="fotos"></div>
      <div class="btns ${existente ? 'dos' : ''}">
        ${existente ? '<button type="button" class="btn peligro" id="borrar">Eliminar</button>' : ''}
        <button class="btn block" type="submit">Guardar</button>
      </div>
    </form>`);

  const pintarFotos = () => {
    h.querySelector('#fotos').innerHTML = fotos.map((f, i) =>
      `<div class="foto"><img src="${f}" alt=""><button type="button" data-quitar="${i}" aria-label="Quitar foto">✕</button></div>`).join('') +
      `<label class="agregar-foto" aria-label="Agregar foto">📷<input type="file" accept="image/*" multiple></label>`;
  };
  pintarFotos();
  h.querySelector('#fotos').addEventListener('click', (e) => {
    const q = e.target.closest('[data-quitar]'); if (!q) return;
    fotos.splice(Number(q.dataset.quitar), 1); pintarFotos();
  });
  h.querySelector('#fotos').addEventListener('change', async (e) => {
    const archivos = [...(e.target.files || [])]; if (!archivos.length) return;
    toast('Comprimiendo foto…');
    const esBoleta = ['veterinario', 'gasto', 'vacuna'].includes(r.tipo);
    for (const a of archivos) {
      try { fotos.push(await comprimir(a, esBoleta ? 1600 : 1280, esBoleta ? 0.78 : 0.72)); }
      catch { toast('No se pudo leer una de las fotos'); }
    }
    pintarFotos();
  });

  h.querySelector('#fReg').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const reg = {
      ...r,
      fecha: d.fecha || ahoraLocal(),
      titulo: (d.titulo || '').trim() || undefined,
      detalle: (d.detalle || '').trim() || undefined,
      notas: (d.notas || '').trim() || undefined,
      valor: d.valor !== undefined && d.valor !== '' ? Number(String(d.valor).replace(',', '.')) : undefined,
      monto: d.monto !== undefined && d.monto !== '' ? Number(d.monto) : undefined,
      proxima: d.proxima || undefined,
      fotos,
      creado: r.creado || new Date().toISOString(),
      actualizado: new Date().toISOString(),
    };
    try {
      await db.guardarRegistro(reg);
      pedirPersistencia();
      await cargar();
      cerrarHoja();
      toast(existente ? 'Cambios guardados' : 'Registro guardado ✓');
      render();
    } catch (err) {
      alert('No se pudo guardar: ' + err.message);
    }
  });

  h.querySelector('#borrar')?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este registro? No se puede deshacer.')) return;
    await db.borrarRegistro(r.id);
    await cargar(); cerrarHoja(); toast('Registro eliminado'); render();
  });
}

function verRegistro(id) {
  const r = estado.registros.find(x => x.id === id); if (!r) return;
  const t = TIPOS[r.tipo] || TIPOS.nota;
  const filas = [
    ['Fecha', fechaCorta(r.fecha)],
    t.valor && r.valor != null ? [t.valor.label, `${num(r.valor)} ${t.valor.unidad}`] : null,
    t.detalle && r.detalle ? [t.detalle, r.detalle] : null,
    r.monto ? ['Costo', dinero.format(r.monto)] : null,
    r.proxima ? [t.proxima || 'Próxima', fechaCorta(r.proxima, false)] : null,
    r.notas ? ['Notas', r.notas] : null,
  ].filter(Boolean);
  const h = abrirHoja(`${t.e} ${r.titulo || t.n}`, `
    <dl class="datos" style="margin-bottom:14px">${filas.map(([a, b]) => `<dt>${esc(a)}</dt><dd style="white-space:pre-wrap">${esc(b)}</dd>`).join('')}</dl>
    ${r.fotos?.length ? `<div class="fotos">${r.fotos.map((f, i) => `<div class="foto"><img src="${f}" alt="" data-foto="${i}"></div>`).join('')}</div>` : ''}
    <div class="btns dos">
      <button class="btn sec" id="editar">Editar</button>
      ${t.proxima ? '<button class="btn" id="repetir">Registrar otra vez</button>' : '<button class="btn" data-cerrar>Listo</button>'}
    </div>`);
  h.querySelector('#editar').addEventListener('click', () => formularioRegistro(r.tipo, r));
  h.querySelector('#repetir')?.addEventListener('click', () => formularioRegistro(r.tipo, null, { titulo: r.titulo, detalle: r.detalle }));
  h.querySelectorAll('[data-foto]').forEach(img => img.addEventListener('click', () => {
    abrirHoja('Foto', `<div class="visor"><img src="${r.fotos[Number(img.dataset.foto)]}" alt=""></div>
      <p class="muted small">Mantén presionada la foto para guardarla o compartirla.</p>`);
  }));
}

// ================= Perfil =================
function formularioPerfil() {
  const p = { ...estado.perfil };
  const campo = (n, label, tipo = 'text', extra = '') => `<label class="campo"><span>${label}</span><input name="${n}" type="${tipo}" value="${esc(p[n])}" ${extra}></label>`;
  const h = abrirHoja('Perfil', `
    <form id="fPerfil" autocomplete="off">
      <div class="row" style="margin-bottom:14px">
        <div id="fotoPerfil">${p.foto ? `<img class="avatar" src="${p.foto}" alt="">` : '<div class="avatar">🐶</div>'}</div>
        <label class="btn sec">📷 Cambiar foto<input type="file" accept="image/*" id="inFoto" hidden></label>
      </div>
      ${campo('nombre', 'Nombre', 'text', 'required')}
      <div class="dos-col">${campo('especie', 'Especie', 'text', 'placeholder="Perro, gato…"')}${campo('raza', 'Raza')}</div>
      <div class="dos-col">${campo('nacimiento', 'Nacimiento', 'date')}
        <label class="campo"><span>Sexo</span><select name="sexo">${['', 'Hembra', 'Macho'].map(s => `<option ${p.sexo === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
      <div class="dos-col">${campo('color', 'Color')}${campo('chip', 'N° microchip', 'text', 'inputmode="numeric"')}</div>
      <label class="campo"><span>Esterilizada</span><select name="esterilizada">${['', 'Sí', 'No'].map(s => `<option ${p.esterilizada === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <div class="dos-col">${campo('vet', 'Veterinario/a')}${campo('vetTelefono', 'Teléfono vet', 'tel')}</div>
      <label class="campo"><span>Alergias / condiciones</span><textarea name="alergias">${esc(p.alergias)}</textarea></label>
      <label class="campo"><span>Notas</span><textarea name="notas">${esc(p.notas)}</textarea></label>
      <button class="btn block" type="submit">Guardar perfil</button>
    </form>`);
  h.querySelector('#inFoto').addEventListener('change', async (e) => {
    const a = e.target.files?.[0]; if (!a) return;
    try {
      p.foto = await comprimir(a, 800, 0.75);
      h.querySelector('#fotoPerfil').innerHTML = `<img class="avatar" src="${p.foto}" alt="">`;
    } catch { toast('No se pudo leer la foto'); }
  });
  h.querySelector('#fPerfil').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    for (const k in d) d[k] = d[k].trim();
    await db.guardarPerfil({ ...p, ...d });
    pedirPersistencia();
    await cargar(); cerrarHoja(); toast('Perfil guardado ✓'); render();
  });
}

// ================= Respaldo: exportar =================
async function exportar() {
  toast('Preparando respaldo…');
  const datos = await db.exportarTodo();
  const json = JSON.stringify(datos);
  const nombre = `lisa-respaldo-${hoyISO()}.json`;
  const archivo = new File([json], nombre, { type: 'application/json' });
  const mb = archivo.size < 1048576 ? `${Math.max(1, Math.round(archivo.size / 1024))} KB` : `${num(archivo.size / 1048576, 1)} MB`;
  const puedeCompartir = !!(navigator.canShare && navigator.canShare({ files: [archivo] }));

  // El botón "Compartir" va en un segundo paso: iOS exige que el menú se abra
  // justo después de un toque, y preparar un respaldo con muchas fotos toma tiempo.
  const h = abrirHoja('Exportar respaldo', `
    <div class="card"><dl class="datos">
      <dt>Archivo</dt><dd>${esc(nombre)}</dd>
      <dt>Tamaño</dt><dd>${mb}</dd>
      <dt>Contiene</dt><dd>${datos.registros.length} registros, perfil y fotos</dd>
    </dl></div>
    <p class="muted small">${puedeCompartir ? 'Se abrirá el menú de compartir: elige <b>Guardar en Archivos</b> (iCloud Drive), <b>AirDrop</b> o <b>WhatsApp</b>.' : 'Se descargará el archivo .json.'}</p>
    <button class="btn block" id="compartir">${puedeCompartir ? 'Compartir respaldo' : 'Descargar respaldo'}</button>`);

  h.querySelector('#compartir').addEventListener('click', async () => {
    try {
      if (puedeCompartir) {
        await navigator.share({ files: [archivo], title: 'Respaldo de Lisa' });
      } else {
        const url = URL.createObjectURL(archivo);
        const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      await db.guardarMeta('ultimoRespaldo', new Date().toISOString());
      cerrarHoja(); toast('Respaldo listo ✓'); render();
    } catch (err) {
      if (err.name === 'AbortError') return toast('No se compartió el respaldo');
      alert('No se pudo exportar: ' + err.message);
    }
  });
}

// ================= Respaldo: importar =================
async function importar(archivo) {
  let datos;
  try {
    datos = JSON.parse(await archivo.text());
    if (datos?.app !== 'AppLisa' || !Array.isArray(datos.registros)) throw new Error('formato');
  } catch {
    return alert('Este archivo no es un respaldo válido de la app de Lisa.');
  }
  const porTipo = {};
  let nFotos = datos.perfil?.foto ? 1 : 0;
  for (const r of datos.registros) { porTipo[r.tipo] = (porTipo[r.tipo] || 0) + 1; nFotos += r.fotos?.length || 0; }
  const fechas = datos.registros.map(r => r.fecha).filter(Boolean).sort();
  const resumen = Object.entries(porTipo).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${TIPOS[k]?.e || '•'} ${TIPOS[k]?.n || k}: ${n}`).join('<br>');

  const h = abrirHoja('Importar respaldo', `
    <div class="card"><dl class="datos">
      <dt>Fecha del respaldo</dt><dd>${esc(new Date(datos.creado).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' }))}</dd>
      <dt>Mascota</dt><dd>${esc(datos.perfil?.nombre || '—')}</dd>
      <dt>Registros</dt><dd>${datos.registros.length}</dd>
      ${fechas.length ? `<dt>Período</dt><dd>${esc(fechaCorta(fechas[0], false))} → ${esc(fechaCorta(fechas.at(-1), false))}</dd>` : ''}
      <dt>Fotos</dt><dd>${nFotos}</dd>
    </dl>${resumen ? `<p class="small" style="margin:10px 0 0">${resumen}</p>` : ''}</div>
    ${estado.registros.length ? `<div class="banner danger"><b>Esto reemplazará lo que hay ahora</b>Se borrarán los ${estado.registros.length} registros y el perfil actuales de este celular y se cargarán los del respaldo.</div>` : ''}
    <div class="btns dos"><button class="btn sec" data-cerrar>Cancelar</button><button class="btn" id="confirmar">Importar</button></div>`);

  h.querySelector('#confirmar').addEventListener('click', async () => {
    try {
      await db.reemplazarTodo(datos);
      await db.guardarMeta('ultimoRespaldo', datos.creado);
      pedirPersistencia();
      await cargar(); cerrarHoja(); toast(`Respaldo importado: ${datos.registros.length} registros ✓`);
      irA('inicio');
    } catch (err) {
      alert('No se pudo importar (tus datos actuales no se tocaron): ' + err.message);
    }
  });
}

// ================= Acciones en la vista (delegación de eventos) =================
vista.addEventListener('click', (e) => {
  const el = e.target.closest('[data-acc]'); if (!el) return;
  const acc = el.dataset.acc;
  if (acc === 'ver') verRegistro(el.dataset.id);
  if (acc === 'nuevo') formularioRegistro(el.dataset.tipo);
  if (acc === 'perfil') formularioPerfil();
  if (acc === 'exportar') exportar().catch(err => alert('No se pudo preparar el respaldo: ' + err.message));
  if (acc === 'tab') irA(el.dataset.tab);
  if (acc === 'filtro') { estado.filtro = el.dataset.tipo; render(); }
});
vista.addEventListener('input', (e) => {
  if (e.target.id !== 'buscar') return;
  estado.buscar = e.target.value;
  // Solo se redibuja la lista, para no perder el foco del buscador
  const tmp = document.createElement('div'); tmp.innerHTML = vistaHistorial();
  $('#resultados').replaceWith(tmp.querySelector('#resultados'));
});
vista.addEventListener('change', (e) => {
  if (e.target.id === 'importar' && e.target.files?.[0]) { importar(e.target.files[0]); e.target.value = ''; }
});

// ================= Almacenamiento persistente =================
async function pedirPersistencia() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* no disponible */ }
}

// ================= Bienvenida (una sola vez) =================
async function bienvenida() {
  if (await db.leerMeta('bienvenidaVista')) return;
  const h = abrirHoja('¡Hola! 🐾', `
    <p>Aquí vas a registrar todo sobre ${esc(estado.perfil.nombre || 'Lisa')}: peso, comidas, paseos, vacunas, visitas al vet, gastos y fotos.</p>
    <div class="banner danger"><b>⚠️ Tus datos viven solo en este iPhone</b>
      No se suben a internet. Si borras el ícono de la pantalla de inicio se pierden, salvo que tengas un respaldo.
      Haz uno de vez en cuando en <b style="display:inline">Ajustes → Exportar respaldo</b> (te lo recordaré cada 30 días).</div>
    <button class="btn block" data-cerrar>Entendido</button>`);
  alCerrarHoja = () => db.guardarMeta('bienvenidaVista', true);
  return h;
}

// ================= Service worker: offline y actualización automática =================
function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  let recargando = false;
  let hayNueva = false;
  const recargar = () => {
    if (recargando) return;
    if (hojaAbierta()) { hayNueva = true; return; } // no interrumpir si estás escribiendo
    recargando = true;
    sessionStorage.setItem('actualizada', '1');
    location.reload();
  };
  // Cuando la versión nueva toma el control, recargamos para usarla. Los datos (IndexedDB) no se tocan.
  navigator.serviceWorker.addEventListener('controllerchange', recargar);
  window.addEventListener('hojaCerrada', () => { if (hayNueva) recargar(); });

  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    const activar = (sw) => { if (sw && navigator.serviceWorker.controller) sw.postMessage('activar'); };
    if (reg.waiting) activar(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener('statechange', () => { if (nuevo.state === 'installed') activar(nuevo); });
    });
    // Buscar versión nueva cada vez que vuelves a abrir la app
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}

// ================= Arranque =================
(async function iniciar() {
  try {
    await cargar();
  } catch (err) {
    vista.innerHTML = `<div class="banner danger"><b>No se pudo abrir la base de datos</b>${esc(err.message)}</div>`;
    return;
  }
  render();
  registrarSW();
  pedirPersistencia();
  if (sessionStorage.getItem('actualizada')) { sessionStorage.removeItem('actualizada'); toast(`App actualizada a la versión ${VERSION} ✓`); }
  bienvenida();
})();
