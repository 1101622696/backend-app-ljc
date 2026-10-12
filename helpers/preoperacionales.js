import { leerHoja, actualizarCampos, agregarFila, aNumero, siguienteConsecutivo, conCandado } from './hoja.js';
import { obtenerCarpeta, subirArchivos, linkCarpeta } from './carpetas.js';
import { ahora } from './fechas.js';
import { ErrorApp } from './errores.js';

// ─────────────────────────────────────────────────────────────
// Hoja "Preoperacional" leída y escrita por NOMBRE de columna:
//   consecutivo | codigo_viaje | placa | odometro | 42 ítems | correo_usuario | usuario | fecha_creacion | link
// Los ítems se guardan tal como llegan ('Cumple' / 'No Cumple' / 'No aplica'): el frontend los compara así.
// El consecutivo 'Pre-n' se genera y se guarda dentro de conCandado: dos envíos al tiempo no se repiten
// y el nombre de la carpeta de Drive es el mismo consecutivo de la fila.
// ─────────────────────────────────────────────────────────────

const HOJA = 'Preoperacional';
const CANDADO = 'preoperacional';
const PREFIJO = 'Pre';

export const ITEMS_PREOPERACIONAL = [
  'nivel_agua', 'nivel_aceite', 'galones', 'fugas_visibles', 'presion_frenos', 'fugas_audibles', 'freno_parqueo',
  'abs_sintestigo', 'prueba_freno', 'luces_altas_bajas', 'direccionales', 'luces_freno', 'luces_remolque',
  'testigo_tablero', 'filtro_aire', 'volante', 'sin_fugas', 'cambios_suave', 'sin_ruidos', 'cinturon_seguridad',
  'espejos', 'extintor_cabezote', 'extintor_trailer', 'botiquin', 'triangulos_reflectivos', 'kit_carretera',
  'senalizacion_conduzco', 'correas', 'estado_carpa', 'refrigerante', 'pito', 'alarma_retroceso', 'presion_llantas',
  'desgaste_llantas', 'tuercas_ajustadas', 'suspension_fisuras', 'acople_quintarueda', 'quinta_rueda', 'pasador_rey',
  'mangueras_aire', 'seguro_acople', 'placas_visibles',
];

const carpetaPadre = () => process.env.CARPETA_PADRE_ID_PREOPERACIONAL;

// ── Lectura ──

const normalizarPlaca = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
const numeroDe = (consecutivo) => parseInt(String(consecutivo ?? '').replace(/\D/g, ''), 10) || 0;
const masRecientePrimero = (a, b) => numeroDe(b.consecutivo) - numeroDe(a.consecutivo);
const valorItem = (v) => (typeof v === 'string' ? v.trim() : v ?? '');

const normalizar = (fila) => ({
  ...fila,
  consecutivo: String(fila.consecutivo ?? '').trim(),
  codigo_viaje: String(fila.codigo_viaje ?? '').trim().toUpperCase(),
  placa: normalizarPlaca(fila.placa),
  correo_usuario: String(fila.correo_usuario ?? '').trim().toLowerCase(),
  // fecha_creacion se deja tal cual: lleva hora (se usa para medir km entre preoperacionales)
});

const sinFila = ({ _fila, ...resto }) => resto;

async function leerPreoperacionales() {
  const { encabezados, filas } = await leerHoja(HOJA);
  return { encabezados, preoperacionales: filas.filter((f) => f.consecutivo).map(normalizar) };
}

/** Todos los preoperacionales, más reciente primero */
const getPreoperacionales = async () => {
  const { preoperacionales } = await leerPreoperacionales();
  return preoperacionales.sort(masRecientePrimero).map(sinFila);
};

/** Solo informativo: el consecutivo real se asigna al guardar (dentro del candado) */
const getSiguienteConsecutivo = async () => {
  const { preoperacionales } = await leerPreoperacionales();
  return siguienteConsecutivo(preoperacionales, 'consecutivo', PREFIJO);
};

const buscar = (preoperacionales, consecutivo) => {
  const buscado = String(consecutivo ?? '').trim().toLowerCase();
  return preoperacionales.find((p) => p.consecutivo.toLowerCase() === buscado) || null;
};

const getPreoperacionalesByConsecutivo = async (consecutivo) => {
  const { preoperacionales } = await leerPreoperacionales();
  const encontrado = buscar(preoperacionales, consecutivo);
  return encontrado ? sinFila(encontrado) : undefined;
};

const getResumenPreoperacionalesPorPlaca = async (placas) => {
  const lista = (Array.isArray(placas) ? placas : [placas]).map(normalizarPlaca).filter(Boolean);
  const filtrados = (await getPreoperacionales()).filter((p) => lista.includes(p.placa));

  return {
    total: {
      count: filtrados.length,
      consecutivos: filtrados.map((r) => ({
        consecutivo: r.consecutivo || '',
        codigo_viaje: r.codigo_viaje || '',
        odometro: r.odometro ?? '',
        fecha_creacion: r.fecha_creacion || '',
        correo_usuario: r.correo_usuario || '',
        usuario: r.usuario || '',
        placa: r.placa || '',
        link: r.link || '',
      })),
    },
  };
};

