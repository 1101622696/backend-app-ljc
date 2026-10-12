import { leerHoja, actualizarCampos, agregarFila, aNumero, siguienteConsecutivo, conCandado } from './hoja.js';
import { ahora, hoy, mesActual, aFechaISO } from './fechas.js';
import { ErrorApp } from './errores.js';
import { obtenerCarpeta, subirArchivos, linkCarpeta } from './carpetas.js';
import { libroGastos } from './libro_gastos.js';
import { vehiculoHelper } from './vehiculos.js';
import { puedeVerPlaca } from '../middlewares/validar-rol.js';

// ─────────────────────────────────────────────────────────────
// Hoja "Combustible". Se lee y escribe por NOMBRE de columna.
// Columnas nuevas (agregarlas al final de los encabezados):
//   tanque_lleno | galones_acumulados | km_desde_lleno
//
// Rendimiento (regla acordada con el cliente):
//   Solo se calcula cuando el registro es TANQUE LLENO y existe un lleno anterior de la placa.
//   km      = odómetro actual − odómetro del último lleno anterior
//   galones = galones de los registros posteriores a ese lleno (parciales + el actual)
//   Así un tanqueo parcial no infla ni desinfla el rendimiento.
// ─────────────────────────────────────────────────────────────

const HOJA = 'Combustible';
const LLAVE_CANDADO = 'combustible';
const PREFIJO = 'COMB';
const RENDIMIENTO_POR_DEFECTO = 8;
const MARGEN_ALERTA = 1; // km/gal por debajo del esperado que disparan la alerta

export const COLUMNAS_COMBUSTIBLE = [
  'consecutivo', 'fecha_registro', 'placa', 'odometro_actual', 'galones_cargados', 'valor_pagado',
  'precio_por_galon', 'km_recorridos', 'rendimiento_real', 'rendimiento_esperado', 'diferencia_rendimiento',
  'alerta', 'correo_usuario', 'usuario', 'estado_factura', 'numero_factura', 'link_factura',
  // nuevas
  'tanque_lleno', 'galones_acumulados', 'km_desde_lleno',
];

const carpetaPadreId = () => process.env.CARPETA_PADRE_ID_COMBUSTIBLE;

// ── Formato ──

const redondear = (n, decimales = 2) => {
  const factor = 10 ** decimales;
  return Math.round((Number(n) + Number.EPSILON) * factor) / factor;
};

export const normalizarPlaca = (placa) => String(placa ?? '').replace(/\s+/g, '').toUpperCase();

const minuscula = (v) => String(v ?? '').trim().toLowerCase();

