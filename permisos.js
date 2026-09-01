'use strict';

// Nivel por área:  'r' = ver,  'rw' = ver y editar,  false = sin acceso
// reportes: true/false = puede descargar reportes en Excel
//
// Para cambiar qué puede hacer cada rol, edita esta tabla.
const PERMISOS = {
  jefe: {
    inventario: 'rw',
    reportes: true,
    usuarios: 'rw',
    config: 'rw',
  },
  administrador: {
    inventario: 'rw',
    reportes: true,
    usuarios: 'r',
    config: 'rw',
  },
  soporte: {
    inventario: 'r',
    reportes: true,
    usuarios: 'rw',
    config: 'r',
  },
};

const ROLES = Object.keys(PERMISOS);

module.exports = { PERMISOS, ROLES };
