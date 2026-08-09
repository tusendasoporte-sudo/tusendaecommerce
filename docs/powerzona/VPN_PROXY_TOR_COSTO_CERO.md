# PowerZona: piloto VPN, proxy y Tor de costo cero

## Alcance

Este cambio amplía exclusivamente el piloto de PowerZona. No modifica R84 ni cambia el estado de BLOCKS03B o S7P3.

El objetivo es reducir falsos negativos con una política estricta adaptada al mercado de PowerZona. Los modos se conservan:

- `off`: no consulta ni registra inteligencia de red.
- `monitor`: detecta y registra, pero nunca bloquea por esta política.
- `block`: con Seguridad en modo `protection`, bloquea VPN/proxy/Tor confirmado, consenso de hosting/datacenter o una IP que alcance el umbral de abuso.
- `network_suspected`: registra una señal aislada o insuficiente. Solo el consenso de ipapi datacenter + proxycheck hosting se convierte en `hosting_blocked`.
- `abusive_ip_detected` / `abusive_ip_blocked`: separan una IP con reputación dañina de una detección específica de VPN.

La detección de VPN comercial sigue siendo probabilística. Una IP no detectada no demuestra que la conexión sea residencial, y una IP de datacenter no demuestra por sí sola el uso de VPN.

## Fuentes y presupuesto

1. Tor se consulta primero contra una copia local de la lista oficial de nodos de salida publicada por Onionoo. Se actualiza una vez al día; una descarga inválida no reemplaza el último lote válido. El lote deja de producir coincidencias positivas si supera 72 horas de antigüedad.
2. Para las IP no resueltas como Tor se consulta `https://api.ipapi.is` desde PocketBase.
3. Si ipapi no confirma VPN, proxy o Tor y existe `PZ_PROXYCHECK_KEY`, se consulta la API estable v3 de `https://proxycheck.io` como segunda opinión. Una marca explícita de VPN, proxy o Tor solo se confirma si la confianza es al menos 90.
4. Si la IP todavía no está confirmada, no es crawler ni red móvil identificada y existe `PZ_ABUSEIPDB_KEY`, se consulta `https://api.abuseipdb.com/api/v2/check` con una ventana de 30 días y sin `verbose`. Un `abuseConfidenceScore` de 25 o más, acompañado por al menos un reporte reciente, es candidato de bloqueo en la política estricta elegida para PowerZona.
5. El consenso de ipapi `is_datacenter=true` y proxycheck hosting bloquea en modo `block`, salvo rastreadores o redes móviles identificadas. Una sola señal de hosting permanece como sospecha.
6. Las respuestas combinadas se guardan 24 horas en caché privada. La versión del clasificador invalida de forma segura entradas antiguas al cambiar estas reglas. Los errores totales o el presupuesto agotado se guardan 5 minutos para evitar reintentos agresivos.

La caché se comparte por tienda e IP protegida para no repetir consultas. Los eventos de observación se deduplican además por navegador protegido: dos navegadores que visiten desde la misma IP reciben el mismo estado de red, pero cada uno conserva su propia relación verificable en Visitantes. Repetir páginas desde el mismo navegador no genera eventos adicionales.

Presupuestos internos por día UTC:

- sin clave: 90 consultas, debajo del límite anónimo oficial de 100;
- con cuenta gratuita: 900 consultas, debajo del límite oficial de 1.000.

Proxycheck solo se usa con cuenta y clave configurada; no se consumen sus consultas anónimas. Su presupuesto interno es de 300 consultas diarias, debajo de las 1.000 incluidas en el plan gratuito. Si proxycheck falla o agota ese presupuesto pero ipapi produjo una respuesta válida, se conserva el resultado de ipapi y no se genera un bloqueo por indisponibilidad de la segunda opinión.

AbuseIPDB solo se usa con cuenta y clave configurada. Su presupuesto interno es de 800 comprobaciones diarias, debajo de las 1.000 incluidas en la cuenta gratuita. No se consultan comentarios ni datos de reportantes, no se envían reportes y una VPN ya confirmada omite esta tercera consulta para ahorrar cuota.

Al alcanzar el presupuesto, o si su contador privado no está disponible, el sistema falla abierto: no bloquea, registra `vpn_check_unavailable` cuando corresponde y no insiste contra el proveedor. Estos presupuestos reducen el riesgo de costo, pero no constituyen una garantía contractual frente a cambios futuros del proveedor.

