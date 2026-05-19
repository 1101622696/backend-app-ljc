import stream from 'stream';
import { getDriveClient, getSheetsClient } from '../services/google.js';

const spreadsheetId = process.env.SPREADSHEET_ID;
const carpetaPadreId = process.env.CARPETA_PADRE_ID_PREOPERACIONAL;

const obtenerDatosPreoperacional = async () => {
  const sheets = getSheetsClient();
  
  const range = 'Preoperacional!A1:AX1000'; 

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

const getPreoperacionales = () => obtenerDatosPreoperacional();

const getSiguienteConsecutivo = async () => {
  const preoperacionales = await getPreoperacionales();
  
  if (!preoperacionales.length) return "Pre-1";

  const ultimo = preoperacionales[0].consecutivo;

  const numero = parseInt(ultimo.split('-')[1], 10) || 0;
  
  return `Pre-${numero + 1}`;
};

const guardarPreoperacional = async ({ codigo_viaje, placa, odometro, nivel_agua, nivel_aceite, galones, fugas_visibles, presion_frenos, fugas_audibles, freno_parqueo, abs_sintestigo, prueba_freno, luces_altas_bajas, direccionales, luces_freno, luces_remolque, testigo_tablero, filtro_aire, volante, sin_fugas, cambios_suave, sin_ruidos, cinturon_seguridad, espejos, extintor_cabezote, extintor_trailer, botiquin, triangulos_reflectivos, kit_carretera, senalizacion_conduzco, correas, estado_carpa, refrigerante, pito, alarma_retroceso, presion_llantas, desgaste_llantas, tuercas_ajustadas, suspension_fisuras, acople_quintarueda, quinta_rueda, pasador_rey, mangueras_aire, seguro_acople, placas_visibles, correo_usuario, usuario, fecha_creacion, Link }) => {
  const sheets = getSheetsClient();
  const consecutivo = await getSiguienteConsecutivo();
 
  const nuevaFila = [consecutivo, codigo_viaje, placa, odometro, nivel_agua, nivel_aceite, galones, fugas_visibles, presion_frenos, fugas_audibles, freno_parqueo, abs_sintestigo, prueba_freno, luces_altas_bajas, direccionales, luces_freno, luces_remolque, testigo_tablero, filtro_aire, volante, sin_fugas, cambios_suave, sin_ruidos, cinturon_seguridad, espejos, extintor_cabezote, extintor_trailer, botiquin, triangulos_reflectivos, kit_carretera, senalizacion_conduzco, correas, estado_carpa, refrigerante, pito, alarma_retroceso, presion_llantas, desgaste_llantas, tuercas_ajustadas, suspension_fisuras, acople_quintarueda, quinta_rueda, pasador_rey, mangueras_aire, seguro_acople, placas_visibles, correo_usuario, usuario, fecha_creacion, Link];

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
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Preoperacional!A2:AX1000', 
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
    filaActual[3], 
    nuevosDatos.nivel_agua || filaActual[4], 
    nuevosDatos.nivel_aceite || filaActual[5],
    nuevosDatos.galones || filaActual[6], 
    nuevosDatos.fugas_visibles || filaActual[7], 
    nuevosDatos.presion_frenos || filaActual[8], 
    nuevosDatos.fugas_audibles || filaActual[9], 
    nuevosDatos.freno_parqueo || filaActual[10], 
    nuevosDatos.abs_sintestigo || filaActual[11], 
    nuevosDatos.prueba_freno || filaActual[12], 
    nuevosDatos.luces_altas_bajas || filaActual[13], 
    nuevosDatos.direccionales || filaActual[14], 
    nuevosDatos.luces_freno || filaActual[15], 
    nuevosDatos.luces_remolque || filaActual[16], 
    nuevosDatos.testigo_tablero || filaActual[17], 
    nuevosDatos.filtro_aire || filaActual[18],
    nuevosDatos.volante || filaActual[19], 
    nuevosDatos.sin_fugas || filaActual[20], 
    nuevosDatos.cambios_suave || filaActual[21], 
    nuevosDatos.sin_ruidos || filaActual[22], 
    nuevosDatos.cinturon_seguridad || filaActual[23], 
    nuevosDatos.espejos || filaActual[24], 
    nuevosDatos.extintor_cabezote || filaActual[25], 
    nuevosDatos.extintor_trailer || filaActual[26], 
    nuevosDatos.botiquin || filaActual[27], 
    nuevosDatos.triangulos_reflectivos || filaActual[28], 
    nuevosDatos.kit_carretera || filaActual[29], 
    nuevosDatos.senalizacion_conduzco || filaActual[30], 
    nuevosDatos.correas || filaActual[31], 
    nuevosDatos.estado_carpa || filaActual[32], 
    nuevosDatos.refrigerante || filaActual[33], 
    nuevosDatos.pito || filaActual[34], 
    nuevosDatos.alarma_retroceso || filaActual[35], 
    nuevosDatos.presion_llantas || filaActual[36], 
    nuevosDatos.desgaste_llantas || filaActual[37],
    nuevosDatos.tuercas_ajustadas || filaActual[38], 
    nuevosDatos.suspension_fisuras || filaActual[39], 
    nuevosDatos.acople_quintarueda || filaActual[40], 
    nuevosDatos.quinta_rueda || filaActual[41], 
    nuevosDatos.pasador_rey || filaActual[42], 
    nuevosDatos.mangueras_aire || filaActual[43], 
    nuevosDatos.seguro_acople || filaActual[44], 
    nuevosDatos.placas_visibles || filaActual[45], 
    filaActual[46],  
    filaActual[47],  
    filaActual[48],  
    nuevosDatos.link || filaActual[49], 
  ];

  const filaEnHoja = filaIndex + 2; 

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Preoperacional!A${filaEnHoja}:AX${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [filaEditada],
    },
  });

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
  
  const enlaces = [];
  for (const archivo of archivos) {
    const enlace = await subirArchivo(archivo, carpetaId);
    enlaces.push(enlace);
  }
  
  const drive = getDriveClient();
  const carpeta = await drive.files.get({
    fileId: carpetaId,
    fields: 'webViewLink'
  });
  
  return carpeta.data.webViewLink;
};

const buscarCarpetaPorNombre = async (nombreCarpeta, parentFolderId) => {
  const drive = getDriveClient();
  
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