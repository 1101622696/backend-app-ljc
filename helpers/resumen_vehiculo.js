import { getSheetsClient } from '../services/google.js';
import { gastosVehiculoHelper } from '../helpers/gastos.js';
import { viajeHelper } from '../helpers/viajes.js';

const spreadsheetId = process.env.SPREADSHEET_ID;

const generarResumenMensual = async (placa, anio, mes) => {
  // Formatear mes a 2 dígitos
  const mesPadded = mes.toString().padStart(2, '0');
  const fechaInicio = `${anio}-${mesPadded}`;

  // 1. Filtrar Gastos_Vehiculos del mes
  const gastos = await gastosVehiculoHelper.getGastosVehiculos();
  const gastosMes = gastos.filter(g => 
    g.placa === placa && 
    g.fecha_registro?.startsWith(fechaInicio)
  );

  // 2. Calcular totales por tipo
  const total_combustible = gastosMes
    .filter(g => g.tipo_gasto === 'combustible')
    .reduce((acc, g) => acc + (parseFloat(g.valor_gasto) || 0), 0);

  const total_nominas = gastosMes
    .filter(g => g.tipo_gasto?.includes('nomina'))
    .reduce((acc, g) => acc + (parseFloat(g.valor_gasto) || 0), 0);

  const total_mantenimientos = gastosMes
    .filter(g => ['mantenimiento', 'soat', 'impuesto', 'tecnico', 'poliza'].includes(g.tipo_gasto))
    .reduce((acc, g) => acc + (parseFloat(g.valor_gasto) || 0), 0);

  const total_gastos_viajes = gastosMes
    .filter(g => g.tipo_gasto === 'viaje')
    .reduce((acc, g) => acc + (parseFloat(g.valor_gasto) || 0), 0);

  const total_gastos = total_combustible + total_nominas + total_mantenimientos + total_gastos_viajes;

  // 3. Calcular ingresos (ganancia de viajes facturados)
  const viajes = await viajeHelper.getTodosLosViajes();
  const viajesMes = viajes.filter(v => 
    v.placa === placa && 
    v.fecha_fin_viaje?.startsWith(fechaInicio) &&
    v.estado_viaje === 'facturado'
  );

  const total_ingresos = viajesMes
    .reduce((acc, v) => acc + (parseFloat(v.ganancia_viaje_real) || parseFloat(v.ganancia_viaje_estimada) || 0), 0);

  const diferencia = total_ingresos - total_gastos;

  return {
    anio,
    mes: mesPadded,
    placa,
    total_gastos,
    total_combustible,
    total_nominas,
    total_mantenimientos,
    total_gastos_viajes,
    total_ingresos,
    diferencia
  };
};

const guardarResumenMensual = async (resumen) => {
  const sheets = getSheetsClient();

  // Verificar si ya existe el resumen
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Resumen_Vehiculo!A2:J1000',
  });

  const filas = response.data.values || [];
  const filaIndex = filas.findIndex(f => 
    f[0] === resumen.anio && 
    f[1] === resumen.mes && 
    f[2] === resumen.placa
  );

  const nuevaFila = [
    resumen.anio,
    resumen.mes,
    resumen.placa,
    resumen.total_gastos,
    resumen.total_combustible,
    resumen.total_nominas,
    resumen.total_mantenimientos,
    resumen.total_gastos_viajes,
    resumen.total_ingresos,
    resumen.diferencia
  ];

  if (filaIndex !== -1) {
    // Actualizar existente
    const filaEnHoja = filaIndex + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Resumen_Vehiculo!A${filaEnHoja}:J${filaEnHoja}`,
      valueInputOption: 'RAW',
      requestBody: { values: [nuevaFila] },
    });
  } else {
    // Crear nuevo
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Resumen_Vehiculo!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [nuevaFila] },
    });
  }

  return resumen;
};

const generarResumenAnual = async (placa, anio) => {
  const resumenMensual = [];
  
  // Generar resumen de cada mes
  for (let mes = 1; mes <= 12; mes++) {
    const resumen = await generarResumenMensual(placa, anio, mes);
    resumenMensual.push(resumen);
  }

  // Calcular totales anuales
  const total_anual = {
    anio,
    mes: 'TOTAL',
    placa,
    total_gastos: resumenMensual.reduce((acc, r) => acc + r.total_gastos, 0),
    total_combustible: resumenMensual.reduce((acc, r) => acc + r.total_combustible, 0),
    total_nominas: resumenMensual.reduce((acc, r) => acc + r.total_nominas, 0),
    total_mantenimientos: resumenMensual.reduce((acc, r) => acc + r.total_mantenimientos, 0),
    total_gastos_viajes: resumenMensual.reduce((acc, r) => acc + r.total_gastos_viajes, 0),
    total_ingresos: resumenMensual.reduce((acc, r) => acc + r.total_ingresos, 0),
    diferencia: resumenMensual.reduce((acc, r) => acc + r.diferencia, 0)
  };

  // Guardar total anual
  await guardarResumenMensual(total_anual);

  return {
    resumen_mensual: resumenMensual,
    total_anual
  };
};

const getResumenVehiculo = async (placa, anio) => {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Resumen_Vehiculo!A2:J1000',
  });

  const rows = res.data.values || [];
  const headers = ['anio', 'mes', 'placa', 'total_gastos', 'total_combustible', 'total_nominas', 'total_mantenimientos', 'total_gastos_viajes', 'total_ingresos', 'diferencia'];
  
  const resumenes = rows.map(row =>
    Object.fromEntries(row.map((val, i) => [headers[i], val]))
  );

  return resumenes.filter(r => r.placa === placa && r.anio === anio.toString());
};

export const resumenVehiculoHelper = {
  generarResumenMensual,
  guardarResumenMensual,
  generarResumenAnual,
  getResumenVehiculo
};