import { leerHoja, actualizarCampos, agregarFila, aNumero, conCandado } from './hoja.js';
import { viajeHelper } from './viajes.js';
import { vehiculoHelper } from './vehiculos.js';
import { aFechaISO, ahora } from './fechas.js';
import { ErrorApp } from './errores.js';
import { puedeVerPlaca } from '../middlewares/validar-rol.js';

// ─────────────────────────────────────────────────────────────
// Resumen financiero del vehículo (por mes y por año).
// Se CALCULA siempre al momento desde Gastos_Vehiculos y Viajes.
// La hoja "Resumen_Vehiculo" es solo un "cierre" opcional: se actualiza o agrega
// la fila (anio, mes, placa), nunca se duplica.
// ─────────────────────────────────────────────────────────────

const HOJA_RESUMEN = 'Resumen_Vehiculo';
const HOJA_GASTOS = 'Gastos_Vehiculos';
const CANDADO = 'resumen_vehiculo';

// Viajes que ya son ingreso real (facturados o cobrados)
const ESTADOS_INGRESO = ['facturado', 'pagado'];
// Viajes aprobados aún sin factura: ingreso esperado (solo informativo)
const ESTADOS_POR_FACTURAR = ['aprobado'];

const TIPOS_MANTENIMIENTO = ['mantenimiento', 'soat', 'impuesto', 'tecnico', 'poliza'];

const CAMPOS_TOTALES = [
  'total_gastos', 'total_combustible', 'total_nominas', 'total_mantenimientos',
  'total_gastos_viajes', 'total_otros', 'total_ingresos', 'diferencia',
  'viajes', 'ingresos_estimados', 'viajes_por_facturar',
];

// ── Normalización ──

const normalizarPlaca = (p) => String(p ?? '').replace(/\s+/g, '').toUpperCase();

