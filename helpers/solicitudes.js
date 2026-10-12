import { leerHoja, agregarFila, siguienteConsecutivo, conCandado, aNumero } from './hoja.js';
import { ahora, aFechaISO } from './fechas.js';
import { obtenerCarpeta, subirArchivos } from './carpetas.js';
import { usuarioHelper } from './usuarios.js';
import { firebaseHelper } from './firebase.js';
import { puedeVerPlaca } from '../middlewares/validar-rol.js';

// ─────────────────────────────────────────────────────────────
// Hoja "Solicitudes": avisos de mantenimiento que hace el conductor cuando ve algo raro.
// NO se vinculan a mantenimientos; solo alertan al propietario/administrador.
// Encabezados: consecutivo | placa | tipo_mantenimiento | descripcion | odometro |
//              correo_usuario | usuario | fecha_creacion | link
// fecha_creacion se guarda con hora: '2026-10-11T19:45:03-05:00'
// ─────────────────────────────────────────────────────────────

const HOJA = 'Solicitudes';
const carpetaPadreId = () => process.env.CARPETA_PADRE_ID_SOLICITUDES;

const texto = (v) => String(v ?? '').trim();
const normalizarPlaca = (v) => texto(v).toUpperCase().replace(/\s+/g, '');
const minuscula = (v) => texto(v).toLowerCase();

/** Con hora se conserva tal cual; sin hora 'AAAA-MM-DD'; inválida → texto original */
const normalizarFecha = (v) => {
  const t = texto(v);
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) return t;
  return aFechaISO(v) || t;
};

const normalizar = ({ _fila, ...fila }) => ({
  ...fila,
  consecutivo: texto(fila.consecutivo),
  placa: normalizarPlaca(fila.placa),
  tipo_mantenimiento: minuscula(fila.tipo_mantenimiento),
  descripcion: texto(fila.descripcion),
  odometro: texto(fila.odometro) === '' ? '' : aNumero(fila.odometro),
  correo_usuario: minuscula(fila.correo_usuario),
  usuario: texto(fila.usuario),
  fecha_creacion: normalizarFecha(fila.fecha_creacion),
  link: texto(fila.link),
});

/** Si llega el usuario de la sesión, deja solo las placas que puede ver */
const getSolicitudes = async (usuario = null) => {
  const { filas } = await leerHoja(HOJA);
  const lista = filas.map(normalizar);
  return usuario ? lista.filter((s) => puedeVerPlaca(usuario, s.placa)) : lista;
};

const getSolicitudesByConsecutivo = async (consecutivo) => {
  const buscado = minuscula(consecutivo);
  return (await getSolicitudes()).find((s) => s.consecutivo && s.consecutivo.toLowerCase() === buscado);
};

const getResumenSolicitudesPorPlaca = async (placas) => {
  const lista = (Array.isArray(placas) ? placas : String(placas ?? '').split(','))
    .map(normalizarPlaca)
    .filter(Boolean);

  const filtradas = (await getSolicitudes()).filter((s) => lista.includes(s.placa));

  return {
    total: {
      count: filtradas.length,
      consecutivos: filtradas.map((s) => ({
        consecutivo: s.consecutivo,
        odometro: s.odometro,
        fecha_creacion: s.fecha_creacion,
        correo_usuario: s.correo_usuario,
        usuario: s.usuario,
        descripcion: s.descripcion,
        placa: s.placa,
        link: s.link,
        tipo_mantenimiento: s.tipo_mantenimiento,
      })),
    },
  };
};

/** Solo informativo: el consecutivo real se asigna al guardar (dentro del candado) */
const getSiguienteConsecutivo = async () => {
  const { filas } = await leerHoja(HOJA);
  return siguienteConsecutivo(filas, 'consecutivo', 'S');
};

/**
 * Guarda la solicitud. El consecutivo S-n se calcula UNA vez dentro del candado
 * y es el mismo que nombra la carpeta de Drive con las fotos.
 */
const guardarSolicitud = async ({ placa, tipo_mantenimiento, descripcion, odometro, correo_usuario, usuario, fecha_creacion, archivos, Link }) =>
  conCandado(HOJA, async () => {
    const { encabezados, filas } = await leerHoja(HOJA);
    const consecutivo = siguienteConsecutivo(filas, 'consecutivo', 'S');

    let link = texto(Link);
    if (archivos?.length) {
      const carpeta = await obtenerCarpeta(consecutivo, carpetaPadreId());
      await subirArchivos(archivos, carpeta.id);
      link = carpeta.link;
    }

    const fila = {
      consecutivo,
      placa: normalizarPlaca(placa),
      tipo_mantenimiento: minuscula(tipo_mantenimiento),
      descripcion: texto(descripcion),
      odometro: odometro === '' || odometro === undefined || odometro === null ? '' : aNumero(odometro),
      correo_usuario: minuscula(correo_usuario),
      usuario: texto(usuario),
      fecha_creacion: fecha_creacion || ahora(),
      link,
    };
    await agregarFila(HOJA, encabezados, fila);
    return { consecutivo, link, fecha_creacion: fila.fecha_creacion };
  });

/**
 * Avisa al propietario de la placa y a los administradores (menos a quien la creó).
 * Nunca lanza: un fallo de Firebase no debe afectar la solicitud ya guardada.
 * Devuelve la cantidad de notificaciones enviadas.
 */
const notificarSolicitud = async ({ consecutivo, placa, descripcion, usuario }, emailCreador = '') => {
  try {
    const creador = minuscula(emailCreador);
    const destinatarios = (await usuarioHelper.obtenerDestinatariosNotificacion(placa))
      .filter((correo) => correo && minuscula(correo) !== creador);

    const detalle = texto(descripcion);
    const corto = detalle.length > 150 ? `${detalle.slice(0, 147)}...` : detalle;
    const titulo = 'Solicitud de mantenimiento';
    const mensaje = `Solicitud de mantenimiento — ${placa}: ${corto || 'sin descripción'}${usuario ? ` (reporta ${usuario})` : ''}`;
    const datos = { tipo: 'solicitud_mantenimiento', consecutivo: String(consecutivo), placa: String(placa) };

    let enviadas = 0;
    for (const correo of destinatarios) {
      try {
        if (await firebaseHelper.enviarNotificacion(correo, titulo, mensaje, datos)) enviadas++;
      } catch (error) {
        console.error(`[solicitudes] No se pudo notificar a ${correo}:`, error);
      }
    }
    return enviadas;
  } catch (error) {
    console.error(`[solicitudes] No se pudo notificar la solicitud ${consecutivo}:`, error);
    return 0;
  }
};

// Compatibilidad: antes el controlador subía archivos por separado (y fallaba: llamaba
// buscarCarpetaPorNombre, que no existía en este archivo)
const procesarArchivos = async (archivos, consecutivo) => {
  if (!archivos?.length) return null;
  const carpeta = await obtenerCarpeta(consecutivo, carpetaPadreId());
  await subirArchivos(archivos, carpeta.id);
  return carpeta.link;
};

export const solicitudHelper = {
  getSolicitudes,
  guardarSolicitud,
  getSiguienteConsecutivo,
  getSolicitudesByConsecutivo,
  getResumenSolicitudesPorPlaca,
  procesarArchivos,
  notificarSolicitud,
};
