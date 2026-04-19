import { getSheetsClient } from '../services/google.js';

const spreadsheetId = process.env.SPREADSHEET_ID;

const getSiguienteConsecutivo = async () => {
  const gastos = await getGastosVehiculos();
  
  if (!gastos.length) return "G-1";

  const ultimo = gastos[0].consecutivo;
  const numero = parseInt(ultimo.split('-')[1], 10) || 0;
  
  return `G-${numero + 1}`;
};

const getGastosVehiculos = async () => {
  const sheets = getSheetsClient();
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
  const sheets = getSheetsClient();
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