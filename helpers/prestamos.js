import stream from 'stream';
import { getDriveClient, getSheetsClient } from '../services/google.js';

const spreadsheetId = process.env.SPREADSHEET_ID;
const carpetaPadreId = process.env.CARPETA_PADRE_ID_PRESTAMOS;

const obtenerDatosPrestamo = async (nombreHoja, rango = 'A1:H1000') => {
  const sheets = getSheetsClient();
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

const getPrestamos = async () => {
  const prestamos = await obtenerDatosPrestamo('Prestamos');
  
  return prestamos.sort((a, b) => {
    const numA = parseInt(a.consecutivo.replace(/\D/g, ''), 10);
    const numB = parseInt(b.consecutivo.replace(/\D/g, ''), 10);
    
    return numB - numA;
  });
};

const getSiguienteConsecutivo = async () => {
  const prestamos = await getPrestamos();
  
  if (!prestamos.length) return "P-1";

  const ultimo = prestamos[0].consecutivo;

  const numero = parseInt(ultimo.split('-')[1], 10) || 0;
  
  return `P-${numero + 1}`;
};

const guardarPrestamo = async ({ valor_pedido, valor_prestado, correo_usuario, usuario, fecha_creacion, estado_prestamo, Link}) => {
  const sheets = getSheetsClient();
  const consecutivo = await getSiguienteConsecutivo();
 
  const nuevaFila = [consecutivo, valor_pedido, valor_prestado, correo_usuario , usuario , fecha_creacion, estado_prestamo, Link];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Prestamos!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

  return { consecutivo };
};

const getPrestamoByConsecutivo = async (consecutivo) => {
  const prestamos = await getPrestamos();
  return prestamos.find(prestamo => 
    prestamo.consecutivo && prestamo.consecutivo.toLowerCase() === consecutivo.toLowerCase()
  );
};

const getResumenPrestamosPorSolicitante = async (email) => {
  try {
    const todoslosPrestamos = await getPrestamos();
    const prestamosFiltrados = todoslosPrestamos.filter(m => m.correo_usuario  === email);

    const mapConDatos = (lista) => {
      return lista.map(r => ({
        consecutivo: r.consecutivo,
        fecha_creacion: r.fecha_creacion || '',
        correo_usuario : r.correo_usuario || '',
        usuario: r.usuario || '',
        link: r.link || '' ,
        valor_pedido: r.valor_pedido || '',
        valor_prestado: r.valor_prestado || '',

      }));  
    };

    return {
      total: {
        count: prestamosFiltrados.length,
        consecutivos: mapConDatos(prestamosFiltrados)
      }
    };
  } catch (error) {
    console.error('Error al obtener resumen de prestamos por email:', error);
    throw error;
  }
};

const editarPrestamoporConsecutivo = async (consecutivo, nuevosDatos) => {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Prestamos!A2:H1000', 
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
  nuevosDatos.valor_pedido || filaActual[1],
  nuevosDatos.valor_prestado || filaActual[2],
  filaActual[3], 
  filaActual[4], 
  filaActual[5], 
  filaActual[6], 
  nuevosDatos.Link || filaActual[7],
];

  const filaEnHoja = filaIndex + 2; 

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Prestamos!A${filaEnHoja}:H${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [filaEditada],
    },
  });

  return true;
};

const marcarPrestamosLiquidados = async (consecutivos) => {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Prestamos!A2:H1000',
  });

  const filas = response.data.values;

  for (const consecutivo of consecutivos) {
    const filaIndex = filas.findIndex(f => f[0]?.toLowerCase() === consecutivo.toLowerCase());
    if (filaIndex !== -1) {
      filas[filaIndex][6] = 'liquidado'; // G - estado_prestamo
      const filaEnHoja = filaIndex + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Prestamos!A${filaEnHoja}:H${filaEnHoja}`,
        valueInputOption: 'RAW',
        requestBody: { values: [filas[filaIndex]] },
      });
    }
  }

  return true;
};


const crearCarpeta = async (nombreCarpeta, parentFolderId) => {
  const drive = getDriveClient();
  
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
  const drive = getDriveClient();
  
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
  const drive = getDriveClient();
  const carpeta = await drive.files.get({
    fileId: carpetaId,
    fields: 'webViewLink'
  });
  
  return carpeta.data.webViewLink;
};

const buscarCarpetaPorNombre = async (nombreCarpeta, parentFolderId) => {
  const drive = getDriveClient();
  
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

export const prestamoHelper = {
  getPrestamos,
  guardarPrestamo,
  getSiguienteConsecutivo,  
  getPrestamoByConsecutivo,
  getResumenPrestamosPorSolicitante,
  editarPrestamoporConsecutivo,
  procesarArchivos,
  subirArchivosACarpetaExistente,
  marcarPrestamosLiquidados
};