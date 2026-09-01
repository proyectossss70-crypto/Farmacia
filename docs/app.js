'use strict';

import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, orderBy,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbf = getFirestore(app);

// ---------- utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const money = (n) => (Number(n) || 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ESTADO_LABEL = { ok: 'OK', por_vencer: 'Por vencer', vencido: 'Vencido', sin_fecha: 'Sin fecha' };
const UNIDAD_LABEL = { unidad: 'Por unidad', blister: 'Por blister' };
const ROLES = ['jefe', 'administrador', 'soporte', 'cajero'];
const PERMISOS = {
  jefe: { inventario: 'rw', reportes: true, usuarios: 'rw', config: 'rw', costos: true },
  administrador: { inventario: 'rw', reportes: true, usuarios: 'r', config: 'rw', costos: true },
  soporte: { inventario: 'r', reportes: true, usuarios: 'rw', config: 'r', costos: true },
  cajero: { inventario: 'r', reportes: false, usuarios: false, config: false, costos: false },
};

let ME = null;
let PERM = {};
let MESES = 6;
let MEDS = [];

// ---------- lógica de negocio ----------
function addMonths(date, n) { const d = new Date(date); d.setMonth(d.getMonth() + n); return d; }

function calcularEstado(fecha, meses) {
  if (!fecha) return { estado: 'sin_fecha', dias: null };
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const fv = new Date(fecha + 'T00:00:00');
  const dias = Math.round((fv - hoy) / 86400000);
  if (fv < hoy) return { estado: 'vencido', dias };
  if (fv <= addMonths(hoy, meses)) return { estado: 'por_vencer', dias };
  return { estado: 'ok', dias };
}

function enriquecer(m) {
  const { estado, dias } = calcularEstado(m.fecha_vencimiento, MESES);
  const stock = Number(m.stock) || 0, precio = Number(m.precio) || 0, costo = Number(m.costo) || 0;
  const min = Number(m.stock_minimo) || 0;
  return {
    ...m, stock, precio, costo, stock_minimo: min,
    estado, dias_para_vencer: dias,
    margen_unitario: +(precio - costo).toFixed(4),
    margen_pct: precio > 0 ? +(((precio - costo) / precio) * 100).toFixed(2) : 0,
    valor_costo: +(stock * costo).toFixed(2),
    valor_venta: +(stock * precio).toFixed(2),
    bajo_stock: stock <= min,
  };
}

// ---------- toast ----------
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 3000);
}

// ---------- pantalla de carga a pantalla completa ----------
function showCargando(texto) {
  $('#cargando-txt').textContent = texto;
  $('#cargando').hidden = false;
}
function hideCargando() {
  $('#cargando').hidden = true;
}

// ---------- autenticación ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    hideCargando();
    ME = null;
    $('#app').hidden = true;
    $('#login').hidden = false;
    return;
  }
  // Hay sesión: mantenemos la pantalla de carga hasta tener todo listo,
  // así no se ve la app a medio cargar.
  $('#login').hidden = true;
  $('#app').hidden = true;
  showCargando('Verificando tu cuenta');
  try {
    const snap = await getDoc(doc(dbf, 'usuarios', user.uid));
    if (!snap.exists() || snap.data().activo !== true) {
      await signOut(auth);
      hideCargando();
      $('#login').hidden = false;
      $('#login-error').textContent = 'Tu cuenta no tiene acceso o está desactivada.';
      $('#login-error').hidden = false;
      return;
    }
    const d = snap.data();
    ME = { uid: user.uid, email: user.email, nombre: d.nombre || user.email, rol: d.rol };
    PERM = PERMISOS[d.rol] || {};
    const inic = (ME.nombre || ME.email || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    $('#user-box').innerHTML =
      `<span class="avatar">${esc(inic)}</span>` +
      `<span class="who"><strong>${esc(ME.nombre)}</strong><span class="rol">${esc(ME.rol)}</span></span>`;
    const vis = {
      dashboard: true, inventario: !!PERM.inventario, reportes: !!PERM.reportes,
      usuarios: !!PERM.usuarios, configuracion: !!PERM.config,
    };
    $$('#nav > a').forEach((a) => a.classList.toggle('hidden', !vis[a.dataset.view]));
    if (!vis.reportes && $('#nav-informes-sub')) $('#nav-informes-sub').hidden = true;
    showCargando('Cargando tu información');
    MESES = await getMeses();
    await navigate('dashboard');
    $('#app').hidden = false;
    hideCargando();
  } catch (e) {
    console.error(e);
    hideCargando();
    $('#login').hidden = false;
    toast('Error al cargar tu perfil: ' + e.message, true);
  }
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').hidden = true;
  const f = e.target;
  const btn = f.querySelector('button[type=submit]');
  btn.classList.add('busy');
  try {
    await signInWithEmailAndPassword(auth, f.email.value.trim(), f.password.value);
  } catch (err) {
    $('#login-error').textContent = /invalid|not-found|wrong|credential/i.test(err.code || '')
      ? 'Correo o contraseña incorrectos.'
      : 'No se pudo iniciar sesión: ' + (err.code || err.message);
    $('#login-error').hidden = false;
  } finally {
    btn.classList.remove('busy');
  }
});

