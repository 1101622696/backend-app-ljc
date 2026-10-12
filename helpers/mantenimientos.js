import { leerHoja, agregarFila, actualizarCampos, siguienteConsecutivo, conCandado, aNumero } from './hoja.js';
import { hoy, aFechaISO, parsearFecha } from './fechas.js';
import { obtenerCarpeta, subirArchivos, linkCarpeta } from './carpetas.js';
import { libroGastos } from './libro_gastos.js';
import { ErrorApp } from './errores.js';
import { puedeVerPlaca } from '../middlewares/validar-rol.js';

// ─────────────────────────────────────────────────────────────
// Hoja "Mantenimientos". Se lee y escribe por NOMBRE de columna.
// Encabezados: consecutivo | placa | tipo_mantenimiento | descripcion | valor_mantenimiento |
//   odometro | correo_usuario | usuario | fecha_creacion | link |
//   estado_factura | numero_factura | link_factura   ← columnas NUEVAS (al final)
// Cada mantenimiento queda también como gasto del vehículo (Gastos_Vehiculos, tipo 'mantenimiento').
// ─────────────────────────────────────────────────────────────

const HOJA = 'Mantenimientos';
const TIPO_GASTO = 'mantenimiento';
const carpetaPadreId = () => process.env.CARPETA_PADRE_ID_MANTENIMIENTOS;

const texto = (v) => String(v ?? '').trim();
const normalizarPlaca = (v) => texto(v).toUpperCase().replace(/\s+/g, '');
const minuscula = (v) => texto(v).toLowerCase();
const mismoConsecutivo = (a, b) => minuscula(a) === minuscula(b);

