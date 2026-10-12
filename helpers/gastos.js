import { leerHoja, actualizarCampos, agregarFila, aNumero, siguienteConsecutivo, conCandado } from './hoja.js';
import { hoy, aFechaISO, parsearFecha } from './fechas.js';
import { ErrorApp } from './errores.js';
import { obtenerCarpeta, subirArchivos } from './carpetas.js';
import { getDriveClient } from '../services/google.js';

// ─────────────────────────────────────────────────────────────
// Hoja "Gastos_Vehiculos" = libro de gastos de cada vehículo.
// Encabezados: consecutivo, fecha_registro, placa, tipo_gasto, codigo_referencia, valor_gasto, descripcion, link_soporte
//
// Gastos AUTOMÁTICOS (los crea su módulo y se sincronizan desde allá; no se editan aquí):
//   combustible, viaje, nomina_viajes, nomina_salario, mantenimiento
// Gastos MANUALES (codigo_referencia MANUAL-...): soat, tecnico, poliza, impuesto, llantas, repuestos, otro…
//
// Usa el mismo candado que libro_gastos.js para que los consecutivos G-n nunca se repitan.
// ─────────────────────────────────────────────────────────────

const HOJA = 'Gastos_Vehiculos';
// Soportes de gastos manuales: CARPETA_PADRE_ID_VEHICULOS / PLACA / Gastos / G-n
const carpetaVehiculos = () => process.env.CARPETA_PADRE_ID_VEHICULOS;
const CANDADO = 'gastos_vehiculos';
export const TIPOS_AUTOMATICOS = ['combustible', 'viaje', 'nomina_viajes', 'nomina_salario', 'mantenimiento'];

const minuscula = (v) => String(v ?? '').trim().toLowerCase();
const normalizarPlaca = (p) => String(p ?? '').replace(/\s+/g, '').toUpperCase();
const numero = (c) => parseInt(String(c).replace(/\D/g, ''), 10) || 0;

const esManual = (g) => String(g.codigo_referencia ?? '').toUpperCase().startsWith('MANUAL-');

const normalizar = (f) => ({
  ...f,
  consecutivo: String(f.consecutivo ?? '').trim().toUpperCase(),
  placa: normalizarPlaca(f.placa),
  tipo_gasto: minuscula(f.tipo_gasto),
  valor_gasto: aNumero(f.valor_gasto),
  fecha_registro: aFechaISO(f.fecha_registro) || String(f.fecha_registro ?? ''),
});

async function leerGastos() {
  const { encabezados, filas } = await leerHoja(HOJA);
  return { encabezados, gastos: filas.filter((f) => f.consecutivo).map(normalizar) };
}

const conBandera = ({ _fila, ...g }) => ({ ...g, editable: esManual(g) });

/** Todos, más reciente primero */
const getGastosVehiculos = async () =>
  (await leerGastos()).gastos.sort((a, b) => numero(b.consecutivo) - numero(a.consecutivo)).map(conBandera);

const getSiguienteConsecutivo = async () => siguienteConsecutivo((await leerGastos()).gastos, 'consecutivo', 'G');

const getGastoById = async (consecutivo) => {
  const buscado = String(consecutivo ?? '').trim().toUpperCase();
  return (await getGastosVehiculos()).find((g) => g.consecutivo === buscado) || null;
};

const getResumenGastosPorPlaca = async (placas) => {
  const lista = (Array.isArray(placas) ? placas : String(placas).split(',')).map(normalizarPlaca).filter(Boolean);
  const gastos = (await getGastosVehiculos()).filter((g) => lista.includes(g.placa));
  return {
    total: {
      count: gastos.length,
      valor: gastos.reduce((s, g) => s + g.valor_gasto, 0),
      consecutivos: gastos.map((g) => ({
        consecutivo: g.consecutivo,
        fecha_registro: g.fecha_registro,
        placa: g.placa,
        tipo_gasto: g.tipo_gasto,
        codigo_referencia: g.codigo_referencia || '',
        valor_gasto: g.valor_gasto,
        descripcion: g.descripcion || '',
        link_soporte: g.link_soporte || '',
        editable: g.editable,
      })),
    },
  };
};