['#logout', '#logout-m'].forEach((s) => $(s) && $(s).addEventListener('click', () => signOut(auth)));

// ---------- navegación ----------
$$('#nav > a').forEach((a) => a.addEventListener('click', () => navigate(a.dataset.view)));

// Apartado desplegable «Informes»: expande/colapsa y permite descargar cada
// reporte directo desde el menú, sin entrar a la página.
const navInformes = $('#nav-informes');
const navInformesSub = $('#nav-informes-sub');
if (navInformes && navInformesSub) {
  navInformes.addEventListener('click', () => {
    const abierto = navInformesSub.hidden;
    navInformesSub.hidden = !abierto;
    navInformes.setAttribute('aria-expanded', String(abierto));
  });
  $$('[data-rep]', navInformesSub).forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    withBusy(a, () => descargarExcel(a.dataset.rep));
  }));
}

function navigate(view) {
  $$('#nav > a').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  $$('.view').forEach((s) => (s.hidden = s.dataset.view !== view));
  const cargar = { dashboard: loadDashboard, inventario: loadInventario, reportes: loadReportes, usuarios: loadUsuarios, configuracion: loadConfig }[view] || (() => {});
  return cargar();
}

// ---------- datos ----------
async function getMeses() {
  try {
    const s = await getDoc(doc(dbf, 'configuracion', 'app'));
    const n = s.exists() ? parseInt(s.data().meses_alerta_vencimiento, 10) : 6;
    return Number.isFinite(n) && n >= 0 ? n : 6;
  } catch { return 6; }
}

async function fetchMeds() {
  const qs = await getDocs(query(collection(dbf, 'medicamentos'), orderBy('nombre')));
  MEDS = qs.docs.map((d) => enriquecer({ id: d.id, ...d.data() }));
}

// ---------- estados de carga ----------
function skeletonCards(n = 4) {
  return Array.from({ length: n }).map(() =>
    `<div class="card"><div class="skeleton" style="height:10px;width:55%"></div>` +
    `<div class="skeleton" style="height:26px;width:42%;margin-top:14px"></div></div>`).join('');
}
function skeletonTable(rows = 5, cols = 5) {
  return `<div class="skeleton-table">${Array.from({ length: rows }).map(() =>
    `<div class="skeleton-row">${Array.from({ length: cols }).map((_, i) =>
      `<div class="skeleton" style="flex:${i === 0 ? 2.4 : 1}"></div>`).join('')}</div>`).join('')}</div>`;
}
async function withBusy(btn, fn) {
  if (btn) btn.classList.add('busy');
  try { return await fn(); }
  finally { if (btn) btn.classList.remove('busy'); }
}

// ---------- dashboard ----------
async function loadDashboard() {
  $('#cards').innerHTML = skeletonCards(4);
  $('#alertas').innerHTML = skeletonTable(4, 5);
  MESES = await getMeses();
  if (PERM.inventario) await fetchMeds();
  const tot = (f) => MEDS.reduce((s, m) => s + f(m), 0);
  const cards = [
    { n: MEDS.length, l: 'Artículos' },
    { n: +tot((m) => m.stock).toFixed(2), l: 'Unidades en stock' },
    PERM.costos && { n: '$' + money(tot((m) => m.valor_costo)), l: 'Valor a costo' },
    { n: '$' + money(tot((m) => m.valor_venta)), l: 'Valor a venta' },
    { n: MEDS.filter((m) => m.estado === 'por_vencer').length, l: `Por vencer (${MESES} meses)`, cls: 'warn' },
    { n: MEDS.filter((m) => m.estado === 'vencido').length, l: 'Vencidos', cls: 'bad' },
    { n: MEDS.filter((m) => m.bajo_stock).length, l: 'Bajo stock', cls: 'warn' },
  ].filter(Boolean);
  $('#cards').innerHTML = cards.map((c) =>
    `<div class="card ${c.cls && c.n ? c.cls : ''}"><div class="n">${esc(c.n)}</div><div class="l">${esc(c.l)}</div></div>`).join('');

  const al = MEDS.filter((m) => m.estado === 'vencido' || m.estado === 'por_vencer' || m.bajo_stock)
    .sort((a, b) => (a.dias_para_vencer ?? 1e9) - (b.dias_para_vencer ?? 1e9));
  $('#alertas').innerHTML = al.length
    ? tabla(['Medicamento', 'Stock', 'Vence', 'Días', 'Estado'],
        al.map((m) => [esc(m.nombre), m.stock, m.fecha_vencimiento || '—', m.dias_para_vencer ?? '—', badge(m)]))
    : '<div class="empty">Nada requiere atención 🎉</div>';
}

