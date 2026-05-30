import { getDriveClient, getSheetsClient } from '../services/google.js';

const spreadsheetId = process.env.SPREADSHEET_ID;

const registrarGastosViaje = async (consecutivo_viaje, gastos, quien) => {
  const sheets = getSheetsClient();
  
  const gastosARegistrar = [];
  
  // Lista de gastos posibles
  const tiposGasto = [
    'peajes', 'lavadas', 'parqueadero', 'engrase', 
    'fumigacion', 'otro', 'cargue', 'descargue', 'comision'
  ];
  
  for (const tipo of tiposGasto) {
    const valor = parseFloat(gastos[`${tipo}_${quien}`]) || 0;
    
    if (valor > 0) {
      // Determinar tipo de factura
      let tipo_factura;
      
      // Automático recibo_caja
      if (['cargue', 'descargue', 'comision'].includes(tipo)) {
        tipo_factura = 'recibo_caja';
      } else {
        // Usuario selecciona
        tipo_factura = gastos[`tipo_factura_${tipo}_${quien}`] || 'factura_electronica';
      }
      
      const nuevaFila = [
        consecutivo_viaje,
        tipo,
        quien,
        valor,
        tipo_factura,
        'pendiente', // estado_factura
        '', // numero_factura
        gastos[`link_${tipo}_${quien}`] || '' // link_soporte
      ];
      
      gastosARegistrar.push(nuevaFila);
    }
  }
  
  if (gastosARegistrar.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Detalle_Gastos_Viajes!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: gastosARegistrar },
    });
  }
  
  return gastosARegistrar.length;
};

const getGastosViaje = async (consecutivo_viaje) => {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Detalle_Gastos_Viajes!A2:H1000',
  });

  const rows = res.data.values || [];
  const headers = ['consecutivo_viaje', 'tipo_gasto', 'quien', 'valor', 'tipo_factura', 'estado_factura', 'numero_factura', 'link_soporte'];
  
  const gastos = rows.map(row =>
    Object.fromEntries(row.map((val, i) => [headers[i], val]))
  );
  
  return gastos.filter(g => g.consecutivo_viaje === consecutivo_viaje);
};

const actualizarEstadoGastosViaje = async (consecutivo_viaje, nuevoEstado) => {
  const sheets = getSheetsClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Detalle_Gastos_Viajes!A2:H1000',
  });

  const filas = response.data.values || [];
  
  for (let i = 0; i < filas.length; i++) {
    if (filas[i][0] === consecutivo_viaje) { // A: consecutivo_viaje
      filas[i][5] = nuevoEstado; // F: estado_factura
      
      const filaEnHoja = i + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Detalle_Gastos_Viajes!A${filaEnHoja}:H${filaEnHoja}`,
        valueInputOption: 'RAW',
        requestBody: { values: [filas[i]] },
      });
    }
  }
  
  return true;
};

const legalizarFacturaIndividual = async (consecutivo_viaje, tipo_gasto, quien, numero_factura) => {
  const sheets = getSheetsClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Detalle_Gastos_Viajes!A2:H1000',
  });

  const filas = response.data.values || [];
  
  for (let i = 0; i < filas.length; i++) {
    if (filas[i][0] === consecutivo_viaje && 
        filas[i][1] === tipo_gasto && 
        filas[i][2] === quien) {
      
      filas[i][5] = 'legalizado'; // F: estado_factura
      filas[i][6] = numero_factura; // G: numero_factura
      
      const filaEnHoja = i + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Detalle_Gastos_Viajes!A${filaEnHoja}:H${filaEnHoja}`,
        valueInputOption: 'RAW',
        requestBody: { values: [filas[i]] },
      });
      
      return true;
    }
  }
  
  return null;
};

const calcularTotalGastos = (gastos) => {
  return gastos.reduce((acc, g) => acc + (parseFloat(g.valor) || 0), 0);
};

export const detalleGastosViajesHelper = {
  registrarGastosViaje,
  getGastosViaje,
  actualizarEstadoGastosViaje,
  legalizarFacturaIndividual,
  calcularTotalGastos
};













