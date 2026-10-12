import { leerHoja, actualizarCampos, agregarFila, aNumero, siguienteConsecutivo, conCandado } from './hoja.js';
import { hoy } from './fechas.js';
import { ErrorApp } from './errores.js';

// ─────────────────────────────────────────────────────────────
// Hoja "Clientes" por NOMBRE de columna.
// Encabezados: codigo, empresa, nit, estado, viajes, telefono, email, tipo_pago, rete_fuente, rete_ica,
//              fecha_creacion, total_valor_viaje_estimado, total_valor_viaje_real, total_ganancia_viaje
//
// rete_ica se guarda en PORCENTAJE: 1.0 = 1 % = 10 por mil. (Si el certificado dice "x mil", dividir entre 10.)
//
// Los totales por cliente (viajes, valores, ganancia y cumplimiento del precio) se CALCULAN desde
// Viajes al consultar, filtrados por lo que el usuario puede ver: el propietario ve la ganancia
// de SUS viajes; el admin, de todos. Las columnas de totales de la hoja ya no se usan.
// ─────────────────────────────────────────────────────────────

const HOJA = 'Clientes';
const ESTADOS_CON_VALOR = ['aprobado', 'facturado', 'pagado'];

const minuscula = (v) => String(v ?? '').trim().toLowerCase();
const soloDigitosNit = (nit) => String(nit ?? '').replace(/[^\d]/g, '');

const normalizar = (f) => ({
  ...f,
  codigo: String(f.codigo ?? '').trim().toUpperCase(),
  empresa: String(f.empresa ?? '').trim(),
  estado: minuscula(f.estado) || 'activo',
  tipo_pago: minuscula(f.tipo_pago),
  rete_fuente: minuscula(f.rete_fuente) === 'si' ? 'si' : 'no',
  rete_ica: aNumero(f.rete_ica),
});

async function leerClientes() {
  const { encabezados, filas } = await leerHoja(HOJA);
  return { encabezados, clientes: filas.filter((f) => f.codigo).map(normalizar) };
}

const sinFila = ({ _fila, ...r }) => r;

/** Todos los clientes (uso interno: viajes, etc.) */
const getClientes = async () => (await leerClientes()).clientes.map(sinFila);

const getClienteById = async (codigo) => {
  const buscado = String(codigo ?? '').trim().toUpperCase();
  return (await getClientes()).find((c) => c.codigo === buscado) || null;
};

// ── Totales calculados desde Viajes ──

/**
 * Agrega a cada cliente: viajes, total_valor_viaje_estimado, total_valor_viaje_real, total_ganancia_viaje,
 * y cómo cumple lo prometido: diferencia_precio_total (valor tonelada final vs inicial),
 * viajes_precio_menor, valor_merma_total y diferencia_facturacion_total.
 * usuario: si se pasa, solo cuenta los viajes que ese usuario puede ver.
 */
async function conTotales(clientes, usuario = null) {
  const { viajeHelper } = await import('./viajes.js'); // import diferido: viajes.js importa este archivo
  const viajes = (await viajeHelper.getTodosLosViajes()).filter(
    (v) => ESTADOS_CON_VALOR.includes(v.estado_viaje) && (!usuario || viajeHelper.puedeVerViaje(usuario, v))
  );

  const totales = {};
  for (const v of viajes) {
    const t = (totales[String(v.cliente).toUpperCase()] ||= {
      viajes: 0, estimado: 0, real: 0, ganancia: 0, difPrecio: 0, precioMenor: 0, merma: 0, difFactura: 0,
    });
    t.viajes++;
    t.estimado += aNumero(v.valor_viaje_estimado);
    t.real += aNumero(v.valor_viaje_real);
    t.ganancia += aNumero(v.ganancia_viaje_real) || aNumero(v.ganancia_viaje_estimada);
    t.difPrecio += aNumero(v.diferencia_precio);
    if (aNumero(v.diferencia_precio) < 0) t.precioMenor++;
    t.merma += aNumero(v.valor_merma);
    t.difFactura += aNumero(v.diferencia_facturacion);
  }

  return clientes.map((c) => {
    const t = totales[c.codigo] || {};
    return {
      ...c,
      viajes: t.viajes || 0,
      total_valor_viaje_estimado: Math.round(t.estimado || 0),
      total_valor_viaje_real: Math.round(t.real || 0),
      total_ganancia_viaje: Math.round(t.ganancia || 0),
      diferencia_precio_total: Math.round(t.difPrecio || 0),
      viajes_precio_menor: t.precioMenor || 0,
      valor_merma_total: Math.round(t.merma || 0),
      diferencia_facturacion_total: Math.round(t.difFactura || 0),
    };
  });
}

const listarConTotales = async (usuario) => conTotales(await getClientes(), usuario);

const obtenerConTotales = async (usuario, codigo) => {
  const cliente = await getClienteById(codigo);
  if (!cliente) return null;
  return (await conTotales([cliente], usuario))[0];
};

// ── Filtros y ordenamientos (sobre la lista con totales del usuario) ──

const filtrar = (campo) => async (valor, usuario = null) =>
  (await listarConTotales(usuario)).filter((c) => minuscula(c[campo]) === minuscula(valor));

