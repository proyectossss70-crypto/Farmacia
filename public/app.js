'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const money = (n) => (Number(n) || 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ESTADO_LABEL = { ok: 'OK', por_vencer: 'Por vencer', vencido: 'Vencido', sin_fecha: 'Sin fecha' };
const UNIDAD_LABEL = { unidad: 'Por unidad', blister: 'Por blister' };

let ME = null;
let PERMISOS = {};
let ROLES = ['jefe', 'administrador', 'soporte', 'cajero'];
let MEDS = [];

// ---------- API ----------
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error((data && data.error) || 'Error ' + res.status);
  return data;
}

function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 3000);
}

// ---------- Auth ----------
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

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('#login-error').hidden = true;
  await withBusy(f.querySelector('button[type=submit]'), async () => {
    try {
      const r = await api('/login', { method: 'POST', body: { usuario: f.usuario.value, password: f.password.value } });
      startApp(r);
    } catch (err) {
      $('#login-error').textContent = err.message;
      $('#login-error').hidden = false;
    }
  });
});

async function cerrarSesion() {
  await api('/logout', { method: 'POST' });
  location.reload();
}
['#logout', '#logout-m'].forEach((s) => $(s) && $(s).addEventListener('click', cerrarSesion));

async function boot() {
  try {
    const r = await api('/me');
    startApp(r);
  } catch {
    $('#login').hidden = false;
  }
}

