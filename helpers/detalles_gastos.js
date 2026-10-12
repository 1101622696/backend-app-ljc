import { leerHoja, actualizarCampos, agregarFila, aNumero } from './hoja.js';
import { normalizarTipoFactura } from './calculos_viaje.js';

// Hoja "Detalle_Gastos_Viajes" — una fila por (viaje, tipo de gasto, quién).
// Encabezados: consecutivo_viaje | tipo_gasto | quien | valor | tipo_factura | estado_factura |
//              numero_factura | link_soporte | descripcion
//
// Guardar es "actualizar o agregar": cerrar dos veces o corregir al aprobar NO duplica filas.

const HOJA = 'Detalle_Gastos_Viajes';

const normalizar = (fila) => ({
  ...fila,
  consecutivo_viaje: String(fila.consecutivo_viaje ?? '').trim().toUpperCase(),
  tipo_gasto: String(fila.tipo_gasto ?? '').trim().toLowerCase(),
  quien: String(fila.quien ?? '').trim().toLowerCase(),
  valor: aNumero(fila.valor),
  estado_factura: String(fila.estado_factura ?? '').trim().toLowerCase() || 'pendiente',
});

async function leerDetalle() {
  const { encabezados, filas } = await leerHoja(HOJA);
  return { encabezados, filas: filas.map(normalizar) };
}

const getGastosViaje = async (consecutivo) => {
  const buscado = String(consecutivo).trim().toUpperCase();
  const { filas } = await leerDetalle();
  return filas
    .filter((g) => g.consecutivo_viaje === buscado && g.valor > 0)
    .map(({ _fila, ...g }) => g);
};

/**
 * Guarda los gastos de un viaje para 'conductor' o 'propietario'.
 * gastos: [{ tipo, valor, tipo_factura, descripcion, link }]  (solo los que vinieron en el formulario)
 * - Si ya existe la fila se actualiza (valor 0 deja la fila en 0).
 * - Si no existe y el valor es > 0 se agrega.
 * Devuelve el total de ese "quien" después de guardar.
 */
const guardarGastos = async (consecutivo, quien, gastos) => {
  const viaje = String(consecutivo).trim().toUpperCase();
  const { encabezados, filas } = await leerDetalle();
  const delViaje = filas.filter((f) => f.consecutivo_viaje === viaje && f.quien === quien);

  for (const gasto of gastos) {
    const existente = delViaje.find((f) => f.tipo_gasto === gasto.tipo);
    const datos = {
      valor: gasto.valor,
      tipo_factura: normalizarTipoFactura(gasto.tipo, gasto.tipo_factura),
      descripcion: gasto.descripcion || '',
    };
    if (gasto.link) datos.link_soporte = gasto.link;

    if (existente) {
      await actualizarCampos(HOJA, encabezados, existente._fila, datos, { omitirFaltantes: true });
      Object.assign(existente, datos);
    } else if (gasto.valor > 0) {
      await agregarFila(HOJA, encabezados, {
        consecutivo_viaje: viaje,
        tipo_gasto: gasto.tipo,
        quien,
        estado_factura: 'pendiente',
        numero_factura: '',
        link_soporte: gasto.link || '',
        ...datos,
      });
      delViaje.push({ tipo_gasto: gasto.tipo, ...datos });
    }
  }

  return delViaje.reduce((total, f) => total + aNumero(f.valor), 0);
};

/** Gastos existentes de un viaje agrupados por quien → { conductor: {peajes: fila}, propietario: {...} } */
const gastosPorQuien = async (consecutivo) => {
  const lista = await getGastosViaje(consecutivo);
  const resultado = { conductor: {}, propietario: {} };
  lista.forEach((g) => {
    if (resultado[g.quien]) resultado[g.quien][g.tipo_gasto] = g;
  });
  return resultado;
};

const legalizarFacturaIndividual = async (consecutivo, tipo_gasto, quien, numero_factura) => {
  const viaje = String(consecutivo).trim().toUpperCase();
  const { encabezados, filas } = await leerDetalle();
  const fila = filas.find(
    (f) => f.consecutivo_viaje === viaje && f.tipo_gasto === String(tipo_gasto).toLowerCase() && f.quien === String(quien).toLowerCase()
  );
  if (!fila) return null;

  await actualizarCampos(HOJA, encabezados, fila._fila, {
    estado_factura: 'legalizado',
    numero_factura: String(numero_factura ?? '').trim(),
  });
  return true;
};

const calcularTotalGastos = (gastos) => gastos.reduce((acc, g) => acc + aNumero(g.valor), 0);

export const detalleGastosViajesHelper = {
  getGastosViaje,
  gastosPorQuien,
  guardarGastos,
  legalizarFacturaIndividual,
  calcularTotalGastos,
};
