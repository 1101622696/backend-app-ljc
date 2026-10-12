import { leerHoja, actualizarCampos, agregarFila, aNumero, siguienteConsecutivo, conCandado } from './hoja.js';
import { obtenerCarpeta, subirArchivos } from './carpetas.js';
import { clienteHelper } from './clientes.js';
import { vehiculoHelper } from './vehiculos.js';
import { usuarioHelper } from './usuarios.js';
import { detalleGastosViajesHelper as detalle } from './detalles_gastos.js';
import { ahora, hoy, aFechaISO, parsearFecha } from './fechas.js';
import { ErrorApp } from './errores.js';
import {
  ESTADOS,
  ESTADOS_ABIERTOS,
  ESTADOS_LIQUIDABLES,
  PREOPERACIONAL,
  TIPOS_GASTO,
  ETIQUETAS_GASTO,
  requiereSoporte,
  normalizarKilos,
  validarPrecioTonelada,
  validarDescargue,
  calcularViaje,
} from './calculos_viaje.js';

// ─────────────────────────────────────────────────────────────
// Hoja "Viajes" leída y escrita por NOMBRE de columna.
// Flujo: solicitado → anticipo_consignado → (preoperacional) → completado → aprobado → facturado → pagado
// Toda escritura pasa por conCandado('viajes'): un doble toque no cierra/aprueba dos veces.
// ─────────────────────────────────────────────────────────────

const HOJA = 'Viajes';
const CANDADO = 'viajes';
const carpetaPadreId = process.env.CARPETA_PADRE_ID_VIAJES;

const PERFIL = { ADMIN: 'administrador', PROPIETARIO: 'propietario', CONDUCTOR: 'conductor' };

// Lo que el conductor no ve del viaje (finanzas del propietario y del cliente)
const CAMPOS_SOLO_GESTION = [
  'total_gastos_propietario', 'ganancia_viaje_estimada', 'ganancia_viaje_real', 'link_gastos_propietario',
  'valor_anticipo_cliente', 'descuento_rete_fuente', 'descuento_rete_ica', 'total_descuentos_cliente',
  'saldo_pendiente_cliente_sin_descuento', 'saldo_pendiente_cliente_real', 'estado_saldo_cliente',
  'diferencia_precio', 'valor_merma', 'diferencia_facturacion', 'notas_facturacion',
];

// ── Lectura ──

const textoMinuscula = (v) => String(v ?? '').trim().toLowerCase();

const normalizar = (fila) => ({
  ...fila,
  consecutivo: String(fila.consecutivo ?? '').trim().toUpperCase(),
  placa: String(fila.placa ?? '').trim().toUpperCase(),
  cliente: String(fila.cliente ?? '').trim(),
  correo_usuario: textoMinuscula(fila.correo_usuario),
  estado_viaje: textoMinuscula(fila.estado_viaje),
  estado_preoperacional: textoMinuscula(fila.estado_preoperacional) || PREOPERACIONAL.PENDIENTE,
  estado_saldo_cliente: textoMinuscula(fila.estado_saldo_cliente) || 'pendiente',
  liquidado: textoMinuscula(fila.liquidado) || 'no',
  fecha_inicio: aFechaISO(fila.fecha_inicio) || String(fila.fecha_inicio ?? ''),
  fecha_fin_viaje: aFechaISO(fila.fecha_fin_viaje) || String(fila.fecha_fin_viaje ?? ''),
});

const numero = (consecutivo) => parseInt(String(consecutivo).replace(/\D/g, ''), 10) || 0;
const masRecientePrimero = (a, b) => numero(b.consecutivo) - numero(a.consecutivo);

async function leerViajes() {
  const { encabezados, filas } = await leerHoja(HOJA);
  const viajes = filas.filter((f) => f.consecutivo).map(normalizar);
  return { encabezados, viajes };
}

/** Todos los viajes (uso interno: nómina, alertas, resumen). Más reciente primero */
const getTodosLosViajes = async () => {
  const { viajes } = await leerViajes();
  return viajes.sort(masRecientePrimero).map(({ _fila, ...v }) => v);
};

async function buscarViaje(consecutivo) {
  const { encabezados, viajes } = await leerViajes();
  const buscado = String(consecutivo ?? '').trim().toUpperCase();
  const viaje = viajes.find((v) => v.consecutivo === buscado);
  if (!viaje) throw new ErrorApp(404, `No existe el viaje ${buscado}`);
  return { encabezados, viaje, viajes };
}

async function escribir(encabezados, viaje, cambios) {
  await actualizarCampos(HOJA, encabezados, viaje._fila, cambios, { omitirFaltantes: true });
  Object.assign(viaje, cambios);
}

// ── Permisos ──

const placasDe = (usuario) => usuarioHelper.listaPlacas(usuario?.placa_asignada);
const esAdmin = (usuario) => usuario?.perfil === PERFIL.ADMIN;
const esGestion = (usuario) => [PERFIL.ADMIN, PERFIL.PROPIETARIO].includes(usuario?.perfil);

const puedeVerViaje = (usuario, viaje) => esAdmin(usuario) || placasDe(usuario).includes(viaje.placa);

function exigirAcceso(usuario, viaje) {
  if (!puedeVerViaje(usuario, viaje)) throw new ErrorApp(404, `No existe el viaje ${viaje.consecutivo}`);
}

function exigirGestion(usuario, viaje) {
  exigirAcceso(usuario, viaje);
  if (!esGestion(usuario)) throw new ErrorApp(403, 'Solo el propietario o el administrador pueden hacer esto');
}

