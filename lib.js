'use strict';

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
  const stock = Number(med.stock) || 0;
  const precio = Number(med.precio) || 0;
  const costo = Number(med.costo) || 0;
  const margenUnit = +(precio - costo).toFixed(4);
  const margenPct = precio > 0 ? +(((precio - costo) / precio) * 100).toFixed(2) : 0;
  return {
    ...med,
    stock,
    precio,
    costo,
    stock_minimo: Number(med.stock_minimo) || 0,
    estado,
    dias_para_vencer: dias,
    margen_unitario: margenUnit,
    margen_pct: margenPct,
    valor_costo: +(stock * costo).toFixed(2),
    valor_venta: +(stock * precio).toFixed(2),
    bajo_stock: stock <= (Number(med.stock_minimo) || 0),
  };
}

module.exports = { calcularEstado, enriquecer };
