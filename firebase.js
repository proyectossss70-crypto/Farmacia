'use strict';

// Inicializa Firebase Admin (Firestore) si hay credenciales disponibles.
//
// Formas de dar la credencial (en orden de prioridad):
//   1. Variable de entorno FIREBASE_SERVICE_ACCOUNT con el JSON completo.
//   2. Variable GOOGLE_APPLICATION_CREDENTIALS con la ruta a un archivo JSON.
//   3. Archivo  serviceAccountKey.json  en la raíz del proyecto.
//
// Si no hay credenciales, la app sigue funcionando con SQLite local.

const fs = require('node:fs');
const path = require('node:path');

let firestore = null;
let firebaseEnabled = false;
let FieldValue = null;
let projectId = null;

function cargarCredencial() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch {
      console.error('FIREBASE_SERVICE_ACCOUNT no contiene un JSON válido.');
      return null;
    }
  }
  const rutas = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(__dirname, 'serviceAccountKey.json'),
  ].filter(Boolean);
  for (const ruta of rutas) {
    if (fs.existsSync(ruta)) {
      try {
        return JSON.parse(fs.readFileSync(ruta, 'utf8'));
      } catch {
        console.error(`No se pudo leer la credencial de Firebase en ${ruta}`);
        return null;
      }
    }
  }
  return null;
}

try {
  const cred = cargarCredencial();
  if (cred) {
    const admin = require('firebase-admin');
    admin.initializeApp({
      credential: admin.credential.cert(cred),
      projectId: cred.project_id,
    });
    firestore = admin.firestore();
    firestore.settings({ ignoreUndefinedProperties: true });
    FieldValue = admin.firestore.FieldValue;
    projectId = cred.project_id;
    firebaseEnabled = true;
  }
} catch (err) {
  console.error('No se pudo inicializar Firebase:', err.message);
  firebaseEnabled = false;
}

module.exports = { firestore, firebaseEnabled, FieldValue, projectId };
