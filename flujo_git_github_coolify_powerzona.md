# Flujo profesional de trabajo - PowerZona / Tusenda Ecommerce

Este documento resume los comandos y reglas para trabajar correctamente con Git, GitHub, Codex, staging y Coolify.

---

## 1. Estructura del proyecto

Repositorio GitHub:

```txt
https://github.com/tusendasoporte-sudo/tusendaecommerce.git
```

Carpetas principales:

```txt
frontend-powerzona   # Frontend Astro
backend-powerzona    # Backend PocketBase
```

Ramas principales:

```txt
main = versión estable

dev  = versión de trabajo, pruebas y cambios con Codex
```

Regla principal:

```txt
Nunca trabajar cambios nuevos directamente en main.
Trabajar siempre en dev.
```

---

## 2. Verificar estado antes de trabajar

Desde la raíz del proyecto:

```bash
git status
```

Resultado ideal:

```txt
On branch dev
Your branch is up to date with 'origin/dev'.

nothing to commit, working tree clean
```

Confirmar rama actual:

```bash
git branch
```

Debe salir:

```txt
* dev
  main
```

Si no estás en dev:

```bash
git checkout dev
```

Traer últimos cambios desde GitHub:

```bash
git pull
```

---

## 3. Flujo correcto antes de pedir cambios a Codex

Antes de pedir cualquier cambio a Codex:

```bash
git status
```

Debe estar limpio.

Luego confirmar que estás en dev:

```bash
git branch
```

Si todo está correcto, pedirle a Codex:

```txt
Antes de modificar nada, dime exactamente qué archivos vas a tocar.
No cambies diseño premium.
No agregues textos internos visibles.
No toques migraciones PocketBase sin avisar.
Si agregas migración, dime cuál se conserva y cuál se elimina si reemplaza otra.
```

---

## 4. Revisar cambios después de Codex

Después de que Codex modifique archivos:

```bash
git status
```

Ver diferencias:

```bash
git diff
```

Ver diferencias resumidas:

```bash
git diff --stat
```

Si quieres revisar un archivo específico:

```bash
git diff ruta/del/archivo
```

Ejemplo:

```bash
git diff frontend-powerzona/src/pages/admin/shipping.astro
```

---

## 5. Probar frontend en desarrollo

Entrar al frontend:

```bash
cd frontend-powerzona
```

Levantar Astro en local:

```bash
npm run dev
```

URL local:

```txt
http://localhost:4321/
```

Para salir del servidor local:

```bash
Ctrl + C
```

Volver a la raíz:

```bash
cd ..
```

---

## 6. Probar build antes de subir cambios

Desde `frontend-powerzona`:

```bash
npm run build
```

Resultado ideal:

```txt
[build] Complete!
```

Si aparecen advertencias como estas:

```txt
getStaticPaths() ignored in dynamic page...
```

No necesariamente bloquean el despliegue. Lo importante es que el build termine con `Complete!`.

---

## 7. Guardar cambios en Git

Desde la raíz del proyecto:

```bash
git status
```

Agregar archivos modificados:

```bash
git add ruta/del/archivo
```

Ejemplo:

```bash
git add frontend-powerzona/package.json frontend-powerzona/package-lock.json frontend-powerzona/astro.config.mjs
```

O si ya revisaste bien todos los cambios:

```bash
git add .
```

Crear commit:

```bash
git commit -m "Mensaje claro del cambio"
```

Ejemplo:

```bash
git commit -m "Preparar frontend SSR para Coolify"
```

Subir a GitHub:

```bash
git push
```

Verificar que quedó limpio:

```bash
git status
```

---

## 8. Actualizar GitHub desde dev

Flujo normal diario:

```bash
git checkout dev
git pull
# trabajar cambios
git status
npm run build   # desde frontend-powerzona si hubo cambios frontend
git add .
git commit -m "Descripción del cambio"
git push
```

---

## 9. Pasar cambios estables de dev a main

Solo cuando dev esté probado y estable:

```bash
git checkout main
git pull
git merge dev
git push
git checkout dev
```

Regla:

```txt
main solo recibe cambios ya probados.
dev es donde se trabaja y se rompe si hace falta.
```

---

## 10. Archivos que NO deben subirse a GitHub

Estos deben estar ignorados:

```txt
node_modules/
backend-powerzona/pb_data/
backend-powerzona/pb_logs/
backend-powerzona/pb_public/
backend-powerzona/pocketbase.exe
*.zip
*.rar
*.7z
*.bak
*.backup
tmp/
temp/
```