const numeroConsecutivo = (consecutivo) => {
  const n = parseInt(String(consecutivo ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

/** 'si'/'no' a partir de lo que mande el frontend. Vacío → 'si' (la app actual no lo envía) */
export const normalizarTanqueLleno = (valor) => {
  if (valor === undefined || valor === null || valor === '') return 'si';
  if (valor === true) return 'si';
  if (valor === false) return 'no';
  const texto = minuscula(valor).normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (['si', 'true', '1', 'yes', 'lleno'].includes(texto)) return 'si';
  if (['no', 'false', '0', 'parcial'].includes(texto)) return 'no';
  throw new ErrorApp(400, 'El campo tanque lleno debe ser "si" o "no"');
};

/** Fila de la hoja con placa, estados, correo y fecha normalizados */
const normalizarFila = (f) => {
  const fechaISO = aFechaISO(f.fecha_registro);
  return {
    ...f,
    consecutivo: String(f.consecutivo ?? '').trim(),
    placa: normalizarPlaca(f.placa),
    fecha_registro: fechaISO || f.fecha_registro || '',
    correo_usuario: minuscula(f.correo_usuario),
    estado_factura: minuscula(f.estado_factura),
    alerta: minuscula(f.alerta),
    // Registros anteriores a la columna nueva se consideran tanque lleno (era lo que suponía el cálculo viejo)
    tanque_lleno: minuscula(f.tanque_lleno) === 'no' ? 'no' : 'si',
  };
};

/** Quita _fila para responder al frontend */
const publico = (f) => {
  const { _fila, ...resto } = f;
  return resto;
};

/**
 * Número obligatorio y mayor que cero. aNumero devuelve 0 para texto inválido,
 * por eso basta con exigir > 0 (también evita dividir entre cero).
 */
const numeroPositivo = (valor, nombre) => {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    throw new ErrorApp(400, `El campo ${nombre} es obligatorio`);
  }
  const numero = aNumero(valor);
  if (!(numero > 0)) throw new ErrorApp(400, `El campo ${nombre} debe ser un número mayor que cero`);
  return numero;
};

const formatoMiles = (n) => Math.round(aNumero(n)).toLocaleString('es-CO');

/** 'AAAA-MM' | 'MM' (año actual) | vacío (mes actual) → 'AAAA-MM' */
export const normalizarMes = (valor) => {
  const texto = String(valor ?? '').trim();
  if (!texto) return mesActual();
  let anio;
  let mes;
  let m = texto.match(/^(\d{4})-(\d{1,2})$/);
  if (m) [, anio, mes] = m;
  else if ((m = texto.match(/^(\d{1,2})$/))) [anio, mes] = [mesActual().slice(0, 4), m[1]];
  else throw new ErrorApp(400, 'El mes debe tener el formato AAAA-MM (ej. 2026-10) o MM');
  if (Number(mes) < 1 || Number(mes) > 12) throw new ErrorApp(400, 'El mes debe estar entre 01 y 12');
  return `${anio}-${String(Number(mes)).padStart(2, '0')}`;
};

// ── Lectura ──

const leer = async () => {
  const { encabezados, filas } = await leerHoja(HOJA);
  return { encabezados, filas: filas.map(normalizarFila) };
};

const filtrarPorUsuario = (filas, usuario) => (usuario ? filas.filter((f) => puedeVerPlaca(usuario, f.placa)) : filas);

/** Más reciente primero: fecha y, en el mismo día, consecutivo mayor */
const compararRecientes = (a, b) => {
  const fa = String(a.fecha_registro);
  const fb = String(b.fecha_registro);
  if (fa !== fb) return fa < fb ? 1 : -1;
  return numeroConsecutivo(b.consecutivo) - numeroConsecutivo(a.consecutivo);
};

/** Orden cronológico de una placa: por odómetro y, si empata, por consecutivo */
const compararPorOdometro = (a, b) =>
  aNumero(a.odometro_actual) - aNumero(b.odometro_actual) || numeroConsecutivo(a.consecutivo) - numeroConsecutivo(b.consecutivo);

/** Todos los registros (usuario opcional: deja solo las placas que puede ver) */
const getTodosLosCombustibles = async (usuario) => {
  const { filas } = await leer();
  return filtrarPorUsuario(filas, usuario).map(publico);
};

/** Listado paginado, más reciente primero */
const getCombustibles = async (pagina = 1, limite = 50, usuario) => {
  const paginaFinal = Math.max(1, Math.floor(aNumero(pagina)) || 1);
  const limiteFinal = Math.min(500, Math.max(1, Math.floor(aNumero(limite)) || 50));

  const todos = (await getTodosLosCombustibles(usuario)).sort(compararRecientes);
  const inicio = (paginaFinal - 1) * limiteFinal;
  const datos = todos.slice(inicio, inicio + limiteFinal);

  return {
    datos,
    pagina: paginaFinal,
    limite: limiteFinal,
    hayMas: inicio + limiteFinal < todos.length,
    total: todos.length,
  };
};

const getCombustibleById = async (consecutivo) => {
  const buscado = minuscula(consecutivo);
  const { filas } = await leer();
  const fila = filas.find((f) => f.consecutivo.toLowerCase() === buscado);
  return fila ? publico(fila) : undefined;
};

const getResumenCombustiblesPorPlaca = async (placas) => {
  const lista = (Array.isArray(placas) ? placas : String(placas ?? '').split(',')).map(normalizarPlaca).filter(Boolean);
  const { filas } = await leer();
  const filtrados = filas.filter((f) => lista.includes(f.placa));

  const valor = (v) => v ?? ''; // ?? y no || para no convertir 0 en ''

  return {
    total: {
      count: filtrados.length,
      consecutivos: filtrados.map((r) => ({
        consecutivo: valor(r.consecutivo),
        fecha_registro: valor(r.fecha_registro),
        odometro_actual: valor(r.odometro_actual),
        galones_cargados: valor(r.galones_cargados),
        valor_pagado: valor(r.valor_pagado),
        precio_por_galon: valor(r.precio_por_galon),
        km_recorridos: valor(r.km_recorridos),
        alerta: valor(r.alerta),
        // nuevos (no cambian los anteriores)
        rendimiento_real: valor(r.rendimiento_real),
        tanque_lleno: valor(r.tanque_lleno),
      })),
    },
  };
};

// ── Filtros y ordenamientos ──

const filtrarCombustiblePorCampoTexto = (combustibles, campo, valor) =>
  combustibles.filter((c) => minuscula(c[campo]) === minuscula(valor));

const ordenarCombustiblePorCampoNumerico = (combustibles, campo, orden = 'desc') => {
  const signo = minuscula(orden) === 'asc' ? 1 : -1;
  return combustibles.sort((a, b) => signo * (aNumero(a[campo]) - aNumero(b[campo])));
};

const getCombustiblesOrdenadosPorGalones = async (orden = 'desc', usuario) =>
  ordenarCombustiblePorCampoNumerico(await getTodosLosCombustibles(usuario), 'galones_cargados', orden);

const getCombustiblesOrdenadosPorValorPagado = async (orden = 'desc', usuario) =>
  ordenarCombustiblePorCampoNumerico(await getTodosLosCombustibles(usuario), 'valor_pagado', orden);

const getCombustiblesOrdenadosPorPrecioPorGalon = async (orden = 'desc', usuario) =>
  ordenarCombustiblePorCampoNumerico(await getTodosLosCombustibles(usuario), 'precio_por_galon', orden);

const getCombustiblesOrdenadosPorRendimientoReal = async (orden = 'desc', usuario) => {
  // Los registros sin rendimiento (parciales o primer tanqueo) van al final en ambos órdenes
  const todos = await getTodosLosCombustibles(usuario);
  const con = todos.filter((c) => c.rendimiento_real !== '' && c.rendimiento_real !== null && c.rendimiento_real !== undefined);
  const sin = todos.filter((c) => !con.includes(c));
  return [...ordenarCombustiblePorCampoNumerico(con, 'rendimiento_real', orden), ...sin];
};

const getCombustiblesOrdenadosPorFecha = async (orden = 'desc', usuario) => {
  const todos = (await getTodosLosCombustibles(usuario)).sort(compararRecientes);
  return minuscula(orden) === 'asc' ? todos.reverse() : todos;
};

const getCombustiblesPorAlerta = async (valor, usuario) =>
  filtrarCombustiblePorCampoTexto(await getTodosLosCombustibles(usuario), 'alerta', valor);

const getCombustiblesPorEstadoFactura = async (valor, usuario) =>
  filtrarCombustiblePorCampoTexto(await getTodosLosCombustibles(usuario), 'estado_factura', valor);

const getCombustiblesPorTanqueLleno = async (valor, usuario) =>
  filtrarCombustiblePorCampoTexto(await getTodosLosCombustibles(usuario), 'tanque_lleno', normalizarTanqueLleno(valor));

/** mes: 'AAAA-MM' o 'MM' (año actual). Antes solo comparaba el mes y mezclaba años */
const getCombustiblesPorMes = async (mes, usuario) => {
  const buscado = normalizarMes(mes);
  const todos = await getTodosLosCombustibles(usuario);
  return todos.filter((c) => String(c.fecha_registro).startsWith(buscado)).sort(compararRecientes);
};

const getSiguienteConsecutivo = async () => {
  const { filas } = await leer();
  return siguienteConsecutivo(filas, 'consecutivo', PREFIJO);
};

// ── Rendimiento ──

const rendimientoEsperadoDe = (vehiculo, respaldo) => {
  const esperado = aNumero(vehiculo?.rendimiento_galon);
  if (esperado > 0) return esperado;
  const anterior = aNumero(respaldo);
  return anterior > 0 ? anterior : RENDIMIENTO_POR_DEFECTO;
};

/**
 * Calcula los campos de rendimiento de `actual` frente a los demás registros de la MISMA placa.
 * `otros` no debe incluir a `actual`. Es una función pura (se prueba sin hoja).
 */
export const calcularRendimiento = (otros, actual, rendimientoEsperado = RENDIMIENTO_POR_DEFECTO) => {
  const odometro = aNumero(actual.odometro_actual);
  const llave = { odometro_actual: odometro, consecutivo: actual.consecutivo };

  // Registros anteriores en orden cronológico (por odómetro, no por posición en la hoja)
  const anteriores = otros.filter((r) => compararPorOdometro(r, llave) < 0).sort(compararPorOdometro);
  const anterior = anteriores[anteriores.length - 1];

  const resultado = {
    km_recorridos: anterior ? redondear(odometro - aNumero(anterior.odometro_actual)) : 0,
    rendimiento_real: '',
    rendimiento_esperado: rendimientoEsperado,
    diferencia_rendimiento: '',
    alerta: 'no',
    galones_acumulados: '',
    km_desde_lleno: '',
  };

  if (normalizarTanqueLleno(actual.tanque_lleno) !== 'si') return resultado;

  let indiceLleno = -1;
  for (let i = anteriores.length - 1; i >= 0; i--) {
    if (normalizarTanqueLleno(anteriores[i].tanque_lleno) === 'si') {
      indiceLleno = i;
      break;
    }
  }
  if (indiceLleno === -1) return resultado; // primer lleno de la placa: no hay contra qué medir

  const lleno = anteriores[indiceLleno];
  const galones = anteriores.slice(indiceLleno + 1).reduce((s, r) => s + aNumero(r.galones_cargados), 0) + aNumero(actual.galones_cargados);
  const km = odometro - aNumero(lleno.odometro_actual);
  if (!(galones > 0)) return resultado;

  const rendimiento = redondear(km / galones);
  return {
    ...resultado,
    rendimiento_real: rendimiento,
    diferencia_rendimiento: redondear(rendimiento - rendimientoEsperado),
    alerta: rendimiento < rendimientoEsperado - MARGEN_ALERTA ? 'si' : 'no',
    galones_acumulados: redondear(galones),
    km_desde_lleno: redondear(km),
  };
};

const mensajeRendimiento = ({ alerta, rendimiento_real, rendimiento_esperado }, tanqueLleno) => {
  if (alerta === 'si') {
    return `⚠️ Alerta: Rendimiento bajo (${rendimiento_real} km/gal vs ${rendimiento_esperado} km/gal esperado)`;
  }
  if (tanqueLleno !== 'si') return 'Registro exitoso. Tanqueo parcial: el rendimiento se calcula cuando se llene el tanque';
  return 'Registro exitoso';
};

const descripcionGasto = (r) =>
  `Combustible ${r.consecutivo} - ${redondear(aNumero(r.galones_cargados))} gal${r.tanque_lleno === 'si' ? ' (tanque lleno)' : ' (parcial)'}`;

/** Solo las columnas cuyo valor cambió (para no reescribir celdas iguales) */
const soloCambios = (fila, cambios) =>
  Object.fromEntries(Object.entries(cambios).filter(([campo, valor]) => String(fila[campo] ?? '') !== String(valor ?? '')));

const CAMPOS_RENDIMIENTO = ['km_recorridos', 'rendimiento_real', 'rendimiento_esperado', 'diferencia_rendimiento', 'alerta', 'galones_acumulados', 'km_desde_lleno'];

/**
 * Recalcula los registros de la placa posteriores a `desde` (sus ventanas de rendimiento
 * pueden incluir el registro que se creó o editó). Se llama dentro del candado.
 */
const recalcularPosteriores = async (encabezados, filas, placa, desde) => {
  const dePlaca = filas.filter((f) => f.placa === placa).sort(compararPorOdometro);
  const posteriores = desde ? dePlaca.filter((f) => compararPorOdometro(f, desde) > 0) : dePlaca;

  for (const registro of posteriores) {
    const otros = dePlaca.filter((f) => f !== registro);
    const calculado = calcularRendimiento(otros, registro, rendimientoEsperadoDe(null, registro.rendimiento_esperado));
    const cambios = soloCambios(registro, Object.fromEntries(CAMPOS_RENDIMIENTO.map((c) => [c, calculado[c]])));
    if (Object.keys(cambios).length) {
      await actualizarCampos(HOJA, encabezados, registro._fila, cambios, { omitirFaltantes: true });
      Object.assign(registro, cambios);
    }
  }
};

// ── Archivos (Drive) ──

/** Sube las facturas a la carpeta de la placa y devuelve el link de la carpeta */
const procesarArchivos = async (archivos, placa, prefijo = '') => {
  if (!archivos || archivos.length === 0) return null;
  const carpeta = await obtenerCarpeta(normalizarPlaca(placa), carpetaPadreId());
  await subirArchivos(archivos, carpeta.id, prefijo);
  return carpeta.link;
};

const extraerFolderId = (link) => {
  const m = String(link ?? '').match(/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
};

const subirArchivosACarpetaExistente = async (archivos, carpetaId, prefijo = '') => {
  if (!archivos || archivos.length === 0) return null;
  await subirArchivos(archivos, carpetaId, prefijo);
  return linkCarpeta(carpetaId);
};

// ── Escritura ──

/**
 * Si al editar se corrige la placa, el gasto ya registrado pasa a la placa nueva.
 * (libroGastos busca por placa + tipo + código; sin esto quedaría un gasto duplicado en la placa vieja)
 */
const moverGastoDePlaca = (consecutivo, placaAnterior, placaNueva) =>
  conCandado('gastos_vehiculos', async () => {
    const HOJA_GASTOS = 'Gastos_Vehiculos';
    const { encabezados, filas } = await leerHoja(HOJA_GASTOS);
    const gasto = filas.find(
      (f) => minuscula(f.tipo_gasto) === 'combustible' && minuscula(f.codigo_referencia) === minuscula(consecutivo) && normalizarPlaca(f.placa) === placaAnterior
    );
    if (gasto) await actualizarCampos(HOJA_GASTOS, encabezados, gasto._fila, { placa: placaNueva });
  });

/**
 * Registra un tanqueo. `placa` ya debe venir validada contra el usuario (controlador).
 * Valida números, odómetro contra el vehículo, calcula rendimiento, sube la factura,
 * guarda la fila, registra el gasto y actualiza el odómetro del vehículo.
 */
const registrarCombustible = async ({
  placa, odometro_actual, galones_cargados, valor_pagado, tanque_lleno,
  correo_usuario, usuario, archivos, link_factura,
}) => {
  const placaFinal = normalizarPlaca(placa);
  if (!placaFinal) throw new ErrorApp(400, 'Debe indicar la placa');

  const odometro = numeroPositivo(odometro_actual, 'odómetro');
  const galones = numeroPositivo(galones_cargados, 'galones cargados');
  const valor = numeroPositivo(valor_pagado, 'valor pagado');
  const lleno = normalizarTanqueLleno(tanque_lleno);

  if ((!archivos || archivos.length === 0) && !link_factura) {
    throw new ErrorApp(400, 'Debe adjuntar la factura de combustible');
  }

  const vehiculo = await vehiculoHelper.getVehiculoById(placaFinal);
  if (!vehiculo) throw new ErrorApp(404, `No se encontró el vehículo con placa ${placaFinal}`);

  const odometroVehiculo = aNumero(vehiculo.odometro);
  if (odometro < odometroVehiculo) {
    throw new ErrorApp(400, `El odómetro no puede ser menor al registrado (${formatoMiles(odometroVehiculo)} km)`);
  }

  const rendimientoEsperado = rendimientoEsperadoDe(vehiculo);
  const fecha_registro = hoy();

  // Consecutivo, cálculo y escritura en el mismo candado: dos tanqueos simultáneos
  // no repiten consecutivo ni calculan con la hoja desactualizada.
  const registro = await conCandado(LLAVE_CANDADO, async () => {
    const { encabezados, filas } = await leer();
    const consecutivo = siguienteConsecutivo(filas, 'consecutivo', PREFIJO);

    const nuevo = { consecutivo, placa: placaFinal, odometro_actual: odometro, galones_cargados: galones, tanque_lleno: lleno };
    const calculo = calcularRendimiento(filas.filter((f) => f.placa === placaFinal), nuevo, rendimientoEsperado);

    const link = archivos && archivos.length
      ? await procesarArchivos(archivos, placaFinal, `${consecutivo} - `)
      : link_factura;

    const fila = {
      ...nuevo,
      fecha_registro,
      valor_pagado: valor,
      precio_por_galon: redondear(valor / galones),
      ...calculo,
      correo_usuario: minuscula(correo_usuario),
      usuario: usuario ?? '',
      estado_factura: 'pendiente',
      numero_factura: '',
      link_factura: link || '',
    };

    await agregarFila(HOJA, encabezados, fila);
    return fila;
  });

  // Lo que sigue ya no debe hacer fallar el registro (la fila existe; un reintento la duplicaría)
  const advertencias = [];
  try {
    await libroGastos.registrarOActualizar({
      placa: placaFinal,
      tipo_gasto: 'combustible',
      codigo_referencia: registro.consecutivo,
      valor_gasto: valor,
      descripcion: descripcionGasto(registro),
      fecha_registro,
      link_soporte: registro.link_factura,
    });
  } catch (error) {
    console.error(`Combustible ${registro.consecutivo}: no se pudo registrar el gasto:`, error);
    advertencias.push('No se pudo registrar el gasto en el libro del vehículo');
  }

  try {
    if (odometro > odometroVehiculo) await vehiculoHelper.actualizarOdometroVehiculo(placaFinal, odometro);
  } catch (error) {
    console.error(`Combustible ${registro.consecutivo}: no se pudo actualizar el odómetro de ${placaFinal}:`, error);
    advertencias.push('No se pudo actualizar el odómetro del vehículo');
  }

  return {
    consecutivo: registro.consecutivo,
    placa: placaFinal,
    // 0 cuando no aplica (como antes) para no romper el frontend; rendimiento_calculado lo aclara
    rendimiento_real: registro.rendimiento_real === '' ? 0 : registro.rendimiento_real,
    rendimiento_calculado: registro.rendimiento_real !== '',
    rendimiento_esperado: registro.rendimiento_esperado,
    km_recorridos: registro.km_recorridos,
    precio_por_galon: registro.precio_por_galon,
    tanque_lleno: registro.tanque_lleno,
    alerta: registro.alerta,
    mensaje: mensajeRendimiento(registro, registro.tanque_lleno),
    advertencias,
  };
};

const exigirPermiso = (usuario, placa) => {
  if (usuario && !puedeVerPlaca(usuario, placa)) {
    throw new ErrorApp(403, 'No tiene permiso para este registro', 'SIN_PERMISO');
  }
};

/** Legaliza la factura: estado 'legalizado' y número de factura obligatorio */
const legalizarCombustible = async (consecutivo, numero_factura, usuario) => {
  const numero = String(numero_factura ?? '').trim();
  if (!numero) throw new ErrorApp(400, 'Debe indicar el número de factura para legalizar');

  return conCandado(LLAVE_CANDADO, async () => {
    const { encabezados, filas } = await leer();
    const fila = filas.find((f) => f.consecutivo.toLowerCase() === minuscula(consecutivo));
    if (!fila) throw new ErrorApp(404, 'Registro de combustible no encontrado');
    exigirPermiso(usuario, fila.placa);
    if (fila.estado_factura === 'legalizado') throw new ErrorApp(400, 'Este registro ya está legalizado');

    await actualizarCampos(HOJA, encabezados, fila._fila, { estado_factura: 'legalizado', numero_factura: numero });

    return {
      consecutivo: fila.consecutivo,
      placa: fila.placa,
      valor: fila.valor_pagado,
      numero_factura: numero,
      mensaje: 'Combustible legalizado correctamente',
    };
  });
};

/** El campo vino en la petición (undefined, null y '' = no se quiere cambiar). 0 sí cuenta. */
const vino = (datos, campo) => datos[campo] !== undefined && datos[campo] !== null && String(datos[campo]).trim() !== '';

/**
 * Edita un registro y recalcula: precio por galón, rendimiento (del editado y de los posteriores
 * de la placa), gasto en Gastos_Vehiculos y, si sube, el odómetro del vehículo.
 * Devuelve null si no existe (el controlador responde 404).
 * nuevosDatos.archivos: facturas nuevas (multer). usuario: para validar permisos (opcional).
 */
const editarCombustibleporConsecutivo = async (consecutivo, nuevosDatos = {}, usuario) => {
  const resultado = await conCandado(LLAVE_CANDADO, async () => {
    const { encabezados, filas } = await leer();
    const fila = filas.find((f) => f.consecutivo.toLowerCase() === minuscula(consecutivo));
    if (!fila) return null;
    exigirPermiso(usuario, fila.placa);

    const placa = vino(nuevosDatos, 'placa') ? normalizarPlaca(nuevosDatos.placa) : fila.placa;
    exigirPermiso(usuario, placa);
    const cambioPlaca = placa !== fila.placa;

    const odometro = vino(nuevosDatos, 'odometro_actual') ? numeroPositivo(nuevosDatos.odometro_actual, 'odómetro') : aNumero(fila.odometro_actual);
    const galones = vino(nuevosDatos, 'galones_cargados') ? numeroPositivo(nuevosDatos.galones_cargados, 'galones cargados') : aNumero(fila.galones_cargados);
    const valor = vino(nuevosDatos, 'valor_pagado') ? numeroPositivo(nuevosDatos.valor_pagado, 'valor pagado') : aNumero(fila.valor_pagado);
    const lleno = vino(nuevosDatos, 'tanque_lleno') ? normalizarTanqueLleno(nuevosDatos.tanque_lleno) : fila.tanque_lleno;

    if (!(galones > 0)) throw new ErrorApp(400, 'El registro no tiene galones válidos; envíe galones cargados');
    if (!(valor > 0)) throw new ErrorApp(400, 'El registro no tiene valor pagado válido; envíe el valor pagado');
    if (!(odometro > 0)) throw new ErrorApp(400, 'El registro no tiene odómetro válido; envíe el odómetro');

    const vehiculo = await vehiculoHelper.getVehiculoById(placa);
    if (cambioPlaca && !vehiculo) throw new ErrorApp(404, `No se encontró el vehículo con placa ${placa}`);

    const editado = { ...fila, placa, odometro_actual: odometro, galones_cargados: galones, tanque_lleno: lleno };
    const otros = filas.filter((f) => f.placa === placa && f !== fila);
    const calculo = calcularRendimiento(otros, editado, rendimientoEsperadoDe(vehiculo, fila.rendimiento_esperado));

    let link_factura = fila.link_factura;
    if (nuevosDatos.archivos && nuevosDatos.archivos.length) {
      link_factura = await procesarArchivos(nuevosDatos.archivos, placa, `${fila.consecutivo} - `);
    }

    const cambios = soloCambios(fila, {
      placa,
      odometro_actual: odometro,
      galones_cargados: galones,
      valor_pagado: valor,
      precio_por_galon: redondear(valor / galones),
      tanque_lleno: lleno,
      link_factura,
      ...calculo,
    });
    const placaAnterior = fila.placa;
    const claveAnterior = { odometro_actual: fila.odometro_actual, consecutivo: fila.consecutivo };
    if (Object.keys(cambios).length) {
      await actualizarCampos(HOJA, encabezados, fila._fila, cambios, { omitirFaltantes: true });
      Object.assign(fila, cambios);
    }

    // Los tanqueos siguientes usan a este registro en su cálculo: se recalculan.
    // Si bajó el odómetro, se recalcula desde la posición más temprana (vieja o nueva).
    const desde = compararPorOdometro(claveAnterior, fila) < 0 ? claveAnterior : fila;
    await recalcularPosteriores(encabezados, filas, placa, desde);
    if (cambioPlaca) await recalcularPosteriores(encabezados, filas, placaAnterior, claveAnterior);

    return { fila, placaAnterior: cambioPlaca ? placaAnterior : '', vehiculo, odometro };
  });

  if (!resultado) return null;
  const { fila, placaAnterior, vehiculo, odometro } = resultado;

  // El gasto se registró con la placa vieja: se mueve a la nueva para no duplicarlo
  if (placaAnterior) await moverGastoDePlaca(fila.consecutivo, placaAnterior, fila.placa);

  // Mantener el gasto sincronizado con el registro (antes quedaba con el valor viejo)
  await libroGastos.registrarOActualizar({
    placa: fila.placa,
    tipo_gasto: 'combustible',
    codigo_referencia: fila.consecutivo,
    valor_gasto: fila.valor_pagado,
    descripcion: descripcionGasto(fila),
    fecha_registro: aFechaISO(fila.fecha_registro) || hoy(),
    link_soporte: fila.link_factura,
  });

  if (vehiculo && odometro > aNumero(vehiculo.odometro)) {
    await vehiculoHelper.actualizarOdometroVehiculo(fila.placa, odometro);
  }

  return {
    consecutivo: fila.consecutivo,
    alerta: fila.alerta,
    rendimiento_real: fila.rendimiento_real === '' ? 0 : fila.rendimiento_real,
    rendimiento_calculado: fila.rendimiento_real !== '',
    km_recorridos: fila.km_recorridos,
    precio_por_galon: fila.precio_por_galon,
    tanque_lleno: fila.tanque_lleno,
    fecha_edicion: ahora(),
  };
};

/**
 * Rendimiento acumulado del mes de una placa.
 * km = último odómetro del mes − primero; galones para el rendimiento = los cargados DESPUÉS
 * del primer tanqueo del mes (el primero llenó el tanque para recorrer esos km).
 */
const rendimientoMensual = async (placa, mes) => {
  const placaFinal = normalizarPlaca(placa);
  if (!placaFinal) throw new ErrorApp(400, 'Debe indicar la placa');
  const mesFinal = normalizarMes(mes);

  const { filas } = await leer();
  const delMes = filas
    .filter((f) => f.placa === placaFinal && String(f.fecha_registro).startsWith(mesFinal))
    .sort(compararPorOdometro);

  const vehiculo = await vehiculoHelper.getVehiculoById(placaFinal);
  const esperado = rendimientoEsperadoDe(vehiculo);

  const primero = delMes[0];
  const ultimo = delMes[delMes.length - 1];
  const km = delMes.length > 1 ? redondear(aNumero(ultimo.odometro_actual) - aNumero(primero.odometro_actual)) : 0;
  const galonesMes = redondear(delMes.reduce((s, f) => s + aNumero(f.galones_cargados), 0));
  const galonesRendimiento = redondear(delMes.slice(1).reduce((s, f) => s + aNumero(f.galones_cargados), 0));
  const rendimiento = galonesRendimiento > 0 ? redondear(km / galonesRendimiento) : null;

  return {
    placa: placaFinal,
    mes: mesFinal,
    registros: delMes.length,
    odometro_inicial: primero ? aNumero(primero.odometro_actual) : null,
    odometro_final: ultimo ? aNumero(ultimo.odometro_actual) : null,
    km_recorridos: km,
    galones_cargados: galonesMes,
    galones_rendimiento: galonesRendimiento,
    valor_pagado: Math.round(delMes.reduce((s, f) => s + aNumero(f.valor_pagado), 0)),
    rendimiento,
    rendimiento_esperado: esperado,
    alerta: rendimiento !== null && rendimiento < esperado - MARGEN_ALERTA ? 'si' : 'no',
    tanqueos: delMes.map(publico),
  };
};

export const combustibleHelper = {
  getSiguienteConsecutivo,
  getCombustibleById,
  getResumenCombustiblesPorPlaca,
  getCombustibles,
  getTodosLosCombustibles,
  getCombustiblesOrdenadosPorGalones,
  getCombustiblesOrdenadosPorValorPagado,
  getCombustiblesOrdenadosPorPrecioPorGalon,
  getCombustiblesOrdenadosPorRendimientoReal,
  getCombustiblesOrdenadosPorFecha,
  getCombustiblesPorAlerta,
  getCombustiblesPorEstadoFactura,
  getCombustiblesPorTanqueLleno,
  getCombustiblesPorMes,
  registrarCombustible,
  legalizarCombustible,
  editarCombustibleporConsecutivo,
  rendimientoMensual,
  calcularRendimiento,
  normalizarTanqueLleno,
  normalizarMes,
  procesarArchivos,
  extraerFolderId,
  subirArchivosACarpetaExistente,
};
