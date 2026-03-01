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

const obtenerDatosMantenimiento = async (nombreHoja, rango = 'A1:J1000') => {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${nombreHoja}!${rango}`,
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(row =>
    Object.fromEntries(row.map((val, i) => [headers[i], val]))
  );
};

const getMantenimientos = async () => {
  const mantenimientos = await obtenerDatosMantenimiento('Mantenimientos');
  
  return mantenimientos.sort((a, b) => {
    const numA = parseInt(a.consecutivo.replace(/\D/g, ''), 10);
    const numB = parseInt(b.consecutivo.replace(/\D/g, ''), 10);
    
    return numB - numA;
  });
};

const getSiguienteConsecutivo = async () => {
  const mantenimientos = await getMantenimientos();
  
  if (!mantenimientos.length) return "M-1";

  const ultimo = mantenimientos[0].consecutivo;

  const numero = parseInt(ultimo.split('-')[1], 10) || 0;
  
  return `M-${numero + 1}`;
};

const guardarMantenimiento = async ({ placa, tipo_mantenimiento, descripcion, valor_mantenimiento, odometro, correo_usuario, usuario, fecha_creacion, Link}) => {
  const sheets = await getSheetsClient();
  const consecutivo = await getSiguienteConsecutivo();
 
  const nuevaFila = [consecutivo, placa, tipo_mantenimiento, descripcion, valor_mantenimiento, odometro, correo_usuario , usuario , fecha_creacion, Link];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Mantenimientos!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

  return { consecutivo };
};

const getMantenimientosByConsecutivo = async (consecutivo) => {
  const mantenimientos = await getMantenimientos();
  return mantenimientos.find(mantenimiento => 
    mantenimiento.consecutivo && mantenimiento.consecutivo.toLowerCase() === consecutivo.toLowerCase()
  );
};

const getResumenMantenimientosPorSolicitante = async (email) => {
  try {
    const todoslosMantenimientos = await getMantenimientos();
    const mantenimientosFiltrados = todoslosMantenimientos.filter(m => m.correo_usuario  === email);

    const mapConDatos = (lista) => {
      return lista.map(r => ({
        consecutivo: r.consecutivo,
        odometro: r.odometro || '',
        fecha_creacion: r.fecha_creacion || '',
        correo_usuario : r.correo_usuario || '',
        usuario: r.usuario || '',
        descripcion: r.descripcion || '',
        placa: r.placa || '',
        link: r.link || '' ,

      }));  
    };

    return {
      total: {
        count: mantenimientosFiltrados.length,
        consecutivos: mapConDatos(mantenimientosFiltrados)
      }
    };
  } catch (error) {
    console.error('Error al obtener resumen de mantenimientos por email:', error);
    throw error;
  }
};

const editarMantenimientoporConsecutivo = async (consecutivo, nuevosDatos) => {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Mantenimientos!A2:J1000', 
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
  nuevosDatos.placa || filaActual[1],
  nuevosDatos.tipo_mantenimiento || filaActual[2],
  nuevosDatos.descripcion || filaActual[3],
  nuevosDatos.valor_mantenimiento || filaActual[4],
  nuevosDatos.odometro || filaActual[5],
  filaActual[6], 
  filaActual[7], 
  filaActual[8], 
  nuevosDatos.Link || filaActual[9],
];

  const filaEnHoja = filaIndex + 2; 

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Mantenimientos!A${filaEnHoja}:J${filaEnHoja}`,
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
};

const procesarArchivos = async (archivos, consecutivo) => {
  if (!archivos || archivos.length === 0) {
    return null;
  }
  
  const carpetaPadreId = '1pRUDMsCXZv3T_E_aloHqwjRvMt3DM4Fn';
  
  let carpeta = await buscarCarpetaPorNombre(consecutivo, carpetaPadreId);
  
  if (!carpeta) {
    carpeta = await crearCarpeta(consecutivo, carpetaPadreId);
  }
  
  const enlaces = [];
  for (const archivo of archivos) {
    const enlace = await subirArchivo(archivo, carpeta.id);
    enlaces.push(enlace);
  }
  
  return carpeta.webViewLink;
};

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

export const mantenimientoHelper = {
  getMantenimientos,
  guardarMantenimiento,
  getSiguienteConsecutivo,  
  getMantenimientosByConsecutivo,
  getResumenMantenimientosPorSolicitante,
  editarMantenimientoporConsecutivo,
  procesarArchivos,
  subirArchivosACarpetaExistente
};