/** 831340 → '831.340' (formato colombiano para mensajes) */
export const formatoMiles = (n) => String(Math.round(aNumero(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Si viene con hora se conserva tal cual; si no, 'AAAA-MM-DD'. Inválida → texto original */
const normalizarFecha = (v) => {
  const t = texto(v);
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) return t;
  return aFechaISO(v) || t;
};

/** El estado guardado manda; si la celda está vacía (filas viejas) se deduce de los datos */
const calcularEstado = (fila) => {
  const guardado = minuscula(fila.estado_factura);
  if (guardado) return guardado;
  return texto(fila.numero_factura) && texto(fila.link_factura) ? 'legalizado' : 'pendiente';
};

const normalizar = (fila) => ({
  ...fila,
  consecutivo: texto(fila.consecutivo),
  placa: normalizarPlaca(fila.placa),
  tipo_mantenimiento: minuscula(fila.tipo_mantenimiento),
  descripcion: texto(fila.descripcion),
  valor_mantenimiento: aNumero(fila.valor_mantenimiento),
  odometro: texto(fila.odometro) === '' ? '' : aNumero(fila.odometro),
  correo_usuario: minuscula(fila.correo_usuario),
  usuario: texto(fila.usuario),
  fecha_creacion: normalizarFecha(fila.fecha_creacion),
  link: texto(fila.link),
  estado_factura: calcularEstado(fila),
  numero_factura: texto(fila.numero_factura),
  link_factura: texto(fila.link_factura),
});

/** Quita _fila (dato interno) antes de responder */
const publico = ({ _fila, ...resto }) => resto;

const leerMantenimientos = async () => {
  const { encabezados, filas } = await leerHoja(HOJA);
  return { encabezados, filas: filas.map(normalizar) };
};

/** Si llega el usuario de la sesión, deja solo las placas que puede ver */
const filtrarPorUsuario = (lista, usuario) => (usuario ? lista.filter((m) => puedeVerPlaca(usuario, m.placa)) : lista);

// ── Consultas ──

const getMantenimientos = async (usuario = null) => {
  const { filas } = await leerMantenimientos();
  return filtrarPorUsuario(filas.map(publico), usuario);
};

const getMantenimientosByConsecutivo = async (consecutivo) => {
  const { filas } = await leerMantenimientos();
  const fila = filas.find((m) => m.consecutivo && mismoConsecutivo(m.consecutivo, consecutivo));
  return fila ? publico(fila) : undefined;
};

const getResumenMantenimientosPorPlaca = async (placas) => {
  const lista = (Array.isArray(placas) ? placas : String(placas ?? '').split(','))
    .map(normalizarPlaca)
    .filter(Boolean);

  const filtrados = (await getMantenimientos()).filter((m) => lista.includes(m.placa));

  return {
    total: {
      count: filtrados.length,
      valor: filtrados.reduce((suma, m) => suma + m.valor_mantenimiento, 0),
      pendientes_factura: filtrados.filter((m) => m.estado_factura !== 'legalizado').length,
      consecutivos: filtrados.map((m) => ({
        consecutivo: m.consecutivo,
        placa: m.placa,
        tipo_mantenimiento: m.tipo_mantenimiento,
        descripcion: m.descripcion,
        valor_mantenimiento: m.valor_mantenimiento,
        odometro: m.odometro,
        fecha_creacion: m.fecha_creacion,
        estado_factura: m.estado_factura,
        numero_factura: m.numero_factura,
        link: m.link,
        link_factura: m.link_factura,
      })),
    },
  };
};

/** Compara sin importar mayúsculas ni espacios (el formulario guardaba 'Correctivo') */
const filtrarMantenimientosPorCampoTexto = (mantenimientos, campo, valor) => {
  const buscado = campo === 'placa' ? normalizarPlaca(valor) : minuscula(valor);
  return mantenimientos.filter((m) => {
    const actual = campo === 'placa' ? normalizarPlaca(m[campo]) : minuscula(m[campo]);
    return actual !== '' && actual === buscado;
  });
};

const direccion = (orden) => (minuscula(orden) === 'asc' ? 1 : -1);

const ordenarMantenimientosPorCampoNumerico = (mantenimientos, campo, orden = 'desc') =>
  [...mantenimientos].sort((a, b) => (aNumero(a[campo]) - aNumero(b[campo])) * direccion(orden));

const getMantenimientosPorTipo = async (valor, usuario = null) =>
  filtrarMantenimientosPorCampoTexto(await getMantenimientos(usuario), 'tipo_mantenimiento', valor);

const getMantenimientosPorPlaca = async (valor, usuario = null) =>
  filtrarMantenimientosPorCampoTexto(await getMantenimientos(usuario), 'placa', valor);

const getMantenimientosPorEstadoFactura = async (valor, usuario = null) =>
  filtrarMantenimientosPorCampoTexto(await getMantenimientos(usuario), 'estado_factura', valor);

const getMantenimientosOrdenadosPorValor = async (orden = 'desc', usuario = null) =>
  ordenarMantenimientosPorCampoNumerico(await getMantenimientos(usuario), 'valor_mantenimiento', orden);

/** Fechas reales (no texto); las que no se pueden leer quedan al final */
const getMantenimientosOrdenadosPorFechaRegistro = async (orden = 'desc', usuario = null) => {
  const lista = await getMantenimientos(usuario);
  const ms = (m) => parsearFecha(m.fecha_creacion)?.getTime() ?? null;
  return [...lista].sort((a, b) => {
    const fa = ms(a);
    const fb = ms(b);
    if (fa === null && fb === null) return 0;
    if (fa === null) return 1;
    if (fb === null) return -1;
    return (fa - fb) * direccion(orden);
  });
};

/** Solo informativo: el consecutivo real se asigna al guardar (dentro del candado) */
const getSiguienteConsecutivo = async () => {
  const { filas } = await leerHoja(HOJA);
  return siguienteConsecutivo(filas, 'consecutivo', 'M');
};

// ── Validaciones de datos ──

/** Valor > 0. Lanza ErrorApp con mensaje para el usuario */
export const validarValor = (valor) => {
  const numero = aNumero(valor);
  if (!(numero > 0)) throw new ErrorApp(400, 'El valor del mantenimiento debe ser mayor a cero');
  return numero;
};

/** Odómetro opcional: '' si no viene; número ≥ 0 si viene */
export const leerOdometro = (valor) => {
  if (texto(valor) === '') return '';
  const numero = aNumero(valor);
  if (!(numero > 0)) throw new ErrorApp(400, 'El odómetro debe ser un número mayor a cero');
  return Math.round(numero);
};

// ── Drive ──

const carpetaDe = (consecutivo) => obtenerCarpeta(consecutivo, carpetaPadreId());

/** Sube archivos a la carpeta del consecutivo. Devuelve { carpeta, subidos } */
const guardarArchivos = async (archivos, consecutivo, prefijo = '') => {
  if (!archivos?.length) return { carpeta: null, subidos: [] };
  const carpeta = await carpetaDe(consecutivo);
  const subidos = await subirArchivos(archivos, carpeta.id, prefijo);
  return { carpeta, subidos };
};

// ── Libro de gastos ──

const registrarGasto = (m) =>
  libroGastos.registrarOActualizar({
    placa: m.placa,
    tipo_gasto: TIPO_GASTO,
    codigo_referencia: m.consecutivo,
    valor_gasto: m.valor_mantenimiento,
    descripcion: `Mantenimiento ${m.tipo_mantenimiento}${m.descripcion ? `: ${m.descripcion}` : ''}`,
    fecha_registro: aFechaISO(m.fecha_creacion) || hoy(),
    link_soporte: m.link || '',
  });

// ── Escritura ──

/**
 * Guarda el mantenimiento. El consecutivo se calcula UNA vez dentro del candado y es el mismo
 * que nombra la carpeta de Drive. Si llegan numero_factura y archivos, queda 'legalizado'.
 * Devuelve { consecutivo, estado_factura, link, link_factura, gasto_registrado }
 */
const guardarMantenimiento = async ({
  placa, tipo_mantenimiento, descripcion, valor_mantenimiento, odometro,
  correo_usuario, usuario, fecha_creacion, numero_factura, archivos, Link,
}) => {
  const registro = await conCandado(HOJA, async () => {
    const { encabezados, filas } = await leerHoja(HOJA);
    const consecutivo = siguienteConsecutivo(filas, 'consecutivo', 'M');

    const { carpeta } = await guardarArchivos(archivos, consecutivo);
    const link = carpeta?.link || texto(Link);
    const factura = texto(numero_factura);
    const conFactura = Boolean(factura && carpeta);

    const fila = {
      consecutivo,
      placa: normalizarPlaca(placa),
      tipo_mantenimiento: minuscula(tipo_mantenimiento),
      descripcion: texto(descripcion),
      valor_mantenimiento: aNumero(valor_mantenimiento),
      odometro: odometro === '' || odometro === undefined || odometro === null ? '' : aNumero(odometro),
      correo_usuario: minuscula(correo_usuario),
      usuario: texto(usuario),
      fecha_creacion: fecha_creacion || hoy(),
      link,
      estado_factura: conFactura ? 'legalizado' : 'pendiente',
      numero_factura: factura,
      // Al crear no se distingue cuál archivo es la factura: se enlaza la carpeta del mantenimiento
      link_factura: conFactura ? carpeta.link : '',
    };

    await agregarFila(HOJA, encabezados, fila);
    return fila;
  });

  // El mantenimiento ya quedó guardado; si el libro de gastos falla se avisa sin perder el registro
  let gasto_registrado = true;
  try {
    await registrarGasto(registro);
  } catch (error) {
    gasto_registrado = false;
    console.error(`[mantenimientos] No se pudo registrar el gasto de ${registro.consecutivo}:`, error);
  }

  return {
    consecutivo: registro.consecutivo,
    estado_factura: registro.estado_factura,
    link: registro.link,
    link_factura: registro.link_factura,
    gasto_registrado,
  };
};

/** Busca la fila (con _fila) para editarla */
const buscarFila = async (consecutivo) => {
  const { encabezados, filas } = await leerMantenimientos();
  const fila = filas.find((m) => m.consecutivo && mismoConsecutivo(m.consecutivo, consecutivo));
  return { encabezados, fila };
};

/**
 * Edita solo los campos que llegan con valor (igual que antes: vacío = no cambia).
 * Editables: placa, tipo_mantenimiento, descripcion, valor_mantenimiento, odometro, numero_factura (+ archivos).
 * Devuelve null si no existe; si existe, { anterior, actual } (el controlador usa anterior para permisos/odómetro).
 * opciones.validar(anterior, cambios) se ejecuta antes de escribir (permisos, vehículo).
 */
const editarMantenimientoporConsecutivo = async (consecutivo, nuevosDatos = {}, opciones = {}) => {
  const resultado = await conCandado(HOJA, async () => {
    const { encabezados, fila } = await buscarFila(consecutivo);
    if (!fila) return null;

    const cambios = {};
    if (texto(nuevosDatos.placa) && normalizarPlaca(nuevosDatos.placa) !== fila.placa) {
      cambios.placa = normalizarPlaca(nuevosDatos.placa);
    }
    if (texto(nuevosDatos.tipo_mantenimiento)) cambios.tipo_mantenimiento = minuscula(nuevosDatos.tipo_mantenimiento);
    if (texto(nuevosDatos.descripcion)) cambios.descripcion = texto(nuevosDatos.descripcion);
    if (texto(nuevosDatos.valor_mantenimiento)) cambios.valor_mantenimiento = validarValor(nuevosDatos.valor_mantenimiento);
    if (texto(nuevosDatos.odometro)) cambios.odometro = leerOdometro(nuevosDatos.odometro);
    if (texto(nuevosDatos.numero_factura)) cambios.numero_factura = texto(nuevosDatos.numero_factura);

    if (opciones.validar) await opciones.validar(publico(fila), cambios);

    const { carpeta } = await guardarArchivos(nuevosDatos.archivos, fila.consecutivo);
    if (carpeta) cambios.link = carpeta.link;
    else if (texto(nuevosDatos.Link)) cambios.link = texto(nuevosDatos.Link);

    // Si con esta edición ya hay número de factura y soporte, queda legalizado
    const numeroFinal = cambios.numero_factura ?? fila.numero_factura;
    let linkFactura = fila.link_factura;
    if (numeroFinal && !linkFactura && carpeta) linkFactura = cambios.link_factura = carpeta.link;
    if (numeroFinal && linkFactura && fila.estado_factura !== 'legalizado') cambios.estado_factura = 'legalizado';

    if (Object.keys(cambios).length) {
      await actualizarCampos(HOJA, encabezados, fila._fila, cambios, { omitirFaltantes: true });
    }
    return { anterior: publico(fila), actual: { ...publico(fila), ...cambios } };
  });

  if (!resultado) return null;
  const { anterior, actual } = resultado;

  // Mantener el libro de gastos al día. Si cambió la placa, el gasto de la placa anterior queda en 0
  if (anterior.placa !== actual.placa) {
    await libroGastos.registrarOActualizar({
      placa: anterior.placa,
      tipo_gasto: TIPO_GASTO,
      codigo_referencia: anterior.consecutivo,
      valor_gasto: 0,
      descripcion: `Mantenimiento trasladado a la placa ${actual.placa}`,
    });
  }
  await registrarGasto(actual);

  return resultado;
};

/**
 * Legaliza la factura: exige número de factura y un soporte (archivo nuevo o link ya guardado).
 * opciones.validar(registro) se ejecuta antes de escribir (permisos).
 */
const legalizarMantenimiento = async (consecutivo, { numero_factura, archivos } = {}, opciones = {}) =>
  conCandado(HOJA, async () => {
    const { encabezados, fila } = await buscarFila(consecutivo);
    if (!fila) throw new ErrorApp(404, 'Mantenimiento no encontrado');
    if (opciones.validar) await opciones.validar(publico(fila));

    const numero = texto(numero_factura);
    if (!numero) throw new ErrorApp(400, 'Ingrese el número de la factura');
    if (fila.estado_factura === 'legalizado') {
      throw new ErrorApp(400, `El mantenimiento ${fila.consecutivo} ya está legalizado (factura ${fila.numero_factura || 'sin número'})`);
    }

    const cambios = { numero_factura: numero, estado_factura: 'legalizado' };

    if (archivos?.length) {
      const { carpeta, subidos } = await guardarArchivos(archivos, fila.consecutivo, 'factura - ');
      // Un solo archivo → link directo a la factura; varios → la carpeta
      cambios.link_factura = (subidos.length === 1 && subidos[0].webViewLink) || carpeta.link;
      if (!fila.link) cambios.link = carpeta.link;
    } else if (fila.link_factura || fila.link) {
      cambios.link_factura = fila.link_factura || fila.link;
    } else {
      throw new ErrorApp(400, 'Adjunte la foto o el PDF de la factura para legalizar');
    }

    await actualizarCampos(HOJA, encabezados, fila._fila, cambios, { omitirFaltantes: true });
    return {
      consecutivo: fila.consecutivo,
      placa: fila.placa,
      valor: fila.valor_mantenimiento,
      estado_factura: 'legalizado',
      numero_factura: numero,
      link_factura: cambios.link_factura,
      mensaje: 'Mantenimiento legalizado correctamente',
    };
  });

/**
 * Registra en Gastos_Vehiculos los mantenimientos que se crearon antes de este cambio.
 * Se puede correr una vez (no duplica: registrarOActualizar actualiza si ya existe).
 */
const sincronizarGastosMantenimientos = async () => {
  const lista = await getMantenimientos();
  let registrados = 0;
  for (const m of lista) {
    if (!m.consecutivo || !m.placa || !(m.valor_mantenimiento > 0)) continue;
    await registrarGasto(m);
    registrados++;
  }
  return { registrados, total: lista.length };
};

// Compatibilidad: antes el controlador subía archivos por separado
const procesarArchivos = async (archivos, consecutivo) => {
  const { carpeta } = await guardarArchivos(archivos, consecutivo);
  return carpeta?.link || null;
};

const subirArchivosACarpetaExistente = async (archivos, carpetaId) => {
  if (!archivos?.length) return null;
  await subirArchivos(archivos, carpetaId);
  return linkCarpeta(carpetaId);
};

export const mantenimientoHelper = {
  getMantenimientos,
  getResumenMantenimientosPorPlaca,
  guardarMantenimiento,
  getSiguienteConsecutivo,
  getMantenimientosByConsecutivo,
  getMantenimientosOrdenadosPorValor,
  getMantenimientosPorTipo,
  getMantenimientosOrdenadosPorFechaRegistro,
  getMantenimientosPorPlaca,
  getMantenimientosPorEstadoFactura,
  editarMantenimientoporConsecutivo,
  legalizarMantenimiento,
  sincronizarGastosMantenimientos,
  procesarArchivos,
  subirArchivosACarpetaExistente,
  validarValor,
  leerOdometro,
  formatoMiles,
};
