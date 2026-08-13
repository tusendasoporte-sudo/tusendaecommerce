# Corrección de codificación del cartel de dispositivos

Fecha: 13 de agosto de 2026

## Problema

Los mensajes rojos del acceso administrativo mostraban caracteres dañados, por ejemplo `alcanzÃ³` y `lÃ­mite`, cuando el backend rechazaba la autorización de un dispositivo.

## Alcance del cambio

- Se corrigieron los mensajes visibles del control de dispositivos en el frontend administrativo.
- Se corrigieron los mismos mensajes seguros emitidos por el backend de PocketBase.
- No se cambió el cálculo de cupos, la generación del identificador del dispositivo, la autorización, la revocación ni las sesiones.
- No se modificaron otros módulos del proyecto.

## Pruebas necesarias

1. Provocar en un entorno de prueba un rechazo por límite de dispositivos y comprobar que el cartel muestre `Se alcanzó el límite...`.
2. Intentar acceder con un dispositivo revocado y comprobar que se muestre `Este dispositivo no está autorizado...`.
3. Verificar un error temporal de validación y comprobar que se muestre `Intenta nuevamente más tarde`.
4. Iniciar sesión con credenciales incorrectas y comprobar que aparezca `Email o contraseña incorrectos`.
5. Confirmar que la autorización normal dentro del cupo continúa funcionando.

## Regresión automatizada

Se agregaron aserciones para verificar el texto exacto en frontend y backend y rechazar cualquier mensaje que vuelva a contener el marcador de codificación incorrecta `Ã`.