/** Lo que se le muestra a cada perfil */
const vistaPara = (usuario, viaje) => {
  const { _fila, ...copia } = viaje;
  if (usuario?.perfil === PERFIL.CONDUCTOR) CAMPOS_SOLO_GESTION.forEach((c) => delete copia[c]);
  return copia;
};

const NOMBRES_ESTADO = {
  [ESTADOS.SOLICITADO]: 'solicitado (falta consignar el anticipo)',
  [ESTADOS.CONSIGNADO]: 'con anticipo consignado',
  [ESTADOS.COMPLETADO]: 'cerrado por el conductor (pendiente de aprobar)',
  [ESTADOS.APROBADO]: 'aprobado',
  [ESTADOS.FACTURADO]: 'facturado',
  [ESTADOS.PAGADO]: 'pagado por el cliente',
};

function exigirEstado(viaje, ...permitidos) {
  if (!permitidos.includes(viaje.estado_viaje)) {
    throw new ErrorApp(409, `El viaje ${viaje.consecutivo} está ${NOMBRES_ESTADO[viaje.estado_viaje] || viaje.estado_viaje}. Esta acción no aplica.`);
  }
}

// ── Datos relacionados ──

async function buscarCliente(codigo) {
  const clientes = await clienteHelper.getClientes();
  return clientes.find((c) => String(c.codigo ?? '').trim().toLowerCase() === String(codigo ?? '').trim().toLowerCase()) || null;
}

async function nombresClientes() {
  const clientes = await clienteHelper.getClientes();
  return Object.fromEntries(clientes.map((c) => [String(c.codigo ?? '').trim(), c.empresa || '']));
}

async function capacidadDe(placa) {
  const vehiculo = await vehiculoHelper.getVehiculoById(placa);
  return aNumero(vehiculo?.capacidad_ton);
}

// ── Archivos ──

/** Agrupa req.files (upload.any) por nombre de campo */
export const agruparArchivos = (files = []) =>
  files.reduce((grupos, archivo) => {
    (grupos[archivo.fieldname] ||= []).push(archivo);
    return grupos;
  }, {});

async function carpetaViaje(consecutivo, subcarpeta = null) {
  const carpeta = await obtenerCarpeta(consecutivo, carpetaPadreId);
  if (!subcarpeta) return carpeta;
  return obtenerCarpeta(subcarpeta, carpeta.id);
}

// ── Gastos que vienen del formulario ──

/**
 * Lee del formulario los gastos de 'conductor' o 'propietario'.
 * Campos: {tipo}_{quien} (valor), tipo_factura_{tipo}_{quien}, descripcion_{tipo}_{quien},
 *         archivos en {tipo}_{quien}_archivos
 * Solo devuelve los tipos que vinieron en el formulario.
 */
function leerGastosFormulario(datos, archivos, quien) {
  return TIPOS_GASTO.filter((tipo) => datos[`${tipo}_${quien}`] !== undefined).map((tipo) => {
    const valor = Math.round(aNumero(datos[`${tipo}_${quien}`]));
    if (valor < 0) throw new ErrorApp(400, `El valor de ${ETIQUETAS_GASTO[tipo]} no puede ser negativo`);
    return {
      tipo,
      valor,
      tipo_factura: datos[`tipo_factura_${tipo}_${quien}`],
      descripcion: String(datos[`descripcion_${tipo}_${quien}`] ?? '').trim(),
      archivos: archivos[`${tipo}_${quien}_archivos`] || [],
    };
  });
}

/**
 * Valida soportes y descripción. exigirSoporte=false cuando el propietario corrige al aprobar.
 * existentes: gastos ya guardados de ese quien (si ya tiene soporte no se vuelve a pedir).
 */
function validarGastos(gastos, quien, existentes = {}, exigirSoporte = true) {
  for (const g of gastos) {
    if (g.valor <= 0) continue;
    const etiqueta = ETIQUETAS_GASTO[g.tipo];
    if (g.tipo === 'otro' && !g.descripcion && !existentes.otro?.descripcion) {
      throw new ErrorApp(400, `Describa en qué fue el gasto "Otro" (${quien})`);
    }
    if (exigirSoporte && requiereSoporte(g.tipo, quien) && !g.archivos.length && !existentes[g.tipo]?.link_soporte) {
      throw new ErrorApp(400, `Adjunte el soporte de ${etiqueta} (${quien})`);
    }
  }
}

/** Sube los soportes y guarda en Detalle_Gastos_Viajes. Devuelve { total, link } */
async function guardarGastosConSoportes(consecutivo, quien, gastos) {
  const conArchivos = gastos.filter((g) => g.archivos.length);
  let link = '';
  if (conArchivos.length) {
    const carpeta = await carpetaViaje(consecutivo, quien === 'conductor' ? 'Gastos_Conductor' : 'Gastos_Propietario');
    link = carpeta.link;
    for (const g of conArchivos) {
      await subirArchivos(g.archivos, carpeta.id, `${ETIQUETAS_GASTO[g.tipo]} - `);
      g.link = carpeta.link;
    }
  }
  const total = await detalle.guardarGastos(consecutivo, quien, gastos);
  return { total, link };
}

// ── Gasto del viaje en Gastos_Vehiculos (uno por viaje, se actualiza si cambia) ──

