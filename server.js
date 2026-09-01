'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const store = require('./store');
const { PERMISOS, ROLES } = require('./permisos');
const { enriquecer } = require('./lib');
const { generarExcel, TIPOS } = require('./reportes');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
  })
);

// Envuelve handlers async para capturar errores.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Middlewares de autorización ----------
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'No autenticado' });
  next();
}

function can(area, level = 'r') {
  return (req, res, next) => {
    const rol = req.session.user.rol;
    const p = PERMISOS[rol] && PERMISOS[rol][area];
    const ok = level === 'r' ? p === 'r' || p === 'rw' : p === 'rw';
    if (!ok) return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    next();
  };
}

function canReportes(req, res, next) {
  const rol = req.session.user.rol;
  if (!(PERMISOS[rol] && PERMISOS[rol].reportes)) {
    return res.status(403).json({ error: 'No tienes permiso para descargar reportes' });
  }
  next();
}

const publicUser = (u) => ({ id: String(u.id), nombre: u.nombre, usuario: u.usuario, rol: u.rol });
const sameId = (a, b) => String(a) === String(b);

// ---------- Autenticación ----------
app.post('/api/login', wrap(async (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) return res.status(400).json({ error: 'Faltan credenciales' });
  const row = await store.usuarios.getByUsername(String(usuario).trim().toLowerCase());
  if (!row || !row.activo || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  req.session.user = publicUser(row);
  res.json({ user: req.session.user, permisos: PERMISOS[row.rol] });
}));

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user, permisos: PERMISOS[req.session.user.rol], roles: ROLES });
});

// ---------- Configuración ----------
app.get('/api/configuracion', requireAuth, wrap(async (req, res) => {
  res.json({ meses_alerta_vencimiento: await store.config.mesesAlerta() });
}));

app.put('/api/configuracion', requireAuth, can('config', 'rw'), wrap(async (req, res) => {
  const n = parseInt(req.body.meses_alerta_vencimiento, 10);
  if (!Number.isFinite(n) || n < 0 || n > 60) {
    return res.status(400).json({ error: 'Los meses de alerta deben estar entre 0 y 60' });
  }
  await store.config.set('meses_alerta_vencimiento', n);
  res.json({ meses_alerta_vencimiento: n });
}));

// ---------- Dashboard ----------
app.get('/api/dashboard', requireAuth, wrap(async (req, res) => {
  const meses = await store.config.mesesAlerta();
  const meds = (await store.medicamentos.list()).map((m) => enriquecer(m, meses));
  res.json({
    total_articulos: meds.length,
    unidades_totales: +meds.reduce((s, m) => s + m.stock, 0).toFixed(2),
    valor_costo: +meds.reduce((s, m) => s + m.valor_costo, 0).toFixed(2),
    valor_venta: +meds.reduce((s, m) => s + m.valor_venta, 0).toFixed(2),
    vencidos: meds.filter((m) => m.estado === 'vencido').length,
    por_vencer: meds.filter((m) => m.estado === 'por_vencer').length,
    bajo_stock: meds.filter((m) => m.bajo_stock).length,
    meses_alerta: meses,
  });
}));

// ---------- Medicamentos ----------
function validarMed(b) {
  const errores = [];
  const nombre = String(b.nombre || '').trim();
  if (!nombre) errores.push('El nombre es obligatorio');
  const unidad = b.unidad_venta === 'blister' ? 'blister' : 'unidad';
  const num = (v, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };
  const fecha = b.fecha_vencimiento ? String(b.fecha_vencimiento).slice(0, 10) : null;
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) errores.push('Fecha de vencimiento inválida');
  return {
    errores,
    data: {
      nombre,
      categoria: String(b.categoria || '').trim() || null,
      stock: num(b.stock),
      stock_minimo: num(b.stock_minimo),
      precio: num(b.precio),
      costo: num(b.costo),
      fecha_vencimiento: fecha,
      unidad_venta: unidad,
      unidades_por_blister: Math.max(1, Math.round(num(b.unidades_por_blister, 1))),
      lote: String(b.lote || '').trim() || null,
    },
  };
}