// ---------- inventario ----------
$('#buscar').addEventListener('input', renderInv);
$('#filtro-estado').addEventListener('change', renderInv);
$('#nuevo-med').addEventListener('click', () => formMed());

async function loadInventario() {
  $('#nuevo-med').hidden = PERM.inventario !== 'rw';
  $('#inv-table').innerHTML = skeletonTable(6, 6);
  MESES = await getMeses();
  await fetchMeds();
  renderInv();
}

function renderInv() {
  const q = $('#buscar').value.trim().toLowerCase();
  const fe = $('#filtro-estado').value;
  const rw = PERM.inventario === 'rw';
  const ver = !!PERM.costos;
  const rows = MEDS.filter((m) =>
    (!q || m.nombre.toLowerCase().includes(q) || (m.categoria || '').toLowerCase().includes(q)) &&
    (!fe || m.estado === fe));
  const headers = ['Medicamento', 'Categoría', 'Stock', 'Precio',
    ...(ver ? ['Costo', 'Margen'] : []), 'Vence', 'Se vende', 'Estado'];
  if (rw) headers.push('');
  $('#inv-table').innerHTML = rows.length ? tabla(headers, rows.map((m) => {
    const c = [
      esc(m.nombre) + (m.lote ? ` <span class="muted">(${esc(m.lote)})</span>` : ''),
      esc(m.categoria || '—'),
      `${m.stock}${m.bajo_stock ? '<span class="badge low">bajo</span>' : ''}`,
      '$' + money(m.precio),
      ...(ver ? [
        '$' + money(m.costo),
        `$${money(m.margen_unitario)} <span class="muted">(${m.margen_pct}%)</span>`,
      ] : []),
      m.fecha_vencimiento || '—',
      UNIDAD_LABEL[m.unidad_venta] + (m.unidad_venta === 'blister' ? ` ×${m.unidades_por_blister}` : ''),
      badge(m),
    ];
    if (rw) c.push(`<button class="row-btn" data-edit="${m.id}">Editar</button><button class="row-btn danger" data-del="${m.id}">Eliminar</button>`);
    return c;
  })) : '<div class="empty">Sin resultados</div>';
  $$('#inv-table [data-edit]').forEach((b) => b.addEventListener('click', () => formMed(MEDS.find((m) => m.id === b.dataset.edit))));
  $$('#inv-table [data-del]').forEach((b) => b.addEventListener('click', () => borrarMed(b.dataset.del)));
}

function limpiarMed(b) {
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const nombre = String(b.nombre || '').trim();
  if (!nombre) throw new Error('El nombre es obligatorio');
  let fecha = b.fecha_vencimiento ? String(b.fecha_vencimiento).slice(0, 10) : null;
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Fecha de vencimiento inválida');
  return {
    nombre,
    categoria: String(b.categoria || '').trim() || null,
    stock: num(b.stock), stock_minimo: num(b.stock_minimo),
    precio: num(b.precio), costo: num(b.costo),
    fecha_vencimiento: fecha,
    unidad_venta: b.unidad_venta === 'blister' ? 'blister' : 'unidad',
    unidades_por_blister: Math.max(1, Math.round(num(b.unidades_por_blister, 1))),
    lote: String(b.lote || '').trim() || null,
  };
}