async function registrarGastoVehiculo(viaje) {
  const HOJA_GASTOS = 'Gastos_Vehiculos';
  const { encabezados, filas } = await leerHoja(HOJA_GASTOS);
  const valor = aNumero(viaje.total_gastos_conductor) + aNumero(viaje.total_gastos_propietario);
  const existente = filas.find(
    (f) => textoMinuscula(f.tipo_gasto) === 'viaje' && String(f.codigo_referencia).trim().toUpperCase() === viaje.consecutivo
  );
  const descripcion = `Gastos del viaje ${viaje.consecutivo} (conductor + propietario)`;

  if (existente) {
    await actualizarCampos(HOJA_GASTOS, encabezados, existente._fila, { valor_gasto: valor, descripcion }, { omitirFaltantes: true });
  } else {
    await agregarFila(HOJA_GASTOS, encabezados, {
      consecutivo: siguienteConsecutivo(filas, 'consecutivo', 'G'),
      fecha_registro: viaje.fecha_fin_viaje || hoy(),
      placa: viaje.placa,
      tipo_gasto: 'viaje',
      codigo_referencia: viaje.consecutivo,
      valor_gasto: valor,
      descripcion,
      link_soporte: viaje.link_carpeta || '',
    });
  }
}

// ── Contadores de viajes (cliente, vehículo, conductor). Se suman una sola vez, al aprobar ──

async function sumarContador(hoja, campoLlave, valorLlave, campoContador) {
  try {
    const { encabezados, filas } = await leerHoja(hoja);
    const fila = filas.find((f) => String(f[campoLlave] ?? '').trim().toLowerCase() === String(valorLlave).trim().toLowerCase());
    if (!fila) return;
    await actualizarCampos(hoja, encabezados, fila._fila, { [campoContador]: aNumero(fila[campoContador]) + 1 }, { omitirFaltantes: true });
  } catch (error) {
    console.warn(`[viajes] No se pudo actualizar el contador en ${hoja}:`, error.message);
  }
}

async function sumarContadores(viaje) {
  await sumarContador('Clientes', 'codigo', viaje.cliente, 'viajes');
  await sumarContador('Vehiculos', 'placa', viaje.placa, 'viajes');
  await sumarContador('Usuarios', 'email', viaje.correo_usuario, 'viajes_realizados');
  usuarioHelper.invalidarCache();
}

// ─────────────────────────────────────────────────────────────
// 1. SOLICITAR ANTICIPO (crear viaje)
// ─────────────────────────────────────────────────────────────

async function resolverPlacaYConductor(usuario, datos) {
  const placaPedida = String(datos.placa ?? '').trim().toUpperCase();
  let placa;
  let conductor;

  if (usuario.perfil === PERFIL.CONDUCTOR) {
    const mias = placasDe(usuario);
    if (!mias.length) throw new ErrorApp(400, 'No tiene una placa asignada. Comuníquese con el administrador.');
    if (mias.length > 1 && !placaPedida) throw new ErrorApp(400, 'Seleccione la placa del viaje');
    placa = placaPedida || mias[0];
    if (!mias.includes(placa)) throw new ErrorApp(403, `La placa ${placa} no está asignada a usted`);
    conductor = await usuarioHelper.getUsuarioByEmail(usuario.email);
  } else {
    if (!placaPedida) throw new ErrorApp(400, 'Seleccione la placa del viaje');
    if (!esAdmin(usuario) && !placasDe(usuario).includes(placaPedida)) {
      throw new ErrorApp(403, `La placa ${placaPedida} no es suya`);
    }
    placa = placaPedida;

    // El viaje es del conductor (para su nómina), no de quien lo registra
    const conductores = (await usuarioHelper.getUsuarios()).filter(
      (u) => u.perfil === PERFIL.CONDUCTOR && u.estado === 'activo' && usuarioHelper.placasDe(u).includes(placa)
    );
    const correoPedido = usuarioHelper.normalizarEmail(datos.correo_conductor);
    if (correoPedido) {
      conductor = conductores.find((c) => c.email === correoPedido);
      if (!conductor) throw new ErrorApp(400, `El conductor seleccionado no tiene asignada la placa ${placa}`);
    } else if (conductores.length === 1) {
      conductor = conductores[0];
    } else if (!conductores.length) {
      throw new ErrorApp(400, `La placa ${placa} no tiene un conductor activo asignado`);
    } else {
      throw new ErrorApp(400, `La placa ${placa} tiene varios conductores. Seleccione cuál hace el viaje.`);
    }
  }

  return { placa, conductor };
}