// ── Escritura ──

/** Arma la fila (por nombre de columna) a partir del objeto que envía el controlador */
const armarFila = (consecutivo, datos, link) => {
  const placa = normalizarPlaca(datos.placa);
  if (!placa) throw new ErrorApp(400, 'Falta la placa del preoperacional');
  const odometro = Math.round(aNumero(datos.odometro));
  if (odometro < 0) throw new ErrorApp(400, 'El odómetro no puede ser negativo');

  return {
    consecutivo,
    codigo_viaje: String(datos.codigo_viaje ?? '').trim().toUpperCase(),
    placa,
    odometro: odometro || '',
    ...Object.fromEntries(ITEMS_PREOPERACIONAL.map((campo) => [campo, valorItem(datos[campo])])),
    correo_usuario: String(datos.correo_usuario ?? '').trim().toLowerCase(),
    usuario: String(datos.usuario ?? '').trim(),
    fecha_creacion: datos.fecha_creacion || ahora(),
    link: link || '',
  };
};

/**
 * Crea consecutivo + carpeta de Drive + archivos + fila en UNA sola operación con candado.
 * Si la subida falla no queda fila a medias. Devuelve { consecutivo, link }.
 */
const guardarConArchivos = (datos, archivos = []) =>
  conCandado(CANDADO, async () => {
    const { encabezados, preoperacionales } = await leerPreoperacionales();
    const consecutivo = siguienteConsecutivo(preoperacionales, 'consecutivo', PREFIJO);

    let link = datos.link || datos.Link || '';
    if (archivos?.length) {
      const carpeta = await obtenerCarpeta(consecutivo, carpetaPadre());
      await subirArchivos(archivos, carpeta.id);
      link = carpeta.link;
    }

    await agregarFila(HOJA, encabezados, armarFila(consecutivo, datos, link));
    return { consecutivo, link };
  });

/** Igual que antes: recibe el mismo objeto (con Link o link) y devuelve { consecutivo } */
const guardarPreoperacional = async (datos) => {
  const { consecutivo } = await guardarConArchivos(datos, []);
  return { consecutivo };
};

/**
 * Edita SOLO los campos enviados (los ítems pueden quedar vacíos si así se envían).
 * consecutivo, viaje, placa, odómetro, usuario y fecha no se editan.
 * Devuelve null si no existe.
 */
const editarPreoperacionalPorConsecutivo = (consecutivo, nuevosDatos = {}) =>
  conCandado(CANDADO, async () => {
    const { encabezados, preoperacionales } = await leerPreoperacionales();
    const actual = buscar(preoperacionales, consecutivo);
    if (!actual) return null;

    const cambios = {};
    for (const campo of ITEMS_PREOPERACIONAL) {
      if (nuevosDatos[campo] !== undefined) cambios[campo] = valorItem(nuevosDatos[campo]);
    }
    // El controlador antes enviaba "Link" y el helper leía "link": el link nuevo nunca se guardaba
    const link = nuevosDatos.link ?? nuevosDatos.Link;
    if (link) cambios.link = link;

    if (Object.keys(cambios).length) {
      await actualizarCampos(HOJA, encabezados, actual._fila, cambios, { omitirFaltantes: true });
    }
    return true;
  });

// ── Drive ──

/** Sube archivos a la carpeta del preoperacional (la crea si no existe). Devuelve el link de la carpeta */
const procesarArchivos = async (archivos, consecutivo) => {
  if (!archivos?.length) return null;
  const carpeta = await obtenerCarpeta(String(consecutivo).trim(), carpetaPadre());
  await subirArchivos(archivos, carpeta.id);
  return carpeta.link;
};

const subirArchivosACarpetaExistente = async (archivos, carpetaId) => {
  if (!archivos?.length) return null;
  await subirArchivos(archivos, carpetaId);
  return linkCarpeta(carpetaId);
};

/** Compatibilidad: devuelve la carpeta del consecutivo ({ id, webViewLink }); la crea si no existe */
const buscarCarpetaPorNombre = async (nombreCarpeta, parentFolderId = carpetaPadre()) => {
  const carpeta = await obtenerCarpeta(nombreCarpeta, parentFolderId);
  return { id: carpeta.id, name: nombreCarpeta, webViewLink: carpeta.link };
};

export const preoperacionalHelper = {
  getPreoperacionales,
  guardarPreoperacional,
  guardarConArchivos,
  getSiguienteConsecutivo,
  getPreoperacionalesByConsecutivo,
  getResumenPreoperacionalesPorPlaca,
  editarPreoperacionalPorConsecutivo,
  procesarArchivos,
  subirArchivosACarpetaExistente,
  buscarCarpetaPorNombre,
  ITEMS: ITEMS_PREOPERACIONAL,
};
