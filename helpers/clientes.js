import { google } from 'googleapis';

const spreadsheetId = '1UtSm_ZBiNWt2njncuJ5PSHreMbj3InG9gyXapqVUBEQ';

const getAuth = () => {
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets'
      ],
    });
  } else {
    return new google.auth.GoogleAuth({
      keyFile: './config/credenciales-sheets.json',
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets'
      ],
    });
  }
};

const getSheetsClient = async () => {
  const authClient = getAuth();
  const client = await authClient.getClient();
  return google.sheets({ version: 'v4', auth: client });
};

const obtenerDatosCliente = async () => {
  const sheets = await getSheetsClient();
  
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

  const ultimo = clientes[clientes.length - 1].codigo;

  const numero = parseInt(ultimo.split('-')[1], 10) || 0;

  return `C-${numero + 1}`;
};

const guardarCliente = async ({  empresa, nit, estado, viajes, economia, telefono, email,tipo_pago, rete_fuente, rete_ica, fecha_creacion }) => {
  const sheets = await getSheetsClient();
  const codigo = await getSiguienteCodigo();

  const nuevaFila = [ codigo, empresa, nit, estado, viajes, economia, telefono, email, tipo_pago, rete_fuente, rete_ica, fecha_creacion];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
      range: 'Clientes!A1:N100',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

  return { codigo };
};

const getClienteByStatus = async (status) => {
  const clientes = await getClientes();
  return clientes.filter(cliente => 
    cliente.estado && cliente.estado.toLowerCase() === status.toLowerCase()
  );
};

const getClienteById = async (codigo) => {
  const clientes = await getClientes();
  return clientes.find(cliente => 
    cliente.codigo && cliente.codigo.toLowerCase() === codigo.toLowerCase()
  );
};

const getClientesPorEstado = async (valor) => {
  const clientes = await getClientes();
  return filtrarClientesPorCampoTexto(clientes, estado, valor);
};

const editarClienteporCodigo = async (codigo, nuevosDatos) => {
  const sheets = await getSheetsClient();

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
  filaActual[5],
  nuevosDatos.telefono || filaActual[6],
  nuevosDatos.email || filaActual[7],
  nuevosDatos.tipo_pago || filaActual[8],
  nuevosDatos.rete_fuente || filaActual[9],
  nuevosDatos.rete_ica || filaActual[10],
  filaActual[11], 
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
  const sheets = await getSheetsClient();

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
    const sheets = await getSheetsClient();
    
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

// Función auxiliar para convertir número de columna a letra
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
  getClienteByStatus,
  getClienteById,
  getClientesPorEstado,
  editarClienteporCodigo,
  actualizarEstadoEnSheets,
  actualizarEconomiaCliente
};