function startApp(r) {
  ME = r.user;
  PERMISOS = r.permisos || {};
  if (r.roles) ROLES = r.roles;
  $('#login').hidden = true;
  $('#app').hidden = false;

  const inic = (ME.nombre || ME.usuario || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  $('#user-box').innerHTML =
    `<span class="avatar">${esc(inic)}</span>` +
    `<span class="who"><strong>${esc(ME.nombre)}</strong><span class="rol">${esc(ME.rol)}</span></span>`;

  // Ocultar secciones sin permiso
  const visible = {
    dashboard: true,
    inventario: !!PERMISOS.inventario,
    reportes: !!PERMISOS.reportes,
    usuarios: !!PERMISOS.usuarios,
    configuracion: !!PERMISOS.config,
  };
  $$('#nav a').forEach((a) => a.classList.toggle('hidden', !visible[a.dataset.view]));

  navigate('dashboard');
}

// ---------- Navegación ----------
$$('#nav a').forEach((a) => a.addEventListener('click', () => navigate(a.dataset.view)));

function navigate(view) {
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  $$('.view').forEach((s) => (s.hidden = s.dataset.view !== view));
  ({ dashboard: loadDashboard, inventario: loadInventario, reportes: loadReportes, usuarios: loadUsuarios, configuracion: loadConfig }[view] || (() => {}))();
}

// ---------- Dashboard ----------
async function loadDashboard() {
  $('#cards').innerHTML = skeletonCards(4);
  $('#alertas').innerHTML = skeletonTable(4, 5);
  const d = await api('/dashboard');
  const cards = [
    { n: d.total_articulos, l: 'Artículos' },
    { n: d.unidades_totales, l: 'Unidades en stock' },
    PERMISOS.costos && { n: '$' + money(d.valor_costo), l: 'Valor a costo' },
    { n: '$' + money(d.valor_venta), l: 'Valor a venta' },
    { n: d.por_vencer, l: `Por vencer (${d.meses_alerta} meses)`, cls: d.por_vencer ? 'warn' : '' },
    { n: d.vencidos, l: 'Vencidos', cls: d.vencidos ? 'bad' : '' },
    { n: d.bajo_stock, l: 'Bajo stock', cls: d.bajo_stock ? 'warn' : '' },
  ].filter(Boolean);
  $('#cards').innerHTML = cards
    .map((c) => `<div class="card ${c.cls || ''}"><div class="n">${esc(c.n)}</div><div class="l">${esc(c.l)}</div></div>`)
    .join('');

  let meds = [];
  if (PERMISOS.inventario) {
    meds = await api('/medicamentos');
    MEDS = meds;
  }
  const alertas = meds
    .filter((m) => m.estado === 'vencido' || m.estado === 'por_vencer' || m.bajo_stock)
    .sort((a, b) => (a.dias_para_vencer ?? 1e9) - (b.dias_para_vencer ?? 1e9));
  $('#alertas').innerHTML = alertas.length
    ? tabla(
        ['Medicamento', 'Stock', 'Vence', 'Días', 'Estado'],
        alertas.map((m) => [
          esc(m.nombre),
          m.stock,
          m.fecha_vencimiento || '—',
          m.dias_para_vencer ?? '—',
          badge(m),
        ])
      )
    : '<div class="empty">Nada requiere atención 🎉</div>';
}

// ---------- Inventario ----------
$('#buscar').addEventListener('input', renderInventario);
$('#filtro-estado').addEventListener('change', renderInventario);
$('#nuevo-med').addEventListener('click', () => formMedicamento());

async function loadInventario() {
  const puedeEditar = PERMISOS.inventario === 'rw';
  $('#nuevo-med').hidden = !puedeEditar;
  $('#inv-table').innerHTML = skeletonTable(6, 6);
  MEDS = await api('/medicamentos');
  renderInventario();
}

function renderInventario() {
  const q = $('#buscar').value.trim().toLowerCase();
  const fe = $('#filtro-estado').value;
  const puedeEditar = PERMISOS.inventario === 'rw';
  const ver = !!PERMISOS.costos;
  const rows = MEDS.filter(
    (m) => (!q || m.nombre.toLowerCase().includes(q) || (m.categoria || '').toLowerCase().includes(q)) && (!fe || m.estado === fe)
  );
  const headers = ['Medicamento', 'Categoría', 'Stock', 'Precio',
    ...(ver ? ['Costo', 'Margen'] : []), 'Vence', 'Se vende', 'Estado'];
  if (puedeEditar) headers.push('');
  $('#inv-table').innerHTML = rows.length
    ? tabla(
        headers,
        rows.map((m) => {
          const cells = [
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
          if (puedeEditar) {
            cells.push(
              `<button class="row-btn" data-edit="${m.id}">Editar</button><button class="row-btn danger" data-del="${m.id}">Eliminar</button>`
            );
          }
          return cells;
        }),
        puedeEditar
      )
    : '<div class="empty">Sin resultados</div>';

  $$('#inv-table [data-edit]').forEach((b) => b.addEventListener('click', () => formMedicamento(MEDS.find((m) => m.id == b.dataset.edit))));
  $$('#inv-table [data-del]').forEach((b) => b.addEventListener('click', () => borrarMedicamento(b.dataset.del)));
}

function formMedicamento(med = null) {
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
    const body = Object.fromEntries(new FormData(f).entries());
    if (med) await api('/medicamentos/' + med.id, { method: 'PUT', body });
    else await api('/medicamentos', { method: 'POST', body });
    closeModal();
    toast('Medicamento guardado');
    loadInventario();
  });
}

async function borrarMedicamento(id) {
  if (!confirm('¿Eliminar este medicamento del inventario?')) return;
  try {
    await api('/medicamentos/' + id, { method: 'DELETE' });
    toast('Medicamento eliminado');
    loadInventario();
  } catch (e) {
    toast(e.message, true);
  }
}

// ---------- Reportes ----------
async function loadReportes() {
  const list = await api('/reportes');
  $('#reportes-list').innerHTML = list
    .map(
      (r) => `<div class="reporte-card"><h4>${esc(r.nombre)}</h4>
        <a href="/api/reportes/${r.id}.xlsx"><button class="primary"><svg class="ico"><use href="#i-download"/></svg> Descargar Excel</button></a></div>`
    )
    .join('');
}

// ---------- Usuarios ----------
$('#nuevo-user').addEventListener('click', () => formUsuario());

