'use strict';

// Implementación del almacén sobre SQLite local (node:sqlite).
const bcrypt = require('bcryptjs');
const db = require('../db');

const USER_COLS = 'id, nombre, usuario, rol, activo, creado_en';
const normUser = (u) => (u ? { ...u, activo: !!u.activo } : null);

async function getConfig(clave, def = null) {
  const row = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
  return row ? row.valor : def;
}

const MED_FIELDS = [
  'nombre', 'categoria', 'stock', 'stock_minimo', 'precio', 'costo',
  'fecha_vencimiento', 'unidad_venta', 'unidades_por_blister', 'lote',
];

module.exports = {
  driver: 'sqlite',

  async init() {
    // db.js ya crea el esquema y la configuración por defecto al requerirse.
  },

  usuarios: {
    async list() {
      return db.prepare(`SELECT ${USER_COLS} FROM usuarios ORDER BY nombre`).all().map(normUser);
    },
    async getById(id) {
      return normUser(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id));
    },
    async getByUsername(usuario) {
      return normUser(db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario));
    },
    async create({ nombre, usuario, password_hash, rol }) {
      const info = db
        .prepare('INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES (?, ?, ?, ?)')
        .run(nombre, usuario, password_hash, rol);
      return normUser(db.prepare(`SELECT ${USER_COLS} FROM usuarios WHERE id = ?`).get(info.lastInsertRowid));
    },
    async update(id, { nombre, rol, activo }) {
      const info = db
        .prepare('UPDATE usuarios SET nombre = ?, rol = ?, activo = ? WHERE id = ?')
        .run(nombre, rol, activo ? 1 : 0, id);
      if (!info.changes && !db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)) return null;
      return normUser(db.prepare(`SELECT ${USER_COLS} FROM usuarios WHERE id = ?`).get(id));
    },
    async setPassword(id, password_hash) {
      db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(password_hash, id);
    },
    async remove(id) {
      return db.prepare('DELETE FROM usuarios WHERE id = ?').run(id).changes > 0;
    },
    async count() {
      return db.prepare('SELECT COUNT(*) c FROM usuarios').get().c;
    },
  },

  medicamentos: {
    async list() {
      return db.prepare('SELECT * FROM medicamentos ORDER BY nombre').all();
    },
    async getById(id) {
      return db.prepare('SELECT * FROM medicamentos WHERE id = ?').get(id) || null;
    },
    async create(data) {
      const info = db
        .prepare(
          `INSERT INTO medicamentos (${MED_FIELDS.join(', ')})
           VALUES (${MED_FIELDS.map((f) => '@' + f).join(', ')})`
        )
        .run(data);
      return db.prepare('SELECT * FROM medicamentos WHERE id = ?').get(info.lastInsertRowid);
    },
    async update(id, data) {
      const exists = db.prepare('SELECT 1 FROM medicamentos WHERE id = ?').get(id);
      if (!exists) return null;
      db.prepare(
        `UPDATE medicamentos SET
           ${MED_FIELDS.map((f) => `${f}=@${f}`).join(', ')}, actualizado_en=datetime('now')
         WHERE id=@id`
      ).run({ ...data, id });
      return db.prepare('SELECT * FROM medicamentos WHERE id = ?').get(id);
    },
    async remove(id) {
      return db.prepare('DELETE FROM medicamentos WHERE id = ?').run(id).changes > 0;
    },
    async count() {
      return db.prepare('SELECT COUNT(*) c FROM medicamentos').get().c;
    },
  },

  config: {
    get: getConfig,
    async set(clave, valor) {
      db.prepare(
        `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
      ).run(clave, String(valor));
    },
    async mesesAlerta() {
      const n = parseInt(await getConfig('meses_alerta_vencimiento', '6'), 10);
      return Number.isFinite(n) && n >= 0 ? n : 6;
    },
  },

  _bcrypt: bcrypt,
};