## Configuración segura

Las variables opcionales son `PZ_IPAPI_KEY`, `PZ_PROXYCHECK_KEY` y `PZ_ABUSEIPDB_KEY`. Deben configurarse únicamente como secretos del servidor de PocketBase/Coolify. No deben añadirse al frontend, al repositorio, a capturas, logs ni metadatos. PocketBase las envía exclusivamente por HTTPS conforme al contrato de cada proveedor y nunca las persiste en caché o eventos. La consulta a proxycheck usa `tag=0` para no guardar la detección positiva en el historial de su panel; la clave de AbuseIPDB se envía en el encabezado `Key`, nunca en la URL.

Sin `PZ_IPAPI_KEY`, ipapi continúa en el nivel anónimo con el presupuesto reducido. Sin `PZ_PROXYCHECK_KEY`, se omite la segunda opinión y no existe consenso estricto de hosting. Sin `PZ_ABUSEIPDB_KEY`, se omite la señal comunitaria y nunca se bloquea por cuota agotada o indisponibilidad del proveedor.

## Cloudflare y origen real

Este cambio no modifica la resolución de la IP del visitante ni confía ciegamente en encabezados aportados por el cliente. La validación de `CF-Connecting-IP`, proxies confiables y topología Cloudflare/Coolify queda como una revisión separada de staging antes de aumentar la política a bloqueo.

`security.checkOrigin` debe permanecer activo. No se autoriza desactivarlo para resolver problemas de proxy, origen o CSRF.

El estado principal y los detalles de seguridad de un visitante corresponden a su IP más reciente. Las IP anteriores bloqueadas o sospechosas permanecen visibles en `Red conocida`, las páginas navegadas y el historial completo, pero no contaminan el estado de una IP actual normal. Un bloqueo manual activo del cliente, dispositivo o IP conserva prioridad sobre esta regla.

## Flujo de validación en staging

1. Comenzar con `vpn_policy=monitor` y revisar etiquetas y metadatos; activar `block` solo mediante una acción autorizada posterior.
2. Configurar claves gratuitas nuevas como `PZ_IPAPI_KEY`, `PZ_PROXYCHECK_KEY` y `PZ_ABUSEIPDB_KEY` solo en el servidor. Guardarlas no despliega el código: el backend debe reiniciarse o redesplegarse de forma autorizada para leer variables nuevas.
3. Confirmar que el cron de Tor termina con estado `valid`, tiene al menos 100 entradas y no expone IP de visitantes en logs.
4. Repetir Proton, Thunder VPN, Opera VPN y Secure VPN en Estados Unidos; registrar hora, IP pública de prueba y proveedor que confirmó el resultado sin publicar la IP completa.
5. Esperar al menos una ventana de caché o limpiar únicamente la entrada de prueba de forma controlada antes de repetir la misma IP.
6. Verificar que Proton y cualquier coincidencia explícita se muestren como VPN/proxy/Tor; el consenso hosting/datacenter debe mostrarse por separado y AbuseIPDB debe mostrar puntuación, reportes y fecha sin comentarios.
7. En `monitor`, confirmar que ninguna señal bloquea. En `block`, confirmar que VPN/proxy/Tor, consenso hosting/datacenter y abuso desde 25 bloquean; crawlers, redes móviles identificadas, una señal aislada, indisponibilidad o cuota agotada deben fallar abierto.
8. Validar por separado que la IP recibida por PocketBase es la IP real reenviada por la cadena Cloudflare/Coolify y no la del proxy.
9. Revisar falsos positivos con tráfico legítimo móvil, residencial, corporativo y bots conocidos antes de considerar `block`.

La prueba de staging no completa BLOCKS03B ni S7P3; ambos permanecen en revisión hasta sus validaciones integrales independientes.

## Referencias

- ipapi.is, documentación y límites: https://ipapi.is/developers.html
- proxycheck.io, API v3 y límites: https://proxycheck.io/api/
- proxycheck.io, plan gratuito: https://proxycheck.io/pricing/
- AbuseIPDB, API v2: https://docs.abuseipdb.com/
- AbuseIPDB, plan gratuito: https://www.abuseipdb.com/pricing
- Tor Project, protocolo Onionoo: https://metrics.torproject.org/onionoo.html