const getVehiculoOrdenadosPorValor = async (orden = 'desc') =>
  (await getGastosVehiculos()).sort((a, b) => (orden === 'desc' ? b.valor_gasto - a.valor_gasto : a.valor_gasto - b.valor_gasto));

const getGastosOrdenadosPorFecha = async (orden = 'desc') => {
  const t = (g) => parsearFecha(g.fecha_registro)?.getTime() || 0;
  return (await getGastosVehiculos()).sort((a, b) => (orden === 'desc' ? t(b) - t(a) : t(a) - t(b)));
};

// ── Registrar ──

/** Uso interno (compatibilidad): agrega una fila tal cual, con consecutivo seguro */
const registrarGasto = ({ placa, tipo_gasto, codigo_referencia, valor_gasto, descripcion, fecha_registro, link_soporte = '' }) =>
  conCandado(CANDADO, async () => {
    const { encabezados, gastos } = await leerGastos();
    const consecutivo = siguienteConsecutivo(gastos, 'consecutivo', 'G');
    await agregarFila(HOJA, encabezados, {
      consecutivo,
      fecha_registro: aFechaISO(fecha_registro) || hoy(),
      placa: normalizarPlaca(placa),
      tipo_gasto: minuscula(tipo_gasto),
      codigo_referencia,
      valor_gasto: Math.round(aNumero(valor_gasto)),
      descripcion: descripcion || '',
      link_soporte,
    });
    return { consecutivo };
  });

function validarManual(datos, { crear }) {
  const cambios = {};
  if (datos.tipo_gasto !== undefined || crear) {
    const tipo = minuscula(datos.tipo_gasto);
    if (!tipo) throw new ErrorApp(400, 'Seleccione el tipo de gasto');
    if (TIPOS_AUTOMATICOS.includes(tipo)) {
      throw new ErrorApp(400, `Los gastos de tipo "${tipo}" se registran desde su propio módulo`);
    }
    cambios.tipo_gasto = tipo;
  }
  if (datos.valor_gasto !== undefined || crear) {
    const valor = Math.round(aNumero(datos.valor_gasto));
    if (valor <= 0) throw new ErrorApp(400, 'El valor del gasto debe ser mayor a cero');
    cambios.valor_gasto = valor;
  }
  if (datos.placa !== undefined || crear) {
    cambios.placa = normalizarPlaca(datos.placa);
    if (!cambios.placa) throw new ErrorApp(400, 'Seleccione la placa');
  }
  if (datos.fecha_registro) {
    cambios.fecha_registro = aFechaISO(datos.fecha_registro);
    if (!cambios.fecha_registro) throw new ErrorApp(400, 'Fecha no válida');
  }
  if (datos.descripcion !== undefined) cambios.descripcion = String(datos.descripcion).trim();
  return cambios;
}

/** Carpeta VEHICULOS/PLACA/Gastos (la crea si no existe) */
async function carpetaGastosDe(placa) {
  if (!carpetaVehiculos()) throw new ErrorApp(500, 'Falta CARPETA_PADRE_ID_VEHICULOS en el .env para guardar soportes');
  const carpetaPlaca = await obtenerCarpeta(normalizarPlaca(placa), carpetaVehiculos());
  return obtenerCarpeta('Gastos', carpetaPlaca.id);
}

/** Sube los soportes a VEHICULOS/PLACA/Gastos/G-n y devuelve el link de esa carpeta */
async function guardarSoportes(archivos, placa, consecutivo) {
  if (!archivos?.length) return '';
  const carpetaGastos = await carpetaGastosDe(placa);
  const carpeta = await obtenerCarpeta(consecutivo, carpetaGastos.id);
  await subirArchivos(archivos, carpeta.id);
  return carpeta.link;
}

const idCarpetaDeLink = (link) => String(link ?? '').match(/folders\/([a-zA-Z0-9_-]+)/)?.[1] || null;

/** Al cambiar la placa del gasto, su carpeta de soportes pasa a la carpeta Gastos de la placa nueva
 *  (el visor decide quién la ve por la placa de la carpeta) */
