# Farmacia

App web para gestión de una farmacia: **inventario de medicamentos**, **alertas de vencimiento configurables**, **usuarios con roles** y **reportes descargables en Excel**.

## Requisitos

- Node.js 22 o superior (usa el módulo SQLite nativo `node:sqlite`, sin bases de datos externas).

## Instalación y arranque

```bash
npm install
npm run seed      # crea la base de datos, usuarios y datos de ejemplo
npm start         # http://localhost:3000
```

Para desarrollo con recarga automática: `npm run dev`.

## Usuarios de acceso (creados por `npm run seed`)

| Rol           | Usuario   | Contraseña   | Puede hacer |
|---------------|-----------|--------------|-------------|
| Jefe          | `jefe`    | `jefe123`    | Todo: inventario, reportes, usuarios y configuración |
| Administrador | `admin`   | `admin123`   | Inventario (editar), reportes, configuración; ve usuarios |
| Soporte       | `soporte` | `soporte123` | Ve inventario y reportes; gestiona usuarios |

> Cambia las contraseñas desde la sección **Usuarios** después de entrar.
> Los permisos de cada rol se editan en [`permisos.js`](permisos.js).

## Inventario

Cada medicamento tiene:

- **Nombre del medicamento**
- **En stock** y **stock mínimo** (alerta de bajo stock)
- **Precio** de venta y **costo** (calcula margen unitario y %)
- **Fecha de vencimiento**
- **Se vende por unidad o por blister** (+ unidades por blister)
- Categoría y lote (opcionales)

### Alerta de vencimiento

En **Configuración** se define con cuántos **meses de anticipación** avisar (por defecto **6**).
Un medicamento que vence dentro de ese plazo se marca como **«Por vencer (devolver)»**;
si ya pasó la fecha, **«Vencido»**.

## Reportes en Excel

En la sección **Reportes** (botón *Descargar Excel*, archivos `.xlsx`):

- **Reporte de inventario** — todo el inventario con estados, márgenes y valores.
- **Medicamentos a devolver** — vencidos y por vencer, ordenados por fecha.
- **Medicamentos bajo stock**.
- **Valorización de inventario** — totales por categoría (costo, venta, margen).
- **Reporte completo** — las 4 hojas anteriores en un solo archivo.

## Estructura

```
server.js       API REST + servidor web (Express)
db.js           esquema y conexión SQLite
lib.js          cálculo de estados de vencimiento y márgenes
reportes.js     generación de archivos Excel (ExcelJS)
permisos.js     matriz de permisos por rol
seed.js         datos iniciales
public/         interfaz web (HTML/CSS/JS sin framework)
data/           base de datos local (no se versiona)
```

## Notas

- La base de datos se guarda en `data/farmacia.db` (ignorada por git).
- Sesiones en memoria: al reiniciar el servidor hay que volver a iniciar sesión.
- Para producción, definir `SESSION_SECRET` y `PORT` como variables de entorno y servir tras HTTPS.
