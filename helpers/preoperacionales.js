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

const obtenerDatosPreoperacional = async (nombreHoja, rango = 'A1:AN1000') => {
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

const getPreoperacionales = async () => {
  const preoperacionales = await obtenerDatosPreoperacional('Preoperacional');
  
  return preoperacionales.sort((a, b) => {
    const numA = parseInt(a.consecutivo.replace(/\D/g, ''), 10);
    const numB = parseInt(b.consecutivo.replace(/\D/g, ''), 10);
    
    return numB - numA;
  });
};

const getSiguienteConsecutivo = async () => {
  const preoperacionales = await getPreoperacionales();
  
  if (!preoperacionales.length) return "Pre-1";

  const ultimo = preoperacionales[0].consecutivo;

  const numero = parseInt(ultimo.split('-')[1], 10) || 0;
  
  return `Pre-${numero + 1}`;
};

const guardarPreoperacional = async ({ codigo_viaje, placa, nivel_agua, odometro, nivel_aceite, galones, estado_cabina, cinturon_seguridad, airbag, calibracion_frenos, panoramicos_espejos, estado_trailer, ruedas_trailer, extintor_cabina, f_vencimiento_ext_c, extintor_trailer, f_vencimiento_ext_t, senalizacion, kit_carretera, direccionales, botiquin, cintas_reflectivas, senalizacion_conduzco, estado_bandas, ruedas_cabezote, correas, aire_acondicionado, estado_carpa, refrigerante, pito, alarma_retroceso, luces, cierre_puertas_capot, bateria, placas_visibles, Link, correo_usuario, usuario, fecha_creacion}) => {
  const sheets = await getSheetsClient();
  const consecutivo = await getSiguienteConsecutivo();
 
  const nuevaFila = [consecutivo, codigo_viaje, placa, nivel_agua, odometro, nivel_aceite, galones, estado_cabina, cinturon_seguridad, airbag, calibracion_frenos, panoramicos_espejos, estado_trailer, ruedas_trailer, extintor_cabina, f_vencimiento_ext_c, extintor_trailer, f_vencimiento_ext_t, senalizacion, kit_carretera, direccionales, botiquin, cintas_reflectivas, senalizacion_conduzco , estado_bandas , ruedas_cabezote , correas , aire_acondicionado , estado_carpa , refrigerante , pito , alarma_retroceso , luces , cierre_puertas_capot , bateria , placas_visibles , Link , correo_usuario , usuario , fecha_creacion];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Preoperacional!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

  return { consecutivo };
};

const getPreoperacionalesByConsecutivo = async (consecutivo) => {
  const preoperacionales = await getPreoperacionales();
  return preoperacionales.find(preoperacional => 
    preoperacional.consecutivo && preoperacional.consecutivo.toLowerCase() === consecutivo.toLowerCase()
  );
};

const getResumenPreoperacionalesPorSolicitante = async (email) => {
  try {
    const todoslosPreoperacionales = await getPreoperacionales();
    const preoperacionalesFiltrados = todoslosPreoperacionales.filter(s => s.correo_usuario  === email);

    const mapConDatos = (lista) => {
      return lista.map(r => ({
        consecutivo: r.consecutivo,
        codigo_viaje: r.codigo_viaje || '',
        odometro: r.odometro || '',
        fecha_creacion: r.fecha_creacion || '',
        correo_usuario : r.correo_usuario || '',
        usuario: r.usuario || '',
        placa: r.placa || '',
        link: r.link || '' ,

      }));  
    };

    return {
      total: {
        count: preoperacionalesFiltrados.length,
        consecutivos: mapConDatos(preoperacionalesFiltrados)
      }
    };
  } catch (error) {
    console.error('Error al obtener resumen de preoperacionales por email:', error);
    throw error;
  }
};


const editarPreoperacionalPorConsecutivo = async (consecutivo, nuevosDatos) => {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Preoperacional!A2:AN1000', 
  });

  const filas = response.data.values;
  const filaIndex = filas.findIndex(fila => fila[0]?.toLowerCase() === consecutivo.toLowerCase());

  if (filaIndex === -1) {
    return null; 
  }

  const filaActual = filas[filaIndex];
  
  const filaEditada = [
    filaActual[0], 
    filaActual[1], 
    filaActual[2], 
    nuevosDatos.nivel_agua || filaActual[3], 
    nuevosDatos.odometro || filaActual[4],
    nuevosDatos.nivel_aceite || filaActual[5], 
    nuevosDatos.galones || filaActual[6], 
    nuevosDatos.estado_cabina || filaActual[7], 
    nuevosDatos.cinturon_seguridad || filaActual[8], 
    nuevosDatos.airbag || filaActual[9], 
    nuevosDatos.calibracion_frenos || filaActual[10], 
    nuevosDatos.panoramicos_espejos || filaActual[11], 
    nuevosDatos.estado_trailer || filaActual[12], 
    nuevosDatos.ruedas_trailer || filaActual[13], 
    nuevosDatos.extintor_cabina || filaActual[14], 
    nuevosDatos.f_vencimiento_ext_c || filaActual[15], 
    nuevosDatos.extintor_trailer || filaActual[16], 
    nuevosDatos.f_vencimiento_ext_t || filaActual[17], 
    nuevosDatos.senalizacion || filaActual[18], 
    nuevosDatos.kit_carretera || filaActual[19], 
    nuevosDatos.direccionales || filaActual[20], 
    nuevosDatos.botiquin || filaActual[21], 
    nuevosDatos.cintas_reflectivas || filaActual[22], 
    nuevosDatos.senalizacion_conduzco || filaActual[23], 
    nuevosDatos.link || filaActual[24], 
    nuevosDatos.estado_bandas || filaActual[25], 
    nuevosDatos.ruedas_cabezote || filaActual[26], 
    nuevosDatos.correas || filaActual[27], 
    nuevosDatos.aire_acondicionado || filaActual[28], 
    nuevosDatos.estado_carpa || filaActual[29], 
    nuevosDatos.refrigerante || filaActual[30], 
    nuevosDatos.pito || filaActual[31], 
    nuevosDatos.alarma_retroceso || filaActual[32], 
    nuevosDatos.luces || filaActual[33], 
    nuevosDatos.cierre_puertas_capot || filaActual[34], 
    nuevosDatos.bateria || filaActual[35], 
    nuevosDatos.placas_visibles || filaActual[36],
    nuevosDatos.correo_usuario || filaActual[37], 
    nuevosDatos.usuario || filaActual[38], 
    filaActual[39]  
  ];

  const filaEnHoja = filaIndex + 2; 

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Preoperacional!A${filaEnHoja}:AN${filaEnHoja}`,
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
  
  const carpetaPadreId = '1dT4qecpToKSNQlpp5q8zfqIQeEi3RKMp';
  
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
  
  const enlaces = [];
  for (const archivo of archivos) {
    const enlace = await subirArchivo(archivo, carpetaId);
    enlaces.push(enlace);
  }
  
  const drive = await getDriveClient();
  const carpeta = await drive.files.get({
    fileId: carpetaId,
    fields: 'webViewLink'
  });
  
  return carpeta.data.webViewLink;
};

const buscarCarpetaPorNombre = async (nombreCarpeta, parentFolderId) => {
  const drive = await getDriveClient();
  
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



export const preoperacionalHelper = {
  getPreoperacionales,
  guardarPreoperacional,
  getSiguienteConsecutivo,  
  getPreoperacionalesByConsecutivo,
  getResumenPreoperacionalesPorSolicitante,
  editarPreoperacionalPorConsecutivo,
  procesarArchivos,
  subirArchivosACarpetaExistente,
  buscarCarpetaPorNombre
};