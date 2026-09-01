'use strict';

const bcrypt = require('bcryptjs');
const db = require('./db');

const usuariosDemo = [
  { nombre: 'Jefe / Propietario', usuario: 'jefe', password: 'jefe123', rol: 'jefe' },
  { nombre: 'Administrador', usuario: 'admin', password: 'admin123', rol: 'administrador' },
  { nombre: 'Soporte', usuario: 'soporte', password: 'soporte123', rol: 'soporte' },
];

const insertUser = db.prepare(
  `INSERT OR IGNORE INTO usuarios (nombre, usuario, password_hash, rol) VALUES (?, ?, ?, ?)`
);

let creados = 0;
for (const u of usuariosDemo) {
  const res = insertUser.run(u.nombre, u.usuario, bcrypt.hashSync(u.password, 10), u.rol);
  if (res.changes > 0) creados++;
}

// Medicamentos de ejemplo (solo si la tabla está vacía)
const total = db.prepare('SELECT COUNT(*) c FROM medicamentos').get().c;
if (total === 0) {
  const hoy = new Date();
  const enMeses = (m) => {
    const d = new Date(hoy);
    d.setMonth(d.getMonth() + m);
    return d.toISOString().slice(0, 10);
  };
  const insertMed = db.prepare(`
    INSERT INTO medicamentos
      (nombre, categoria, stock, stock_minimo, precio, costo, fecha_vencimiento, unidad_venta, unidades_por_blister, lote)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const demo = [
    ['Paracetamol 500mg', 'Analgésicos', 240, 50, 0.15, 0.07, enMeses(14), 'blister', 10, 'L-2401'],
    ['Ibuprofeno 400mg', 'Antiinflamatorios', 60, 40, 0.20, 0.09, enMeses(3), 'blister', 10, 'L-2312'],
    ['Amoxicilina 500mg', 'Antibióticos', 18, 30, 0.35, 0.18, enMeses(-1), 'blister', 12, 'L-2208'],
    ['Loratadina 10mg', 'Antialérgicos', 120, 20, 0.25, 0.11, enMeses(8), 'unidad', 1, 'L-2405'],
    ['Alcohol en gel 250ml', 'Cuidado personal', 35, 10, 2.50, 1.40, enMeses(20), 'unidad', 1, 'L-2401'],
    ['Omeprazol 20mg', 'Gastrointestinales', 25, 25, 0.30, 0.14, enMeses(5), 'blister', 14, 'L-2311'],
  ];
  for (const m of demo) insertMed.run(...m);
  console.log(`Se insertaron ${demo.length} medicamentos de ejemplo.`);
}

console.log(`Usuarios nuevos creados: ${creados}`);
console.log('\nCredenciales de acceso:');
console.log('  Jefe:          usuario "jefe"     contraseña "jefe123"');
console.log('  Administrador: usuario "admin"    contraseña "admin123"');
console.log('  Soporte:       usuario "soporte"  contraseña "soporte123"');
console.log('\nCambia estas contraseñas desde la sección Usuarios al iniciar sesión.');
