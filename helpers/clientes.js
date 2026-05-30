import { getSheetsClient } from '../services/google.js';

const spreadsheetId = process.env.SPREADSHEET_ID;

const obtenerDatosCliente = async () => {
  const sheets = getSheetsClient();
  
  const range = 'Clientes!A1:N100'; 

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(row =>
    Object.fromEntries(row.map((val, i) => [headers[i], val]))
  );
};

const getClientes = () => obtenerDatosCliente();

const getSiguienteCodigo = async () => {
  const clientes = await getClientes();

  if (!clientes.length) return "C-1";

  const maxNumero = Math.max(
    ...clientes.map((c) => parseInt(c.codigo?.split('-')[1], 10) || 0)
  );
  
  return `C-${maxNumero + 1}`;
};

const guardarCliente = async ({  empresa, nit, estado, viajes, telefono, email,tipo_pago, rete_fuente, rete_ica, fecha_creacion }) => {
  const sheets = getSheetsClient();
  const codigo = await getSiguienteCodigo();

  const nuevaFila = [ codigo, empresa, nit, estado, viajes, telefono, email, tipo_pago, rete_fuente, rete_ica, fecha_creacion];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
      range: 'Clientes!A1:N100',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

  return { codigo };
};

const getClienteById = async (codigo) => {
  const clientes = await getClientes();
  return clientes.find(cliente => 
    cliente.codigo && cliente.codigo.toLowerCase() === codigo.toLowerCase()
  );
};

const filtrarClientesPorCampoTexto = (clientes, campo, valor) => {
  return clientes.filter(cliente => 
    cliente[campo] && cliente[campo].toLowerCase() === valor.toLowerCase()
  );
};

const ordenarClientesPorCampoNumerico = (clientes, campo, orden = 'desc') => {
  return clientes.sort((a, b) => {
    const valorA = parseFloat(a[campo]) || 0;
    const valorB = parseFloat(b[campo]) || 0;
    
    return orden.toLowerCase() === 'desc' ? valorB - valorA : valorA - valorB;
  });
};

const getClientesPorEstado = async (valor) => {
  const clientes = await getClientes();
  return filtrarClientesPorCampoTexto(clientes, 'estado', valor);
};

const getClientesOrdenadosPorViajes = async (orden = 'desc') => {
  const clientes = await getClientes();
  return ordenarClientesPorCampoNumerico(clientes, 'viajes', orden);
};

const getClientesPorTipoPago = async (valor) => {
  const clientes = await getClientes();
  return filtrarClientesPorCampoTexto(clientes, 'tipo_pago', valor);
};

const getClientesPorReteFuente = async (valor) => {
  const clientes = await getClientes();
  return filtrarClientesPorCampoTexto(clientes, 'rete_fuente', valor);
};

const getClientesOrdenadosPorReteIca = async (orden = 'desc') => {
  const clientes = await getClientes();
  return ordenarClientesPorCampoNumerico(clientes, 'rete_ica', orden);
};

const getClientesOrdenadosPorValorEstimado = async (orden = 'desc') => {
  const clientes = await getClientes();
  return ordenarClientesPorCampoNumerico(clientes, 'total_valor_viaje_estimado', orden);
};

const getClientesOrdenadosPorValorReal = async (orden = 'desc') => {
  const clientes = await getClientes();
  return ordenarClientesPorCampoNumerico(clientes, 'total_valor_viaje_real', orden);
};

const getClientesOrdenadosPorGanancia = async (orden = 'desc') => {
  const clientes = await getClientes();
  return ordenarClientesPorCampoNumerico(clientes, 'total_ganancia_viaje', orden);
};

const editarClienteporCodigo = async (codigo, nuevosDatos) => {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Clientes!A2:L50', 
  });

  const filas = response.data.values;
  const filaIndex = filas.findIndex(fila => fila[0]?.toLowerCase() === codigo.toLowerCase());

  if (filaIndex === -1) {
    return null; 
  }

  const filaActual = filas[filaIndex];
  
  const filaEditada = [
  filaActual[0], 
  nuevosDatos.empresa || filaActual[1],
  nuevosDatos.nit || filaActual[2],
  filaActual[3],
  filaActual[4],
  nuevosDatos.telefono || filaActual[5],
  nuevosDatos.email || filaActual[6],
  nuevosDatos.tipo_pago || filaActual[7],
  nuevosDatos.rete_fuente || filaActual[8],
  nuevosDatos.rete_ica || filaActual[9],
  filaActual[10], 
  filaActual[11], 
  filaActual[12], 
  filaActual[13], 
];

  const filaEnHoja = filaIndex + 2; 

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Clientes!A${filaEnHoja}:N${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [filaEditada],
    },
  });

  return true;
};

const actualizarEconomiaCliente = async (codigoCliente, valor_viaje_estimado, valor_viaje_real, ganancia_viaje) => {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Clientes!A2:O1000', // Ajusta según tus columnas
  });

  const filas = response.data.values;
  const filaIndex = filas.findIndex(f => f[0] === codigoCliente);

  if (filaIndex === -1) {
    throw new Error('Cliente no encontrado');
  }

  const filaActual = filas[filaIndex];
  
  // Suponiendo que las columnas de economía están en:
  // L: total_valor_viaje_estimado
  // M: total_valor_viaje_real
  // N: total_ganancia_viaje
  
  const economiaEstimadaActual = parseFloat(filaActual[11]) || 0;
  const economiaRealActual = parseFloat(filaActual[12]) || 0;
  const gananciaActual = parseFloat(filaActual[13]) || 0;

  filaActual[11] = economiaEstimadaActual + valor_viaje_estimado;
  filaActual[12] = economiaRealActual + valor_viaje_real;
  filaActual[13] = gananciaActual + ganancia_viaje;

  const filaEnHoja = filaIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Clientes!A${filaEnHoja}:O${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: { values: [filaActual] },
  });

  return true;
};

const actualizarEstadoEnSheets = async (codigo, nuevoEstado = "activo") => {
  try {
    const sheets = getSheetsClient();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clientes!A1:L50', 
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      throw new Error('No se encontraron datos en la hoja');
    }
    
    // Determinar qué columna contiene el codigo y el estado
    const headers = rows[0];
    const codigoIndex = headers.findIndex(header => 
      header.toLowerCase() === 'codigo');
    const estadoIndex = headers.findIndex(header => 
      header.toLowerCase() === 'estado');
    
    if (codigoIndex === -1 || estadoIndex === -1) {
      throw new Error('No se encontraron las columnas necesarias');
    }
    
    // Encontrar la fila que corresponde al codigo
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][codigoIndex] && 
          rows[i][codigoIndex].toLowerCase() === codigo.toLowerCase()) {
        rowIndex = i;
        break;
      }
    }
    
    if (rowIndex === -1) {
      throw new Error(`No se encontró el codigo ${codigo}`);
    }
    
    // Actualizar el estado en Google Sheets
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Clientes!${getColumnLetter(estadoIndex + 1)}${rowIndex + 1}`,
      valueInputOption: 'RAW',
      resource: {
        values: [[nuevoEstado]]
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error al actualizar el estado en Google Sheets:', error);
    throw error;
  }
};

function getColumnLetter(columnNumber) {
  let columnLetter = '';
  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    columnLetter = String.fromCharCode(65 + remainder) + columnLetter;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }
  return columnLetter;
}

export const clienteHelper = {
  getClientes,
  guardarCliente,
  getClienteById,
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
  actualizarEconomiaCliente
};