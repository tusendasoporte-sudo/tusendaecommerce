# Identidad visual PowerZona

> Trabajo de identidad de PZ-APP-C01. La aprobación visual del propietario es obligatoria antes de cerrar C01 y antes de producir los recursos Android finales en C07.

## Identidad aprobada

- Nombre visible: `PowerZona`.
- `applicationId`: `com.tusenda84.powerzona`.
- Disponibilidad: producto white-label exclusivo para tiendas con plan Premium.
- Dirección visual: P/Z inclinada y legible, rayo central, movimiento orbital, azul zafiro, platino y blanco perlado.
- Maestro v3 aprobado por el propietario: `powerzona-icon-premium-v3.png`.

## Historial de propuestas

El propietario rechazó la v1 y las opciones v2 A/B. Se conservan para trazabilidad, pero **no deben usarse ni derivarse en C07**:

- `powerzona-icon-master-v1.png`.
- `powerzona-splash-master-v1.png`.
- `powerzona-palette.svg`.
- `powerzona-icon-premium-v2a.png`.
- `powerzona-icon-premium-v2b.png`.

La paleta Midnight/Cyan/Amber de v1 también queda rechazada y no es la paleta oficial de PowerZona.

## Familia v3

| Recurso | Dimensiones | SHA-256 | Estado |
|---|---:|---|---|
| `powerzona-icon-premium-v3.png` | 1254 × 1254 | `C13F17866B372B8B049A04CCB14496867A7FA3B36E7021CB3AEC041032927D46` | **Aprobado** |
| `powerzona-icon-symbol-v3.png` | 1254 × 1254 | `E284D6746DF6E11F22C344EAC4A117855C61CF8E737A51DB3CEC1D7415C8DADB` | **Aprobado** |
| `powerzona-splash-premium-v3.png` | 941 × 1672 | `6934893EF19C110E30FACC2EF87EB1A91A26D4B0346CD190F90EA02F3F007BDF` | **Aprobado** |
| `powerzona-palette-v3.svg` | 1200 × 720 | `41CFF31EB31C2C5338EA87967D1F61C4749A56CD55E78116F184F745FE8D5656` | **Aprobado** |

El icono de símbolo elimina el wordmark para mejorar la lectura a tamaños pequeños. C07 generará desde el maestro aprobado los foreground/background adaptativos, densidades Android y variantes de splash por versión; no copiará ciegamente un único bitmap para todas las densidades.

## Paleta v3 propuesta

| Token | Hex | Uso principal |
|---|---|---|
| Zafiro profundo | `#071F63` | Marca oscura, encabezados y contraste |
| Cobalto energía | `#155EEB` | Color primario, CTA y foco |
| Azul destello | `#4A8DFF` | Reflejos y estados activos |
| Platino | `#C7D0DE` | Bordes, detalles y superficies neutras |
| Hielo luminoso | `#E9F1FF` | Fondos secundarios y halos sutiles |
| Blanco perla | `#FFFFFF` | Fondo principal y espacio visual |
| Tinta | `#081735` | Texto principal sobre fondos claros |
| Texto secundario | `#465574` | Texto auxiliar y estados neutros |
| Fondo base | `#F8FAFF` | Superficie general de la app |

Los acabados metálicos y reflejos de los maestros son una representación de marca. La interfaz debe usar estos tokens planos, con contraste accesible, y reservar los degradados para recursos gráficos controlados.

## Reglas de uso

1. Las letras `P` y `Z` deben reconocerse inmediatamente y conservar inclinación dinámica.
2. El rayo central comunica energía sin dominar ni romper la lectura.
3. En el launcher se usa el símbolo sin wordmark; en el splash se usa `PowerZona`, sin espacio.
4. El nombre se escribe `PowerZona`; el lockup en mayúsculas puede mostrarse como `POWERZONA`, siempre sin espacio.
5. Evitar estética gamer barata, neón, volumen excesivo, llamas, corona, escudo, carrito, bolsa o moneda.
6. No añadir “Tu Senda 84” al icono o splash de la app pública.
7. Android aplicará la máscara del launcher; C07 mantendrá el contenido dentro de la zona segura adaptativa.

## Generación de derivados

Modo utilizado: herramienta integrada `image_gen`, caso `logo-brand`, usando `powerzona-icon-premium-v3.png` como ancla visual aprobada.

### Símbolo launcher

Conservar P/Z, esmalte zafiro, bordes platino, rayo blanco y órbita de v3; eliminar solo el wordmark y el pequeño subrayado, recentrar el símbolo y respetar una zona segura amplia. Sin texto, nuevos elementos ni rediseño de las letras.

### Splash

Crear una composición vertical 9:16 con fondo blanco perlado/hielo, halo zafiro muy sutil, símbolo v3 centrado y el texto exacto `PowerZona` una sola vez. Sin lema, indicador de carga, productos, texto adicional ni marca de agua.

### Paleta

La paleta fue creada de forma determinista como SVG, no mediante generación, para conservar exactamente los valores hexadecimales documentados.

## Aprobación manual

El 2026-08-11 el propietario aprobó primero el maestro premium v3 y después confirmó explícitamente `derivados v3 aprobados`. Por tanto, el maestro, símbolo launcher, splash y paleta v3 quedan aprobados para que C07 produzca los recursos Android finales sin rediseñar la identidad.
