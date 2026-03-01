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

const getSiguienteConsecutivo = async () => {
  const gastos = await getGastosVehiculos();
  
  if (!gastos.length) return "G-1";

  const ultimo = gastos[0].consecutivo;
  const numero = parseInt(ultimo.split('-')[1], 10) || 0;
  
  return `G-${numero + 1}`;
};

const getGastosVehiculos = async () => {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Gastos_Vehiculos!A2:H1000',
  });

  const rows = res.data.values || [];
  const headers = ['consecutivo', 'fecha_registro', 'placa', 'tipo_gasto', 'codigo_referencia', 'valor_gasto', 'descripcion', 'link_soporte'];
  
  return rows.map(row =>
    Object.fromEntries(row.map((val, i) => [headers[i], val]))
  ).sort((a, b) => {
    const numA = parseInt(a.consecutivo?.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.consecutivo?.replace(/\D/g, ''), 10) || 0;
    return numB - numA;
  });
};

const registrarGasto = async ({ placa, tipo_gasto, codigo_referencia, valor_gasto, descripcion, fecha_registro, link_soporte = '' }) => {
  const sheets = await getSheetsClient();
  const consecutivo = await getSiguienteConsecutivo();

  const nuevaFila = [
    consecutivo,
    fecha_registro,
    placa,
    tipo_gasto,
    codigo_referencia,
    valor_gasto,
    descripcion || '',
    link_soporte
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Gastos_Vehiculos!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

  return { consecutivo };
};

export const gastosVehiculoHelper = {
  getSiguienteConsecutivo,
  getGastosVehiculos,
  registrarGasto
};