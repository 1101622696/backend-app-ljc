import { google } from 'googleapis';
import stream from 'stream';

const spreadsheetId = '1UtSm_ZBiNWt2njncuJ5PSHreMbj3InG9gyXapqVUBEQ';

const getAuth = () => {
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ],
    });
  } else {
    return new google.auth.GoogleAuth({
      keyFile: './config/credenciales-sheets.json',
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ],
    });
  }
};

const getSheetsClient = async () => {
  const authClient = getAuth();
  const client = await authClient.getClient();
  return google.sheets({ version: 'v4', auth: client });
};
const getDriveClient = async () => {
  const authClient = getAuth();
  const client = await authClient.getClient();
  return google.drive({ version: 'v3', auth: client });
};

const obtenerDatosVehiculo = async () => {
  const sheets = await getSheetsClient();
  
  const range = 'Vehiculos!A1:AC100'; 

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

const getVehiculos = () => obtenerDatosVehiculo();

const guardarVehiculo = async ({ placa, viajes, licencia, marca, modelo, referencia, odometro, clase_vehiculo, color, servicio, capacidad, combustible, numero_motor, numero_chasis, fecha_matricula, soat, soat_expedicion, soat_vencimiento, capacidad_ton, tecnico, tecnico_expedicion, tecnico_vencimiento, poliza, poliza_expedicion, poliza_vencimiento, Link, estado, fecha_creacion }) => {
  const sheets = await getSheetsClient();

  const nuevaFila = [placa, viajes, licencia, marca, modelo, referencia, odometro, clase_vehiculo, color, servicio, capacidad, combustible, numero_motor, numero_chasis, fecha_matricula, soat, soat_expedicion, soat_vencimiento, capacidad_ton, tecnico, tecnico_expedicion, tecnico_vencimiento, poliza, poliza_expedicion, poliza_vencimiento, Link, estado, fecha_creacion];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
      range: 'Vehiculos!A1:AC100',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

  return { placa };
};
const getVehiculoByStatus = async (status) => {
  const vehiculos = await getVehiculos();
  return vehiculos.filter(vehiculo => 
    vehiculo.estado && vehiculo.estado.toLowerCase() === status.toLowerCase()
  );
};
const getVehiculoById = async (placa) => {
  const vehiculos = await getVehiculos();
  return vehiculos.find(vehiculo => 
    vehiculo.placa && vehiculo.placa.toLowerCase() === placa.toLowerCase()
  );
};

const filtrarVehiculosPorCampoTexto = (vehiculos, campo, valor) => {
  return vehiculos.filter(vehiculo => 
    vehiculo[campo] && vehiculo[campo].toLowerCase() === valor.toLowerCase()
  );
};

const getVehiculosPorEstado = async (valor) => {
  const vehiculos = await getVehiculos();
  return filtrarVehiculosPorCampoTexto(vehiculos, estado, valor);
};

const ordenarVehiculosPorCampoNumerico = (vehiculos, campo, orden = 'desc') => {
  return vehiculos.sort((a, b) => {
    const valorA = parseFloat(a[campo]) || 0;
    const valorB = parseFloat(b[campo]) || 0;
    
    return orden.toLowerCase() === 'desc' ? valorB - valorA : valorA - valorB;
  });
};

const getVehiculosOrdenadosPorFechaPoliza = async (orden = 'desc') => {
  const vehiculos = await getVehiculos();
  
  return vehiculos.sort((a, b) => {
    const fechaA = new Date(a.poliza_vencimiento || 0);
    const fechaB = new Date(b.poliza_vencimiento || 0);
    
    return orden.toLowerCase() === 'desc' ? fechaB - fechaA : fechaA - fechaB;
  });
};

const getVehiculosOrdenadosPorFechaSoat = async (orden = 'desc') => {
  const vehiculos = await getVehiculos();
  
  return vehiculos.sort((a, b) => {
    const fechaA = new Date(a.soat_vencimiento || 0);
    const fechaB = new Date(b.soat_vencimiento || 0);
    
    return orden.toLowerCase() === 'desc' ? fechaB - fechaA : fechaA - fechaB;
  });
};

const getVehiculosOrdenadosPorFechaTecnico = async (orden = 'desc') => {
  const vehiculos = await getVehiculos();
  
  return vehiculos.sort((a, b) => {
    const fechaA = new Date(a.tecnico_vencimiento || 0);
    const fechaB = new Date(b.tecnico_vencimiento || 0);
    
    return orden.toLowerCase() === 'desc' ? fechaB - fechaA : fechaA - fechaB;
  });
};

const getVehiculoOrdenadosPorViajes = async (orden = 'desc') => {
  const vehiculos = await getVehiculos();
  return ordenarVehiculosPorCampoNumerico(vehiculos, "viajes", orden);
};

const getVehiculoOrdenadosPorDistancia = async (orden = 'desc') => {
  const vehiculos = await getVehiculos();
  return ordenarVehiculosPorCampoNumerico(vehiculos, "odometro", orden);
};

const editarVehiculoporPlaca = async (placa, nuevosDatos) => {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Vehiculos!A2:AC100', 
  });

  const filas = response.data.values;
  const filaIndex = filas.findIndex(fila => fila[0]?.toLowerCase() === placa.toLowerCase());

  if (filaIndex === -1) {
    return null; 
  }

  // teer los datos actuales
  const filaActual = filas[filaIndex];
  
  const filaEditada = [
  filaActual[0], 
  filaActual[1],
  nuevosDatos.licencia || filaActual[2],
  nuevosDatos.marca || filaActual[3],
  nuevosDatos.modelo || filaActual[4],
  nuevosDatos.referencia || filaActual[5],
  nuevosDatos.odometro || filaActual[6],
  nuevosDatos.clase_vehiculo || filaActual[7],
  nuevosDatos.color || filaActual[8],
  nuevosDatos.servicio || filaActual[9],
  nuevosDatos.capacidad || filaActual[10],
  nuevosDatos.combustible || filaActual[11],
  nuevosDatos.numero_motor || filaActual[12],
  nuevosDatos.numero_chasis || filaActual[13],
  nuevosDatos.fecha_matricula || filaActual[14],
  nuevosDatos.soat || filaActual[15], 
  nuevosDatos.soat_expedicion || filaActual[16],
  nuevosDatos.soat_vencimiento || filaActual[17], 
  nuevosDatos.capacidad_ton || filaActual[18],
  nuevosDatos.tecnico || filaActual[19], 
  nuevosDatos.tecnico_expedicion || filaActual[20],
  nuevosDatos.tecnico_vencimiento || filaActual[21], 
  nuevosDatos.poliza || filaActual[25], 
  nuevosDatos.poliza_expedicion || filaActual[23],
  nuevosDatos.poliza_vencimiento || filaActual[24], 
  nuevosDatos.Link || filaActual[22],
  filaActual[26], 
  filaActual[27], 
];

  const filaEnHoja = filaIndex + 2; 

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Vehiculos!A${filaEnHoja}:AC${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [filaEditada],
    },
  });

  return true;
};

