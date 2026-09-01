'use strict';

const ExcelJS = require('exceljs');
const db = require('./db');
const { getMesesAlerta, enriquecer } = require('./lib');

const UNIDAD_LABEL = { unidad: 'Por unidad', blister: 'Por blister' };
const ESTADO_LABEL = {
  ok: 'OK',
  por_vencer: 'Por vencer (devolver)',
  vencido: 'Vencido',
  sin_fecha: 'Sin fecha',
};

function cargarMedicamentos() {
  const meses = getMesesAlerta();
  const rows = db.prepare('SELECT * FROM medicamentos ORDER BY nombre').all();
  return rows.map((r) => enriquecer(r, meses));
}

function estiloEncabezado(ws) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
  header.alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function hojaInventario(wb, meds) {
  const ws = wb.addWorksheet('Inventario');
  ws.columns = [
    { header: 'Medicamento', key: 'nombre', width: 30 },
    { header: 'Categoría', key: 'categoria', width: 18 },
    { header: 'Lote', key: 'lote', width: 12 },
    { header: 'En stock', key: 'stock', width: 10 },
    { header: 'Stock mínimo', key: 'stock_minimo', width: 13 },
    { header: 'Precio venta', key: 'precio', width: 12 },
    { header: 'Costo', key: 'costo', width: 12 },
    { header: 'Margen unit.', key: 'margen_unitario', width: 12 },
    { header: 'Margen %', key: 'margen_pct', width: 10 },
    { header: 'Valor a costo', key: 'valor_costo', width: 14 },
    { header: 'Valor a venta', key: 'valor_venta', width: 14 },
    { header: 'Vence', key: 'fecha_vencimiento', width: 12 },
    { header: 'Días para vencer', key: 'dias_para_vencer', width: 15 },
    { header: 'Se vende', key: 'unidad_venta', width: 12 },
    { header: 'Uds/blister', key: 'unidades_por_blister', width: 11 },
    { header: 'Estado', key: 'estado', width: 22 },
  ];
  for (const m of meds) {
    ws.addRow({
      ...m,
      unidad_venta: UNIDAD_LABEL[m.unidad_venta] || m.unidad_venta,
      estado: ESTADO_LABEL[m.estado] || m.estado,
    });
  }
  estiloEncabezado(ws);
  ws.autoFilter = { from: 'A1', to: 'P1' };
  return ws;
}

function hojaPorVencer(wb, meds) {
  const ws = wb.addWorksheet('A devolver');
  ws.columns = [
    { header: 'Medicamento', key: 'nombre', width: 30 },
    { header: 'Categoría', key: 'categoria', width: 18 },
    { header: 'Lote', key: 'lote', width: 12 },
    { header: 'En stock', key: 'stock', width: 10 },
    { header: 'Se vende', key: 'unidad_venta', width: 12 },
    { header: 'Vence', key: 'fecha_vencimiento', width: 12 },
    { header: 'Días para vencer', key: 'dias_para_vencer', width: 15 },
    { header: 'Valor a costo', key: 'valor_costo', width: 14 },
    { header: 'Estado', key: 'estado', width: 22 },
  ];
  const filtrados = meds
    .filter((m) => m.estado === 'vencido' || m.estado === 'por_vencer')
    .sort((a, b) => (a.dias_para_vencer ?? 0) - (b.dias_para_vencer ?? 0));
  for (const m of filtrados) {
    ws.addRow({
      ...m,
      unidad_venta: UNIDAD_LABEL[m.unidad_venta] || m.unidad_venta,
      estado: ESTADO_LABEL[m.estado] || m.estado,
    });
  }
  estiloEncabezado(ws);
  ws.autoFilter = { from: 'A1', to: 'I1' };
  return ws;
}

function hojaBajoStock(wb, meds) {
  const ws = wb.addWorksheet('Bajo stock');
  ws.columns = [
    { header: 'Medicamento', key: 'nombre', width: 30 },
    { header: 'Categoría', key: 'categoria', width: 18 },
    { header: 'En stock', key: 'stock', width: 10 },
    { header: 'Stock mínimo', key: 'stock_minimo', width: 13 },
    { header: 'Faltante', key: 'faltante', width: 10 },
    { header: 'Costo', key: 'costo', width: 12 },
  ];
  for (const m of meds.filter((m) => m.bajo_stock)) {
    ws.addRow({ ...m, faltante: +(m.stock_minimo - m.stock).toFixed(2) });
  }
  estiloEncabezado(ws);
  return ws;
}

function hojaValorizacion(wb, meds) {
  const ws = wb.addWorksheet('Valorización');
  ws.columns = [
    { header: 'Categoría', key: 'categoria', width: 24 },
    { header: 'Artículos', key: 'articulos', width: 12 },
    { header: 'Unidades en stock', key: 'unidades', width: 18 },
    { header: 'Valor a costo', key: 'valor_costo', width: 16 },
    { header: 'Valor a venta', key: 'valor_venta', width: 16 },
    { header: 'Margen potencial', key: 'margen', width: 16 },
  ];
  const porCat = new Map();
  for (const m of meds) {
    const k = m.categoria || 'Sin categoría';
    const acc = porCat.get(k) || { articulos: 0, unidades: 0, valor_costo: 0, valor_venta: 0 };
    acc.articulos += 1;
    acc.unidades += m.stock;
    acc.valor_costo += m.valor_costo;
    acc.valor_venta += m.valor_venta;
    porCat.set(k, acc);
  }
  let tC = 0, tV = 0, tU = 0, tA = 0;
  for (const [categoria, a] of [...porCat.entries()].sort()) {
    ws.addRow({
      categoria,
      articulos: a.articulos,
      unidades: +a.unidades.toFixed(2),
      valor_costo: +a.valor_costo.toFixed(2),
      valor_venta: +a.valor_venta.toFixed(2),
      margen: +(a.valor_venta - a.valor_costo).toFixed(2),
    });
    tC += a.valor_costo; tV += a.valor_venta; tU += a.unidades; tA += a.articulos;
  }
  const total = ws.addRow({
    categoria: 'TOTAL',
    articulos: tA,
    unidades: +tU.toFixed(2),
    valor_costo: +tC.toFixed(2),
    valor_venta: +tV.toFixed(2),
    margen: +(tV - tC).toFixed(2),
  });
  total.font = { bold: true };
  estiloEncabezado(ws);
  return ws;
}

const TIPOS = {
  inventario: { nombre: 'Reporte de inventario', hojas: [hojaInventario] },
  'por-vencer': { nombre: 'Medicamentos a devolver', hojas: [hojaPorVencer] },
  'bajo-stock': { nombre: 'Medicamentos bajo stock', hojas: [hojaBajoStock] },
  valorizacion: { nombre: 'Valorizacion de inventario', hojas: [hojaValorizacion] },
  completo: {
    nombre: 'Reporte completo',
    hojas: [hojaInventario, hojaPorVencer, hojaBajoStock, hojaValorizacion],
  },
};

async function generarExcel(tipo) {
  const def = TIPOS[tipo];
  if (!def) throw new Error('Tipo de reporte desconocido: ' + tipo);
  const meds = cargarMedicamentos();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Farmacia';
  wb.created = new Date();
  for (const hoja of def.hojas) hoja(wb, meds);
  const buffer = await wb.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);
  const filename = `${def.nombre.replace(/\s+/g, '_')}_${fecha}.xlsx`;
  return { buffer, filename };
}

module.exports = { generarExcel, TIPOS };