function formMed(med = null) {
  const m = med || { unidad_venta: 'unidad', unidades_por_blister: 10, stock: 0, stock_minimo: 0, precio: 0, costo: 0 };
  openModal(med ? 'Editar medicamento' : 'Nuevo medicamento', `
    <label>Nombre del medicamento<input name="nombre" value="${esc(m.nombre || '')}" required></label>
    <div class="grid2">
      <label>Categoría<input name="categoria" value="${esc(m.categoria || '')}"></label>
      <label>Lote<input name="lote" value="${esc(m.lote || '')}"></label>
    </div>
    <div class="grid2">
      <label>En stock<input name="stock" type="number" step="any" value="${m.stock}"></label>
      <label>Stock mínimo<input name="stock_minimo" type="number" step="any" value="${m.stock_minimo}"></label>
    </div>
    <div class="grid2">
      <label>Precio de venta<input name="precio" type="number" step="any" value="${m.precio}"></label>
      <label>Costo<input name="costo" type="number" step="any" value="${m.costo}"></label>
    </div>
    <div class="grid2">
      <label>Fecha de vencimiento<input name="fecha_vencimiento" type="date" value="${esc(m.fecha_vencimiento || '')}"></label>
      <label>Se vende por
        <select name="unidad_venta">
          <option value="unidad" ${m.unidad_venta === 'unidad' ? 'selected' : ''}>Unidad</option>
          <option value="blister" ${m.unidad_venta === 'blister' ? 'selected' : ''}>Blister</option>
        </select>
      </label>
    </div>
    <label>Unidades por blister<input name="unidades_por_blister" type="number" min="1" step="1" value="${m.unidades_por_blister || 1}"></label>
    <button type="submit">Guardar</button>
  `, async (f) => {
    const data = limpiarMed(Object.fromEntries(new FormData(f).entries()));
    const now = new Date().toISOString();
    if (med) await updateDoc(doc(dbf, 'medicamentos', med.id), { ...data, actualizado_en: now });
    else await addDoc(collection(dbf, 'medicamentos'), { ...data, creado_en: now, actualizado_en: now });
    closeModal();
    toast('Medicamento guardado');
    loadInventario();
  });
}

async function borrarMed(id) {
  if (!confirm('¿Eliminar este medicamento del inventario?')) return;
  try { await deleteDoc(doc(dbf, 'medicamentos', id)); toast('Medicamento eliminado'); loadInventario(); }
  catch (e) { toast(e.message, true); }
}

// ---------- reportes (Excel con SheetJS) ----------
async function loadReportes() {
  const defs = [
    ['inventario', 'Reporte de inventario'],
    ['por-vencer', 'Medicamentos a devolver'],
    ['bajo-stock', 'Medicamentos bajo stock'],
    ['valorizacion', 'Valorización de inventario'],
    ['completo', 'Reporte completo (todo)'],
  ];
  $('#reportes-list').innerHTML = defs.map(([id, n]) =>
    `<div class="reporte-card"><h4>${esc(n)}</h4><button class="primary" data-rep="${id}"><svg class="ico"><use href="#i-download"/></svg> Descargar Excel</button></div>`).join('');
  $$('#reportes-list [data-rep]').forEach((b) => b.addEventListener('click', () => withBusy(b, () => descargarExcel(b.dataset.rep))));
}