async function moverSoportes(link, placaNueva) {
  const id = idCarpetaDeLink(link);
  if (!id) return;
  const drive = getDriveClient();
  const { data } = await drive.files.get({ fileId: id, fields: 'id, parents' });
  const destino = await carpetaGastosDe(placaNueva);
  const actuales = (data.parents || []).filter((p) => p !== destino.id);
  if (!actuales.length) return;
  await drive.files.update({ fileId: id, addParents: destino.id, removeParents: actuales.join(','), fields: 'id' });
}

const buscarGasto = (gastos, consecutivo) =>
  gastos.find((g) => g.consecutivo === String(consecutivo ?? '').trim().toUpperCase());

/**
 * Gasto manual desde la pantalla de Gastos (archivos = soportes, opcionales).
 * La fila se escribe dentro del candado (consecutivo seguro) y los archivos se suben DESPUÉS, fuera
 * del candado: subir 10 fotos tarda y el candado lo comparten los gastos de todos los módulos.
 */
const registrarGastoManual = async (datos, archivos = []) => {
  const cambios = validarManual(datos, { crear: true });
  const { consecutivo } = await conCandado(CANDADO, async () => {
    const { encabezados, gastos } = await leerGastos();
    const nuevo = siguienteConsecutivo(gastos, 'consecutivo', 'G');
    await agregarFila(HOJA, encabezados, {
      fecha_registro: hoy(),
      descripcion: `Gasto manual: ${cambios.tipo_gasto}`,
      ...cambios,
      consecutivo: nuevo,
      codigo_referencia: `MANUAL-${nuevo}`,
      link_soporte: datos.link_soporte || '',
    });
    return { consecutivo: nuevo };
  });

  if (!archivos.length) return { consecutivo, link_soporte: datos.link_soporte || '' };

  try {
    const link = await guardarSoportes(archivos, cambios.placa, consecutivo);
    const { encabezados, gastos } = await leerGastos();
    const fila = buscarGasto(gastos, consecutivo);
    if (fila) await actualizarCampos(HOJA, encabezados, fila._fila, { link_soporte: link }, { omitirFaltantes: true });
    return { consecutivo, link_soporte: link };
  } catch (error) {
    // El gasto ya quedó: se avisa para que adjunte el soporte editándolo (reintentar duplicaría el gasto)
    console.error(`Gasto ${consecutivo}: no se pudieron subir los soportes:`, error.message);
    return {
      consecutivo,
      link_soporte: '',
      advertencia: `El gasto ${consecutivo} quedó registrado, pero los soportes no se pudieron subir. Edítelo para adjuntarlos.`,
    };
  }
};

/** Solo gastos manuales; los automáticos se corrigen en su módulo. Los archivos se suman a la carpeta del gasto */
const editarGastoporConsecutivo = async (consecutivo, nuevosDatos, archivos = []) => {
  const { encabezados, gastos } = await leerGastos();
  const gasto = buscarGasto(gastos, consecutivo);
  if (!gasto) return null;
  if (!esManual(gasto)) {
    throw new ErrorApp(409, `Este gasto viene de ${gasto.tipo_gasto} (${gasto.codigo_referencia}). Corríjalo desde ese módulo.`);
  }
  const cambios = validarManual(nuevosDatos, { crear: false });
  const placaFinal = cambios.placa || gasto.placa;

  if (placaFinal !== gasto.placa && gasto.link_soporte) await moverSoportes(gasto.link_soporte, placaFinal);
  if (archivos.length) cambios.link_soporte = await guardarSoportes(archivos, placaFinal, gasto.consecutivo);

  if (Object.keys(cambios).length) await actualizarCampos(HOJA, encabezados, gasto._fila, cambios, { omitirFaltantes: true });
  return true;
};

export const gastosVehiculoHelper = {
  TIPOS_AUTOMATICOS,
  getSiguienteConsecutivo,
  getResumenGastosPorPlaca,
  getGastosVehiculos,
  getGastoById,
  getVehiculoOrdenadosPorValor,
  getGastosOrdenadosPorFecha,
  registrarGasto,
  registrarGastoManual,
  editarGastoporConsecutivo,
};
