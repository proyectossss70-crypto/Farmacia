# Farmacia

App web para gestión de una farmacia: **inventario de medicamentos**, **alertas de vencimiento configurables**, **usuarios con roles** y **reportes descargables en Excel**.

## Requisitos

- Node.js 22 o superior.

## Instalación y arranque

```bash
npm install
npm run seed      # crea la base de datos, usuarios y datos de ejemplo
npm start         # http://localhost:3000
```

Para desarrollo con recarga automática: `npm run dev`.

## Almacenamiento de datos

La app funciona con dos backends de datos y elige automáticamente:

| Situación | Backend usado |
|-----------|---------------|
| Sin credenciales de Firebase | **SQLite local** (`data/farmacia.db`) |
| Con credenciales de Firebase | **Cloud Firestore** |

Se puede forzar con la variable de entorno `DB_DRIVER=sqlite` o `DB_DRIVER=firestore`.
Al arrancar, el servidor imprime `Almacenamiento de datos: sqlite | firestore`.

### Conectar Firebase / Firestore

1. En [console.firebase.google.com](https://console.firebase.google.com) crea un proyecto y activa **Firestore Database** (modo producción).
2. **Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada**. Se descarga un JSON.
3. Guarda ese archivo como **`serviceAccountKey.json`** en la raíz del proyecto (ya está en `.gitignore`, nunca se sube al repo).
   - Alternativas: variable `GOOGLE_APPLICATION_CREDENTIALS=/ruta/al.json` o `FIREBASE_SERVICE_ACCOUNT='{...json...}'`.
4. Ejecuta `npm run seed` para crear usuarios y datos de ejemplo en Firestore, y luego `npm start`.
5. (Opcional) Publica las reglas de [`firestore.rules`](firestore.rules): bloquean el acceso directo de clientes, ya que todo pasa por el servidor.

Colecciones que crea en Firestore: `usuarios`, `medicamentos`, `configuracion`.

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

## Publicar online (URL pública) con Render

El repo incluye [`render.yaml`](render.yaml) para desplegar gratis en [Render](https://render.com).

1. Sube este proyecto a un repositorio de GitHub (tuyo o con permiso de escritura).
2. En Render: **New → Blueprint** → conecta ese repositorio. Render detecta `render.yaml`.
3. Antes de crear el servicio, en **Secret Files** añade un archivo:
   - Nombre: `serviceAccountKey.json`
   - Contenido: el JSON de la cuenta de servicio de Firebase.
4. **Apply / Create**. Al terminar, Render da una URL tipo `https://farmacia-xxxx.onrender.com`.
5. Entra con `jefe` / `jefe123` y **cambia todas las contraseñas de inmediato** (sección Usuarios).

Variables que configura `render.yaml`: `NODE_ENV=production`, `DB_DRIVER=firestore`,
`SESSION_SECRET` (autogenerada), `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/serviceAccountKey.json`.

> Plan gratuito: el servicio se "duerme" tras ~15 min sin uso; la primera visita después
> tarda ~50 s en responder y se cierran las sesiones abiertas (hay que volver a iniciar sesión).

## Estructura

```
server.js            API REST + servidor web (Express)
store.js             elige el backend de datos (sqlite / firestore)
stores/sqlite.js     implementación sobre SQLite
stores/firestore.js  implementación sobre Cloud Firestore
firebase.js          inicializa Firebase Admin si hay credenciales
db.js                esquema y conexión SQLite
lib.js               cálculo de estados de vencimiento y márgenes
reportes.js          generación de archivos Excel (ExcelJS)
permisos.js          matriz de permisos por rol
seed.js              datos iniciales
firestore.rules      reglas de seguridad de Firestore
public/              interfaz web (HTML/CSS/JS sin framework)
data/                base de datos local SQLite (no se versiona)
```

## Notas

- `serviceAccountKey.json`, `.env` y `data/` están en `.gitignore` y no se suben al repo.
- Sesiones en memoria: al reiniciar el servidor hay que volver a iniciar sesión.
- Para producción, definir `SESSION_SECRET` y `PORT` como variables de entorno y servir tras HTTPS.
