'use strict';

// Provisiona la app cliente (GitHub Pages) en Firebase:
//   - crea las cuentas de acceso en Firebase Authentication
//   - crea el documento de rol en Firestore (usuarios/{uid})
//   - deja la configuración por defecto
//
// Uso:  node seed-firebase.js        (requiere serviceAccountKey.json)

const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });

const auth = admin.auth();
const db = admin.firestore();

const USERS = [
  { email: 'jefe@farmacia.com', password: 'jefe123', nombre: 'Jefe / Propietario', rol: 'jefe' },
  { email: 'admin@farmacia.com', password: 'admin123', nombre: 'Administrador', rol: 'administrador' },
  { email: 'soporte@farmacia.com', password: 'soporte123', nombre: 'Soporte', rol: 'soporte' },
  { email: 'cajero@farmacia.com', password: 'cajero123', nombre: 'Cajero', rol: 'cajero' },
];

async function main() {
  // Limpia usuarios del esquema anterior (los que tenían contraseña con hash).
  const viejos = await db.collection('usuarios').get();
  for (const d of viejos.docs) {
    if (d.data().password_hash) await d.ref.delete();
  }

  for (const u of USERS) {
    let rec;
    try {
      rec = await auth.getUserByEmail(u.email);
      await auth.updateUser(rec.uid, { password: u.password, displayName: u.nombre });
    } catch {
      rec = await auth.createUser({ email: u.email, password: u.password, displayName: u.nombre });
    }
    await db.collection('usuarios').doc(rec.uid).set({
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      activo: true,
    });
    console.log(`  ${u.email.padEnd(22)} ${u.rol.padEnd(14)} uid=${rec.uid}`);
  }

  // Configuración (alerta de vencimiento en meses)
  await db.collection('configuracion').doc('app').set({ meses_alerta_vencimiento: 6 }, { merge: true });
  await db.collection('configuracion').doc('meses_alerta_vencimiento').delete().catch(() => {});

  // Medicamentos de ejemplo si no hay ninguno
  const meds = await db.collection('medicamentos').get();
  if (meds.empty) {
    const hoy = new Date();
    const enMeses = (m) => {
      const d = new Date(hoy);
      d.setMonth(d.getMonth() + m);
      return d.toISOString().slice(0, 10);
    };
    const demo = [
      ['Paracetamol 500mg', 'Analgésicos', 240, 50, 0.15, 0.07, enMeses(14), 'blister', 10, 'L-2401'],
      ['Ibuprofeno 400mg', 'Antiinflamatorios', 60, 40, 0.2, 0.09, enMeses(3), 'blister', 10, 'L-2312'],
      ['Amoxicilina 500mg', 'Antibióticos', 18, 30, 0.35, 0.18, enMeses(-1), 'blister', 12, 'L-2208'],
      ['Loratadina 10mg', 'Antialérgicos', 120, 20, 0.25, 0.11, enMeses(8), 'unidad', 1, 'L-2405'],
      ['Alcohol en gel 250ml', 'Cuidado personal', 35, 10, 2.5, 1.4, enMeses(20), 'unidad', 1, 'L-2401'],
      ['Omeprazol 20mg', 'Gastrointestinales', 25, 25, 0.3, 0.14, enMeses(5), 'blister', 14, 'L-2311'],
    ];
    for (const [nombre, categoria, stock, stock_minimo, precio, costo, fecha_vencimiento, unidad_venta, unidades_por_blister, lote] of demo) {
      await db.collection('medicamentos').add({
        nombre, categoria, stock, stock_minimo, precio, costo,
        fecha_vencimiento, unidad_venta, unidades_por_blister, lote,
        creado_en: new Date().toISOString(),
        actualizado_en: new Date().toISOString(),
      });
    }
    console.log(`  ${demo.length} medicamentos de ejemplo`);
  }

  console.log('\nListo. Acceso:');
  console.log('  jefe@farmacia.com / jefe123');
  console.log('  admin@farmacia.com / admin123');
  console.log('  soporte@farmacia.com / soporte123');
  console.log('  cajero@farmacia.com / cajero123');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
