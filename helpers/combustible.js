import stream from 'stream';
import { getDriveClient, getSheetsClient } from '../services/google.js';
import { vehiculoHelper } from '../helpers/vehiculos.js';
import { gastosVehiculoHelper } from '../helpers/gastos.js';

const spreadsheetId = process.env.SPREADSHEET_ID;
const carpetaPadreId = process.env.CARPETA_PADRE_ID_COMBUSTIBLE;

const getCombustibles = async () => {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Combustible!A2:O1000',
  });

  const rows = res.data.values || [];
  const headers = [
    'consecutivo', 'fecha_registro', 'placa', 'odometro_actual', 'galones_cargados',
    'valor_pagado', 'precio_por_galon', 'km_recorridos', 'rendimiento_real',
    'rendimiento_esperado', 'diferencia_rendimiento', 'alerta', 'correo_usuario',
    'usuario', 'link_factura'
  ];
  
  return rows.map(row =>
    Object.fromEntries(row.map((val, i) => [headers[i], val]))
  ).sort((a, b) => {
    const numA = parseInt(a.consecutivo?.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.consecutivo?.replace(/\D/g, ''), 10) || 0;
    return numB - numA;
  });
};

const getSiguienteConsecutivo = async () => {
  const registros = await getCombustibles();
  
  if (!registros.length) return "COMB-1";

  const ultimo = registros[0].consecutivo;
  const numero = parseInt(ultimo.split('-')[1], 10) || 0;
  
  return `COMB-${numero + 1}`;
};

const registrarCombustible = async ({ placa, odometro_actual, galones_cargados, valor_pagado, correo_usuario, usuario, link_factura }) => {
  const sheets = getSheetsClient();
  const consecutivo = await getSiguienteConsecutivo();
  const fecha_registro = new Date().toISOString().split('T')[0];

  // Calcular precio por galón
  const precio_por_galon = valor_pagado / galones_cargados;

  // Buscar último registro de esta placa
  const registros = await getCombustibles();
  const ultimoRegistro = registros.find(r => r.placa === placa);
  
  let km_recorridos = 0;
  let rendimiento_real = 0;
  let alerta = 'no';

  if (ultimoRegistro) {
    const odometro_anterior = parseFloat(ultimoRegistro.odometro_actual) || 0;
    km_recorridos = odometro_actual - odometro_anterior;
    rendimiento_real = km_recorridos / galones_cargados;
  }

  // Obtener rendimiento esperado del vehículo
  const vehiculo = await vehiculoHelper.getVehiculoById(placa);
  const rendimiento_esperado = parseFloat(vehiculo?.rendimiento_galon) || 8;

  const diferencia_rendimiento = rendimiento_real - rendimiento_esperado;

  // Alerta si rendimiento es menor a esperado - 1
  if (rendimiento_real > 0 && rendimiento_real < (rendimiento_esperado - 1)) {
    alerta = 'si';
  }

  const nuevaFila = [
    consecutivo,
    fecha_registro,
    placa,
    odometro_actual,
    galones_cargados,
    valor_pagado,
    precio_por_galon,
    km_recorridos,
    rendimiento_real,
    rendimiento_esperado,
    diferencia_rendimiento,
    alerta,
    correo_usuario,
    usuario,
    'pendiente',
    "",
    link_factura || '',
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Combustible!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

  // ===== REGISTRAR EN GASTOS_VEHICULOS =====
  await gastosVehiculoHelper.registrarGasto({
    placa,
    tipo_gasto: 'combustible',
    codigo_referencia: consecutivo,
    valor_gasto: valor_pagado,
    descripcion: `Combustible ${galones_cargados} gal - Rendimiento: ${rendimiento_real.toFixed(2)} km/gal`,
    fecha_registro
  });

  return { 
    consecutivo, 
    rendimiento_real, 
    alerta,
    mensaje: alerta === 'si' 
      ? `⚠️ Alerta: Rendimiento bajo (${rendimiento_real.toFixed(2)} km/gal vs ${rendimiento_esperado} km/gal esperado)` 
      : 'Registro exitoso'
  };
};

const legalizarCombustible = async (consecutivo, numero_factura) => {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Combustible!A2:Q1000',
  });

  const filas = response.data.values || [];
  const filaIndex = filas.findIndex(f => f[0]?.toLowerCase() === consecutivo.toLowerCase());

  if (filaIndex === -1) {
    throw new Error('Registro de combustible no encontrado');
  }

  const filaActual = filas[filaIndex];

  // Verificar que esté pendiente
  if (filaActual[14] === 'legalizado') {
    throw new Error('Este registro ya está legalizado');
  }

  filaActual[14] = 'legalizado'; // O - estado_factura

  // Actualizar también el número de factura si se proporciona (agregar columna P)
  if (numero_factura) {
    filaActual[15] = numero_factura; // P - numero_factura (NUEVA COLUMNA)
  }

  const filaEnHoja = filaIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Combustible!A${filaEnHoja}:Q${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: { values: [filaActual] },
  });

  return {
    consecutivo,
    placa: filaActual[2],
    valor: filaActual[5],
    mensaje: 'Combustible legalizado correctamente'
  };
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

const procesarArchivos = async (archivos, placafoldername) => {
  if (!archivos || archivos.length === 0) {
    return null;
  }
    
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

const subirArchivo = async (archivo, carpetaId) => {
  try {
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
  } catch (error) {
    console.error('Error subiendo archivo:', error.message);
    throw error;
  }
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

export const combustibleHelper = {
  getSiguienteConsecutivo,
  getCombustibles,
  registrarCombustible,
  legalizarCombustible,
  procesarArchivos
};