Verificar que Git no los está siguiendo:

```bash
git ls-files | findstr /i "node_modules pb_data pb_logs pb_public pocketbase.exe"
```

Resultado ideal:

```txt
No debe salir nada.
```

---

## 11. Migraciones PocketBase

Las migraciones sí deben subirse:

```txt
backend-powerzona/pb_migrations/
```

Verificar:

```bash
git ls-files | findstr /i "pb_migrations"
```

Debe mostrar archivos dentro de:

```txt
backend-powerzona/pb_migrations/
```

Regla importante:

```txt
Si se agrega una migración nueva, Codex debe avisar.
Si una migración reemplaza otra, Codex debe decir cuál conservar y cuál eliminar.
No borrar migraciones sin revisar.
```

---

## 12. Comandos útiles de ramas

Ver ramas:

```bash
git branch
```

Cambiar a dev:

```bash
git checkout dev
```

Cambiar a main:

```bash
git checkout main
```

Crear una rama nueva desde dev:

```bash
git checkout dev
git checkout -b nombre-de-rama
```

Eliminar rama local si ya no se necesita:

```bash
git branch -d nombre-de-rama
```

---

## 13. Deshacer cambios si algo sale mal

Ver cambios:

```bash
git status
```

Deshacer cambios de un archivo específico:

```bash
git restore ruta/del/archivo
```

Ejemplo:

```bash
git restore frontend-powerzona/src/pages/admin/shipping.astro
```

Deshacer todos los cambios no guardados:

```bash
git restore .
```

Cuidado: esto elimina cambios locales no commitados.

---

## 14. Ver historial

Ver últimos commits:

```bash
git log --oneline -10
```

Ver historial gráfico simple:

```bash
git log --oneline --graph --decorate --all -15
```

---

## 15. Flujo Coolify / staging

Coolify usará GitHub como fuente del código.

Flujo:

```txt
PC / VS Code
   ↓ git push
GitHub privado
   ↓ Coolify lee repo y rama
Servidor / VPS
   ↓
Staging público con dominio temporal
```

Para frontend en Coolify:

```txt
Repository: tusendasoporte-sudo/tusendaecommerce
Branch: dev
Base Directory: frontend-powerzona
Build Command: npm install && npm run build
Start Command: revisar según dist generado por Astro Node
```

Para backend PocketBase:

```txt
pb_migrations vienen desde GitHub
pb_data debe estar en volumen persistente del servidor
pocketbase.exe no se usa en Linux
```

---

## 16. Reglas visuales y de producto

Reglas permanentes del proyecto:

```txt
No romper diseño premium actual.
No dejar textos internos visibles.
No dejar notas técnicas visibles.
No mostrar nombres de bloques o versiones en admin o tienda pública.
No tocar multiusuarios todavía.
Primero cerrar PowerZona como tienda individual estable.
```

Para menús flotantes de 3 puntos:

```txt
Usar patrón seguro:
- fixed / portal o posición calculada
- z-index alto
- cierre al tocar fuera
- reposición si está cerca del borde inferior
```

Para imágenes:

```txt
Optimizar automáticamente al guardar.
Preferir WebP.
Buen tamaño.
Buena calidad.
Evitar imágenes pesadas.
```

---

## 17. Comandos usados en esta etapa

Conectar repo GitHub:

```bash
git remote add origin https://github.com/tusendasoporte-sudo/tusendaecommerce.git
```

Ver remoto:

```bash
git remote -v
```

Subir main:

```bash
git push -u origin main
```

Crear dev:

```bash
git checkout -b dev
```

Subir dev:

```bash
git push -u origin dev
```

Preparar Astro SSR para Coolify:

```bash
cd frontend-powerzona
npm.cmd install @astrojs/node
npm run build
```

Commit realizado:

```bash
git add frontend-powerzona/astro.config.mjs frontend-powerzona/package-lock.json frontend-powerzona/package.json
git commit -m "Preparar frontend SSR para Coolify"
git push
```

---

## 18. Estado actual confirmado

```txt
GitHub privado conectado.
main creada como estable.
dev creada como trabajo diario.
.gitignore seguro.
pb_migrations versionadas.
pb_data, pb_logs, pb_public y pocketbase.exe fuera de Git.
Astro configurado con adapter Node.
npm run build funciona correctamente.
Proyecto listo para el siguiente paso: conectar Coolify con GitHub para staging.
```
