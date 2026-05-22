import { getSheetsClient } from '../services/google.js';

const spreadsheetId = process.env.SPREADSHEET_ID;

const getGastosVehiculos = async () => {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Gastos_Vehiculos!A2:H1000',
  });

  const rows = res.data.values || [];
  const headers = ['consecutivo', 'fecha_registro', 'placa', 'tipo_gasto', 'codigo_referencia', 'valor_gasto', 'descripcion', 'link_soporte'];
  
  return rows.map(row =>
    Object.fromEntries(row.map((val, i) => [headers[i], val]))
  ).sort((a, b) => {
    const numA = parseInt(a.consecutivo?.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.consecutivo?.replace(/\D/g, ''), 10) || 0;
    return numB - numA;
  });
};

const getSiguienteConsecutivo = async () => {
  const gastos = await getGastosVehiculos();
  
  if (!gastos.length) return "G-1";

  const ultimo = gastos[0].consecutivo;
  const numero = parseInt(ultimo.split('-')[1], 10) || 0;
  
  return `G-${numero + 1}`;
};

const getGastoById = async (consecutivo) => {
  const gastos = await getGastosVehiculos();
  return gastos.find(gasto => 
    gasto.consecutivo && gasto.consecutivo.toLowerCase() === consecutivo.toLowerCase()
  );
};

const getResumenGastosPorPlaca = async (placas) => {
  try {
    const todoslosGastos = await getGastosVehiculos()

    // convertir a array si llega una sola placa
    const placasArray = Array.isArray(placas)
      ? placas
      : [placas]

    const placasUpper = placasArray.map(p =>
      p.trim().toUpperCase()
    )

    const gastosFiltrados =
      todoslosGastos.filter(p =>
        placasUpper.includes(
          p.placa?.trim().toUpperCase()
        )
      )

    const mapConDatos = (lista) => {

      return lista.map(r => ({

        consecutivo: r.consecutivo || '',
        fecha_registro: r.fecha_registro || '',
        placa: r.placa || '',
        tipo_gasto: r.tipo_gasto || '',
        codigo_referencia: r.codigo_referencia || '',
        valor_gasto: r.valor_gasto || '',
      }))
    }
    return {
      total: {
        count: gastosFiltrados.length,
        consecutivos: mapConDatos(gastosFiltrados)
      }
    }
  } catch (error) {
    console.error('Error al obtener resumen de gastos por placa:', error);
    throw error;
  }
};

const ordenarGastosPorCampoNumerico = (gastos, campo, orden = 'desc') => {
  return gastos.sort((a, b) => {
    const valorA = parseFloat(a[campo]) || 0;
    const valorB = parseFloat(b[campo]) || 0;
    
    return orden.toLowerCase() === 'desc' ? valorB - valorA : valorA - valorB;
  });
};

const getVehiculoOrdenadosPorValor = async (orden = 'desc') => {
  const gastos = await getGastosVehiculos();
  return ordenarGastosPorCampoNumerico(gastos, 'valor_gasto', orden);
};

const registrarGasto = async ({ placa, tipo_gasto, codigo_referencia, valor_gasto, descripcion, fecha_registro, link_soporte = '' }) => {
  const sheets = getSheetsClient();
  const consecutivo = await getSiguienteConsecutivo();

  const nuevaFila = [
    consecutivo,
    fecha_registro,
    placa,
    tipo_gasto,
    codigo_referencia,
    valor_gasto,
    descripcion || '',
    link_soporte
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Gastos_Vehiculos!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

  return { consecutivo };
};

const editarGastoporConsecutivo = async (consecutivo, nuevosDatos) => {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Gastos_Vehiculos!A2:H1000', 
  });

  const filas = response.data.values;
  const filaIndex = filas.findIndex(fila => fila[0]?.toLowerCase() === consecutivo.toLowerCase());

  if (filaIndex === -1) {
    return null; 
  }

  // teer los datos actuales
  const filaActual = filas[filaIndex];
  
  const filaEditada = [
  filaActual[0], 
  filaActual[1],
  nuevosDatos.placa || filaActual[2],
  nuevosDatos.tipo_gasto || filaActual[3],
  nuevosDatos.codigo_referencia || filaActual[4],
  nuevosDatos.valor_gasto || filaActual[5],
  nuevosDatos.descripcion || filaActual[6],
];

  const filaEnHoja = filaIndex + 2; 

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Gastos_Vehiculos!A${filaEnHoja}:H${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [filaEditada],
    },
  });

  return true;
};

export const gastosVehiculoHelper = {
  getSiguienteConsecutivo,
  getResumenGastosPorPlaca,
  getGastosVehiculos,
  getGastoById,
  getVehiculoOrdenadosPorValor,
  registrarGasto,
  editarGastoporConsecutivo
};