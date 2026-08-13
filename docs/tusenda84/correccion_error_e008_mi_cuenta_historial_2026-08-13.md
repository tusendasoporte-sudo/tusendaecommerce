# Corrección E008: Mi cuenta, historial y contraseña

Fecha: 2026-08-13

## Problema reportado

En la aplicación de administración, la sección **Mi cuenta** mostraba directamente todos los filtros y el historial de actividad. Esto alargaba demasiado la vista. El formulario para cambiar la contraseña también permanecía siempre visible.

## Solución aplicada

- **Mi cuenta** ahora muestra dos acciones compactas:
  - **Ver historial** abre una página independiente.
  - **Cambiar contraseña** abre una ventana modal.
- La página **Mi historial** abre los filtros de actividad cerrados por defecto.
- El historial solicita y muestra 10 registros por página.
- La paginación conserva los controles **Anterior** y **Próximo**.
- En Android, el botón físico Atrás desde **Mi historial** regresa a **Mi cuenta**.
- El modal de contraseña conserva el proceso seguro existente: validación, cambio de contraseña y cierre de sesiones.

## Funciones existentes tocadas

1. `StoreActivityView.astro`
   - Se añadieron parámetros opcionales para decidir si los filtros inician abiertos y cuántos registros solicita cada página.
   - Los valores anteriores se conservan como predeterminados: filtros abiertos y 20 registros. Por tanto, las demás vistas que reutilizan el componente no cambian su funcionamiento.

2. `middleware.ts`
   - La excepción de acceso existente para **Mi cuenta** se amplió únicamente a sus rutas hijas `account/*`.
   - El bloqueo de acceso de Master en modo soporte también cubre esas rutas hijas.

3. `account.astro`
   - El historial embebido se movió a la nueva página.
   - El formulario de contraseña se conserva, pero ahora vive dentro de un diálogo accesible.

4. Navegación Android de administración
   - La nueva página declara **Mi cuenta** como su destino padre; no se modificó la jerarquía de otras pantallas.

## Pruebas automáticas necesarias

- E008: acción **Ver historial**, ruta independiente, filtros cerrados y tamaño de página 10.
- E008: apertura y cierre accesible del modal de contraseña.
- Seguridad: el cambio de contraseña sigue usando el servicio seguro existente y finaliza cerrando sesiones.
- Permisos: un administrador o miembro autorizado puede entrar a `account/history`.
- Permisos: Master en modo soporte continúa sin acceso a **Mi cuenta** ni a su historial.
- Navegación Android: Atrás desde **Mi historial** vuelve a **Mi cuenta**.
- Compilación completa del frontend.

## Pruebas manuales requeridas en staging

1. Abrir **Ajustes > Mi cuenta** y comprobar que los filtros y el formulario de contraseña ya no aparecen directamente.
2. Tocar **Ver historial** y confirmar que abre **Mi historial**.
3. Confirmar que **Filtros de actividad** inicia cerrado; abrirlo y realizar una búsqueda.
4. Con más de 10 eventos, confirmar que la primera página contiene como máximo 10 y que **Anterior** y **Próximo** funcionan.
5. En Android, usar el botón físico Atrás desde **Mi historial** y confirmar que vuelve a **Mi cuenta**, no a **Resumen**.
6. Tocar **Cambiar contraseña**, cerrar con la X y tocando fuera del modal.
7. Probar contraseñas nuevas diferentes y confirmar que se muestra la validación sin enviar el cambio.
8. Hacer una prueba controlada con una contraseña válida y confirmar que se cierran las sesiones y se solicita iniciar sesión nuevamente.
9. Repetir el acceso con una cuenta de personal autorizada y confirmar que solo ve su propia actividad.
10. Confirmar que el historial de equipo y las demás vistas de actividad conservan sus valores anteriores.