// Minúscula y sin tildes: 'Nómina_Salario' → 'nomina_salario', 'Técnico' → 'tecnico'
const normalizarTipo = (t) =>
  String(t ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

const dos = (n) => String(n).padStart(2, '0');

/** Clave 'AAAA-MM' de una fecha en cualquier formato ('' si es inválida) */
const claveMes = (valor) => aFechaISO(valor).slice(0, 7);

/** '3' | 3 | '03' → '03'; 'total' → 'TOTAL' */
const normalizarMes = (mes) => {
  const texto = String(mes ?? '').trim();
  if (/^\d{1,2}$/.test(texto)) return dos(Number(texto));
  return texto.toUpperCase();
};

// ── Validaciones ──

const validarAnio = (anio) => {
  const texto = String(anio ?? '').trim();
  if (!/^\d{4}$/.test(texto)) throw new ErrorApp(400, 'El año debe tener 4 dígitos (ej. 2026)');
  return Number(texto);
};

const validarMes = (mes) => {
  const texto = String(mes ?? '').trim();
  const numero = /^\d{1,2}$/.test(texto) ? Number(texto) : NaN;
  if (!(numero >= 1 && numero <= 12)) throw new ErrorApp(400, 'El mes debe ser un número entre 1 y 12');
  return numero;
};

const validarPlacaTexto = (placa) => {
  const p = normalizarPlaca(placa);
  if (!p) throw new ErrorApp(400, 'Debe especificar la placa');
  return p;
};

// ── Lectura de datos (una sola vez por cálculo) ──

/** Gastos_Vehiculos normalizados: placa en mayúscula, tipo sin tildes, fecha 'AAAA-MM-DD', valor numérico */
const leerGastos = async () => {
  const { filas } = await leerHoja(HOJA_GASTOS);
  return filas.map((f) => ({
    placa: normalizarPlaca(f.placa),
    tipo: normalizarTipo(f.tipo_gasto),
    mes: claveMes(f.fecha_registro),
    valor: aNumero(f.valor_gasto),
  }));
};

const vacio = (v) => v === null || v === undefined || String(v).trim() === '';

/** Valor facturado del viaje: real, o el estimado si el real está vacío */
const valorFacturado = (v) => aNumero(vacio(v.valor_viaje_real) ? v.valor_viaje_estimado : v.valor_viaje_real);

/** Viajes normalizados con el mes en que cuentan (fecha_fin_viaje; si falta, cierre o facturación) */
const leerViajes = async () => {
  const viajes = await viajeHelper.getTodosLosViajes();
  return viajes.map((v) => ({
    placa: normalizarPlaca(v.placa),
    estado: String(v.estado_viaje ?? '').trim().toLowerCase(),
    mes: claveMes(v.fecha_fin_viaje) || claveMes(v.fecha_cierre) || claveMes(v.fecha_facturacion),
    valor: valorFacturado(v),
  }));
};

// ── Cálculo puro (sin leer hojas) ──

/**
 * Resumen de una placa en un mes a partir de datos ya leídos.
 * diferencia = ingresos facturados − todos los gastos del mes.
 */
const calcularMes = (placa, anio, mes, gastos, viajes) => {
  const clave = `${anio}-${dos(mes)}`;
  const t = {
    total_combustible: 0, total_nominas: 0, total_mantenimientos: 0,
    total_gastos_viajes: 0, total_otros: 0, total_ingresos: 0,
    viajes: 0, ingresos_estimados: 0, viajes_por_facturar: 0,
  };

  for (const g of gastos) {
    if (g.placa !== placa || g.mes !== clave) continue;
    if (g.tipo === 'combustible') t.total_combustible += g.valor;
    else if (g.tipo.includes('nomina')) t.total_nominas += g.valor;
    else if (TIPOS_MANTENIMIENTO.includes(g.tipo)) t.total_mantenimientos += g.valor;
    else if (g.tipo === 'viaje') t.total_gastos_viajes += g.valor;
    else t.total_otros += g.valor; // tipos manuales: antes se perdían del total
  }

  for (const v of viajes) {
    if (v.placa !== placa || v.mes !== clave) continue;
    if (ESTADOS_INGRESO.includes(v.estado)) {
      t.total_ingresos += v.valor;
      t.viajes += 1;
    } else if (ESTADOS_POR_FACTURAR.includes(v.estado)) {
      t.ingresos_estimados += v.valor;
      t.viajes_por_facturar += 1;
    }
  }

  const total_gastos = t.total_combustible + t.total_nominas + t.total_mantenimientos + t.total_gastos_viajes + t.total_otros;

  return {
    anio,
    mes: dos(mes),
    placa,
    total_gastos: redondear(total_gastos),
    total_combustible: redondear(t.total_combustible),
    total_nominas: redondear(t.total_nominas),
    total_mantenimientos: redondear(t.total_mantenimientos),
    total_gastos_viajes: redondear(t.total_gastos_viajes),
    total_otros: redondear(t.total_otros),
    total_ingresos: redondear(t.total_ingresos),
    diferencia: redondear(t.total_ingresos - total_gastos),
    viajes: t.viajes,
    ingresos_estimados: redondear(t.ingresos_estimados),
    viajes_por_facturar: t.viajes_por_facturar,
  };
};

/** Suma los 12 meses en la fila TOTAL */
const calcularTotal = (placa, anio, meses) => {
  const total = { anio, mes: 'TOTAL', placa };
  for (const campo of CAMPOS_TOTALES) total[campo] = redondear(meses.reduce((acc, r) => acc + (r[campo] || 0), 0));
  return total;
};

const tieneMovimiento = (r) =>
  r.total_gastos !== 0 || r.total_ingresos !== 0 || r.viajes > 0 || r.viajes_por_facturar > 0;

// ── Guardado (cierre) ──

const mismaFila = (f, r) =>
  String(f.anio ?? '').trim() === String(r.anio) &&
  normalizarMes(f.mes) === normalizarMes(r.mes) &&
  normalizarPlaca(f.placa) === r.placa;

/**
 * Guarda varios resúmenes en Resumen_Vehiculo: si ya existe (anio, mes, placa) actualiza esas celdas,
 * si no, agrega la fila. Las columnas nuevas (total_otros, viajes, ...) solo se escriben si existen en la hoja.
 * soloSiExiste(r): para no crear filas en cero de meses sin movimiento.
 */
const guardarVarios = (resumenes, soloSiExiste = () => false) =>
  conCandado(CANDADO, async () => {
    const { encabezados, filas } = await leerHoja(HOJA_RESUMEN);
    if (!encabezados.length) throw new ErrorApp(500, `La hoja ${HOJA_RESUMEN} no tiene encabezados`);

    const resultado = [];
    for (const r of resumenes) {
      const datos = { ...r, anio: Number(r.anio), mes: normalizarMes(r.mes), fecha_actualizacion: ahora() };
      // Solo columnas que existen en la hoja (sin avisos repetidos en el log)
      const cambios = Object.fromEntries(Object.entries(datos).filter(([c]) => encabezados.includes(c)));

      // Si quedaron filas repetidas por el error anterior, se actualizan todas para que coincidan
      const existentes = filas.filter((f) => mismaFila(f, r) && f._fila > 0);
      if (existentes.length) {
        for (const f of existentes) await actualizarCampos(HOJA_RESUMEN, encabezados, f._fila, cambios);
        resultado.push({ ...r, accion: 'actualizado' });
      } else if (filas.some((f) => mismaFila(f, r))) {
        resultado.push({ ...r, accion: 'repetido' });
      } else if (!soloSiExiste(r)) {
        await agregarFila(HOJA_RESUMEN, encabezados, cambios);
        // Se registra en memoria para no duplicarla si llega otra igual en este mismo lote
        filas.push({ ...cambios, _fila: -1 });
        resultado.push({ ...r, accion: 'agregado' });
      }
    }
    return resultado;
  });

/** Guarda (o actualiza) un resumen. Devuelve el mismo resumen (API anterior) */
const guardarResumenMensual = async (resumen) => {
  const r = {
    ...resumen,
    anio: validarAnio(resumen.anio),
    mes: resumen.mes === 'TOTAL' ? 'TOTAL' : dos(validarMes(resumen.mes)),
    placa: validarPlacaTexto(resumen.placa),
  };
  await guardarVarios([r]);
  return resumen;
};

// ── API pública ──

/** Resumen de un mes, calculado al momento */
const generarResumenMensual = async (placa, anio, mes) => {
  const p = validarPlacaTexto(placa);
  const a = validarAnio(anio);
  const m = validarMes(mes);
  const [gastos, viajes] = await Promise.all([leerGastos(), leerViajes()]);
  return calcularMes(p, a, m, gastos, viajes);
};

/**
 * Resumen de los 12 meses + TOTAL leyendo las hojas UNA sola vez.
 * opciones.guardar: guarda los meses con movimiento (o que ya estaban en la hoja) y el TOTAL.
 */
const generarResumenAnual = async (placa, anio, opciones = {}) => {
  const p = validarPlacaTexto(placa);
  const a = validarAnio(anio);
  const [gastos, viajes] = await Promise.all([leerGastos(), leerViajes()]);

  const resumenMensual = [];
  for (let mes = 1; mes <= 12; mes++) resumenMensual.push(calcularMes(p, a, mes, gastos, viajes));
  const total_anual = calcularTotal(p, a, resumenMensual);

  // Por compatibilidad, si no se indica, se guarda como antes
  if (opciones.guardar !== false) {
    await guardarVarios([...resumenMensual, total_anual], (r) => r.mes !== 'TOTAL' && !tieneMovimiento(r));
  }

  return { resumen_mensual: resumenMensual, total_anual };
};

/** Filas del año (12 meses + TOTAL) calculadas al momento. Antes leía lo guardado y podía estar desactualizado */
const getResumenVehiculo = async (placa, anio) => {
  const { resumen_mensual, total_anual } = await generarResumenAnual(placa, anio, { guardar: false });
  return [...resumen_mensual, total_anual];
};

/** Lo que está guardado como cierre en Resumen_Vehiculo para una placa y año */
const getResumenGuardado = async (placa, anio) => {
  const p = validarPlacaTexto(placa);
  const a = String(validarAnio(anio));
  const { filas } = await leerHoja(HOJA_RESUMEN);
  return filas
    .filter((f) => normalizarPlaca(f.placa) === p && String(f.anio ?? '').trim() === a)
    .map(({ _fila, ...f }) => ({ ...f, placa: p, mes: normalizarMes(f.mes) }));
};

/**
 * Resumen del mes de todos los vehículos que el usuario puede ver.
 * Incluye los vehículos de la hoja Vehiculos y cualquier placa con movimiento en el mes.
 */
const generarResumenFlota = async (anio, mes, usuario, opciones = {}) => {
  const a = validarAnio(anio);
  const m = validarMes(mes);
  const clave = `${a}-${dos(m)}`;

  const [gastos, viajes, vehiculos] = await Promise.all([leerGastos(), leerViajes(), vehiculoHelper.getVehiculos()]);

  const placas = new Set();
  (vehiculos || []).forEach((v) => placas.add(normalizarPlaca(v.placa)));
  gastos.forEach((g) => g.mes === clave && placas.add(g.placa));
  viajes.forEach((v) => v.mes === clave && placas.add(v.placa));

  const visibles = [...placas]
    .filter((p) => p && (!usuario || puedeVerPlaca(usuario, p)))
    .sort();

  const resumenes = visibles.map((p) => calcularMes(p, a, m, gastos, viajes));

  if (opciones.guardar) await guardarVarios(resumenes, (r) => !tieneMovimiento(r));
  return resumenes;
};

export const resumenVehiculoHelper = {
  generarResumenMensual,
  guardarResumenMensual,
  generarResumenAnual,
  getResumenVehiculo,
  // Nuevas
  getResumenGuardado,
  generarResumenFlota,
  guardarVarios,
  calcularMes,
  validarAnio,
  validarMes,
};
