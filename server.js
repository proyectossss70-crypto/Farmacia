'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const db = require('./db');
const { PERMISOS, ROLES } = require('./permisos');
const { getMesesAlerta, setConfig, enriquecer } = require('./lib');
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

const publicUser = (u) => ({ id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol });

// ---------- Autenticación ----------
app.post('/api/login', (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) return res.status(400).json({ error: 'Faltan credenciales' });
  const row = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1').get(String(usuario).trim());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  req.session.user = publicUser(row);
  res.json({ user: req.session.user, permisos: PERMISOS[row.rol] });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user, permisos: PERMISOS[req.session.user.rol], roles: ROLES });
});

// ---------- Configuración ----------
app.get('/api/configuracion', requireAuth, (req, res) => {
  res.json({ meses_alerta_vencimiento: getMesesAlerta() });
});

app.put('/api/configuracion', requireAuth, can('config', 'rw'), (req, res) => {
  const n = parseInt(req.body.meses_alerta_vencimiento, 10);
  if (!Number.isFinite(n) || n < 0 || n > 60) {
    return res.status(400).json({ error: 'Los meses de alerta deben estar entre 0 y 60' });
  }
  setConfig('meses_alerta_vencimiento', n);
  res.json({ meses_alerta_vencimiento: n });
});

// ---------- Dashboard ----------
app.get('/api/dashboard', requireAuth, (req, res) => {
  const meses = getMesesAlerta();
  const meds = db.prepare('SELECT * FROM medicamentos').all().map((m) => enriquecer(m, meses));
  const resumen = {
    total_articulos: meds.length,
    unidades_totales: +meds.reduce((s, m) => s + m.stock, 0).toFixed(2),
    valor_costo: +meds.reduce((s, m) => s + m.valor_costo, 0).toFixed(2),
    valor_venta: +meds.reduce((s, m) => s + m.valor_venta, 0).toFixed(2),
    vencidos: meds.filter((m) => m.estado === 'vencido').length,
    por_vencer: meds.filter((m) => m.estado === 'por_vencer').length,
    bajo_stock: meds.filter((m) => m.bajo_stock).length,
    meses_alerta: meses,
  };
  res.json(resumen);
});

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
  let fecha = b.fecha_vencimiento ? String(b.fecha_vencimiento).slice(0, 10) : null;
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

app.get('/api/medicamentos', requireAuth, can('inventario', 'r'), (req, res) => {
  const meses = getMesesAlerta();
  const rows = db.prepare('SELECT * FROM medicamentos ORDER BY nombre').all();
  res.json(rows.map((r) => enriquecer(r, meses)));
});

app.post('/api/medicamentos', requireAuth, can('inventario', 'rw'), (req, res) => {
  const { errores, data } = validarMed(req.body || {});
  if (errores.length) return res.status(400).json({ error: errores.join('. ') });
  const info = db
    .prepare(
      `INSERT INTO medicamentos
        (nombre, categoria, stock, stock_minimo, precio, costo, fecha_vencimiento, unidad_venta, unidades_por_blister, lote)
       VALUES (@nombre, @categoria, @stock, @stock_minimo, @precio, @costo, @fecha_vencimiento, @unidad_venta, @unidades_por_blister, @lote)`
    )
    .run(data);
  const row = db.prepare('SELECT * FROM medicamentos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(enriquecer(row, getMesesAlerta()));
});

app.put('/api/medicamentos/:id', requireAuth, can('inventario', 'rw'), (req, res) => {
  const existe = db.prepare('SELECT id FROM medicamentos WHERE id = ?').get(req.params.id);
  if (!existe) return res.status(404).json({ error: 'Medicamento no encontrado' });
  const { errores, data } = validarMed(req.body || {});
  if (errores.length) return res.status(400).json({ error: errores.join('. ') });
  db.prepare(
    `UPDATE medicamentos SET
       nombre=@nombre, categoria=@categoria, stock=@stock, stock_minimo=@stock_minimo,
       precio=@precio, costo=@costo, fecha_vencimiento=@fecha_vencimiento, unidad_venta=@unidad_venta,
       unidades_por_blister=@unidades_por_blister, lote=@lote, actualizado_en=datetime('now')
     WHERE id=@id`
  ).run({ ...data, id: Number(req.params.id) });
  const row = db.prepare('SELECT * FROM medicamentos WHERE id = ?').get(req.params.id);
  res.json(enriquecer(row, getMesesAlerta()));
});

app.delete('/api/medicamentos/:id', requireAuth, can('inventario', 'rw'), (req, res) => {
  const info = db.prepare('DELETE FROM medicamentos WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Medicamento no encontrado' });
  res.json({ ok: true });
});

// ---------- Usuarios ----------
app.get('/api/usuarios', requireAuth, can('usuarios', 'r'), (req, res) => {
  res.json(db.prepare('SELECT id, nombre, usuario, rol, activo, creado_en FROM usuarios ORDER BY nombre').all());
});

app.post('/api/usuarios', requireAuth, can('usuarios', 'rw'), (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const usuario = String(req.body.usuario || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const rol = ROLES.includes(req.body.rol) ? req.body.rol : 'soporte';
  if (!nombre || !usuario || password.length < 4) {
    return res.status(400).json({ error: 'Nombre, usuario y contraseña (mín. 4 caracteres) son obligatorios' });
  }
  if (db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(usuario)) {
    return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
  }
  const info = db
    .prepare('INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES (?, ?, ?, ?)')
    .run(nombre, usuario, bcrypt.hashSync(password, 10), rol);
  res.status(201).json(db.prepare('SELECT id, nombre, usuario, rol, activo, creado_en FROM usuarios WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/usuarios/:id', requireAuth, can('usuarios', 'rw'), (req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  const nombre = String(req.body.nombre || u.nombre).trim();
  const rol = ROLES.includes(req.body.rol) ? req.body.rol : u.rol;
  const activo = req.body.activo === undefined ? u.activo : req.body.activo ? 1 : 0;
  if (u.id === req.session.user.id && (activo === 0 || rol !== 'jefe' && u.rol === 'jefe')) {
    return res.status(400).json({ error: 'No puedes desactivar ni degradar tu propia cuenta' });
  }
  db.prepare('UPDATE usuarios SET nombre = ?, rol = ?, activo = ? WHERE id = ?').run(nombre, rol, activo, u.id);
  if (req.body.password) {
    if (String(req.body.password).length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(req.body.password), 10), u.id);
  }
  res.json(db.prepare('SELECT id, nombre, usuario, rol, activo, creado_en FROM usuarios WHERE id = ?').get(u.id));
});

app.delete('/api/usuarios/:id', requireAuth, can('usuarios', 'rw'), (req, res) => {
  if (Number(req.params.id) === req.session.user.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  }
  const info = db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ ok: true });
});

// ---------- Reportes (Excel) ----------
app.get('/api/reportes', requireAuth, canReportes, (req, res) => {
  res.json(Object.entries(TIPOS).map(([id, d]) => ({ id, nombre: d.nombre })));
});

app.get('/api/reportes/:tipo.xlsx', requireAuth, canReportes, async (req, res) => {
  try {
    const { buffer, filename } = await generarExcel(req.params.tipo);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- Estáticos + arranque ----------
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  const n = db.prepare('SELECT COUNT(*) c FROM usuarios').get().c;
  if (n === 0) {
    console.log('\n⚠️  No hay usuarios. Ejecuta primero:  npm run seed\n');
  }
  console.log(`Farmacia corriendo en  http://localhost:${PORT}`);
});