app.get('/api/medicamentos', requireAuth, can('inventario', 'r'), wrap(async (req, res) => {
  const meses = await store.config.mesesAlerta();
  const rows = await store.medicamentos.list();
  res.json(rows.map((r) => enriquecer(r, meses)));
}));

app.post('/api/medicamentos', requireAuth, can('inventario', 'rw'), wrap(async (req, res) => {
  const { errores, data } = validarMed(req.body || {});
  if (errores.length) return res.status(400).json({ error: errores.join('. ') });
  const row = await store.medicamentos.create(data);
  res.status(201).json(enriquecer(row, await store.config.mesesAlerta()));
}));

app.put('/api/medicamentos/:id', requireAuth, can('inventario', 'rw'), wrap(async (req, res) => {
  const { errores, data } = validarMed(req.body || {});
  if (errores.length) return res.status(400).json({ error: errores.join('. ') });
  const row = await store.medicamentos.update(req.params.id, data);
  if (!row) return res.status(404).json({ error: 'Medicamento no encontrado' });
  res.json(enriquecer(row, await store.config.mesesAlerta()));
}));

app.delete('/api/medicamentos/:id', requireAuth, can('inventario', 'rw'), wrap(async (req, res) => {
  const ok = await store.medicamentos.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Medicamento no encontrado' });
  res.json({ ok: true });
}));

// ---------- Usuarios ----------
app.get('/api/usuarios', requireAuth, can('usuarios', 'r'), wrap(async (req, res) => {
  res.json(await store.usuarios.list());
}));

app.post('/api/usuarios', requireAuth, can('usuarios', 'rw'), wrap(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const usuario = String(req.body.usuario || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const rol = ROLES.includes(req.body.rol) ? req.body.rol : 'soporte';
  if (!nombre || !usuario || password.length < 4) {
    return res.status(400).json({ error: 'Nombre, usuario y contraseña (mín. 4 caracteres) son obligatorios' });
  }
  if (await store.usuarios.getByUsername(usuario)) {
    return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
  }
  const nuevo = await store.usuarios.create({ nombre, usuario, password_hash: bcrypt.hashSync(password, 10), rol });
  res.status(201).json(nuevo);
}));

app.put('/api/usuarios/:id', requireAuth, can('usuarios', 'rw'), wrap(async (req, res) => {
  const u = await store.usuarios.getById(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  const nombre = String(req.body.nombre || u.nombre).trim();
  const rol = ROLES.includes(req.body.rol) ? req.body.rol : u.rol;
  const activo = req.body.activo === undefined ? !!u.activo : !!req.body.activo;
  if (sameId(u.id, req.session.user.id) && (!activo || (u.rol === 'jefe' && rol !== 'jefe'))) {
    return res.status(400).json({ error: 'No puedes desactivar ni degradar tu propia cuenta' });
  }
  const actualizado = await store.usuarios.update(req.params.id, { nombre, rol, activo });
  if (req.body.password) {
    if (String(req.body.password).length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }
    await store.usuarios.setPassword(req.params.id, bcrypt.hashSync(String(req.body.password), 10));
  }
  res.json(actualizado);
}));

app.delete('/api/usuarios/:id', requireAuth, can('usuarios', 'rw'), wrap(async (req, res) => {
  if (sameId(req.params.id, req.session.user.id)) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  }
  const ok = await store.usuarios.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ ok: true });
}));

// ---------- Reportes (Excel) ----------
app.get('/api/reportes', requireAuth, canReportes, (req, res) => {
  res.json(Object.entries(TIPOS).map(([id, d]) => ({ id, nombre: d.nombre })));
});

app.get('/api/reportes/:tipo.xlsx', requireAuth, canReportes, wrap(async (req, res) => {
  try {
    const { buffer, filename } = await generarExcel(req.params.tipo);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

// ---------- Estáticos + manejo de errores ----------
app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

async function main() {
  await store.init();
  if ((await store.usuarios.count()) === 0) {
    console.log('\n⚠️  No hay usuarios. Ejecuta primero:  npm run seed\n');
  }
  app.listen(PORT, () => console.log(`Farmacia corriendo en  http://localhost:${PORT}`));
}

main().catch((err) => {
  console.error('No se pudo iniciar el servidor:', err);
  process.exit(1);
});
