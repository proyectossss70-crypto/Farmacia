'use strict';

// Selecciona el almacén de datos:
//   - Firestore  si hay credenciales de Firebase (o DB_DRIVER=firestore)
//   - SQLite     en caso contrario (o DB_DRIVER=sqlite)
const { firebaseEnabled } = require('./firebase');

const forzado = process.env.DB_DRIVER;
let store;

if (forzado === 'firestore' || (!forzado && firebaseEnabled)) {
  if (!firebaseEnabled) {
    console.error('DB_DRIVER=firestore pero no hay credenciales de Firebase. Revisa el Secret File / variables de entorno.');
    process.exit(1);
  }
  store = require('./stores/firestore');
} else {
  // En producción, caer a SQLite casi siempre es un error de configuración
  // (falta el Secret File de Firebase). Fallar de forma visible.
  if (process.env.NODE_ENV === 'production' && forzado !== 'sqlite') {
    console.error(
      'ERROR: no se encontraron credenciales de Firebase en producción.\n' +
      'Añade el Secret File "serviceAccountKey.json" en Render (o DB_DRIVER=sqlite para forzar SQLite).'
    );
    process.exit(1);
  }
  store = require('./stores/sqlite');
}

console.log(`Almacenamiento de datos: ${store.driver}`);

module.exports = store;
