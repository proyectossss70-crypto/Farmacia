# Puesta en marcha — versión web (GitHub Pages)

Esta carpeta `docs/` es una app **100% en el navegador**: no hay servidor.
Habla directamente con **Firebase Authentication** (login) y **Cloud Firestore** (datos).
La configuración web de Firebase ya está puesta en `firebase-config.js` (son valores públicos).

Son **3 pasos únicos**. Después, cualquier cambio se publica solo con `git push`.

---

## 1. Activar el inicio de sesión en Firebase

1. [console.firebase.google.com](https://console.firebase.google.com) → proyecto **farmacia-uniris**
2. Menú **Authentication** → **Comenzar / Get started**
3. Pestaña **Sign-in method** → **Email/Password** → **Habilitar** (solo la primera opción) → **Guardar**

## 2. Crear las cuentas de acceso

En una terminal, con `serviceAccountKey.json` en la raíz del proyecto:

```bash
node seed-firebase.js
```

Crea estas cuentas (cámbialas de contraseña después, o créalas tú desde la sección Usuarios):

| Correo | Contraseña | Rol |
|---|---|---|
| `jefe@farmacia.com` | `jefe123` | jefe |
| `admin@farmacia.com` | `admin123` | administrador |
| `soporte@farmacia.com` | `soporte123` | soporte |
| `cajero@farmacia.com` | `cajero123` | cajero |

## 3. Publicar las reglas de seguridad de Firestore

1. Firebase console → **Firestore Database** → pestaña **Rules**
2. Borra lo que haya y pega el contenido de [`../firestore.rules`](../firestore.rules)
3. **Publicar**

## 4. Activar GitHub Pages

1. En GitHub: repo **Settings** → **Pages**
2. **Source:** Deploy from a branch
3. **Branch:** `main` — carpeta **`/docs`** → **Save**
4. Espera ~1 minuto. La app queda en:
   **https://proyectossss70-crypto.github.io/Farmacia/**

---

## Uso

- Entra con `jefe@farmacia.com` / `jefe123`.
- **Cambia las contraseñas**: sección **Usuarios** (crear/editar).
- Al eliminar un usuario se le quita el acceso; la cuenta de correo sigue en Firebase
  Authentication (bórrala ahí si quieres, es opcional).

## Roles

| | Inventario | Reportes | Usuarios | Configuración | Ve costos/margen |
|---|---|---|---|---|---|
| **jefe** | editar | sí | editar | editar | sí |
| **administrador** | editar | sí | ver | editar | sí |
| **soporte** | ver | sí | editar | ver | sí |
| **cajero** | ver | no | — | — | **no** |

El **cajero** solo consulta el panel y el inventario (nombre, stock, precio de venta,
vencimiento). No ve precio de costo ni margen, ni reportes, usuarios o configuración.

Se ajustan en `firestore.rules` (seguridad real de escritura) y en `docs/app.js` → `PERMISOS`
(lo que se muestra, incluido ocultar costos con `costos: false`).
