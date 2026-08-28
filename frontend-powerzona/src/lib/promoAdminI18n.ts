import './promoDestructiveActions.ts';

export const PROMO_ADMIN_LOCALE_COOKIE = 'pz_promo_admin_locale';
export const PROMO_ADMIN_LOCALES = Object.freeze(['es', 'en'] as const);

export type PromoAdminLocale = (typeof PROMO_ADMIN_LOCALES)[number];

const ENGLISH_COPY: Readonly<Record<string, string>> = Object.freeze({
  'Activo': 'Active',
  'Pausado': 'Paused',
  'Configuración': 'Setup',
  'No disponible': 'Unavailable',
  'Tienda Promo': 'Promo Store',
  'Resumen Promo': 'Promo Overview',
  'Resumen': 'Overview',
  'Sitio': 'Site',
  'Audiencia y salida': 'Audience and delivery',
  'Contenido': 'Content',
  'Organización': 'Organization',
  'Galería y productos': 'Gallery and products',
  'Portada y galerías': 'Cover and galleries',
  'Galería': 'Gallery',
  'Apariencia': 'Appearance',
  'Idiomas': 'Languages',
  'Contacto': 'Contact',
  'Reseñas': 'Reviews',
  'Analíticas': 'Analytics',
  'Identidad, slogan, servicios vinculados y pie del sitio.': 'Identity, slogan, linked services, and site footer.',
  'Identidad, estructura, servicios y pie del sitio.': 'Identity, structure, services, and site footer.',
  'La foto, las ofertas y los productos de este servicio se administran en «Galería y productos».': 'The photo, offers, and products for this service are managed in “Gallery and products”.',
  'Icono del servicio': 'Service icon',
  'Sin icono': 'No icon',
  'Alfombra': 'Carpet',
  'Pisos': 'Flooring',
  'Escaleras': 'Stairs',
  'Acabados': 'Finishing',
  'Tapicería': 'Upholstery',
  'Limpieza': 'Cleaning',
  'Instalación': 'Installation',
  'Comercial': 'Commercial',
  'Elige un icono lineal aprobado. No consume la cuota de fotos.': 'Choose an approved line icon. It does not use the photo quota.',
  'Organiza la identidad, los textos, los servicios y el pie del sitio.': 'Organize identity, copy, services, and the site footer.',
  'Portada visual, fotos de servicios, ofertas, productos y trabajos.': 'Visual cover, service photos, offers, products, and projects.',
  'Carrusel, galerías por categoría, trabajos y recursos audiovisuales.': 'Carousel, category galleries, projects, and audiovisual resources.',
  'Tema aprobado y personalización visual permitida.': 'Approved theme and allowed visual customization.',
  'Locales habilitados, traducciones y completitud.': 'Enabled locales, translations, and completion.',
  'Método principal y canales de contacto permitidos.': 'Primary method and allowed contact channels.',
  'Presentación y moderación de reseñas de la tienda.': 'Store review presentation and moderation.',
  'Visitas e interacciones agregadas sin datos personales.': 'Aggregated visits and interactions without personal data.',
  'Organiza el trabajo de tu presencia promocional desde módulos separados y autorizados.': 'Manage your promotional presence through separate, authorized modules.',
  'Modo soporte Master': 'Master support mode',
  'Las acciones permitidas conservan auditoría y contexto explícito de tienda.': 'Allowed actions retain auditing and explicit store context.',
  'Volver al control Master': 'Return to Master control',
  'Ver mi página': 'View my page',
  'Contactar a Tu Senda 84': 'Contact Tu Senda 84',
  '¿Necesitas ayuda con tu página?': 'Need help with your page?',
  'Escribir por WhatsApp': 'Write on WhatsApp',
  'WhatsApp no configurado': 'WhatsApp not configured',
  'Cerrar sesión': 'Sign out',
  'Módulos disponibles': 'Available modules',
  'La lista responde a capacidades y permisos efectivos.': 'The list reflects effective capabilities and permissions.',
  'Estado del sitio': 'Site status',
  'Nivel de acceso': 'Access level',
  'Administrador principal': 'Primary administrator',
  'Acceso granular': 'Granular access',
  'Tus módulos Promo': 'Your Promo modules',
  'Solo aparecen las áreas habilitadas por el backend para esta sesión.': 'Only areas enabled by the backend for this session are shown.',
  'Abrir módulo': 'Open module',
  'No hay módulos operativos disponibles.': 'No operational modules are available.',
  'El acceso de lectura está activo, pero esta sesión no tiene otras acciones efectivas.': 'Read access is active, but this session has no other effective actions.',
  'Acceso validado': 'Access validated',
  'La autorización efectiva de cada cambio continúa validándose en el backend.': 'The backend continues to validate effective authorization for every change.',
  'Página pública en vivo': 'Live public page',
  'Acceso de solo lectura': 'Read-only access',
  'No se pudo continuar': 'Unable to continue',
  'Recargar página': 'Reload page',
  'Actualizar': 'Refresh',
  'Guardar cambios': 'Save changes',
  'Guardar y actualizar página': 'Save and update page',
  'Sin cambios pendientes': 'No pending changes',
  'Cambios sin guardar': 'Unsaved changes',
  'Cargando la página segura…': 'Loading the secure page…',
  'Cargando…': 'Loading…',
  'Guardando…': 'Saving…',
  'Página pública actualizada correctamente.': 'Public page updated successfully.',
  'No había cambios nuevos para guardar.': 'There were no new changes to save.',
  'Editor de contenido': 'Content editor',
  'Organización del contenido': 'Content organization',
  'Introducción de portada': 'Cover introduction',
  'Título de portada': 'Cover title',
  'Resumen corto': 'Short summary',
  'Diseño de portada': 'Cover design',
  'Inmersiva': 'Immersive',
  'Dividida': 'Split',
  'Centrada': 'Centered',
  'Editorial': 'Editorial',
  'Añadir especialidad': 'Add specialty',
  'Añadir botón': 'Add button',
  'Contacto principal': 'Primary contact',
  'Sección Contacto': 'Contact section',
  'Sección Servicios': 'Services section',
  'Texto del botón': 'Button text',
  'Especialidades de portada': 'Cover specialties',
  'Botones de portada': 'Cover buttons',
  'Las imágenes del carrusel se administran en «Galería y productos» y siempre aparecen detrás del texto en los diseños superpuestos.': 'Carousel images are managed in “Gallery and products” and always appear behind the text in overlay designs.',

  'Canales de contacto': 'Contact channels',
  'Organiza identidad, portada, servicios, propietario y pie del sitio. Guardar actualiza la página automáticamente.': 'Organize identity, cover, services, owner, and footer. Saving updates the page automatically.',
  'Configura el logo, canales, QR y el método principal. Guardar actualiza la página automáticamente.': 'Configure the logo, channels, QR, and primary method. Saving updates the page automatically.',
  'Identidad pública': 'Public identity',
  'Nombre y resumen del negocio en el idioma base. No modifica usuarios ni datos internos.': 'Business name and summary in the base language. It does not change users or internal data.',
  'Nombre público': 'Public name',
  'Slogan': 'Slogan',
  'Resumen del negocio': 'Business summary',
  'Máximo 140 caracteres.': 'Maximum 140 characters.',
  'Frase opcional bajo el nombre; máximo 120 caracteres.': 'Optional phrase below the name; maximum 120 characters.',
  'Texto plano, sin HTML, scripts ni URLs.': 'Plain text, without HTML, scripts, or URLs.',
  'Orden y contenido de secciones': 'Section order and content',
  'Usa los botones de orden para mantener una experiencia accesible también por teclado.': 'Use the ordering buttons to keep the experience keyboard accessible.',
  'Presentación de contacto': 'Contact presentation',
  'Controla la visibilidad y los textos que aparecen en la página pública.': 'Controls visibility and the text shown on the public page.',
  'Mostrar sección de contacto': 'Show contact section',
  'Puede permanecer oculta hasta que completes la información.': 'It can remain hidden until you complete the information.',
  'Etiqueta de navegación': 'Navigation label',
  'Título de la sección': 'Section title',
  'Resumen': 'Summary',
  'Logo del negocio': 'Business logo',
  'Se reutiliza en la cabecera pública y como imagen de vista previa al compartir por WhatsApp.': 'It is reused in the public header and as the preview image when sharing on WhatsApp.',
  'Sin logo': 'No logo',
  'Imagen del logo': 'Logo image',
  'Recomendado: imagen cuadrada de al menos 256×256. Se optimiza a WebP.': 'Recommended: a square image at least 256×256. It is optimized to WebP.',
  'Procesar logo': 'Process logo',
  'Quitar logo': 'Remove logo',
  'Código QR propio': 'Custom QR code',
  'Sube una imagen de QR; se convertirá a WebP 512×512 con fondo blanco y sin recorte.': 'Upload a QR image; it will be converted to 512×512 WebP on a white background without cropping.',
  'Sin QR': 'No QR',
  'Imagen del QR': 'QR image',
  'La carga queda asociada al guardar los cambios.': 'The upload is linked when changes are saved.',
  'Procesar QR': 'Process QR',
  'Quitar QR': 'Remove QR',
  'Métodos permitidos': 'Allowed methods',
  'WhatsApp y teléfono exigen E.164; correo exige una dirección válida. No se aceptan URLs.': 'WhatsApp and phone require E.164; email requires a valid address. URLs are not accepted.',
  'Añadir método': 'Add method',
  'Habilitar contacto en la página': 'Enable contact on the page',
  'Al habilitarlo debes elegir un método principal disponible.': 'When enabled, choose an available primary method.',
  'Al guardar, la página pública se actualiza automáticamente después de validar permisos, medios y contenido.': 'When saved, the public page updates automatically after permissions, media, and content are validated.',
  'Apariencia del sitio': 'Site appearance',
  'Elige una de las seis apariencias aprobadas. Guardar actualiza la página pública automáticamente.': 'Choose one of the six approved appearances. Saving updates the public page automatically.',
  'Temas aprobados': 'Approved themes',
  'La lista llega del catálogo privado del backend. Temas no aprobados, retirados o incompatibles no aparecen como opciones.': 'The list comes from the private backend catalog. Unapproved, retired, or incompatible themes are not shown.',
  'Personalización avanzada': 'Advanced customization',
  'Opcional: ajusta únicamente los valores visuales permitidos por el tema.': 'Optional: adjust only the visual values allowed by the theme.',
  'Restaurar defaults': 'Restore defaults',
  'Vista previa visual': 'Visual preview',
  'Vista de referencia del tema y sus ajustes visuales antes de guardar.': 'Reference preview of the theme and its visual settings before saving.',
  'Guardar apariencia': 'Save appearance',
  'Idiomas y traducciones': 'Languages and translations',
  'Administra los idiomas visibles y sus traducciones. Al guardar, los cambios válidos se reflejan automáticamente en la página.': 'Manage visible languages and their translations. Valid saved changes automatically appear on the page.',
  'Idiomas habilitados': 'Enabled languages',
  'Solo se ofrecen catálogos generales completos y aprobados por el backend.': 'Only complete general catalogs approved by the backend are offered.',
  'Añadir': 'Add',
  'Estado de idiomas visibles': 'Visible language status',
  'La referencia del idioma base nunca cuenta como traducción. Antes de guardar se valida cada idioma que verá el público.': 'The base-language reference never counts as a translation. Every public language is validated before saving.',
  'Cargando la página y sus idiomas…': 'Loading the page and its languages…',
  'Crea galerías como categorías, agrega varios medios por trabajo y marca los que aparecerán como destacados.': 'Create galleries as categories, add multiple media items per project, and mark featured work.',
  'Composición en modo lectura.': 'Read-only composition.',
  'Tu sesión puede consultar el contenido, pero no actualizar la página pública.': 'Your session can view content but cannot update the public page.',
  'Medios usados en galerías': 'Media used in galleries',
  'Contenido visual': 'Visual content',
  'Administra el carrusel, la foto del propietario, cada servicio, sus productos y los trabajos realizados.': 'Manage the carousel, owner photo, each service, its products, and completed projects.',
  'Nuevo producto': 'New product',
  'Completa la información y guarda para añadirlo al servicio.': 'Complete the information and save to add it to the service.',
  '← Volver a Galería y productos': '← Back to Gallery and products',
  'El producto todavía no se ha guardado.': 'The product has not been saved yet.',
  'Cancelar nuevo producto': 'Cancel new product',
  'Añade una foto para activar Visible.': 'Add a photo to enable Visible.',
  'Cargando el nuevo producto…': 'Loading the new product…',
  'Producto nuevo preparado. Guardar lo añadirá al servicio.': 'New product ready. Saving will add it to the service.',
  'Cambios pendientes · guardado explícito': 'Pending changes · explicit save',
  'Imágenes almacenadas': 'Stored images',
  'Uso y límites de imágenes': 'Image usage and limits',
  'Uso y límites de medios': 'Media usage and limits',
  'Contenido visual en modo lectura.': 'Visual content is read-only.',
  'La sesión puede consultar, pero no actualizar estos medios.': 'This session can view but cannot update this media.',
  'Cargando contenido y medios…': 'Loading content and media…',
  'Imagen principal o carrusel': 'Main image or carousel',
  'Agregar imágenes': 'Add images',
  'Propietario': 'Owner',
  'Foto del dueño del negocio': 'Business owner photo',
  'Esta foto acompaña la presentación del propietario en la página pública.': 'This photo accompanies the owner introduction on the public page.',
  'Aún no hay foto del propietario.': 'There is no owner photo yet.',
  'Cambiar foto': 'Change photo',
  'Agregar foto': 'Add photo',
  'Trabajos realizados': 'Completed projects',
  'Portafolio': 'Portfolio',
  'Publica fotos del resultado mientras realizas un trabajo. Cada trabajo admite hasta 3 fotos.': 'Publish result photos from completed work. Each project accepts up to 3 photos.',
  'Trabajos': 'Projects',
  '+ Añadir trabajo': '+ Add project',
  'Todavía no hay trabajos realizados.': 'There are no completed projects yet.',
  'Título del trabajo': 'Project title',
  'Descripción': 'Description',
  'Nota opcional': 'Optional note',
  'Las fotos del proceso o resultado se administran en «Galería y productos». Cada trabajo admite hasta 3 fotos.': 'Process or result photos are managed in “Gallery and products”. Each project accepts up to 3 photos.',
  'Puede incluir hasta 3 fotos. Los destacados se administran en la sección independiente.': 'It can include up to 3 photos. Featured items are managed in the separate section.',
  'Eliminar trabajo': 'Delete project',
  'Foto de portada del servicio': 'Service cover photo',
  'Aún no hay foto de portada.': 'There is no cover photo yet.',
  '+ Añadir producto': '+ Add product',
  'Este servicio todavía no tiene productos o trabajos.': 'This service does not have products or projects yet.',
  'Nombre del producto o trabajo': 'Product or project name',
  'Añade al menos una foto para mostrar este producto.': 'Add at least one photo to display this product.',
  'El botón «Cotizar» se añade automáticamente con el contacto principal.': 'The “Get a quote” button is added automatically using the primary contact.',
  'Eliminar producto': 'Delete product',
  'Primero crea y guarda un servicio en la sección superior de Contenido.': 'First create and save a service in the Content section above.',
  'Aún no hay medios en la portada.': 'There is no cover media yet.',
  'Contenido visual cargado. Los cambios se aplicarán al guardar.': 'Visual content loaded. Changes will apply when saved.',
  'Contenido visual actualizado.': 'Visual content updated.',
  'No se pudo preparar el guardado. Intenta nuevamente.': 'The save could not be prepared. Try again.',
  'No se guardaron cambios en la página pública. Las imágenes continúan pendientes para reintentar.': 'No changes were saved to the public page. The images remain pending so you can try again.',
  'Optimizando medios y validando el guardado seguro…': 'Optimizing media and validating the secure save…',
  'No se pudo cargar el contenido visual.': 'Visual content could not be loaded.',
  'Almacenamiento': 'Storage',
  'Portada': 'Cover',
  'Carrusel principal': 'Main carousel',
  'Un medio muestra una portada fija; dos o más activan el carrusel accesible.': 'One media item shows a fixed cover; two or more enable the accessible carousel.',
  'Medios disponibles': 'Available media',
  'Las imágenes se optimizan a WebP y el backend vuelve a validar tipo, tamaño y tenant.': 'Images are optimized to WebP and the backend revalidates type, size, and tenant.',
  'Procesar y subir': 'Process and upload',
  'Reseñas de tienda': 'Store reviews',
  'Presentación pública y moderación': 'Public presentation and moderation',
  'Solo se gestionan reseñas generales de esta tienda. Productos y pedidos permanecen fuera de Promo.': 'Only general reviews for this store are managed. Products and orders remain outside Promo.',
  'Sección de reseñas': 'Reviews section',
  'Al guardar, la sección y su título se actualizan automáticamente en la página pública.': 'When saved, the section and its title update automatically on the public page.',
  'Mostrar reseñas aprobadas': 'Show approved reviews',
  'Título en el idioma principal': 'Title in the primary language',
  'Después de un trabajo': 'After a job',
  'Solicitar una reseña': 'Request a review',
  'Enlace privado · hasta 3 fotos': 'Private link · up to 3 photos',
  'Crea un enlace de un solo uso. El cliente verá las fotos en privado y decidirá si autoriza mostrarlas junto a la reseña.': 'Create a one-time link. The customer sees the photos privately and decides whether to allow them with the review.',
  'Idioma del cliente': 'Customer language',
  'Nombre o referencia del cliente (opcional)': 'Customer name or reference (optional)',
  'Descripción privada del trabajo (opcional)': 'Private job description (optional)',
  'Vigencia': 'Validity',
  'Fotos del trabajo (opcional)': 'Job photos (optional)',
  'Elegir imagen': 'Choose image',
  'Cambiar imagen': 'Replace image',
  'Arrastra una imagen aquí': 'Drag an image here',
  'o selecciónala desde tu dispositivo': 'or choose it from your device',
  'Disponible': 'Available',
  'Pendiente': 'Pending',
  'Guardada': 'Saved',
  'Lista para guardar.': 'Ready to save.',
  'Optimizando localmente…': 'Optimizing locally…',
  'Generar enlace privado': 'Generate private link',
  'Enlace creado': 'Link created',
  'Copiar enlace': 'Copy link',
  'Compartir': 'Share',
  'WhatsApp abrirá el mensaje con el enlace. Las fotos solo se adjuntan con el menú Compartir cuando el dispositivo lo permite.': 'WhatsApp opens the message with the link. Photos are attached only through Share when the device supports it.',
  'Datos operativos': 'Operational data',
  'Moderación': 'Moderation',
  'Estado': 'Status',
  'Todas': 'All',
  'Pendientes': 'Pending',
  'Aprobadas': 'Approved',
  'Ocultas': 'Hidden',
  'Rechazadas': 'Rejected',
  'Anterior': 'Previous',
  'Siguiente': 'Next',
});

