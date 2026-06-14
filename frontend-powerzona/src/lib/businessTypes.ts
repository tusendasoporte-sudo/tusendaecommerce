export type BusinessTypeOption = {
  slug: string;
  label: string;
};

export type BusinessTypeGroup = {
  category: string;
  options: BusinessTypeOption[];
};

export const BUSINESS_TYPE_GROUPS: BusinessTypeGroup[] = [
  {
    category: 'Alimentos y bebidas',
    options: [
      { slug: 'cafeteria', label: 'Cafeter\u00eda' },
      { slug: 'restaurante', label: 'Restaurante' },
      { slug: 'comida-rapida', label: 'Comida r\u00e1pida' },
      { slug: 'dulceria-reposteria', label: 'Dulcer\u00eda / reposter\u00eda' },
      { slug: 'panaderia', label: 'Panader\u00eda' },
      { slug: 'heladeria', label: 'Helader\u00eda' },
      { slug: 'pizzeria', label: 'Pizzer\u00eda' },
      { slug: 'bebidas', label: 'Bebidas' },
      { slug: 'alimentos-preparados', label: 'Alimentos preparados' },
      { slug: 'mercado-viveres', label: 'Mercado / v\u00edveres' },
      { slug: 'carniceria', label: 'Carnicer\u00eda' },
      { slug: 'pescaderia', label: 'Pescader\u00eda' },
      { slug: 'frutas-vegetales', label: 'Frutas y vegetales' },
    ],
  },
  {
    category: 'Moda y accesorios',
    options: [
      { slug: 'ropa', label: 'Ropa' },
      { slug: 'calzado', label: 'Calzado' },
      { slug: 'bolsos-carteras', label: 'Bolsos y carteras' },
      { slug: 'relojes', label: 'Relojes' },
      { slug: 'joyeria-bisuteria', label: 'Joyer\u00eda / bisuter\u00eda' },
      { slug: 'accesorios-moda', label: 'Accesorios de moda' },
      { slug: 'ropa-deportiva', label: 'Ropa deportiva' },
      { slug: 'ropa-infantil', label: 'Ropa infantil' },
      { slug: 'uniformes', label: 'Uniformes' },
    ],
  },
  {
    category: 'Belleza y cuidado personal',
    options: [
      { slug: 'peluqueria', label: 'Peluquer\u00eda' },
      { slug: 'barberia', label: 'Barber\u00eda' },
      { slug: 'unas', label: 'U\u00f1as' },
      { slug: 'maquillaje', label: 'Maquillaje' },
      { slug: 'perfumeria', label: 'Perfumer\u00eda' },
      { slug: 'cosmeticos', label: 'Cosm\u00e9ticos' },
      { slug: 'cuidado-piel', label: 'Cuidado de la piel' },
      { slug: 'spa-estetica', label: 'Spa / est\u00e9tica' },
      { slug: 'productos-higiene', label: 'Productos de higiene' },
    ],
  },
  {
    category: 'Salud, fitness y bienestar',
    options: [
      { slug: 'suplementos-deportivos', label: 'Suplementos deportivos' },
      { slug: 'gimnasio-fitness', label: 'Gimnasio / fitness' },
      { slug: 'nutricion', label: 'Nutrici\u00f3n' },
      { slug: 'farmacia-productos-salud', label: 'Farmacia / productos de salud' },
      { slug: 'medicina-natural', label: 'Medicina natural' },
      { slug: 'terapias', label: 'Terapias' },
      { slug: 'equipos-medicos', label: 'Equipos m\u00e9dicos' },
      { slug: 'optica', label: '\u00d3ptica' },
    ],
  },
  {
    category: 'Tecnolog\u00eda',
    options: [
      { slug: 'celulares', label: 'Celulares' },
      { slug: 'accesorios-celulares', label: 'Accesorios para celulares' },
      { slug: 'reparacion-celulares', label: 'Reparaci\u00f3n de celulares' },
      { slug: 'computadoras', label: 'Computadoras' },
      { slug: 'accesorios-computadora', label: 'Accesorios de computadora' },
      { slug: 'electronica', label: 'Electr\u00f3nica' },
      { slug: 'videojuegos', label: 'Videojuegos' },
      { slug: 'camaras-seguridad', label: 'C\u00e1maras / seguridad' },
      { slug: 'servicios-tecnicos', label: 'Servicios t\u00e9cnicos' },
    ],
  },
  {
    category: 'Hogar',
    options: [
      { slug: 'muebles', label: 'Muebles' },
      { slug: 'decoracion', label: 'Decoraci\u00f3n' },
      { slug: 'electrodomesticos', label: 'Electrodom\u00e9sticos' },
      { slug: 'articulos-hogar', label: 'Art\u00edculos del hogar' },
      { slug: 'limpieza', label: 'Limpieza' },
      { slug: 'cocina', label: 'Cocina' },
      { slug: 'colchones', label: 'Colchones' },
      { slug: 'jardineria', label: 'Jardiner\u00eda' },
    ],
  },
  {
    category: 'Ferreter\u00eda y construcci\u00f3n',
    options: [
      { slug: 'ferreteria', label: 'Ferreter\u00eda' },
      { slug: 'herramientas', label: 'Herramientas' },
      { slug: 'materiales-construccion', label: 'Materiales de construcci\u00f3n' },
      { slug: 'pinturas', label: 'Pinturas' },
      { slug: 'plomeria', label: 'Plomer\u00eda' },
      { slug: 'electricidad', label: 'Electricidad' },
      { slug: 'carpinteria', label: 'Carpinter\u00eda' },
      { slug: 'cerrajeria', label: 'Cerrajer\u00eda' },
    ],
  },
  {
    category: 'Autos, motos y transporte',
    options: [
      { slug: 'repuestos-auto', label: 'Repuestos de auto' },
      { slug: 'repuestos-moto', label: 'Repuestos de moto' },
      { slug: 'accesorios-autos', label: 'Accesorios para autos' },
      { slug: 'mecanica', label: 'Mec\u00e1nica' },
      { slug: 'lavado-autos', label: 'Lavado de autos' },
      { slug: 'transporte', label: 'Transporte' },
      { slug: 'mensajeria-delivery', label: 'Mensajer\u00eda / delivery' },
      { slug: 'alquiler-autos', label: 'Alquiler de autos' },
    ],
  },
  {
    category: 'Servicios',
    options: [
      { slug: 'servicios-profesionales', label: 'Servicios profesionales' },
      { slug: 'contabilidad', label: 'Contabilidad' },
      { slug: 'diseno-grafico', label: 'Dise\u00f1o gr\u00e1fico' },
      { slug: 'marketing', label: 'Marketing' },
      { slug: 'fotografia-video', label: 'Fotograf\u00eda / video' },
      { slug: 'reparaciones', label: 'Reparaciones' },
      { slug: 'clases-cursos', label: 'Clases / cursos' },
      { slug: 'eventos', label: 'Eventos' },
      { slug: 'decoracion-eventos', label: 'Decoraci\u00f3n de eventos' },
      { slug: 'impresion', label: 'Impresi\u00f3n' },
      { slug: 'publicidad', label: 'Publicidad' },
    ],
  },
  {
    category: 'Ni\u00f1os, mascotas y regalos',
    options: [
      { slug: 'bebes', label: 'Beb\u00e9s' },
      { slug: 'juguetes', label: 'Juguetes' },
      { slug: 'articulos-escolares', label: 'Art\u00edculos escolares' },
      { slug: 'mascotas', label: 'Mascotas' },
      { slug: 'alimentos-mascotas', label: 'Alimentos para mascotas' },
      { slug: 'regalos', label: 'Regalos' },
      { slug: 'floreria', label: 'Florer\u00eda' },
      { slug: 'detalles-personalizados', label: 'Detalles personalizados' },
    ],
  },
  {
    category: 'Otros',
    options: [
      { slug: 'tienda-mixta', label: 'Tienda mixta' },
      { slug: 'tienda-general', label: 'Tienda general' },
      { slug: 'negocio-online', label: 'Negocio online' },
      { slug: 'mayorista', label: 'Mayorista' },
      { slug: 'importaciones', label: 'Importaciones' },
      { slug: 'otro', label: 'Otro' },
    ],
  },
];