const crearViaje = (usuario, datos) =>
  conCandado(CANDADO, async () => {
    const { placa, conductor } = await resolverPlacaYConductor(usuario, datos);

    const vehiculo = await vehiculoHelper.getVehiculoById(placa);
    if (!vehiculo) throw new ErrorApp(404, `No existe el vehículo ${placa}`);
    if (textoMinuscula(vehiculo.estado) === 'inactivo') throw new ErrorApp(400, `El vehículo ${placa} está inactivo`);

    const cliente = await buscarCliente(datos.cliente);
    if (!cliente) throw new ErrorApp(400, 'Seleccione un cliente válido');
    if (textoMinuscula(cliente.estado) === 'inactivo') throw new ErrorApp(400, `El cliente ${cliente.empresa} está inactivo`);

    const destino = String(datos.destino ?? '').trim();
    if (!destino) throw new ErrorApp(400, 'Ingrese el destino');

    const fechaInicio = aFechaISO(datos.fecha_inicio);
    if (!fechaInicio) throw new ErrorApp(400, 'Ingrese la fecha de inicio del viaje');

    const anticipo = Math.round(aNumero(datos.valor_anticipo_conductor));
    if (anticipo <= 0) throw new ErrorApp(400, 'Ingrese el valor del anticipo');

    const precioInicial = validarPrecioTonelada(datos.valor_tonelada_inicial, 'valor de la tonelada inicial');

    const { encabezados, viajes } = await leerViajes();

    const abierto = viajes.find((v) => v.placa === placa && ESTADOS_ABIERTOS.includes(v.estado_viaje));
    if (abierto) {
      throw new ErrorApp(
        409,
        `La placa ${placa} ya tiene el viaje ${abierto.consecutivo} abierto (${NOMBRES_ESTADO[abierto.estado_viaje]}). Ciérrelo antes de pedir otro anticipo.`
      );
    }

    const consecutivo = siguienteConsecutivo(viajes, 'consecutivo', 'V');
    const nuevo = {
      consecutivo,
      placa,
      cliente: String(cliente.codigo).trim(),
      destino,
      fecha_inicio: fechaInicio,
      correo_usuario: conductor.email,
      usuario: conductor.nombre,
      creado_por: usuario.email,
      fecha_creacion: ahora(),
      estado_viaje: ESTADOS.SOLICITADO,
      estado_preoperacional: PREOPERACIONAL.PENDIENTE,
      valor_anticipo_conductor: anticipo,
      valor_tonelada_inicial: precioInicial,
      estado_saldo_cliente: 'pendiente',
      ajuste_diez_pcto_pendiente: 0,
      liquidado: 'no',
    };

    await agregarFila(HOJA, encabezados, nuevo);
    return { ...nuevo, cliente_nombre: cliente.empresa };
  });

// ─────────────────────────────────────────────────────────────
// 2. CONSIGNAR ANTICIPO (propietario / admin)
// ─────────────────────────────────────────────────────────────

const consignarAnticipo = (usuario, consecutivo, datos, archivos) =>
  conCandado(CANDADO, async () => {
    const { encabezados, viaje } = await buscarViaje(consecutivo);
    exigirGestion(usuario, viaje);
    exigirEstado(viaje, ESTADOS.SOLICITADO);

    const valor = Math.round(aNumero(datos.valor_anticipo_consignado));
    if (valor <= 0) throw new ErrorApp(400, 'Ingrese el valor consignado');

    const comprobantes = archivos.comprobante || [];
    if (!comprobantes.length) throw new ErrorApp(400, 'Adjunte el comprobante de la consignación');

    const carpeta = await carpetaViaje(viaje.consecutivo, 'Consignacion');
    await subirArchivos(comprobantes, carpeta.id, 'Consignación - ');
    const raiz = await carpetaViaje(viaje.consecutivo);

    await escribir(encabezados, viaje, {
      valor_anticipo_consignado: valor,
      fecha_consignacion: aFechaISO(datos.fecha_consignacion) || hoy(),
      link_consignacion: carpeta.link,
      consignado_por: usuario.email,
      link_carpeta: raiz.link,
      estado_viaje: ESTADOS.CONSIGNADO,
    });
    return viaje;
  });

// ─────────────────────────────────────────────────────────────
// 3. PREOPERACIONAL (lo llama el módulo de preoperacionales)
// ─────────────────────────────────────────────────────────────

/** Valida que el viaje pueda recibir el preoperacional y devuelve el viaje */
const validarViajeParaPreoperacional = async (usuario, consecutivo) => {
  const { viaje } = await buscarViaje(consecutivo);
  exigirAcceso(usuario, viaje);
  exigirEstado(viaje, ESTADOS.SOLICITADO, ESTADOS.CONSIGNADO);
  if (viaje.estado_preoperacional === PREOPERACIONAL.REALIZADO) {
    throw new ErrorApp(409, `El viaje ${viaje.consecutivo} ya tiene preoperacional (${viaje.consecutivo_preoperacional || ''})`);
  }
  return viaje;
};

const registrarPreoperacional = (consecutivo, { consecutivo_preoperacional, odometro, fecha }) =>
  conCandado(CANDADO, async () => {
    const { encabezados, viaje } = await buscarViaje(consecutivo);
    await escribir(encabezados, viaje, {
      estado_preoperacional: PREOPERACIONAL.REALIZADO,
      consecutivo_preoperacional: consecutivo_preoperacional || '',
      fecha_preoperacional: fecha || ahora(),
      odometro_preoperacional: aNumero(odometro) || '',
    });
    return viaje;
  });

// ─────────────────────────────────────────────────────────────
// 4. CERRAR VIAJE (conductor; propietario/admin pueden hacerlo a su nombre)
// ─────────────────────────────────────────────────────────────

async function leerCargaYPrecio(datos, viaje, { obligatorio }) {
  const cambios = {};
  const capacidad = await capacidadDe(viaje.placa);

  const vieneCargue = datos.kilos_cargue !== undefined && datos.kilos_cargue !== '';
  const vieneDescargue = datos.kilos_descargue !== undefined && datos.kilos_descargue !== '';
  if (obligatorio || vieneCargue) cambios.kilos_cargue = normalizarKilos(datos.kilos_cargue, 'cargue', capacidad);
  if (obligatorio || vieneDescargue) cambios.kilos_descargue = normalizarKilos(datos.kilos_descargue, 'descargue', capacidad);
  if (cambios.kilos_cargue || cambios.kilos_descargue) {
    validarDescargue(
      cambios.kilos_cargue ?? aNumero(viaje.kilos_cargue),
      cambios.kilos_descargue ?? aNumero(viaje.kilos_descargue)
    );
  }

  if (obligatorio || (datos.valor_tonelada_final !== undefined && datos.valor_tonelada_final !== '')) {
    cambios.valor_tonelada_final = validarPrecioTonelada(datos.valor_tonelada_final, 'valor de la tonelada final');
  }

  if (obligatorio || datos.fecha_fin_viaje) {
    const fin = aFechaISO(datos.fecha_fin_viaje);
    if (!fin) throw new ErrorApp(400, 'Ingrese la fecha de fin del viaje');
    if (viaje.fecha_inicio && parsearFecha(fin) < parsearFecha(viaje.fecha_inicio)) {
      throw new ErrorApp(400, 'La fecha de fin no puede ser anterior a la fecha de inicio');
    }
    cambios.fecha_fin_viaje = fin;
  }
  return cambios;
}

