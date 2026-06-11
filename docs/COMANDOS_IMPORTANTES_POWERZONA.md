# Comandos importantes — PowerZona

Documento rápido para tener a mano los comandos principales del proyecto **PowerZona**.

---

## 1. Ubicación principal del proyecto

Ruta actual del proyecto en Windows:

```powershell
C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt
```

Para entrar a la carpeta principal:

```powershell
cd "C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt"
```

---

## 2. Abrir PocketBase

Abrir una terminal nueva en PowerShell y ejecutar:

cd "C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt\backend-powerzona"
.\pocketbase.exe serve

```powershell
cd "C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt\backend-powerzona"
.\pocketbase.exe serve
```

PocketBase debe mostrar algo parecido a:

```txt
Server started at http://127.0.0.1:8090
REST API:  http://127.0.0.1:8090/api/
Dashboard: http://127.0.0.1:8090/_/
```

Panel admin de PocketBase:

```txt
http://127.0.0.1:8090/_/
```

API de PocketBase:

```txt
http://127.0.0.1:8090/api/
```

---

## 3. Abrir el frontend local

Abrir otra terminal nueva en PowerShell y ejecutar:

```powershell
cd "C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt\frontend-powerzona"
npm run dev
npm run dev -- --host 0.0.0.0
```

La web local debe abrir en:

```txt
http://localhost:4321
```

---

## 4. URLs importantes del proyecto

Página pública:

```txt
http://localhost:4321
```

Checkout:

```txt
http://localhost:4321/checkout
```

Panel admin principal:

```txt
http://localhost:4321/admin
```

Panel admin de órdenes:

```txt
http://localhost:4321/admin/orders
```

PocketBase admin:

```txt
http://127.0.0.1:8090/_/
```

---

## 5. Orden correcto para abrir el proyecto

Siempre abrir en este orden:

```txt
1. Abrir PocketBase.
2. Abrir frontend con npm run dev.
3. Entrar a http://localhost:4321.
4. Entrar al panel admin si hace falta.
```

---

## 6. Si el frontend da error `fetch failed`

Ese error normalmente significa que el frontend no puede conectarse a PocketBase.

Revisar primero:

```txt
1. Confirmar que PocketBase está abierto.
2. Confirmar que PocketBase está en el puerto 8090.
3. Confirmar que el archivo .env del frontend apunta al puerto correcto.
```

Archivo a revisar:

```txt
frontend-powerzona\.env
```

Debe tener:

```env
PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090
```

Si aparece `8091`, cambiarlo a `8090`.

Después reiniciar el frontend:

```powershell
Ctrl + C
npm run dev
```

---

## 7. Detener servidores

Para detener PocketBase o Astro:

```powershell
Ctrl + C
```

Si pregunta:

```txt
Terminate batch job (Y/N)?
```

Responder:

```txt
Y
```

---

## 8. Reinstalar dependencias del frontend

Usar esto si hay errores raros de dependencias, Astro, Vite o Rollup:

```powershell
cd "C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt\frontend-powerzona"
npm install
```

Luego abrir otra vez:

```powershell
npm run dev
```

---

## 9. Build de prueba

Para probar si el proyecto compila:

```powershell
cd "C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt\frontend-powerzona"
npm run build
```

Si el build funciona, el frontend está listo técnicamente para producción.

---

## 10. Comando rápido para abrir frontend desde carpeta principal

Si estás en:

```txt
C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt
```

puedes hacer:

```powershell
cd .\frontend-powerzona
npm run dev
```

---

## 11. Comando rápido para abrir PocketBase desde carpeta principal

Si estás en:

```txt
C:\Users\workd\Desktop\PROYECTOS\WEb E_Comerce PowerZona_ChatGpt
```

puedes hacer:

```powershell
cd .\backend-powerzona
.\pocketbase.exe serve
```

---

## 12. Verificar carpetas correctas

La estructura actual importante del proyecto es:

```txt
WEb E_Comerce PowerZona_ChatGpt
├─ backend-powerzona
│  ├─ pocketbase.exe
│  ├─ pb_data
│  └─ pb_migrations
│
└─ frontend-powerzona
   ├─ src
   ├─ public
   ├─ package.json
   └─ .env
```

Carpeta backend correcta:

```txt
backend-powerzona
```

Carpeta frontend correcta:

```txt
frontend-powerzona
```

No usar:

```txt
backend
```

porque esa carpeta no existe en esta versión del source.

---

## 13. Pruebas rápidas después de abrir

Después de abrir ambos servidores, probar:

```txt
1. http://localhost:4321
2. http://localhost:4321/checkout
3. http://localhost:4321/admin
4. http://localhost:4321/admin/orders
5. http://127.0.0.1:8090/_/
```

---

## 14. Bloque actual del proyecto

Último bloque trabajado:

```txt
Inventario seguro al confirmar / cancelar orden
```

Estado:

```txt
Implementado en source actualizado.
Pendiente de pruebas manuales finales.
```

Próximo bloque recomendado:

```txt
Limpieza visual del panel admin y botón plegable para Agregar producto.
```

Antes de empezar un bloque nuevo, conviene:

```txt
1. Cerrar el bloque actual.
2. Actualizar el source.
3. Actualizar el Master Document.
4. Abrir una conversación nueva.
```