const ordenar = (campo) => async (orden = 'desc', usuario = null) =>
  (await listarConTotales(usuario)).sort((a, b) =>
    orden === 'desc' ? aNumero(b[campo]) - aNumero(a[campo]) : aNumero(a[campo]) - aNumero(b[campo])
  );

const getClientesPorEstado = filtrar('estado');
const getClientesPorTipoPago = filtrar('tipo_pago');
const getClientesPorReteFuente = filtrar('rete_fuente');
const getClientesOrdenadosPorViajes = ordenar('viajes');
const getClientesOrdenadosPorReteIca = ordenar('rete_ica');
const getClientesOrdenadosPorValorEstimado = ordenar('total_valor_viaje_estimado');
const getClientesOrdenadosPorValorReal = ordenar('total_valor_viaje_real');
const getClientesOrdenadosPorGanancia = ordenar('total_ganancia_viaje');

// ── Crear / editar ──

function prepararDatos(datos, { crear }) {
  const cambios = {};
  if (datos.empresa !== undefined) {
    cambios.empresa = String(datos.empresa).trim();
    if (!cambios.empresa) throw new ErrorApp(400, 'Escriba el nombre de la empresa');
  } else if (crear) {
    throw new ErrorApp(400, 'Escriba el nombre de la empresa');
  }
  if (datos.nit !== undefined) cambios.nit = String(datos.nit).trim();
  if (datos.telefono !== undefined) cambios.telefono = String(datos.telefono).trim();
  if (datos.email !== undefined) cambios.email = String(datos.email).trim().toLowerCase();
  if (datos.tipo_pago !== undefined) cambios.tipo_pago = minuscula(datos.tipo_pago);
  if (datos.rete_fuente !== undefined) cambios.rete_fuente = minuscula(datos.rete_fuente) === 'si' ? 'si' : 'no';
  if (datos.rete_ica !== undefined && datos.rete_ica !== '') {
    const tarifa = aNumero(datos.rete_ica);
    if (tarifa < 0 || tarifa > 5) {
      throw new ErrorApp(400, 'Rete ICA en porcentaje (ej. 1 = 10 por mil). Debe estar entre 0 y 5.');
    }
    cambios.rete_ica = tarifa;
  }
  return cambios;
}

const guardarCliente = (datos) =>
  conCandado('clientes', async () => {
    const cambios = prepararDatos(datos, { crear: true });
    const { encabezados, clientes } = await leerClientes();

    const nit = soloDigitosNit(cambios.nit);
    if (nit && clientes.some((c) => soloDigitosNit(c.nit) === nit)) {
      throw new ErrorApp(409, `Ya existe un cliente con el NIT ${cambios.nit}`);
    }

    const codigo = siguienteConsecutivo(clientes, 'codigo', 'C');
    await agregarFila(HOJA, encabezados, {
      rete_fuente: 'no',
      rete_ica: 0,
      ...cambios,
      codigo,
      estado: 'activo',
      viajes: 0,
      fecha_creacion: hoy(),
    });
    return { codigo };
  });

const editarClienteporCodigo = async (codigo, nuevosDatos) => {
  const { encabezados, clientes } = await leerClientes();
  const cliente = clientes.find((c) => c.codigo === String(codigo ?? '').trim().toUpperCase());
  if (!cliente) return null;

  const cambios = prepararDatos(nuevosDatos, { crear: false });
  const nit = soloDigitosNit(cambios.nit);
  if (nit && clientes.some((c) => c.codigo !== cliente.codigo && soloDigitosNit(c.nit) === nit)) {
    throw new ErrorApp(409, `Ya existe otro cliente con el NIT ${cambios.nit}`);
  }
  if (Object.keys(cambios).length) await actualizarCampos(HOJA, encabezados, cliente._fila, cambios, { omitirFaltantes: true });
  return true;
};

const actualizarEstadoEnSheets = async (codigo, nuevoEstado = 'activo') => {
  const estado = minuscula(nuevoEstado);
  if (!['activo', 'inactivo'].includes(estado)) throw new ErrorApp(400, 'Estado no válido');
  const { encabezados, clientes } = await leerClientes();
  const cliente = clientes.find((c) => c.codigo === String(codigo ?? '').trim().toUpperCase());
  if (!cliente) return null;
  await actualizarCampos(HOJA, encabezados, cliente._fila, { estado });
  return true;
};

/** Ya no acumula en la hoja: los totales se calculan desde Viajes al consultar. Se deja por compatibilidad */
const actualizarEconomiaCliente = async () => true;

export const clienteHelper = {
  getClientes,
  getClienteById,
  listarConTotales,
  obtenerConTotales,
  guardarCliente,
  getClientesPorEstado,
  getClientesOrdenadosPorViajes,
  getClientesPorTipoPago,
  getClientesPorReteFuente,
  getClientesOrdenadosPorReteIca,
  getClientesOrdenadosPorValorEstimado,
  getClientesOrdenadosPorValorReal,
  getClientesOrdenadosPorGanancia,
  editarClienteporCodigo,
  actualizarEstadoEnSheets,
  actualizarEconomiaCliente,
};