const cerrarViaje = (usuario, consecutivo, datos, archivos) =>
  conCandado(CANDADO, async () => {
    const { encabezados, viaje } = await buscarViaje(consecutivo);
    exigirAcceso(usuario, viaje);
    if (usuario.perfil === PERFIL.CONDUCTOR && usuario.email !== viaje.correo_usuario) {
      throw new ErrorApp(403, 'Solo el conductor que hizo el viaje puede cerrarlo');
    }
    if (viaje.estado_viaje === ESTADOS.SOLICITADO) {
      throw new ErrorApp(409, 'El anticipo de este viaje aún no ha sido consignado. No se puede cerrar todavía.');
    }
    exigirEstado(viaje, ESTADOS.CONSIGNADO);
    if (viaje.estado_preoperacional !== PREOPERACIONAL.REALIZADO) {
      throw new ErrorApp(409, 'Haga el preoperacional de este viaje antes de cerrarlo');
    }

    const cambios = await leerCargaYPrecio(datos, viaje, { obligatorio: true });

    const existentes = (await detalle.gastosPorQuien(viaje.consecutivo)).conductor;
    const gastos = leerGastosFormulario(datos, archivos, 'conductor');
    validarGastos(gastos, 'conductor', existentes, true);

    const manifiestos = archivos.manifiesto || [];
    if (!manifiestos.length && !viaje.link_manifiesto) throw new ErrorApp(400, 'Adjunte el manifiesto del viaje');

    // Archivos a Drive
    const raiz = await carpetaViaje(viaje.consecutivo);
    cambios.link_carpeta = raiz.link;
    if (manifiestos.length) {
      const carpeta = await carpetaViaje(viaje.consecutivo, 'Manifiesto');
      await subirArchivos(manifiestos, carpeta.id, 'Manifiesto - ');
      cambios.link_manifiesto = carpeta.link;
    }

    const { total, link } = await guardarGastosConSoportes(viaje.consecutivo, 'conductor', gastos);
    cambios.total_gastos_conductor = total;
    if (link) cambios.link_gastos_conductor = link;

    const cliente = await buscarCliente(viaje.cliente);
    const calculado = calcularViaje({ ...viaje, ...cambios }, cliente || {});

    await escribir(encabezados, viaje, {
      ...cambios,
      ...calculado,
      fecha_cierre: ahora(),
      estado_viaje: ESTADOS.COMPLETADO,
    });
    return viaje;
  });

// ─────────────────────────────────────────────────────────────
// 5. APROBAR (propietario / admin). Puede corregir lo del conductor.
// ─────────────────────────────────────────────────────────────

const aprobarViaje = (usuario, consecutivo, datos, archivos) =>
  conCandado(CANDADO, async () => {
    const { encabezados, viaje } = await buscarViaje(consecutivo);
    exigirGestion(usuario, viaje);
    exigirEstado(viaje, ESTADOS.COMPLETADO);

    const cambios = await leerCargaYPrecio(datos, viaje, { obligatorio: false });

    const existentes = await detalle.gastosPorQuien(viaje.consecutivo);

    // Correcciones a los gastos del conductor (sin exigir soporte: el propietario tiene los recibos)
    const gastosConductor = leerGastosFormulario(datos, archivos, 'conductor');
    validarGastos(gastosConductor, 'conductor', existentes.conductor, false);
    if (gastosConductor.length) {
      const { total, link } = await guardarGastosConSoportes(viaje.consecutivo, 'conductor', gastosConductor);
      cambios.total_gastos_conductor = total;
      if (link) cambios.link_gastos_conductor = link;
    }

    // Gastos del propietario
    const gastosPropietario = leerGastosFormulario(datos, archivos, 'propietario');
    validarGastos(gastosPropietario, 'propietario', existentes.propietario, true);
    const propietario = await guardarGastosConSoportes(viaje.consecutivo, 'propietario', gastosPropietario);
    cambios.total_gastos_propietario = propietario.total;
    if (propietario.link) cambios.link_gastos_propietario = propietario.link;

    const anticipoCliente = Math.round(aNumero(datos.valor_anticipo_cliente));
    if (anticipoCliente < 0) throw new ErrorApp(400, 'El anticipo del cliente no puede ser negativo');
    cambios.valor_anticipo_cliente = anticipoCliente;

    const cliente = await buscarCliente(viaje.cliente);
    const calculado = calcularViaje({ ...viaje, ...cambios }, cliente || {});

    await escribir(encabezados, viaje, {
      ...cambios,
      ...calculado,
      fecha_aprobacion: ahora(),
      aprobado_por: usuario.email,
      estado_viaje: ESTADOS.APROBADO,
    });

    await registrarGastoVehiculo(viaje);
    await sumarContadores(viaje);
    return viaje;
  });

