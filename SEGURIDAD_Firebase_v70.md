# SCI v70 — Cierre de acceso con Firebase Auth (correo + clave)

Antes, cualquiera con el enlace podía entrar a los datos usando login anónimo. Ahora el acceso exige un usuario real (correo + contraseña) que TÚ creas en Firebase. El login de la app valida contra Firebase; tu tabla de usuarios solo define rol y permisos.

## Orden de los pasos — síguelo tal cual para no quedar bloqueado

### 1. Crear los usuarios en Firebase Console
1. https://console.firebase.google.com → proyecto **cuaderno-de-campo-d2922**.
2. **Authentication** → **Sign-in method**.
3. Habilita **Correo electrónico/contraseña**. Guarda.
4. **Deshabilita el proveedor "Anónimo"** si está activo.
5. **Users** → **Add user**. Crea uno por persona (correo + contraseña):
   - **Tu admin**: el correo con que entrarás tú (ej. `rodrigo.briones.friz@gmail.com`)
   - `mmautz@forestallacabana.cl`
   - `rodrigoparant@forestallacabana.cl`

> La contraseña se gestiona SIEMPRE aquí, nunca en la app.

### 2. Cambiar las reglas de Firestore
Firebase Console → **Firestore Database** → **Reglas** → pega esto y **Publicar**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sci/{docId} {
      allow read, write: if request.auth != null
                         && request.auth.token.firebase.sign_in_provider == 'password'
                         && (docId == 'main' || docId.matches('main_p[0-9]+'));
    }
    match /cuaderno/{docId} {
      allow read, write: if request.auth != null
                         && request.auth.token.firebase.sign_in_provider == 'password';
    }
    match /presupuesto/{docId} {
      allow read, write: if request.auth != null
                         && request.auth.token.firebase.sign_in_provider == 'password';
    }
    match /{document=**} { allow read, write: if false; }
  }
}
```

### 3. Subir el código v70
Sube el zip completo o los archivos cambiados:
`index.html`, `service-worker.js`, `js/core.js`, `js/cuaderno.js`, `js/inventario.js`, `js/presupuesto.js`.

### 4. Primer login: tu admin se auto-enlaza (sin bloqueo)
Tu usuario `rbriones` ya es admin pero aún no tiene correo. El código trae un **rescate de primer arranque**:

1. Abre la app (recarga para tomar v70).
2. Inicia sesión con **tu correo de Firebase** y su clave.
3. Como ningún usuario tiene correo todavía y `rbriones` es admin, la app te preguntará:
   *"Primer acceso con correo. ¿Asociar este correo (tu correo) al administrador 'rbriones'?"* → **Aceptar**.
4. Quedas dentro como admin, y `rbriones` queda enlazado a tu correo para siempre.

> Este rescate se apaga solo: en cuanto UN usuario tenga correo, ya no se puede volver a usar para colarse. Es seguro.

### 5. Enlazar a los demás usuarios
Ya dentro como admin, ve a **Usuarios** y edita cada uno poniendo su **Correo de acceso** (igual al de Firebase):
- `mmautz` → `mmautz@forestallacabana.cl`
- `rparant` → `rodrigoparant@forestallacabana.cl`

La columna "Correo" marca en rojo "sin correo" a quien le falte. Ese usuario no entra hasta asignárselo.

## Crear un usuario nuevo de aquí en adelante (2 pasos)
1. **Firebase Console → Authentication → Add user**: correo + contraseña.
2. **App → Usuarios → Nuevo**: mismo correo en "Correo de acceso", rol y permisos.

Dar de baja: desactívalo en la app (switch Activo) **y** deshabilítalo/bórralo en Firebase Authentication.

## Qué cambió en el código
- `doLogin`: ahora hace `signInWithEmailAndPassword`; tras autenticar busca el usuario por correo y carga rol/permisos. Incluye el rescate de primer arranque para el admin.
- Se eliminó `signInAnonymously` de `core.js` y `cuaderno.js`.
- El arranque ya no sincroniza antes del login: solo prepara el SDK.
- `logout` también cierra la sesión de Firebase (`signOut`).
- Formulario de usuarios: campo **Correo de acceso** (obligatorio, único); la contraseña se gestiona en Firebase.

## Recomendado
- Pon el repositorio de GitHub en **privado** (GitHub Pages sigue funcionando).
