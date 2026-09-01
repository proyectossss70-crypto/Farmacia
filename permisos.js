'use strict';

// Nivel por área:  'r' = ver,  'rw' = ver y editar,  false = sin acceso
// reportes: true/false = puede descargar reportes en Excel
//
// Para cambiar qué puede hacer cada rol, edita esta tabla.
// costos: ver precio de costo y margen (se oculta al cajero)
const PERMISOS = {
  jefe: {
    inventario: 'rw',
    reportes: true,
    usuarios: 'rw',
    config: 'rw',
    costos: true,
  },
  administrador: {
    inventario: 'rw',
    reportes: true,
    usuarios: 'r',
    config: 'rw',
    costos: true,
  },
  soporte: {
    inventario: 'r',
    reportes: true,
    usuarios: 'rw',
    config: 'r',
    costos: true,
  },
  cajero: {
    inventario: 'r',
    reportes: false,
    usuarios: false,
    config: false,
    costos: false,
  },
};

const ROLES = Object.keys(PERMISOS);

module.exports = { PERMISOS, ROLES };
