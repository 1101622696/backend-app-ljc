import stream from 'stream';
import { getDriveClient, getSheetsClient } from '../services/google.js';
import { vehiculoHelper } from '../helpers/vehiculos.js';
import { gastosVehiculoHelper } from '../helpers/gastos.js';

const spreadsheetId = process.env.SPREADSHEET_ID;
const carpetaPadreId = process.env.CARPETA_PADRE_ID_COMBUSTIBLE;

const obtenerCombustible = async () => {
  const sheets = getSheetsClient();
  
  const range = 'Combustible!A1:Q1000'; 

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

// const getCombustibles = () => obtenerCombustible();

const getCombustibles = async (pagina = 1, limite = 50) => {
  const sheets = getSheetsClient();
  const inicio = (pagina - 1) * limite + 2
  const fin = inicio + limite - 1
  const range = `Combustible!A1:Q1`
  
  // Primero traer headers
  const resHeaders = await sheets.spreadsheets.values.get({ spreadsheetId, range })
  const headers = (resHeaders.data.values?.[0] || []).map(h => h.trim().toLowerCase())

  // Luego traer datos paginados
  const resData = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Combustible!A${inicio}:Q${fin}`,
  })

  const rows = resData.data.values || []
  const datos = rows.map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
  )

  return { datos, pagina, limite, hayMas: rows.length === limite }
}

const getCombustibleById = async (consecutivo) => {
  const combustibles = await getTodosLosCombustibles();
  return combustibles.find(combustible => 
    combustible.consecutivo === consecutivo
  );
};

const getTodosLosCombustibles = async () => {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Combustible!A1:Q1000',
  })
  const rows = res.data.values || []
  if (rows.length === 0) return []
  const headers = rows[0].map(h => h.trim().toLowerCase())
  return rows.slice(1).map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
  )
}

const getResumenCombustiblesPorPlaca = async (placas) => {
  try {
    // const todoslosCombustibles = await getTodosLosCombustibles()
const todoslosCombustibles = await getTodosLosCombustibles()

    // convertir a array si llega una sola placa
    const placasArray = Array.isArray(placas)
      ? placas
      : [placas]

    const placasUpper = placasArray.map(p =>
      p.trim().toUpperCase()
    )

    const combustiblesFiltrados =
      todoslosCombustibles.filter(p =>
        placasUpper.includes(
          p.placa?.trim().toUpperCase()
        )
      )

    const mapConDatos = (lista) => {

      return lista.map(r => ({

        consecutivo: r.consecutivo || '',
        fecha_registro: r.fecha_registro || '',
        odometro_actual: r.odometro_actual || '',
        galones_cargados: r.galones_cargados || '',
        valor_pagado: r.valor_pagado || '',
        precio_por_galon: r.precio_por_galon || '',
        km_recorridos: r.km_recorridos || '',
        alerta: r.alerta || '',

      }))
    }
    return {
      total: {
        count: combustiblesFiltrados.length,
        consecutivos: mapConDatos(combustiblesFiltrados)
      }
    }
  } catch (error) {
    console.error('Error al obtener resumen de combustibles por placa:', error);
    throw error;
  }
};

const filtrarCombustiblePorCampoTexto = (combustibles, campo, valor) => {
  return combustibles.filter(combustible => 
    combustible[campo] && combustible[campo].toLowerCase() === valor.toLowerCase()
  );
};

const ordenarCombustiblePorCampoNumerico = (combustibles, campo, orden = 'desc') => {
  return combustibles.sort((a, b) => {
    const valorA = parseFloat(a[campo]) || 0;
    const valorB = parseFloat(b[campo]) || 0;
    
    return orden.toLowerCase() === 'desc' ? valorB - valorA : valorA - valorB;
  });
};

const getCombustiblesOrdenadosPorGalones = async (orden = 'desc') => {
  const combustibles = await getTodosLosCombustibles();
  return ordenarCombustiblePorCampoNumerico(combustibles, 'galones_cargados', orden);
};

const getCombustiblesOrdenadosPorValorPagado = async (orden = 'desc') => {
  const combustibles = await getTodosLosCombustibles();
  return ordenarCombustiblePorCampoNumerico(combustibles, 'valor_pagado', orden);
};

const getCombustiblesOrdenadosPorPrecioPorGalon = async (orden = 'desc') => {
  const combustibles = await getTodosLosCombustibles();
  return ordenarCombustiblePorCampoNumerico(combustibles, 'precio_por_galon', orden);
};

const getCombustiblesOrdenadosPorRendimientoReal = async (orden = 'desc') => {
  const combustibles = await getTodosLosCombustibles();
  return ordenarCombustiblePorCampoNumerico(combustibles, 'rendimiento_real', orden);
};

const getCombustiblesPorAlerta = async (valor) => {
  const combustibles = await getTodosLosCombustibles();
  return filtrarCombustiblePorCampoTexto(combustibles, 'alerta', valor);
};

const getCombustiblesPorEstadoFactura = async (valor) => {
  const combustibles = await getTodosLosCombustibles();
  return filtrarCombustiblePorCampoTexto(combustibles, 'estado_factura', valor);
};

const getCombustiblesPorMes = async (mes) => {
  const combustibles = await getTodosLosCombustibles();

  return combustibles.filter((combustible) => {
    if (!combustible.fecha_registro) return false;

    const fecha = new Date(combustible.fecha_registro);

    return fecha.getMonth() + 1 === Number(mes);
  });
};

const getSiguienteConsecutivo = async () => {
  const registros = await getTodosLosCombustibles();
  
  if (!registros.length) return "COMB-1";

  // Sacar el número más alto de todos los consecutivos
  const numeros = registros
    .map(r => parseInt(r.consecutivo?.split('-')[1], 10) || 0)
    .filter(n => !isNaN(n));

  const maximo = Math.max(...numeros);
  
  return `COMB-${maximo + 1}`;
};

const registrarCombustible = async ({ placa, odometro_actual, galones_cargados, valor_pagado, correo_usuario, usuario, link_factura }) => {
  const sheets = getSheetsClient();
  const consecutivo = await getSiguienteConsecutivo();
  const fecha_registro = new Date().toISOString().split('T')[0];

  // Calcular precio por galón
  const precio_por_galon = valor_pagado / galones_cargados;

  // Buscar último registro de esta placa
  const registros = await getTodosLosCombustibles();
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

const editarCombustibleporConsecutivo = async (consecutivo, nuevosDatos) => {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Combustible!A2:Q1000',
  });

  const filas = response.data.values || [];

  const filaIndex = filas.findIndex(
    fila => fila[0]?.toLowerCase() === consecutivo.toLowerCase()
  );

  if (filaIndex === -1) {
    return null;
  }

  // ===== DATOS ACTUALES =====
  const filaActual = filas[filaIndex];

  const placa = nuevosDatos.placa || filaActual[2];

  const odometro_actual = parseFloat(
    nuevosDatos.odometro_actual || filaActual[3]
  );

  const galones_cargados = parseFloat(
    nuevosDatos.galones_cargados || filaActual[4]
  );

  const valor_pagado = parseFloat(
    nuevosDatos.valor_pagado || filaActual[5]
  );

  // ===== RECALCULAR =====
  const precio_por_galon =
    galones_cargados > 0
      ? valor_pagado / galones_cargados
      : 0;

  // Buscar registros anteriores de la misma placa
  const registrosMismaPlaca = filas.filter(
    (fila, index) =>
      index !== filaIndex &&
      fila[2] === placa
  );

  let km_recorridos = 0;
  let rendimiento_real = 0;
  let alerta = 'no';

  if (registrosMismaPlaca.length > 0) {
    const ultimoRegistro = registrosMismaPlaca
      .sort((a, b) => {
        const odA = parseFloat(a[3]) || 0;
        const odB = parseFloat(b[3]) || 0;
        return odB - odA;
      })[0];

    const odometroAnterior = parseFloat(ultimoRegistro[3]) || 0;

    km_recorridos = odometro_actual - odometroAnterior;

    if (galones_cargados > 0) {
      rendimiento_real = km_recorridos / galones_cargados;
    }
  }

  // ===== RENDIMIENTO ESPERADO =====
  const vehiculo = await vehiculoHelper.getVehiculoById(placa);

  const rendimiento_esperado =
    parseFloat(vehiculo?.rendimiento_galon) || 8;

  const diferencia_rendimiento =
    rendimiento_real - rendimiento_esperado;

  if (
    rendimiento_real > 0 &&
    rendimiento_real < (rendimiento_esperado - 1)
  ) {
    alerta = 'si';
  }

  // ===== ARCHIVOS =====
  let link_factura = filaActual[16] || '';

  if (nuevosDatos.Link) {
    // Si ya existe carpeta -> subir ahí
    if (link_factura && link_factura.includes('/folders/')) {

      const match = link_factura.match(/folders\/([a-zA-Z0-9_-]+)/);

      if (match?.[1]) {
        const carpetaId = match[1];

        link_factura = await subirArchivosACarpetaExistente(
          nuevosDatos.archivos || [],
          carpetaId
        );
      }

    } else {
      // Si no existe carpeta -> crear nueva
      link_factura = await procesarArchivos(
        nuevosDatos.archivos || [],
        placa
      );
    }
  }

  // ===== FILA FINAL =====
  const filaEditada = [
    filaActual[0], // consecutivo
    filaActual[1], // fecha registro
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
    filaActual[12], // correo
    filaActual[13], // usuario
    filaActual[14], // estado factura
    filaActual[15],
    link_factura,
  ];

  const filaEnHoja = filaIndex + 2;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Combustible!A${filaEnHoja}:Q${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [filaEditada],
    },
  });

  return {
    alerta,
    rendimiento_real,
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

const extraerFolderId = (link) => {
  const match = link.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
};

export const combustibleHelper = {
  getSiguienteConsecutivo,
  getCombustibleById,
  getResumenCombustiblesPorPlaca,
  getCombustibles,
  getCombustiblesOrdenadosPorGalones,
  getCombustiblesOrdenadosPorValorPagado,
  getCombustiblesOrdenadosPorPrecioPorGalon,
  getCombustiblesOrdenadosPorRendimientoReal,
  getCombustiblesPorAlerta,
  getCombustiblesPorEstadoFactura,
  getCombustiblesPorMes,
  registrarCombustible,
  legalizarCombustible,
  editarCombustibleporConsecutivo,
  procesarArchivos,
  extraerFolderId,
  subirArchivosACarpetaExistente
};