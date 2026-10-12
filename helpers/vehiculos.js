import { leerHoja, actualizarCampos, agregarFila, aNumero, conCandado } from './hoja.js';
import { obtenerCarpeta, subirArchivos } from './carpetas.js';
import { aFechaISO, sumarAnios, diasEntre, hoy, parsearFecha } from './fechas.js';
import { ErrorApp } from './errores.js';

// ─────────────────────────────────────────────────────────────
// Hoja "Vehiculos" leída y escrita por NOMBRE de columna.
// Encabezados: placa, viajes, licencia, marca, modelo, referencia, odometro, clase_vehiculo, color,
// servicio, capacidad, combustible, numero_motor, numero_chasis, fecha_matricula, soat, soat_expedicion,
// soat_vencimiento, capacidad_ton, tecnico, tecnico_expedicion, tecnico_vencimiento, poliza,
// poliza_expedicion, poliza_vencimiento, link, estado, fecha_creacion, rendimiento_galon, service_code
//
// El estado de SOAT / técnico-mecánica / póliza se CALCULA al leer con la fecha de vencimiento
// (antes se guardaba al crear y quedaba desactualizado para siempre).
// ─────────────────────────────────────────────────────────────

const HOJA = 'Vehiculos';
const carpetaPadreId = process.env.CARPETA_PADRE_ID_VEHICULOS;
const DIAS_AVISO = 30; // "próxima a vencer" desde 30 días antes

const DOCUMENTOS = ['soat', 'tecnico', 'poliza'];
const CAMPOS_FECHA = ['fecha_matricula', 'soat_expedicion', 'soat_vencimiento', 'tecnico_expedicion',
  'tecnico_vencimiento', 'poliza_expedicion', 'poliza_vencimiento'];
const CAMPOS_NUMERO = ['odometro', 'capacidad_ton', 'rendimiento_galon', 'viajes'];
const CAMPOS_TEXTO = ['licencia', 'marca', 'modelo', 'referencia', 'clase_vehiculo', 'color', 'servicio',
  'capacidad', 'combustible', 'numero_motor', 'numero_chasis', 'service_code'];

export const normalizarPlaca = (placa) => String(placa ?? '').replace(/\s+/g, '').toUpperCase();

/** 'activo' | 'proxima a vencer' | 'vencido' | 'sin fecha' según días al vencimiento */
export const estadoDocumento = (vencimiento) => {
  const dias = diasEntre(hoy(), vencimiento);
  if (dias === null) return { estado: 'sin fecha', dias: null };
  if (dias < 0) return { estado: 'vencido', dias };
  if (dias <= DIAS_AVISO) return { estado: 'proxima a vencer', dias };
  return { estado: 'activo', dias };
};

const normalizar = (fila) => {
  const v = { ...fila, placa: normalizarPlaca(fila.placa), estado: String(fila.estado ?? '').trim().toLowerCase() || 'activo' };
  CAMPOS_FECHA.forEach((c) => {
    if (v[c] !== undefined && v[c] !== '') v[c] = aFechaISO(v[c]) || String(v[c]);
  });
  CAMPOS_NUMERO.forEach((c) => {
    if (v[c] !== undefined && v[c] !== '') v[c] = aNumero(v[c]);
  });
  DOCUMENTOS.forEach((doc) => {
    const { estado, dias } = estadoDocumento(v[`${doc}_vencimiento`]);
    v[doc] = estado;
    v[`dias_${doc}`] = dias;
  });
  return v;
};

async function leerVehiculos() {
  const { encabezados, filas } = await leerHoja(HOJA);
  return { encabezados, vehiculos: filas.filter((f) => normalizarPlaca(f.placa)).map(normalizar) };
}

const sinFila = ({ _fila, ...resto }) => resto;

// ── Consultas ──

const getVehiculos = async () => (await leerVehiculos()).vehiculos.map(sinFila);

const getVehiculoById = async (placa) => {
  const buscada = normalizarPlaca(placa);
  return (await getVehiculos()).find((v) => v.placa === buscada) || null;
};

const getResumenVehiculosPorPlaca = async (placas) => {
  const lista = (Array.isArray(placas) ? placas : String(placas).split(',')).map(normalizarPlaca).filter(Boolean);
  const vehiculos = (await getVehiculos()).filter((v) => lista.includes(v.placa));
  return {
    total: {
      count: vehiculos.length,
      consecutivos: vehiculos.map((v) => ({
        placa: v.placa,
        viajes: v.viajes ?? '',
        licencia: v.licencia || '',
        estado: v.estado,
        marca: v.marca || '',
        modelo: v.modelo || '',
        odometro: v.odometro ?? '',
        soat: v.soat,
        soat_vencimiento: v.soat_vencimiento || '',
        tecnico: v.tecnico,
        tecnico_vencimiento: v.tecnico_vencimiento || '',
        poliza: v.poliza,
        poliza_vencimiento: v.poliza_vencimiento || '',
      })),
    },
  };
};

