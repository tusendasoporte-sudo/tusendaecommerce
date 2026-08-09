# PowerZona: piloto VPN, proxy y Tor de costo cero

## Alcance

Este cambio amplía exclusivamente el piloto de PowerZona. No modifica R84 ni cambia el estado de BLOCKS03B o S7P3.

El objetivo es reducir falsos negativos sin convertir señales ambiguas en bloqueos. La política existente se conserva:

- `off`: no consulta ni registra inteligencia de red.
- `monitor`: detecta y registra, pero nunca bloquea por esta política.
- `block`: bloquea únicamente cuando `is_vpn`, `is_proxy` o `is_tor` es verdadero y Seguridad está en modo `protection`.
- `network_suspected`: registra contexto de datacenter o abuso sin VPN/proxy/Tor confirmado. Nunca bloquea por sí solo.

La detección de VPN comercial sigue siendo probabilística. Una IP no detectada no demuestra que la conexión sea residencial, y una IP de datacenter no demuestra por sí sola el uso de VPN.

## Fuentes y presupuesto

1. Tor se consulta primero contra una copia local de la lista oficial de nodos de salida publicada por Onionoo. Se actualiza una vez al día; una descarga inválida no reemplaza el último lote válido. El lote deja de producir coincidencias positivas si supera 72 horas de antigüedad.
2. Para las IP no resueltas como Tor se consulta `https://api.ipapi.is` desde PocketBase.
3. Si ipapi no confirma VPN, proxy o Tor y existe `PZ_PROXYCHECK_KEY`, se consulta la API estable v3 de `https://proxycheck.io` como segunda opinión. Una marca explícita de VPN, proxy o Tor solo se confirma si la confianza es al menos 90. Hosting, datacenter o una detección con confianza inferior quedan como `network_suspected` y no bloquean.
4. Las respuestas combinadas se guardan 24 horas en caché privada. Si ya existía una respuesta de ipapi y posteriormente se configura proxycheck, la siguiente visita puede enriquecer esa entrada sin repetir ipapi. Los errores totales o el presupuesto agotado se guardan 5 minutos para evitar reintentos agresivos.

Presupuestos internos por día UTC:

- sin clave: 90 consultas, debajo del límite anónimo oficial de 100;
- con cuenta gratuita: 900 consultas, debajo del límite oficial de 1.000.

Proxycheck solo se usa con cuenta y clave configurada; no se consumen sus consultas anónimas. Su presupuesto interno es de 300 consultas diarias, debajo de las 1.000 incluidas en el plan gratuito. Si proxycheck falla o agota ese presupuesto pero ipapi produjo una respuesta válida, se conserva el resultado de ipapi y no se genera un bloqueo por indisponibilidad de la segunda opinión.

Al alcanzar el presupuesto, o si su contador privado no está disponible, el sistema falla abierto: no bloquea, registra `vpn_check_unavailable` cuando corresponde y no insiste contra el proveedor. Estos presupuestos reducen el riesgo de costo, pero no constituyen una garantía contractual frente a cambios futuros del proveedor.

## Configuración segura

Las variables opcionales son `PZ_IPAPI_KEY` y `PZ_PROXYCHECK_KEY`. Deben configurarse únicamente como secretos del servidor de PocketBase/Coolify. No deben añadirse al frontend, al repositorio, a capturas, logs ni metadatos. PocketBase las envía exclusivamente por HTTPS conforme al contrato de cada proveedor y nunca las persiste en caché o eventos. La consulta a proxycheck usa `tag=0` para no guardar la detección positiva en el historial de su panel.

Sin `PZ_IPAPI_KEY`, ipapi continúa en el nivel anónimo con el presupuesto reducido. Sin `PZ_PROXYCHECK_KEY`, simplemente se omite la segunda opinión. AbuseIPDB no está integrado en esta fase: su reputación comunitaria sirve para una política de abuso separada, pero no sustituye una confirmación específica de VPN.

## Cloudflare y origen real

Este cambio no modifica la resolución de la IP del visitante ni confía ciegamente en encabezados aportados por el cliente. La validación de `CF-Connecting-IP`, proxies confiables y topología Cloudflare/Coolify queda como una revisión separada de staging antes de aumentar la política a bloqueo.

`security.checkOrigin` debe permanecer activo. No se autoriza desactivarlo para resolver problemas de proxy, origen o CSRF.

## Flujo de validación en staging

1. Mantener `vpn_policy=monitor`.
2. Configurar claves gratuitas nuevas como `PZ_IPAPI_KEY` y `PZ_PROXYCHECK_KEY` solo en el servidor. Guardarlas no despliega el código: el backend debe reiniciarse o redesplegarse de forma autorizada para leer variables nuevas.
3. Confirmar que el cron de Tor termina con estado `valid`, tiene al menos 100 entradas y no expone IP de visitantes en logs.
4. Repetir Proton, Thunder VPN, Opera VPN y Secure VPN en Estados Unidos; registrar hora, IP pública de prueba y proveedor que confirmó el resultado sin publicar la IP completa.
5. Esperar al menos una ventana de caché o limpiar únicamente la entrada de prueba de forma controlada antes de repetir la misma IP.
6. Verificar que Proton y cualquier coincidencia explícita se muestren como VPN/proxy/Tor; las señales de datacenter/abuso deben mostrarse como “Red sospechosa sin confirmar VPN”.
7. Confirmar que ninguna señal `network_suspected`, indisponibilidad o agotamiento de cuota bloquea navegación, pedidos, reseñas o rifas.
8. Validar por separado que la IP recibida por PocketBase es la IP real reenviada por la cadena Cloudflare/Coolify y no la del proxy.
9. Revisar falsos positivos con tráfico legítimo móvil, residencial, corporativo y bots conocidos antes de considerar `block`.

La prueba de staging no completa BLOCKS03B ni S7P3; ambos permanecen en revisión hasta sus validaciones integrales independientes.

## Referencias

- ipapi.is, documentación y límites: https://ipapi.is/developers.html
- proxycheck.io, API v3 y límites: https://proxycheck.io/api/
- proxycheck.io, plan gratuito: https://proxycheck.io/pricing/
- Tor Project, protocolo Onionoo: https://metrics.torproject.org/onionoo.html
