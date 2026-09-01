'use strict';

const db = require('./db');

function getConfig(clave, porDefecto = null) {
  const row = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
  return row ? row.valor : porDefecto;
}

function setConfig(clave, valor) {
  db.prepare(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  ).run(clave, String(valor));
}

function getMesesAlerta() {
  const n = parseInt(getConfig('meses_alerta_vencimiento', '6'), 10);
  return Number.isFinite(n) && n >= 0 ? n : 6;
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

// Estado de un medicamento según su fecha de vencimiento y los meses de alerta.
//  vencido     -> ya pasó la fecha
//  por_vencer  -> vence dentro de la ventana de alerta (se debe devolver)
//  ok          -> aún lejos del vencimiento
//  sin_fecha   -> no tiene fecha registrada
function calcularEstado(fechaVencimiento, mesesAlerta) {
  if (!fechaVencimiento) return { estado: 'sin_fecha', dias: null };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fv = new Date(fechaVencimiento + 'T00:00:00');
  const dias = Math.round((fv - hoy) / 86400000);
  const limite = addMonths(hoy, mesesAlerta);
  if (fv < hoy) return { estado: 'vencido', dias };
  if (fv <= limite) return { estado: 'por_vencer', dias };
  return { estado: 'ok', dias };
}

// Enriquece una fila de medicamento con estado, márgenes y valores de inventario.
function enriquecer(med, mesesAlerta) {
  const { estado, dias } = calcularEstado(med.fecha_vencimiento, mesesAlerta);
  const margenUnit = +(med.precio - med.costo).toFixed(4);
  const margenPct = med.precio > 0 ? +(((med.precio - med.costo) / med.precio) * 100).toFixed(2) : 0;
  return {
    ...med,
    estado,
    dias_para_vencer: dias,
    margen_unitario: margenUnit,
    margen_pct: margenPct,
    valor_costo: +(med.stock * med.costo).toFixed(2),
    valor_venta: +(med.stock * med.precio).toFixed(2),
    bajo_stock: med.stock <= med.stock_minimo,
  };
}

module.exports = {
  getConfig,
  setConfig,
  getMesesAlerta,
  calcularEstado,
  enriquecer,
};
