import stream from 'stream';
import { getDriveClient, getSheetsClient } from '../services/google.js';

const spreadsheetId = process.env.SPREADSHEET_ID;
const carpetaPadreId = process.env.CARPETA_PADRE_ID_SOLICITUDES;

const obtenerDatosSolicitud = async () => {
  const sheets = getSheetsClient();
  
  const range = 'Solicitudes!A1:I100'; 

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

const getSolicitudes = () => obtenerDatosSolicitud();

const getSiguienteConsecutivo = async () => {
  const solicitudes = await getSolicitudes();
  
  if (!solicitudes.length) return "S-1";

  const maxNumero = Math.max(
    ...solicitudes.map((s) => parseInt(s.consecutivo?.split('-')[1], 10) || 0)
  );
  return `S-${maxNumero + 1}`;
};

const guardarSolicitud = async ({ placa, tipo_mantenimiento, descripcion, odometro, correo_usuario, usuario, fecha_creacion, Link}) => {
  const sheets = getSheetsClient();
  const consecutivo = await getSiguienteConsecutivo();
 
  const nuevaFila = [consecutivo, placa, tipo_mantenimiento, descripcion, odometro, correo_usuario , usuario , fecha_creacion, Link];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Solicitudes!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

  return { consecutivo };
};

const getSolicitudesByConsecutivo = async (consecutivo) => {
  const solicitudes = await getSolicitudes();
  return solicitudes.find(solicitud => 
    solicitud.consecutivo && solicitud.consecutivo.toLowerCase() === consecutivo.toLowerCase()
  );
};

const getResumenSolicitudesPorPlaca = async (placas) => {
  try {
    const todoslosSolicitudes = await getSolicitudes()

    // convertir a array si llega una sola placa
    const placasArray = Array.isArray(placas)
      ? placas
      : [placas]

    const placasUpper = placasArray.map(p =>
      p.trim().toUpperCase()
    )

    const solicitudesFiltradas =
      todoslosSolicitudes.filter(p =>
        placasUpper.includes(
          p.placa?.trim().toUpperCase()
        )
      )

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

      }))
    }
    return {
      total: {
        count: solicitudesFiltradas.length,
        consecutivos: mapConDatos(solicitudesFiltradas)
      }
    }
  } catch (error) {
    console.error('Error al obtener resumen de solicitudes Filtradas por placa:', error);
    throw error;
  }
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

export const solicitudHelper = {
  getSolicitudes,
  guardarSolicitud,
  getSiguienteConsecutivo,  
  getSolicitudesByConsecutivo,
  getResumenSolicitudesPorPlaca,
  procesarArchivos,
};