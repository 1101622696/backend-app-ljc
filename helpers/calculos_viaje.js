import { aNumero } from './hoja.js';
import { ErrorApp } from './errores.js';

// ─────────────────────────────────────────────────────────────
// Reglas y cálculos del viaje. Funciones puras (sin hoja ni Drive): la misma
// fórmula para cerrar, aprobar, facturar y editar.
// ─────────────────────────────────────────────────────────────

export const ESTADOS = {
  SOLICITADO: 'solicitado',
  CONSIGNADO: 'anticipo_consignado',
  COMPLETADO: 'completado',
  APROBADO: 'aprobado',
  FACTURADO: 'facturado',
  PAGADO: 'pagado',
};

/** Estados en los que el viaje sigue "abierto" (bloquea pedir otro anticipo para la placa) */
export const ESTADOS_ABIERTOS = [ESTADOS.SOLICITADO, ESTADOS.CONSIGNADO];

/** Estados que la nómina puede liquidar */
export const ESTADOS_LIQUIDABLES = [ESTADOS.APROBADO, ESTADOS.FACTURADO, ESTADOS.PAGADO];

export const PREOPERACIONAL = { PENDIENTE: 'se debe', REALIZADO: 'realizado' };

export const TIPOS_GASTO = ['peajes', 'lavadas', 'parqueadero', 'engrase', 'fumigacion', 'cargue', 'descargue', 'comision', 'otro'];

export const ETIQUETAS_GASTO = {
  peajes: 'Peajes',
  lavadas: 'Lavadas',
  parqueadero: 'Parqueadero',
  engrase: 'Engrase',
  fumigacion: 'Fumigación',
  cargue: 'Cargue',
  descargue: 'Descargue',
  comision: 'Comisión',
  otro: 'Otro',
};

/** Siempre van con recibo de caja */
export const SIEMPRE_RECIBO = ['cargue', 'descargue', 'comision'];

/** Gastos que NO exigen soporte, por quién los pagó */
const SIN_SOPORTE = {
  conductor: ['cargue', 'descargue', 'comision'],
  propietario: ['peajes', 'cargue', 'descargue', 'comision'], // peajes: factura electrónica que llega después
};

export const requiereSoporte = (tipo, quien) => !SIN_SOPORTE[quien]?.includes(tipo);

export const TIPOS_FACTURA = ['factura_electronica', 'recibo_caja'];

export const normalizarTipoFactura = (tipo, valor) => {
  if (SIEMPRE_RECIBO.includes(tipo)) return 'recibo_caja';
  const texto = String(valor ?? '').toLowerCase();
  if (texto.includes('recibo')) return 'recibo_caja';
  return 'factura_electronica';
};

// ── Validaciones de lo que digita el conductor ──

export const LIMITES = {
  KILOS_MIN: 10000, // 10 toneladas
  KILOS_MAX_DEFECTO: 60000,
  MARGEN_CAPACIDAD: 1.15, // capacidad del vehículo + 15 %
  PRECIO_TONELADA_MIN: 10000,
  PRECIO_TONELADA_MAX: 2000000,
};

const formatoPeso = (n) => `$${Math.round(n).toLocaleString('es-CO')}`;
const formatoKilos = (n) => `${Math.round(n).toLocaleString('es-CO')} kg`;

/**
 * Kilos del tiquete de báscula. Si llega un número menor a 100 se entiende que son toneladas
 * (34,31 → 34.310 kg). Valida que sea una carga de tractomula.
 */
export const normalizarKilos = (valor, etiqueta, capacidadTon = 0) => {
  let kilos = aNumero(valor);
  if (!kilos) throw new ErrorApp(400, `Ingrese los kilos de ${etiqueta} (como aparecen en el tiquete de báscula)`);
  if (kilos < 100) kilos *= 1000;
  kilos = Math.round(kilos);

  const maximo = capacidadTon > 0 ? Math.round(capacidadTon * 1000 * LIMITES.MARGEN_CAPACIDAD) : LIMITES.KILOS_MAX_DEFECTO;
  if (kilos < LIMITES.KILOS_MIN || kilos > maximo) {
    throw new ErrorApp(
      400,
      `Los kilos de ${etiqueta} (${formatoKilos(kilos)}) no son válidos. Deben estar entre ${formatoKilos(LIMITES.KILOS_MIN)} y ${formatoKilos(maximo)}.`
    );
  }
  return kilos;
};

/** Valor por tonelada en pesos completos (154000, no 154) */
export const validarPrecioTonelada = (valor, etiqueta) => {
  const precio = Math.round(aNumero(valor));
  if (!precio) throw new ErrorApp(400, `Ingrese el ${etiqueta}`);
  if (precio < 1000) {
    throw new ErrorApp(400, `El ${etiqueta} debe escribirse completo. ¿Quiso decir ${formatoPeso(precio * 1000)}?`);
  }
  if (precio < LIMITES.PRECIO_TONELADA_MIN || precio > LIMITES.PRECIO_TONELADA_MAX) {
    throw new ErrorApp(
      400,
      `El ${etiqueta} (${formatoPeso(precio)}) no es válido. Debe estar entre ${formatoPeso(LIMITES.PRECIO_TONELADA_MIN)} y ${formatoPeso(LIMITES.PRECIO_TONELADA_MAX)}.`
    );
  }
  return precio;
};