function hojaInventario(meds) {
  return meds.map((m) => ({
    Medicamento: m.nombre, Categoría: m.categoria || '', Lote: m.lote || '',
    'En stock': m.stock, 'Stock mínimo': m.stock_minimo,
    'Precio venta': m.precio, Costo: m.costo,
    'Margen unit.': m.margen_unitario, 'Margen %': m.margen_pct,
    'Valor a costo': m.valor_costo, 'Valor a venta': m.valor_venta,
    Vence: m.fecha_vencimiento || '', 'Días para vencer': m.dias_para_vencer ?? '',
    'Se vende': UNIDAD_LABEL[m.unidad_venta], 'Uds/blister': m.unidades_por_blister,
    Estado: ESTADO_LABEL[m.estado],
  }));
}
function hojaPorVencer(meds) {
  return meds.filter((m) => m.estado === 'vencido' || m.estado === 'por_vencer')
    .sort((a, b) => (a.dias_para_vencer ?? 0) - (b.dias_para_vencer ?? 0))
    .map((m) => ({
      Medicamento: m.nombre, Categoría: m.categoria || '', Lote: m.lote || '',
      'En stock': m.stock, 'Se vende': UNIDAD_LABEL[m.unidad_venta],
      Vence: m.fecha_vencimiento || '', 'Días para vencer': m.dias_para_vencer ?? '',
      'Valor a costo': m.valor_costo, Estado: ESTADO_LABEL[m.estado],
    }));
}
function hojaBajoStock(meds) {
  return meds.filter((m) => m.bajo_stock).map((m) => ({
    Medicamento: m.nombre, Categoría: m.categoria || '',
    'En stock': m.stock, 'Stock mínimo': m.stock_minimo,
    Faltante: +(m.stock_minimo - m.stock).toFixed(2), Costo: m.costo,
  }));
}
function hojaValorizacion(meds) {
  const map = new Map();
  for (const m of meds) {
    const k = m.categoria || 'Sin categoría';
    const a = map.get(k) || { Categoría: k, Artículos: 0, 'Unidades en stock': 0, 'Valor a costo': 0, 'Valor a venta': 0 };
    a.Artículos++; a['Unidades en stock'] += m.stock;
    a['Valor a costo'] += m.valor_costo; a['Valor a venta'] += m.valor_venta;
    map.set(k, a);
  }
  const rows = [...map.values()].sort((a, b) => a.Categoría.localeCompare(b.Categoría));
  rows.forEach((r) => {
    r['Unidades en stock'] = +r['Unidades en stock'].toFixed(2);
    r['Valor a costo'] = +r['Valor a costo'].toFixed(2);
    r['Valor a venta'] = +r['Valor a venta'].toFixed(2);
    r['Margen potencial'] = +(r['Valor a venta'] - r['Valor a costo']).toFixed(2);
  });
  if (rows.length) {
    rows.push({
      Categoría: 'TOTAL',
      Artículos: rows.reduce((s, r) => s + r.Artículos, 0),
      'Unidades en stock': +rows.reduce((s, r) => s + r['Unidades en stock'], 0).toFixed(2),
      'Valor a costo': +rows.reduce((s, r) => s + r['Valor a costo'], 0).toFixed(2),
      'Valor a venta': +rows.reduce((s, r) => s + r['Valor a venta'], 0).toFixed(2),
      'Margen potencial': +rows.reduce((s, r) => s + r['Margen potencial'], 0).toFixed(2),
    });
  }
  return rows;
}

