import { getDriveClient } from '../services/google.js';
import { esAdmin, puedeVerPlaca, CONDUCTOR } from '../middlewares/validar-rol.js';

// ─────────────────────────────────────────────────────────────
// Archivos de Drive que la app muestra en el visor.
//
// Quién puede ver qué:
//  1. Solo archivos que estén DENTRO de las carpetas de la app (las CARPETA_PADRE_ID_* del .env).
//     Antes /api/drive/archivo/:id entregaba cualquier archivo de la cuenta de Google a quien
//     tuviera el id, sin sesión.
//  2. El administrador ve todo lo de la app.
//  3. Los demás, solo lo del registro que pueden ver: la carpeta de primer nivel lleva el nombre
//     del registro (placa o consecutivo) y con eso se busca el registro y se revisan sus permisos.
// ─────────────────────────────────────────────────────────────

const TIPO_CARPETA = 'application/vnd.google-apps.folder';
const MAX_NIVELES = 8;
const DURACION_CACHE = 10 * 60 * 1000;

// Los ids de Drive solo tienen letras, números, guion y guion bajo.
// Validarlo evita que alguien meta comillas y cambie la consulta `q` de Drive.
const esIdValido = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{10,}$/.test(id);

const esCarpeta = (mimeType) => mimeType === TIPO_CARPETA;

// Documentos nativos de Google (Docs, Sheets...) no se descargan con alt=media
const esDocumentoGoogle = (mimeType) =>
  typeof mimeType === 'string' && mimeType.startsWith('application/vnd.google-apps.') && !esCarpeta(mimeType);

const conCodigo = (mensaje, code) => Object.assign(new Error(mensaje), { code });
const noEncontrado = () => conCodigo('No encontrado', 404);

// ── Consultas a Drive ──