async function loadUsuarios() {
  const puedeEditar = PERMISOS.usuarios === 'rw';
  $('#nuevo-user').hidden = !puedeEditar;
  $('#users-table').innerHTML = skeletonTable(4, 4);
  const users = await api('/usuarios');
  const headers = ['Nombre', 'Usuario', 'Rol', 'Estado'];
  if (puedeEditar) headers.push('');
  $('#users-table').innerHTML = tabla(
    headers,
    users.map((u) => {
      const cells = [
        esc(u.nombre),
        esc(u.usuario),
        `<span class="rol">${esc(u.rol)}</span>`,
        u.activo ? 'Activo' : '<span class="muted">Inactivo</span>',
      ];
      if (puedeEditar) {
        cells.push(
          `<button class="row-btn" data-eu="${u.id}">Editar</button>` +
            (u.id === ME.id ? '' : `<button class="row-btn danger" data-du="${u.id}">Eliminar</button>`)
        );
      }
      return cells;
    }),
    puedeEditar
  );
  $$('#users-table [data-eu]').forEach((b) => b.addEventListener('click', () => formUsuario(users.find((u) => u.id == b.dataset.eu))));
  $$('#users-table [data-du]').forEach((b) => b.addEventListener('click', () => borrarUsuario(b.dataset.du)));
}

function formUsuario(user = null) {
  const u = user || { rol: 'soporte', activo: 1 };
  openModal(user ? 'Editar usuario' : 'Nuevo usuario', `
    <label>Nombre<input name="nombre" value="${esc(u.nombre || '')}" required></label>
    ${user ? '' : '<label>Usuario (para iniciar sesión)<input name="usuario" required></label>'}
    <label>${user ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}<input name="password" type="text" ${user ? '' : 'required'}></label>
    <label>Rol
      <select name="rol">${ROLES.map((r) => `<option value="${r}" ${u.rol === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
    </label>
    ${user ? `<label>Estado<select name="activo"><option value="1" ${u.activo ? 'selected' : ''}>Activo</option><option value="0" ${!u.activo ? 'selected' : ''}>Inactivo</option></select></label>` : ''}
    <button type="submit">Guardar</button>
  `, async (f) => {
    const body = Object.fromEntries(new FormData(f).entries());
    if (body.activo !== undefined) body.activo = body.activo === '1';
    if (user) await api('/usuarios/' + user.id, { method: 'PUT', body });
    else await api('/usuarios', { method: 'POST', body });
    closeModal();
    toast('Usuario guardado');
    loadUsuarios();
  });
}

async function borrarUsuario(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  try {
    await api('/usuarios/' + id, { method: 'DELETE' });
    toast('Usuario eliminado');
    loadUsuarios();
  } catch (e) {
    toast(e.message, true);
  }
}

// ---------- Configuración ----------
async function loadConfig() {
  const c = await api('/configuracion');
  $('#meses-alerta').value = c.meses_alerta_vencimiento;
  $('#meses-alerta').disabled = PERMISOS.config !== 'rw';
  $('#config-form button').hidden = PERMISOS.config !== 'rw';
}

$('#config-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await withBusy(e.target.querySelector('button[type=submit]'), async () => {
    try {
      await api('/configuracion', { method: 'PUT', body: { meses_alerta_vencimiento: $('#meses-alerta').value } });
      $('#config-ok').hidden = false;
      setTimeout(() => ($('#config-ok').hidden = true), 2000);
    } catch (err) {
      toast(err.message, true);
    }
  });
});

// ---------- Helpers UI ----------
function tabla(headers, rows) {
  const cell = (c, i, len) => {
    const act = i === len - 1 && headers[i] === '';
    return `<td class="${act ? 'actions' : ''}" data-label="${esc(headers[i] || '')}">${c}</td>`;
  };
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => cell(c, i, r.length)).join('')}</tr>`).join('')}</tbody></table>`;
}

function badge(m) {
  return `<span class="badge ${m.estado}">${ESTADO_LABEL[m.estado]}${
    m.estado === 'por_vencer' ? ' · devolver' : ''
  }</span>`;
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
    try {
      await onSubmit(e.target);
    } catch (err) {
      $('#modal-error').textContent = err.message;
      $('#modal-error').hidden = false;
    } finally {
      if (btn) btn.classList.remove('busy');
    }
  };
}
function closeModal() { $('#modal').hidden = true; }
$('#modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

boot();