const getVehiculosPorEstado = async (valor) => {
  const buscado = String(valor ?? '').trim().toLowerCase();
  return (await getVehiculos()).filter((v) => v.estado === buscado);
};

const ordenarPorFecha = (campo) => async (orden = 'desc') => {
  const vehiculos = await getVehiculos();
  const t = (v) => parsearFecha(v[campo])?.getTime() || 0;
  return vehiculos.sort((a, b) => (orden === 'desc' ? t(b) - t(a) : t(a) - t(b)));
};

const ordenarPorNumero = (campo) => async (orden = 'desc') => {
  const vehiculos = await getVehiculos();
  return vehiculos.sort((a, b) => (orden === 'desc' ? aNumero(b[campo]) - aNumero(a[campo]) : aNumero(a[campo]) - aNumero(b[campo])));
};

const getVehiculosOrdenadosPorFechaPoliza = ordenarPorFecha('poliza_vencimiento');
const getVehiculosOrdenadosPorFechaSoat = ordenarPorFecha('soat_vencimiento');
const getVehiculosOrdenadosPorFechaTecnico = ordenarPorFecha('tecnico_vencimiento');
const getVehiculoOrdenadosPorViajes = ordenarPorNumero('viajes');
const getVehiculoOrdenadosPorDistancia = ordenarPorNumero('odometro');

// ── Datos del formulario ──

/**
 * Toma del formulario solo los campos que llegaron y los deja listos para la hoja.
 * Vencimientos: si llega la fecha de vencimiento se respeta (ej. tecnomecánica de vehículo nuevo);
 * si solo llega la expedición, vence a 1 año (antes la póliza usaba el año de la tecnomecánica).
 */
function prepararDatos(datos) {
  const cambios = {};
  CAMPOS_TEXTO.forEach((c) => {
    if (datos[c] !== undefined) cambios[c] = String(datos[c] ?? '').trim();
  });
  ['odometro', 'capacidad_ton', 'rendimiento_galon'].forEach((c) => {
    if (datos[c] === undefined || datos[c] === '') return;
    const n = aNumero(datos[c]);
    if (n < 0) throw new ErrorApp(400, `El valor de ${c.replace('_', ' ')} no es válido`);
    cambios[c] = n;
  });
  if (datos.fecha_matricula) cambios.fecha_matricula = aFechaISO(datos.fecha_matricula);

  DOCUMENTOS.forEach((doc) => {
    const expedicion = datos[`${doc}_expedicion`];
    const vencimiento = datos[`${doc}_vencimiento`];
    if (expedicion) {
      const iso = aFechaISO(expedicion);
      if (!iso) throw new ErrorApp(400, `La fecha de expedición de ${doc} no es válida`);
      cambios[`${doc}_expedicion`] = iso;
      cambios[`${doc}_vencimiento`] = sumarAnios(iso, 1);
    }
    if (vencimiento) {
      const iso = aFechaISO(vencimiento);
      if (!iso) throw new ErrorApp(400, `La fecha de vencimiento de ${doc} no es válida`);
      cambios[`${doc}_vencimiento`] = iso;
    }
    if (cambios[`${doc}_vencimiento`]) cambios[doc] = estadoDocumento(cambios[`${doc}_vencimiento`]).estado;
  });
  return cambios;
}

/** Sube archivos a la carpeta de la placa y devuelve el link de la carpeta */
const procesarArchivos = async (archivos, placa) => {
  if (!archivos?.length) return null;
  const carpeta = await obtenerCarpeta(normalizarPlaca(placa), carpetaPadreId);
  await subirArchivos(archivos, carpeta.id);
  return carpeta.link;
};

// ── Crear / editar ──

/**
 * Crea el vehículo. Si lo crea un propietario, la placa se le agrega a sus placas asignadas
 * (antes no podía ver el vehículo que acababa de crear).
 */
const crearVehiculo = (usuario, datos, archivos = []) =>
  conCandado('vehiculos', async () => {
    const placa = normalizarPlaca(datos.placa);
    if (!/^[A-Z0-9]{5,7}$/.test(placa)) throw new ErrorApp(400, 'Placa no válida (ej. SNT473)');

    const { encabezados, vehiculos } = await leerVehiculos();
    if (vehiculos.some((v) => v.placa === placa)) throw new ErrorApp(409, `Ya existe el vehículo ${placa}`);

    const cambios = prepararDatos(datos);
    const link = await procesarArchivos(archivos, placa);

    const nuevo = {
      ...cambios,
      placa,
      viajes: 0,
      estado: 'activo',
      fecha_creacion: hoy(),
      rendimiento_galon: cambios.rendimiento_galon || 8,
      link: link || '',
      service_code: cambios.service_code || placa,
    };
    DOCUMENTOS.forEach((doc) => {
      if (!nuevo[doc]) nuevo[doc] = 'sin fecha';
    });

    await agregarFila(HOJA, encabezados, nuevo);

    if (usuario?.perfil === 'propietario') await asignarPlacaAPropietario(usuario.email, placa);
    return { placa };
  });

