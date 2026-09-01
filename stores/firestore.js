'use strict';

// Implementación del almacén sobre Cloud Firestore (Firebase Admin SDK).
// Colecciones:  usuarios / medicamentos / configuracion
const { firestore } = require('../firebase');

const C = {
  usuarios: () => firestore.collection('usuarios'),
  medicamentos: () => firestore.collection('medicamentos'),
  configuracion: () => firestore.collection('configuracion'),
};

const doc2obj = (d) => (d && d.exists ? { id: d.id, ...d.data() } : null);
const publicUser = (u) => {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
};

const MED_DEFAULTS = {
  nombre: '', categoria: null, stock: 0, stock_minimo: 0, precio: 0, costo: 0,
  fecha_vencimiento: null, unidad_venta: 'unidad', unidades_por_blister: 1, lote: null,
};

async function getConfig(clave, def = null) {
  const snap = await C.configuracion().doc(clave).get();
  return snap.exists ? snap.data().valor : def;
}

module.exports = {
  driver: 'firestore',

  async init() {
    const ref = C.configuracion().doc('meses_alerta_vencimiento');
    if (!(await ref.get()).exists) await ref.set({ valor: '6' });
  },

  usuarios: {
    async list() {
      const snap = await C.usuarios().orderBy('nombre').get();
      return snap.docs.map((d) => publicUser(doc2obj(d)));
    },
    async getById(id) {
      return doc2obj(await C.usuarios().doc(id).get());
    },
    async getByUsername(usuario) {
      const snap = await C.usuarios().where('usuario', '==', usuario).limit(1).get();
      return snap.empty ? null : doc2obj(snap.docs[0]);
    },
    async create({ nombre, usuario, password_hash, rol }) {
      const ref = await C.usuarios().add({
        nombre, usuario, password_hash, rol,
        activo: true,
        creado_en: new Date().toISOString(),
      });
      return publicUser(doc2obj(await ref.get()));
    },
    async update(id, { nombre, rol, activo }) {
      const ref = C.usuarios().doc(id);
      if (!(await ref.get()).exists) return null;
      await ref.update({ nombre, rol, activo: !!activo });
      return publicUser(doc2obj(await ref.get()));
    },
    async setPassword(id, password_hash) {
      await C.usuarios().doc(id).update({ password_hash });
    },
    async remove(id) {
      const ref = C.usuarios().doc(id);
      if (!(await ref.get()).exists) return false;
      await ref.delete();
      return true;
    },
    async count() {
      const snap = await C.usuarios().get();
      return snap.size;
    },
  },

  medicamentos: {
    async list() {
      const snap = await C.medicamentos().orderBy('nombre').get();
      return snap.docs.map(doc2obj);
    },
    async getById(id) {
      return doc2obj(await C.medicamentos().doc(id).get());
    },
    async create(data) {
      const now = new Date().toISOString();
      const ref = await C.medicamentos().add({
        ...MED_DEFAULTS, ...data, creado_en: now, actualizado_en: now,
      });
      return doc2obj(await ref.get());
    },
    async update(id, data) {
      const ref = C.medicamentos().doc(id);
      if (!(await ref.get()).exists) return null;
      await ref.update({ ...data, actualizado_en: new Date().toISOString() });
      return doc2obj(await ref.get());
    },
    async remove(id) {
      const ref = C.medicamentos().doc(id);
      if (!(await ref.get()).exists) return false;
      await ref.delete();
      return true;
    },
    async count() {
      const snap = await C.medicamentos().get();
      return snap.size;
    },
  },

  config: {
    get: getConfig,
    async set(clave, valor) {
      await C.configuracion().doc(clave).set({ valor: String(valor) });
    },
    async mesesAlerta() {
      const n = parseInt(await getConfig('meses_alerta_vencimiento', '6'), 10);
      return Number.isFinite(n) && n >= 0 ? n : 6;
    },
  },
};
