import { google } from 'googleapis';
import stream from 'stream';
import {vehiculoHelper} from './vehiculos.js';

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

const getSiguienteConsecutivo = async () => {
  const registros = await getCombustibles();
  
  if (!registros.length) return "COMB-1";

  const ultimo = registros[0].consecutivo;
  const numero = parseInt(ultimo.split('-')[1], 10) || 0;
  
  return `COMB-${numero + 1}`;
};

const getCombustibles = async () => {
  const sheets = await getSheetsClient();
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

const registrarCombustible = async ({ placa, odometro_actual, galones_cargados, valor_pagado, correo_usuario, usuario, link_factura }) => {
  const sheets = await getSheetsClient();
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
    link_factura || ''
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Combustible!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

  return { 
    consecutivo, 
    rendimiento_real, 
    alerta,
    mensaje: alerta === 'si' 
      ? `Alerta: Rendimiento bajo (${rendimiento_real.toFixed(2)} km/gal vs ${rendimiento_esperado} km/gal esperado)` 
      : 'Registro exitoso'
  };
};

export const combustibleHelper = {
  getSiguienteConsecutivo,
  getCombustibles,
  registrarCombustible
};