// ─────────────────────────────────────────────────────────────
// 6. FACTURAR (propietario / admin)
// ─────────────────────────────────────────────────────────────

const facturarViaje = (usuario, consecutivo, datos) =>
  conCandado(CANDADO, async () => {
    const { encabezados, viaje } = await buscarViaje(consecutivo);
    exigirGestion(usuario, viaje);
    exigirEstado(viaje, ESTADOS.APROBADO);

    const valorReal = Math.round(aNumero(datos.valor_viaje_real));
    if (valorReal <= 0) throw new ErrorApp(400, 'Ingrese el valor facturado al cliente');

    const numeroFactura = String(datos.num_factura_cliente ?? '').trim();
    if (!numeroFactura) throw new ErrorApp(400, 'Ingrese el número de la factura');

    const diezAnterior = aNumero(viaje.diez_pcto);
    const cliente = await buscarCliente(viaje.cliente);
    const calculado = calcularViaje({ ...viaje, valor_viaje_real: valorReal }, cliente || {});

    const cambios = {
      ...calculado,
      valor_viaje_real: valorReal,
      num_factura_cliente: numeroFactura,
      notas_facturacion: String(datos.notas_facturacion ?? '').trim(),
      fecha_facturacion: ahora(),
      estado_viaje: ESTADOS.FACTURADO,
    };

    // Si la nómina ya pagó el 10 % sobre el valor estimado, la diferencia queda para la próxima nómina
    let ajuste = 0;
    if (viaje.liquidado === 'si') {
      ajuste = calculado.diez_pcto - diezAnterior;
      cambios.ajuste_diez_pcto_pendiente = aNumero(viaje.ajuste_diez_pcto_pendiente) + ajuste;
    }

    await escribir(encabezados, viaje, cambios);
    return { viaje, ajuste };
  });

// ─────────────────────────────────────────────────────────────
// 7. PAGO DEL CLIENTE (propietario / admin)
// ─────────────────────────────────────────────────────────────

const registrarPagoCliente = (usuario, consecutivo, datos = {}) =>
  conCandado(CANDADO, async () => {
    const { encabezados, viaje } = await buscarViaje(consecutivo);
    exigirGestion(usuario, viaje);
    exigirEstado(viaje, ESTADOS.FACTURADO);

    await escribir(encabezados, viaje, {
      estado_saldo_cliente: 'pagado',
      fecha_pago_cliente: aFechaISO(datos.fecha_pago_cliente) || hoy(),
      estado_viaje: ESTADOS.PAGADO,
    });

    try {
      await clienteHelper.actualizarEconomiaCliente(
        viaje.cliente,
        aNumero(viaje.valor_viaje_estimado),
        aNumero(viaje.valor_viaje_real),
        aNumero(viaje.ganancia_viaje_real)
      );
    } catch (error) {
      console.warn('[viajes] No se pudieron actualizar los totales del cliente:', error.message);
    }
    return viaje;
  });

// ─────────────────────────────────────────────────────────────
// 8. EDITAR (solo administrador, antes de facturar)
// ─────────────────────────────────────────────────────────────

const editarViaje = (usuario, consecutivo, datos, archivos) =>
  conCandado(CANDADO, async () => {
    const { encabezados, viaje } = await buscarViaje(consecutivo);
    if (!esAdmin(usuario)) throw new ErrorApp(403, 'Solo el administrador puede editar viajes');
    exigirEstado(viaje, ESTADOS.SOLICITADO, ESTADOS.CONSIGNADO, ESTADOS.COMPLETADO, ESTADOS.APROBADO);
    if (viaje.liquidado === 'si') throw new ErrorApp(409, 'El viaje ya fue liquidado en nómina. No se puede editar.');

    const cambios = {};
    const estado = viaje.estado_viaje;
    const yaCerrado = [ESTADOS.COMPLETADO, ESTADOS.APROBADO].includes(estado);

    if (datos.cliente !== undefined && datos.cliente !== '') {
      const cliente = await buscarCliente(datos.cliente);
      if (!cliente) throw new ErrorApp(400, 'Cliente no válido');
      cambios.cliente = String(cliente.codigo).trim();
    }
    if (datos.destino !== undefined && String(datos.destino).trim()) cambios.destino = String(datos.destino).trim();
    if (datos.fecha_inicio) {
      cambios.fecha_inicio = aFechaISO(datos.fecha_inicio);
      if (!cambios.fecha_inicio) throw new ErrorApp(400, 'Fecha de inicio no válida');
    }
    if (datos.valor_anticipo_conductor !== undefined && datos.valor_anticipo_conductor !== '') {
      cambios.valor_anticipo_conductor = Math.round(aNumero(datos.valor_anticipo_conductor));
    }
    if (datos.valor_tonelada_inicial !== undefined && datos.valor_tonelada_inicial !== '') {
      cambios.valor_tonelada_inicial = validarPrecioTonelada(datos.valor_tonelada_inicial, 'valor de la tonelada inicial');
    }
    if (estado !== ESTADOS.SOLICITADO && datos.valor_anticipo_consignado !== undefined && datos.valor_anticipo_consignado !== '') {
      const valor = Math.round(aNumero(datos.valor_anticipo_consignado));
      if (valor <= 0) throw new ErrorApp(400, 'El anticipo consignado debe ser mayor a cero');
      cambios.valor_anticipo_consignado = valor;
    }

    if (yaCerrado) {
      Object.assign(cambios, await leerCargaYPrecio(datos, viaje, { obligatorio: false }));

      const existentes = await detalle.gastosPorQuien(viaje.consecutivo);
      const gastosConductor = leerGastosFormulario(datos, archivos, 'conductor');
      validarGastos(gastosConductor, 'conductor', existentes.conductor, false);
      if (gastosConductor.length) {
        const r = await guardarGastosConSoportes(viaje.consecutivo, 'conductor', gastosConductor);
        cambios.total_gastos_conductor = r.total;
        if (r.link) cambios.link_gastos_conductor = r.link;
      }

      if (estado === ESTADOS.APROBADO) {
        const gastosPropietario = leerGastosFormulario(datos, archivos, 'propietario');
        validarGastos(gastosPropietario, 'propietario', existentes.propietario, false);
        if (gastosPropietario.length) {
          const r = await guardarGastosConSoportes(viaje.consecutivo, 'propietario', gastosPropietario);
          cambios.total_gastos_propietario = r.total;
          if (r.link) cambios.link_gastos_propietario = r.link;
        }
        if (datos.valor_anticipo_cliente !== undefined && datos.valor_anticipo_cliente !== '') {
          cambios.valor_anticipo_cliente = Math.round(aNumero(datos.valor_anticipo_cliente));
        }
      }

      const cliente = await buscarCliente(cambios.cliente || viaje.cliente);
      Object.assign(cambios, calcularViaje({ ...viaje, ...cambios }, cliente || {}));
    }

    if (!Object.keys(cambios).length) throw new ErrorApp(400, 'No hay cambios para guardar');

    cambios.editado_por = usuario.email;
    cambios.fecha_edicion = ahora();
    await escribir(encabezados, viaje, cambios);

    if (estado === ESTADOS.APROBADO) await registrarGastoVehiculo(viaje);
    return viaje;
  });