async function descargarExcel(tipo) {
  MESES = await getMeses();
  await fetchMeds();
  const wb = XLSX.utils.book_new();
  const add = (nombre, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'Sin datos' }]), nombre);
  const hojas = {
    inventario: () => add('Inventario', hojaInventario(MEDS)),
    'por-vencer': () => add('A devolver', hojaPorVencer(MEDS)),
    'bajo-stock': () => add('Bajo stock', hojaBajoStock(MEDS)),
    valorizacion: () => add('Valorización', hojaValorizacion(MEDS)),
    completo: () => {
      add('Inventario', hojaInventario(MEDS));
      add('A devolver', hojaPorVencer(MEDS));
      add('Bajo stock', hojaBajoStock(MEDS));
      add('Valorización', hojaValorizacion(MEDS));
    },
  };
  (hojas[tipo] || hojas.inventario)();
  XLSX.writeFile(wb, `reporte_${tipo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ---------- usuarios ----------
$('#nuevo-user').addEventListener('click', () => formUser());

async function loadUsuarios() {
  const rw = PERM.usuarios === 'rw';
  $('#nuevo-user').hidden = !rw;
  $('#users-table').innerHTML = skeletonTable(4, 4);
  const qs = await getDocs(collection(dbf, 'usuarios'));
  const users = qs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  const headers = ['Nombre', 'Correo', 'Rol', 'Estado'];
  if (rw) headers.push('');
  $('#users-table').innerHTML = tabla(headers, users.map((u) => {
    const c = [esc(u.nombre), esc(u.email || ''), `<span class="rol">${esc(u.rol)}</span>`,
      u.activo ? 'Activo' : '<span class="muted">Inactivo</span>'];
    if (rw) c.push(
      `<button class="row-btn" data-eu="${u.id}">Editar</button>` +
      (u.id === ME.uid ? '' : `<button class="row-btn danger" data-du="${u.id}">Eliminar</button>`));
    return c;
  }));
  $$('#users-table [data-eu]').forEach((b) => b.addEventListener('click', () => formUser(users.find((u) => u.id === b.dataset.eu))));
  $$('#users-table [data-du]').forEach((b) => b.addEventListener('click', () => borrarUser(b.dataset.du)));
}

function formUser(user = null) {
  const u = user || { rol: 'soporte', activo: true };
  openModal(user ? 'Editar usuario' : 'Nuevo usuario', `
    <label>Nombre<input name="nombre" value="${esc(u.nombre || '')}" required></label>
    ${user ? '' : '<label>Correo<input name="email" type="email" required></label>'}
    ${user ? '' : '<label>Contraseña (mín. 6)<input name="password" type="text" minlength="6" required></label>'}
    <label>Rol<select name="rol">${ROLES.map((r) => `<option value="${r}" ${u.rol === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    ${user ? `<label>Estado<select name="activo"><option value="1" ${u.activo ? 'selected' : ''}>Activo</option><option value="0" ${!u.activo ? 'selected' : ''}>Inactivo</option></select></label>` : ''}
    <button type="submit">Guardar</button>
  `, async (f) => {
    const b = Object.fromEntries(new FormData(f).entries());
    if (user) {
      await updateDoc(doc(dbf, 'usuarios', user.id), {
        nombre: b.nombre.trim(),
        rol: ROLES.includes(b.rol) ? b.rol : user.rol,
        activo: b.activo === '1',
      });
    } else {
      await crearUsuario({ nombre: b.nombre.trim(), email: b.email.trim(), password: b.password, rol: b.rol });
    }
    closeModal();
    toast('Usuario guardado');
    loadUsuarios();
  });
}

// Crea la cuenta en Firebase Auth sin cerrar la sesión actual (app secundaria).
async function crearUsuario({ nombre, email, password, rol }) {
  if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  const sec = initializeApp(firebaseConfig, 'sec-' + Date.now());
  const secAuth = getAuth(sec);
  try {
    const cred = await createUserWithEmailAndPassword(secAuth, email, password);
    await setDoc(doc(dbf, 'usuarios', cred.user.uid), {
      nombre, email, rol: ROLES.includes(rol) ? rol : 'soporte', activo: true,
    });
  } catch (e) {
    if ((e.code || '').includes('email-already-in-use')) throw new Error('Ese correo ya está registrado');
    throw e;
  } finally {
    await signOut(secAuth).catch(() => {});
    await deleteApp(sec).catch(() => {});
  }
}

async function borrarUser(id) {
  if (!confirm('¿Quitar el acceso de este usuario?\n(La cuenta de correo queda en Firebase pero sin permisos.)')) return;
  try { await deleteDoc(doc(dbf, 'usuarios', id)); toast('Usuario eliminado'); loadUsuarios(); }
  catch (e) { toast(e.message, true); }
}

// ---------- configuración ----------
async function loadConfig() {
  MESES = await getMeses();
  $('#meses-alerta').value = MESES;
  const rw = PERM.config === 'rw';
  $('#meses-alerta').disabled = !rw;
  $('#config-form button').hidden = !rw;
}

$('#config-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = parseInt($('#meses-alerta').value, 10);
  if (!Number.isFinite(n) || n < 0 || n > 60) return toast('Los meses deben estar entre 0 y 60', true);
  const btn = e.target.querySelector('button[type=submit]');
  await withBusy(btn, async () => {
    try {
      await setDoc(doc(dbf, 'configuracion', 'app'), { meses_alerta_vencimiento: n }, { merge: true });
      MESES = n;
      $('#config-ok').hidden = false;
      setTimeout(() => ($('#config-ok').hidden = true), 2000);
    } catch (err) { toast(err.message, true); }
  });
});

// ---------- helpers UI ----------
function tabla(headers, rows) {
  const cell = (c, i, len) => {
    const act = i === len - 1 && headers[i] === '';
    return `<td class="${act ? 'actions' : ''}" data-label="${esc(headers[i] || '')}">${c}</td>`;
  };
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r) => `<tr>${r.map((c, i) => cell(c, i, r.length)).join('')}</tr>`).join('')
  }</tbody></table>`;
}
function badge(m) {
  return `<span class="badge ${m.estado}">${ESTADO_LABEL[m.estado]}${m.estado === 'por_vencer' ? ' · devolver' : ''}</span>`;
}
function openModal(title, html, onSubmit) {
  $('#modal-title').textContent = title;
  $('#modal-form').innerHTML = html;
  $('#modal-error').hidden = true;
  $('#modal').hidden = false;
  $('#modal-form').onsubmit = async (e) => {
    e.preventDefault();
    $('#modal-error').hidden = true;
    const btn = e.target.querySelector('button[type=submit]');
    if (btn) btn.classList.add('busy');
    try { await onSubmit(e.target); }
    catch (err) { $('#modal-error').textContent = err.message; $('#modal-error').hidden = false; }
    finally { if (btn) btn.classList.remove('busy'); }
  };
}
function closeModal() { $('#modal').hidden = true; }
$('#modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
