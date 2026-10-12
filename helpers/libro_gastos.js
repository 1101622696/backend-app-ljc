import { leerHoja, agregarFila, actualizarCampos, siguienteConsecutivo, conCandado, aNumero } from './hoja.js';
import { hoy } from './fechas.js';

// "Gastos_Vehiculos" = libro de gastos de cada vehículo (una fila por gasto).
// Encabezados: consecutivo | fecha_registro | placa | tipo_gasto | codigo_referencia | valor_gasto | descripcion | link_soporte
//
// registrarOActualizar evita duplicados: si ya existe una fila con el mismo
// (tipo_gasto, codigo_referencia, placa) la actualiza en vez de agregar otra.

const HOJA = 'Gastos_Vehiculos';

const igual = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

export const registrarOActualizar = ({ placa, tipo_gasto, codigo_referencia, valor_gasto, descripcion = '', fecha_registro, link_soporte = '' }) =>
  conCandado('gastos_vehiculos', async () => {
    const { encabezados, filas } = await leerHoja(HOJA);
    const existente = filas.find(
      (f) => igual(f.tipo_gasto, tipo_gasto) && igual(f.codigo_referencia, codigo_referencia) && igual(f.placa, placa)
    );
    const valor = Math.round(aNumero(valor_gasto));

    if (existente) {
      await actualizarCampos(HOJA, encabezados, existente._fila, { valor_gasto: valor, descripcion }, { omitirFaltantes: true });
      return existente.consecutivo;
    }

    const consecutivo = siguienteConsecutivo(filas, 'consecutivo', 'G');
    await agregarFila(HOJA, encabezados, {
      consecutivo,
      fecha_registro: fecha_registro || hoy(),
      placa: String(placa).trim().toUpperCase(),
      tipo_gasto,
      codigo_referencia,
      valor_gasto: valor,
      descripcion,
      link_soporte,
    });
    return consecutivo;
  });

export const libroGastos = { registrarOActualizar };