async function asignarPlacaAPropietario(email, placa) {
  try {
    const { usuarioHelper } = await import('./usuarios.js'); // import diferido: evita dependencia circular
    const propietario = await usuarioHelper.getUsuarioByEmail(email);
    if (!propietario) return;
    const placas = usuarioHelper.listaPlacas(`${propietario.placa_asignada},${placa}`);
    const { encabezados } = await leerHoja('Usuarios!1:1');
    await actualizarCampos('Usuarios', encabezados, propietario._fila, { placa_asignada: placas.join(', ') });
    usuarioHelper.invalidarCache();
  } catch (error) {
    console.warn('[vehiculos] No se pudo asignar la placa al propietario:', error.message);
  }
}

/** Edita solo los campos que llegaron. La placa no se cambia (es la llave de viajes, gastos, etc.) */
const editarVehiculoporPlaca = async (placa, nuevosDatos, archivos = []) => {
  const { encabezados, vehiculos } = await leerVehiculos();
  const vehiculo = vehiculos.find((v) => v.placa === normalizarPlaca(placa));
  if (!vehiculo) return null;

  const cambios = prepararDatos(nuevosDatos);
  const link = await procesarArchivos(archivos, vehiculo.placa);
  if (link) cambios.link = link;
  else if (nuevosDatos.Link || nuevosDatos.link) cambios.link = nuevosDatos.Link || nuevosDatos.link;

  if (cambios.odometro !== undefined && cambios.odometro < aNumero(vehiculo.odometro)) {
    throw new ErrorApp(400, `El odómetro no puede ser menor al registrado (${aNumero(vehiculo.odometro).toLocaleString('es-CO')} km)`);
  }

  if (Object.keys(cambios).length) {
    await actualizarCampos(HOJA, encabezados, vehiculo._fila, cambios, { omitirFaltantes: true });
  }
  return true;
};

const actualizarEstadoEnSheets = async (placa, nuevoEstado = 'activo') => {
  const estado = String(nuevoEstado).trim().toLowerCase();
  if (!['activo', 'inactivo'].includes(estado)) throw new ErrorApp(400, 'Estado no válido');
  const { encabezados, vehiculos } = await leerVehiculos();
  const vehiculo = vehiculos.find((v) => v.placa === normalizarPlaca(placa));
  if (!vehiculo) return null;
  await actualizarCampos(HOJA, encabezados, vehiculo._fila, { estado });
  return true;
};

/** Solo escribe la celda del odómetro (antes reescribía la fila completa por posición) */
const actualizarOdometroVehiculo = async (placa, nuevoOdometro) => {
  const valor = Math.round(aNumero(nuevoOdometro));
  if (!valor) return false;
  const { encabezados, vehiculos } = await leerVehiculos();
  const vehiculo = vehiculos.find((v) => v.placa === normalizarPlaca(placa));
  if (!vehiculo) throw new ErrorApp(404, `No existe el vehículo ${normalizarPlaca(placa)}`);
  if (valor <= aNumero(vehiculo.odometro)) return false; // nunca baja
  await actualizarCampos(HOJA, encabezados, vehiculo._fila, { odometro: valor });
  return true;
};

// ── Compatibilidad con código anterior ──

const guardarVehiculo = async (datos) => {
  const { encabezados } = await leerVehiculos();
  await agregarFila(HOJA, encabezados, { ...datos, placa: normalizarPlaca(datos.placa), link: datos.Link || datos.link || '' });
  return { placa: normalizarPlaca(datos.placa) };
};

const buscarCarpetaPorNombre = async (nombre, padreId) => {
  const carpeta = await obtenerCarpeta(nombre, padreId);
  return { id: carpeta.id, webViewLink: carpeta.link };
};

const subirArchivosACarpetaExistente = async (archivos, carpetaId) => {
  if (!archivos?.length) return null;
  await subirArchivos(archivos, carpetaId);
  return `https://drive.google.com/drive/folders/${carpetaId}`;
};

export const vehiculoHelper = {
  getVehiculos,
  getResumenVehiculosPorPlaca,
  guardarVehiculo,
  crearVehiculo,
  getVehiculoById,
  getVehiculosPorEstado,
  getVehiculoOrdenadosPorDistancia,
  getVehiculoOrdenadosPorViajes,
  getVehiculosOrdenadosPorFechaPoliza,
  getVehiculosOrdenadosPorFechaSoat,
  getVehiculosOrdenadosPorFechaTecnico,
  editarVehiculoporPlaca,
  procesarArchivos,
  actualizarEstadoEnSheets,
  subirArchivosACarpetaExistente,
  buscarCarpetaPorNombre,
  actualizarOdometroVehiculo,
  estadoDocumento,
  normalizarPlaca,
};