const listarArchivosCarpeta = async (folderId) => {
  const drive = getDriveClient();
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and mimeType != '${TIPO_CARPETA}'`,
    fields: 'files(id, name, mimeType, size, modifiedTime)',
    orderBy: 'name',
    pageSize: 200,
  });
  return response.data.files || [];
};

const obtenerMetadataArchivo = async (fileId) => {
  const drive = getDriveClient();
  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, modifiedTime, parents, trashed',
  });
  if (meta.data.trashed) throw noEncontrado();
  return meta.data;
};

const obtenerStreamArchivo = async (fileId) => {
  const drive = getDriveClient();
  const respuesta = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  return respuesta.data;
};

// ── Carpetas raíz de la app ──

const VARIABLES_RAIZ = {
  CARPETA_PADRE_ID_VIAJES: 'viajes',
  CARPETA_PADRE_ID_PREOPERACIONAL: 'preoperacionales',
  CARPETA_PADRE_ID_SOLICITUDES: 'solicitudes',
  CARPETA_PADRE_ID_VEHICULOS: 'vehiculos',
  CARPETA_PADRE_ID_COMBUSTIBLE: 'combustible',
  CARPETA_PADRE_ID_MANTENIMIENTOS: 'mantenimientos',
  CARPETA_PADRE_ID_NOMINA: 'nomina',
  CARPETA_PADRE_ID_PRESTAMOS: 'prestamos',
};

/** { idCarpeta: 'modulo' } con las carpetas del .env que estén definidas */
const carpetasRaiz = () => {
  const mapa = {};
  Object.entries(VARIABLES_RAIZ).forEach(([variable, modulo]) => {
    const id = String(process.env[variable] ?? '').trim();
    if (id) mapa[id] = modulo;
  });
  return mapa;
};

// Nombre y carpeta padre de cada carpeta ya consultada (casi nunca cambian de lugar)
const cachePadres = new Map();

async function datosCarpeta(id) {
  const guardado = cachePadres.get(id);
  if (guardado && Date.now() - guardado.cuando < DURACION_CACHE) return guardado;
  const drive = getDriveClient();
  const { data } = await drive.files.get({ fileId: id, fields: 'id, name, parents' });
  const datos = { nombre: data.name || '', padre: data.parents?.[0] || null, cuando: Date.now() };
  cachePadres.set(id, datos);
  return datos;
}

/**
 * Sube por las carpetas hasta encontrar una raíz de la app.
 * Devuelve { modulo, registro, ruta } o null si el archivo no está en la app.
 *   registro = nombre de la carpeta de primer nivel (placa o consecutivo); null si es la raíz
 *   ruta     = carpetas entre el registro y el archivo, de arriba abajo (ej. ['Gastos_Propietario'])
 * Ejemplo: VIAJES/V-12/Gastos_Propietario/peaje.jpg → { modulo: 'viajes', registro: 'V-12', ruta: ['Gastos_Propietario'] }
 */
async function ubicarEnApp(meta) {
  const raices = carpetasRaiz();
  if (raices[meta.id]) return { modulo: raices[meta.id], registro: null, ruta: [] };

  // Nombres de carpetas desde la del archivo hacia arriba (si el objetivo es carpeta, empieza por ella)
  const cadena = esCarpeta(meta.mimeType) ? [meta.name || ''] : [];
  let padre = meta.parents?.[0] || null;

  for (let nivel = 0; padre && nivel < MAX_NIVELES; nivel++) {
    if (raices[padre]) {
      const registro = cadena.length ? cadena[cadena.length - 1] : null;
      return { modulo: raices[padre], registro, ruta: cadena.slice(0, -1).reverse() };
    }
    const datos = await datosCarpeta(padre);
    cadena.push(datos.nombre);
    padre = datos.padre;
  }
  return null;
}

// ── Permisos por módulo ──

const minuscula = (v) => String(v ?? '').trim().toLowerCase();

/** true si obtener() lo devuelve, false si responde 404; otros errores (cupo de Sheets, red) se relanzan */
async function siLoEncuentra(obtener) {
  try {
    await obtener();
    return true;
  } catch (error) {
    if (error?.estado === 404) return false;
    throw error;
  }
}

// Los helpers se cargan al usarlos (evita dependencias circulares al arrancar)
const PERMISOS = {
  vehiculos: async (usuario, registro, ruta) => {
    if (!puedeVerPlaca(usuario, registro)) return false;
    // VEHICULOS/PLACA/Gastos/G-n = soportes de gastos: el conductor no ve los gastos
    if (usuario.perfil === CONDUCTOR && minuscula(ruta[0]) === 'gastos') return false;
    return true;
  },
  combustible: async (usuario, registro) => puedeVerPlaca(usuario, registro),

  viajes: async (usuario, registro, ruta) => {
    const { viajeHelper } = await import('./viajes.js');
    const viaje = await viajeHelper.getViajesByConsecutivo(registro);
    if (!viaje || !puedeVerPlaca(usuario, viaje.placa)) return false;
    // Los soportes del propietario no son para el conductor
    if (usuario.perfil === CONDUCTOR && ruta.some((r) => minuscula(r).includes('propietario'))) return false;
    return true;
  },

  preoperacionales: async (usuario, registro) => {
    const { preoperacionalHelper } = await import('./preoperacionales.js');
    const preop = await preoperacionalHelper.getPreoperacionalesByConsecutivo(registro);
    return Boolean(preop) && puedeVerPlaca(usuario, preop.placa);
  },

  solicitudes: async (usuario, registro) => {
    const { solicitudHelper } = await import('./solicitudes.js');
    const solicitud = await solicitudHelper.getSolicitudesByConsecutivo(registro);
    return Boolean(solicitud) && puedeVerPlaca(usuario, solicitud.placa);
  },

  mantenimientos: async (usuario, registro) => {
    if (usuario.perfil === CONDUCTOR) return false;
    const { mantenimientoHelper } = await import('./mantenimientos.js');
    const mant = await mantenimientoHelper.getMantenimientosByConsecutivo(registro);
    return Boolean(mant) && puedeVerPlaca(usuario, mant.placa);
  },

  // Nómina y préstamos: obtener() ya filtra lo que cada usuario puede ver (404 si no le corresponde)
  nomina: async (usuario, registro) => {
    const { nominaHelper } = await import('./nomina.js');
    return siLoEncuentra(() => nominaHelper.obtener(usuario, registro));
  },

  prestamos: async (usuario, registro) => {
    const { prestamoHelper } = await import('./prestamos.js');
    return siLoEncuentra(() => prestamoHelper.obtener(usuario, registro));
  },
};

/**
 * Metadata del archivo o carpeta, solo si el usuario puede verlo.
 * Si no está en la app o no le corresponde, responde "no encontrado" (no revela que existe).
 */
async function metadataConPermiso(usuario, id) {
  if (!esIdValido(id)) throw conCodigo('Identificador de Drive no válido', 400);

  let meta;
  try {
    meta = await obtenerMetadataArchivo(id);
  } catch (error) {
    if (error?.code === 404 || error?.status === 404) throw noEncontrado();
    throw error;
  }

  const ubicacion = await ubicarEnApp(meta);
  if (!ubicacion) throw noEncontrado();
  if (esAdmin(usuario)) return meta;

  // La raíz de un módulo o un archivo suelto en ella: solo el administrador
  if (!ubicacion.registro) throw noEncontrado();

  if (!(await tienePermiso(usuario, ubicacion))) throw noEncontrado();
  return meta;
}

// Al abrir una carpeta con 10 fotos llegan 11 peticiones del mismo registro: el permiso se recuerda
// 2 minutos por usuario y registro, así se lee la hoja una vez y no 11 (la API de Sheets tiene cupo por minuto).
const DURACION_PERMISO = 2 * 60 * 1000;
const cachePermisos = new Map();

function tienePermiso(usuario, { modulo, registro, ruta }) {
  const permiso = PERMISOS[modulo];
  if (!permiso) return Promise.resolve(false);
  const llave = [usuario.email, usuario.perfil, usuario.placa_asignada, modulo, registro, ruta.join('/')].join('|');
  const guardado = cachePermisos.get(llave);
  if (guardado && Date.now() - guardado.cuando < DURACION_PERMISO) return guardado.promesa;

  // Se guarda la promesa (no el resultado): las peticiones que llegan a la vez esperan la misma consulta
  const promesa = Promise.resolve(permiso(usuario, registro, ruta)).then(Boolean);
  if (cachePermisos.size > 2000) cachePermisos.clear();
  cachePermisos.set(llave, { promesa, cuando: Date.now() });
  // Si falló (cupo de Sheets, red), no se recuerda: el siguiente intento consulta de nuevo
  promesa.catch(() => {
    if (cachePermisos.get(llave)?.promesa === promesa) cachePermisos.delete(llave);
  });
  return promesa;
}

export const driveHelper = {
  esIdValido,
  esCarpeta,
  esDocumentoGoogle,
  listarArchivosCarpeta,
  obtenerMetadataArchivo,
  obtenerStreamArchivo,
  metadataConPermiso,
  ubicarEnApp,
};