const crearCarpeta = async (nombreCarpeta, parentFolderId) => {
  const drive = await getDriveClient();
  
  const fileMetadata = {
    name: nombreCarpeta,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentFolderId ? [parentFolderId] : []
  };
  
  const respuesta = await drive.files.create({
    resource: fileMetadata,
    fields: 'id, webViewLink'
  });
  
  return respuesta.data;
};

const subirArchivo = async (archivo, carpetaId) => {
  try {
    const drive = await getDriveClient();

    const fileMetadata = {
      name: archivo.originalname,
      parents: [carpetaId]
    };

    const bufferStream = new stream.PassThrough();
    bufferStream.end(archivo.buffer);

    const media = {
      mimeType: archivo.mimetype,
      body: bufferStream
    };

    const respuesta = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink'
    });

    return respuesta.data.webViewLink;
  } catch (error) {
    console.error('Error subiendo archivo:', error.message);
    throw error;
  }
};

const procesarArchivos = async (archivos, placafoldername) => {
  if (!archivos || archivos.length === 0) {
    return null;
  }
  
  const carpetaPadreId = '1xD1GpMzuzb5qi0t2VpXUASJbQTvtnP1A';
  
  let carpeta = await buscarCarpetaPorNombre(placafoldername, carpetaPadreId);
  
    if (!carpeta) {
      carpeta = await crearCarpeta(placafoldername, carpetaPadreId);
    }

  const enlaces = [];
  for (const archivo of archivos) {
    const enlace = await subirArchivo(archivo, carpeta.id);
    enlaces.push(enlace);
  }
  
  return carpeta.webViewLink;
};