export function normalizePromoAdminLocale(value: unknown): PromoAdminLocale {
  return String(value || '').trim().toLowerCase() === 'en' ? 'en' : 'es';
}

export function promoAdminText(locale: PromoAdminLocale, value: unknown) {
  const text = String(value ?? '');
  if (locale !== 'en') return text;
  const exact = ENGLISH_COPY[text];
  if (exact) return exact;
  const patterns: readonly [RegExp, (...groups: string[]) => string][] = [
    [/^Estado: (.+)$/, (status) => `Status: ${promoAdminText('en', status)}`],
    [/^Idioma base: (.+)$/, (language) => `Base language: ${language}`],
    [/^Versión(?: de página)?: (.+)$/, (version) => `Page version: ${version}`],
    [/^Idiomas: (.+)$/, (count) => `Languages: ${count}`],
    [/^Tema actual: (.+)$/, (theme) => `Current theme: ${theme}`],
    [/^(\d+) de (\d+)$/, (current, total) => `${current} of ${total}`],
    [/^(\d+) días$/, (days) => `${days} days`],
    [/^Abrir (.+)$/, (label) => `Open ${promoAdminText('en', label)}`],
    [/^Especialidades \(máximo (\d+)\)$/, (maximum) => `Specialties (maximum ${maximum})`],
    [/^Botones \(máximo (\d+)\)$/, (maximum) => `Buttons (maximum ${maximum})`],
    [/^Trabajos realizados \((\d+)\)$/, (count) => `Completed projects (${count})`],
    [/^Productos o trabajos \((\d+)\)$/, (count) => `Products or projects (${count})`],
    [/^Servicio (\d+)$/, (number) => `Service ${number}`],
    [/^Producto (\d+)$/, (number) => `Product ${number}`],
    [/^Trabajo (\d+)$/, (number) => `Project ${number}`],
    [/^de (\d+)$/, (total) => `of ${total}`],
  ];
  for (const [pattern, render] of patterns) {
    const match = text.match(pattern);
    if (match) return render(...match.slice(1));
  }
  return text;
}

