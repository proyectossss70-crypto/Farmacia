'use strict';

// Usa el módulo SQLite nativo de Node (sin dependencias nativas que compilar).
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'farmacia.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre        TEXT NOT NULL,
    usuario       TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol           TEXT NOT NULL DEFAULT 'soporte',
    activo        INTEGER NOT NULL DEFAULT 1,
    creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS medicamentos (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre               TEXT NOT NULL,
    categoria            TEXT,
    stock                REAL NOT NULL DEFAULT 0,
    stock_minimo         REAL NOT NULL DEFAULT 0,
    precio               REAL NOT NULL DEFAULT 0,   -- precio de venta
    costo                REAL NOT NULL DEFAULT 0,   -- costo de compra
    fecha_vencimiento    TEXT,                      -- yyyy-mm-dd
    unidad_venta         TEXT NOT NULL DEFAULT 'unidad', -- 'unidad' | 'blister'
    unidades_por_blister INTEGER NOT NULL DEFAULT 1,
    lote                 TEXT,
    creado_en            TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT
  );
`);

// Configuración por defecto: alertar 6 meses antes del vencimiento.
db.prepare(
  `INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('meses_alerta_vencimiento', '6')`
).run();

module.exports = db;