const actualizarEstadoEnSheets = async (placa, nuevoEstado = "activo") => {
  try {
    const sheets = await getSheetsClient();
    
    // Primero, obtener todos los datos para encontrar la fila del placa
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Vehiculos!A1:AC10', 
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      throw new Error('No se encontraron datos en la hoja');
    }
    
    // Determinar qué columna contiene el placa y el estado
    const headers = rows[0];
    const placaIndex = headers.findIndex(header => 
      header.toLowerCase() === 'placa');
    const estadoIndex = headers.findIndex(header => 
      header.toLowerCase() === 'estado');
    
    if (placaIndex === -1 || estadoIndex === -1) {
      throw new Error('No se encontraron las columnas necesarias');
    }
    
    // Encontrar la fila que corresponde al placa
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][placaIndex] && 
          rows[i][placaIndex].toLowerCase() === placa.toLowerCase()) {
        rowIndex = i;
        break;
      }
    }
    
    if (rowIndex === -1) {
      throw new Error(`No se encontró la placa ${placa}`);
    }
    
    // Actualizar el estado en Google Sheets
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Vehiculos!${getColumnLetter(estadoIndex + 1)}${rowIndex + 1}`,
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
const subirArchivosACarpetaExistente = async (archivos, carpetaId) => {
  if (!archivos || archivos.length === 0) {
    return null;
  }
  
  // Subir cada archivo a la carpeta existente
  const enlaces = [];
  for (const archivo of archivos) {
    const enlace = await subirArchivo(archivo, carpetaId);
    enlaces.push(enlace);
  }
  
  // Devolver el enlace a la carpeta (necesitamos obtenerlo)
  const drive = await getDriveClient();
  const carpeta = await drive.files.get({
    fileId: carpetaId,
    fields: 'webViewLink'
  });
  
  return carpeta.data.webViewLink;
};

const buscarCarpetaPorNombre = async (nombreCarpeta, parentFolderId) => {
  const drive = await getDriveClient();
  
  // Crear consulta para buscar por nombre exacto dentro de la carpeta padre
  let query = `name = '${nombreCarpeta}' and mimeType = 'application/vnd.google-apps.folder'`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  }
  
  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive'
  });
  
  return response.data.files.length > 0 ? response.data.files[0] : null;
};

const actualizarOdometroVehiculo = async (placa, nuevoOdometro) => {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Vehiculos!A2:AC100', 
  });

  const filas = response.data.values;
  const filaIndex = filas.findIndex(fila => fila[0]?.toLowerCase() === placa.toLowerCase());

  if (filaIndex === -1) {
    throw new Error('Vehículo no encontrado');
  }

  const filaEnHoja = filaIndex + 2;
  const filaActual = filas[filaIndex];
  
  // Actualizar solo la columna del odómetro (columna G = índice 6)
  filaActual[6] = nuevoOdometro;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Vehiculos!A${filaEnHoja}:AC${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [filaActual],
    },
  });

  return true;
};

export const vehiculoHelper = {
  getVehiculos,
  guardarVehiculo,
  getVehiculoByStatus,
  getVehiculoById,
  getVehiculosPorEstado,
  getVehiculoOrdenadosPorDistancia,
  getVehiculoOrdenadosPorViajes,
  getVehiculosOrdenadosPorFechaPoliza,
  getVehiculosOrdenadosPorFechaSoat,
  getVehiculosOrdenadosPorFechaTecnico,
  editarVehiculoporPlaca,
  procesarArchivos,
  actualizarEstadoEnSheets,
  subirArchivosACarpetaExistente,
  buscarCarpetaPorNombre,
  actualizarOdometroVehiculo
};