function translateTextNode(node: Text, locale: PromoAdminLocale) {
  const value = node.nodeValue || '';
  const trimmed = value.trim();
  if (!trimmed) return;
  const translated = promoAdminText(locale, trimmed);
  if (translated === trimmed) return;
  const start = value.slice(0, value.indexOf(trimmed));
  const end = value.slice(value.indexOf(trimmed) + trimmed.length);
  node.nodeValue = `${start}${translated}${end}`;
}

export function translatePromoAdminTree(root: ParentNode, locale: PromoAdminLocale) {
  if (locale !== 'en' || typeof document === 'undefined') return;
  const owner = root instanceof Document ? root : root.ownerDocument;
  if (!owner) return;
  const walker = owner.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !parent.closest('script, style, pre, code, [contenteditable="true"], [data-promo-admin-no-translate]')) {
      translateTextNode(node as Text, locale);
    }
    node = walker.nextNode();
  }
  const attributes = ['aria-label', 'title', 'placeholder'] as const;
  const elements = root instanceof Element ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
  elements.forEach((element) => attributes.forEach((attribute) => {
    const value = element.getAttribute(attribute);
    if (!value) return;
    const translated = promoAdminText(locale, value);
    if (translated !== value) element.setAttribute(attribute, translated);
  }));
}

export function observePromoAdminTranslations(root: HTMLElement, locale: PromoAdminLocale) {
  translatePromoAdminTree(root, locale);
  if (locale !== 'en' || typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver((mutations) => mutations.forEach((mutation) => {
    if (mutation.type === 'characterData' && mutation.target instanceof Text) {
      translateTextNode(mutation.target, locale);
      return;
    }
    mutation.addedNodes.forEach((node) => {
      if (node instanceof Text) translateTextNode(node, locale);
      else if (node instanceof HTMLElement) translatePromoAdminTree(node, locale);
    });
  }));
  observer.observe(root, { childList: true, characterData: true, subtree: true });
  return () => observer.disconnect();
}