export const validarDescargue = (kilosCargue, kilosDescargue) => {
  if (kilosDescargue > kilosCargue * 1.02) {
    throw new ErrorApp(
      400,
      `Los kilos de descargue (${formatoKilos(kilosDescargue)}) no pueden superar los de cargue (${formatoKilos(kilosCargue)}). Revise los tiquetes.`
    );
  }
};

// ── Cálculo completo ──

const redondear = (n) => Math.round(n);
const tresDecimales = (n) => Math.round(n * 1000) / 1000;

/**
 * Recalcula todos los valores del viaje.
 * @param {object} viaje   fila del viaje (con los datos de entrada ya actualizados)
 * @param {object} cliente fila del cliente ({ rete_fuente: 'si'|'no', rete_ica: '0.8' })
 *
 * Reglas acordadas:
 * - Valor del viaje = toneladas descargadas × valor de la tonelada final
 * - 10 % del conductor = 10 % del valor facturado (o del estimado mientras no se facture)
 * - Saldo del anticipo = anticipo CONSIGNADO − gastos del conductor
 * - Saldo pendiente del conductor = 10 % − saldo del anticipo
 *     (positivo: el propietario le debe; negativo: el conductor debe y se cruza en nómina)
 * - Retenciones sobre el TOTAL del viaje (no sobre el saldo después del anticipo)
 *     rete fuente 1 % si el cliente la aplica; rete ICA = tarifa en % del cliente
 * - Saldo del cliente = total − anticipo del cliente − retenciones
 * - Ganancia = valor − 10 % − gastos del conductor − gastos del propietario
 *     (las retenciones no restan: son anticipos de impuestos)
 */
export function calcularViaje(viaje, cliente = {}) {
  const kilosCargue = aNumero(viaje.kilos_cargue);
  const kilosDescargue = aNumero(viaje.kilos_descargue);
  const toneladasCargue = tresDecimales(kilosCargue / 1000);
  const toneladasDescargue = tresDecimales(kilosDescargue / 1000);

  const precioInicial = aNumero(viaje.valor_tonelada_inicial);
  const precioFinal = aNumero(viaje.valor_tonelada_final);

  const valorEstimado = redondear(toneladasDescargue * precioFinal);
  const valorReal = aNumero(viaje.valor_viaje_real);
  const base = valorReal > 0 ? valorReal : valorEstimado;

  const gastosConductor = aNumero(viaje.total_gastos_conductor);
  const gastosPropietario = aNumero(viaje.total_gastos_propietario);
  const anticipoConsignado = aNumero(viaje.valor_anticipo_consignado);
  const anticipoCliente = aNumero(viaje.valor_anticipo_cliente);

  const diezPcto = redondear(base * 0.1);
  const saldoAnticipo = redondear(anticipoConsignado - gastosConductor);
  const saldoPendienteConductor = redondear(diezPcto - saldoAnticipo);

  const aplicaReteFuente = String(cliente.rete_fuente ?? '').trim().toLowerCase() === 'si';
  const tarifaIca = aNumero(cliente.rete_ica);
  const reteFuente = aplicaReteFuente ? redondear(base * 0.01) : 0;
  const reteIca = redondear(base * (tarifaIca / 100));
  const totalDescuentos = reteFuente + reteIca;

  const gananciaEstimada = redondear(valorEstimado - valorEstimado * 0.1 - gastosConductor - gastosPropietario);
  const gananciaReal = valorReal > 0 ? redondear(valorReal - diezPcto - gastosConductor - gastosPropietario) : '';

  // Comparación con lo prometido
  const diferenciaKg = redondear(kilosCargue - kilosDescargue);
  const diferenciaPrecio = precioInicial && precioFinal ? redondear((precioFinal - precioInicial) * toneladasDescargue) : 0;
  const valorMerma = redondear((diferenciaKg / 1000) * precioFinal);

  return {
    toneladas_inicio: toneladasCargue,
    toneladas_descargue: toneladasDescargue,
    diferencia_kg: diferenciaKg,
    valor_viaje_estimado: valorEstimado,
    diez_pcto: diezPcto,
    saldo_anticipo_conductor: saldoAnticipo,
    saldo_pendiente_conductor: saldoPendienteConductor,
    descuento_rete_fuente: reteFuente,
    descuento_rete_ica: reteIca,
    total_descuentos_cliente: totalDescuentos,
    saldo_pendiente_cliente_sin_descuento: redondear(base - anticipoCliente),
    saldo_pendiente_cliente_real: redondear(base - anticipoCliente - totalDescuentos),
    ganancia_viaje_estimada: gananciaEstimada,
    ganancia_viaje_real: gananciaReal,
    diferencia_facturacion: valorReal > 0 ? redondear(valorReal - valorEstimado) : '',
    diferencia_precio: diferenciaPrecio,
    valor_merma: valorMerma,
  };
}

export const calculosViaje = {
  ESTADOS,
  ESTADOS_ABIERTOS,
  ESTADOS_LIQUIDABLES,
  PREOPERACIONAL,
  TIPOS_GASTO,
  ETIQUETAS_GASTO,
  SIEMPRE_RECIBO,
  TIPOS_FACTURA,
  LIMITES,
  requiereSoporte,
  normalizarTipoFactura,
  normalizarKilos,
  validarPrecioTonelada,
  validarDescargue,
  calcularViaje,
};
