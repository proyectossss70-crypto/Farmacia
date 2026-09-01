'use strict';

// Selecciona el almacén de datos:
//   - Firestore  si hay credenciales de Firebase (o DB_DRIVER=firestore)
//   - SQLite     en caso contrario (o DB_DRIVER=sqlite)
const { firebaseEnabled } = require('./firebase');

const forzado = process.env.DB_DRIVER;
let store;

if (forzado === 'firestore' || (!forzado && firebaseEnabled)) {
  if (!firebaseEnabled) {
    console.error('DB_DRIVER=firestore pero no hay credenciales de Firebase. Revisa firebase.js / README.');
    process.exit(1);
  }
  store = require('./stores/firestore');
} else {
  store = require('./stores/sqlite');
}

console.log(`Almacenamiento de datos: ${store.driver}`);

module.exports = store;