// ─────────────────────────────────────────────────────────────
// Otros
// ─────────────────────────────────────────────────────────────

const legalizarFactura = async (usuario, consecutivo, tipo_gasto, quien, numero_factura) => {
  const { viaje } = await buscarViaje(consecutivo);
  exigirGestion(usuario, viaje);
  return detalle.legalizarFacturaIndividual(viaje.consecutivo, tipo_gasto, quien, numero_factura);
};

/**
 * Para nómina: viajes de un conductor que se pueden liquidar y viajes ya liquidados con ajuste del 10 % pendiente.
 * El propietario solo ve los de sus placas.
 */
const pendientesConductor = async (usuario, email) => {
  const correo = textoMinuscula(email);
  const { viajes } = await leerViajes();
  const propios = viajes.filter((v) => v.correo_usuario === correo && (!usuario || puedeVerViaje(usuario, v)));
  const limpio = ({ _fila, ...v }) => v;
  return {
    por_liquidar: propios
      .filter((v) => ESTADOS_LIQUIDABLES.includes(v.estado_viaje) && v.liquidado !== 'si')
      .sort((a, b) => numero(a.consecutivo) - numero(b.consecutivo))
      .map(limpio),
    con_ajuste: propios
      .filter((v) => v.liquidado === 'si' && aNumero(v.ajuste_diez_pcto_pendiente) !== 0)
      .map(limpio),
  };
};

/** Para nómina: marca los viajes como liquidados (por nombre de columna) */
const marcarViajesLiquidados = (consecutivos, consecutivoNomina = '') =>
  conCandado(CANDADO, async () => {
    const { encabezados, viajes } = await leerViajes();
    const placas = new Set();
    for (const c of consecutivos) {
      const viaje = viajes.find((v) => v.consecutivo === String(c).trim().toUpperCase());
      if (!viaje) continue;
      await escribir(encabezados, viaje, { liquidado: 'si', fecha_liquidacion: ahora(), consecutivo_nomina: consecutivoNomina });
      placas.add(viaje.placa);
    }
    return [...placas];
  });

/** Para nómina: deja en cero el ajuste del 10 % ya pagado */
const aplicarAjustes = (consecutivos) =>
  conCandado(CANDADO, async () => {
    const { encabezados, viajes } = await leerViajes();
    for (const c of consecutivos) {
      const viaje = viajes.find((v) => v.consecutivo === String(c).trim().toUpperCase());
      if (viaje) await escribir(encabezados, viaje, { ajuste_diez_pcto_pendiente: 0 });
    }
  });

// ── Consultas ──

const CAMPOS_LISTA = [
  'consecutivo', 'placa', 'cliente', 'destino', 'fecha_inicio', 'fecha_fin_viaje', 'estado_viaje',
  'estado_preoperacional', 'usuario', 'correo_usuario', 'valor_anticipo_conductor', 'valor_anticipo_consignado',
  'saldo_pendiente_conductor', 'valor_viaje_estimado', 'valor_viaje_real', 'liquidado',
];

/** Lista para la pantalla de viajes: el admin ve todo; los demás, sus placas */
const listarViajes = async (usuario, { estado = '', placa = '', pagina = 1, limite = 100 } = {}) => {
  const { viajes } = await leerViajes();
  const clientes = await nombresClientes();

  let visibles = viajes.filter((v) => puedeVerViaje(usuario, v));
  if (estado) visibles = visibles.filter((v) => v.estado_viaje === textoMinuscula(estado));
  if (placa) visibles = visibles.filter((v) => v.placa === String(placa).trim().toUpperCase());
  visibles.sort(masRecientePrimero);

  const desde = (Math.max(1, pagina) - 1) * limite;
  const datos = visibles.slice(desde, desde + limite).map((v) => {
    const resumen = Object.fromEntries(CAMPOS_LISTA.map((c) => [c, v[c] ?? '']));
    resumen.cliente_nombre = clientes[v.cliente] || v.cliente;
    if (usuario.perfil === PERFIL.CONDUCTOR) delete resumen.valor_viaje_estimado;
    return resumen;
  });

  // Conteo por estado (para los chips de la pantalla)
  const conteo = {};
  viajes
    .filter((v) => puedeVerViaje(usuario, v) && (!placa || v.placa === String(placa).trim().toUpperCase()))
    .forEach((v) => {
      conteo[v.estado_viaje] = (conteo[v.estado_viaje] || 0) + 1;
    });

  return { datos, pagina, limite, total: visibles.length, hayMas: desde + limite < visibles.length, conteo };
};

/** Detalle completo + nombre del cliente + gastos. Lo que no le corresponde al conductor no se envía */
const obtenerViaje = async (usuario, consecutivo) => {
  const { viaje } = await buscarViaje(consecutivo);
  exigirAcceso(usuario, viaje);
  const cliente = await buscarCliente(viaje.cliente);
  let gastos = await detalle.getGastosViaje(viaje.consecutivo);
  if (usuario.perfil === PERFIL.CONDUCTOR) gastos = gastos.filter((g) => g.quien === 'conductor');
  return { ...vistaPara(usuario, viaje), cliente_nombre: cliente?.empresa || viaje.cliente, gastos };
};

const obtenerGastosViaje = async (usuario, consecutivo) => (await obtenerViaje(usuario, consecutivo)).gastos;

/** Compatibilidad con Preoperacionales: { total: { count, consecutivos } } */
const getResumenViajesPorPlaca = async (placas) => {
  const lista = (Array.isArray(placas) ? placas : String(placas).split(','))
    .map((p) => String(p).trim().toUpperCase())
    .filter(Boolean);
  const viajes = (await getTodosLosViajes()).filter((v) => lista.includes(v.placa));
  const clientes = await nombresClientes();
  return {
    total: {
      count: viajes.length,
      consecutivos: viajes.map((v) => ({
        consecutivo: v.consecutivo,
        placa: v.placa,
        cliente: v.cliente,
        cliente_nombre: clientes[v.cliente] || v.cliente,
        destino: v.destino,
        fecha_inicio: v.fecha_inicio,
        estado_viaje: v.estado_viaje,
        estado_preoperacional: v.estado_preoperacional,
        usuario: v.usuario,
      })),
    },
  };
};

const getViajesByConsecutivo = async (consecutivo) => {
  const { viajes } = await leerViajes();
  const v = viajes.find((x) => x.consecutivo === String(consecutivo).trim().toUpperCase());
  if (!v) return null;
  const { _fila, ...resto } = v;
  return resto;
};

/** Admin: ordenar por un campo numérico o de fecha */
const ordenarViajes = async (campo, orden = 'desc') => {
  const viajes = await getTodosLosViajes();
  const esFecha = campo.startsWith('fecha');
  const valor = (v) => (esFecha ? parsearFecha(v[campo])?.getTime() || 0 : aNumero(v[campo]));
  return viajes.sort((a, b) => (orden === 'desc' ? valor(b) - valor(a) : valor(a) - valor(b)));
};

/** Admin: filtrar por un campo de texto */
const filtrarViajes = async (campo, valor) =>
  (await getTodosLosViajes()).filter((v) => textoMinuscula(v[campo]) === textoMinuscula(valor));

/** Viajes facturados pendientes de pago de un cliente */
const facturarCliente = async (usuario, codigoCliente) => {
  const viajes = (await getTodosLosViajes()).filter(
    (v) =>
      v.cliente === String(codigoCliente).trim() &&
      v.estado_viaje === ESTADOS.FACTURADO &&
      (esAdmin(usuario) || placasDe(usuario).includes(v.placa))
  );
  const cliente = await buscarCliente(codigoCliente);
  return {
    codigoCliente,
    nombre_empresa: cliente?.empresa || '',
    tipo_pago: cliente?.tipo_pago || '',
    total_viajes: viajes.length,
    total_pendiente: viajes.reduce((acc, v) => acc + aNumero(v.saldo_pendiente_cliente_real), 0),
    viajes: viajes.map((v) => ({
      consecutivo: v.consecutivo,
      placa: v.placa,
      destino: v.destino,
      fecha_inicio: v.fecha_inicio,
      fecha_fin_viaje: v.fecha_fin_viaje,
      valor_viaje_real: v.valor_viaje_real,
      saldo_pendiente_cliente_real: v.saldo_pendiente_cliente_real,
      num_factura_cliente: v.num_factura_cliente,
    })),
  };
};

export const viajeHelper = {
  // flujo
  crearViaje,
  consignarAnticipo,
  validarViajeParaPreoperacional,
  registrarPreoperacional,
  cerrarViaje,
  aprobarViaje,
  facturarViaje,
  registrarPagoCliente,
  editarViaje,
  legalizarFactura,
  marcarViajesLiquidados,
  aplicarAjustes,
  pendientesConductor,
  // consultas
  listarViajes,
  obtenerViaje,
  obtenerGastosViaje,
  getTodosLosViajes,
  getResumenViajesPorPlaca,
  getViajesByConsecutivo,
  ordenarViajes,
  filtrarViajes,
  facturarCliente,
  // utilidades
  agruparArchivos,
  puedeVerViaje,
};
