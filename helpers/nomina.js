import { getDriveClient, getSheetsClient } from '../services/google.js';
import { viajeHelper } from '../helpers/viajes.js';
import { prestamoHelper } from '../helpers/prestamos.js';
import { usuarioHelper } from '../helpers/usuarios.js';
import { gastosVehiculoHelper } from '../helpers/gastos.js';

const spreadsheetId = process.env.SPREADSHEET_ID;
const carpetaPadreId = process.env.CARPETA_PADRE_ID_VIAJES;

const obtenerDatosNomina = async (nombreHoja, rango = 'A1:M1000') => {
  const sheets = getSheetsClient();
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

const getNominaConductores = async () => {
  const nomina = await obtenerDatosNomina('Nomina_Conductores');
  
  return nomina.sort((a, b) => {
    const numA = parseInt(a.consecutivo_nomina.replace(/\D/g, ''), 10);
    const numB = parseInt(b.consecutivo_nomina.replace(/\D/g, ''), 10);
    
    return numB - numA;
  });
};

const getNominaByConsecutivo = async (consecutivo) => {
  const nominas = await getNominaConductores();
  return nominas.find(nomina => 
    nomina.consecutivo_nomina && nomina.consecutivo_nomina.toLowerCase() === consecutivo.toLowerCase()
  );
};

const getSiguienteConsecutivoNomina = async () => {
  const nomina = await getNominaConductores()
  
  if (!nomina.length) return 'NOM-1' 

  const numeros = nomina
    .map(r => parseInt(r.consecutivo_nomina?.split('-')[1], 10) || 0)
    .filter(n => !isNaN(n))

  return `NOM-${Math.max(...numeros) + 1}`
}

const getResumenNominaPorSolicitante = async (email) => {
  try {
    const todaslasNominas = await getNominaConductores();
    const nominafiltrados = todaslasNominas.filter(s => s.id_conductor  === email);

    const mapConDatos = (lista) => {
      return lista.map(r => ({
        consecutivo_nomina: r.consecutivo_nomina,
        mes: r.mes || '',
        id_conductor : r.id_conductor || '',
        fecha_pago: r.fecha_pago || '',
        salario_base: r.salario_base || '',
        sso: r.sso || '',
        total_viajes_mes: r.total_viajes_mes || '',
        diez_pcto_total_mes: r.diez_pcto_total_mes || '',
        saldo_anticipo_total_mes: r.saldo_anticipo_total_mes || '',
        total_prestamos: r.total_prestamos || '',
        total_nomina: r.total_nomina || '',
        tipo: r.tipo || '',
      }));  
    };

    return {
      total: {
        count: nominafiltrados.length,
        consecutivos: mapConDatos(nominafiltrados)
      }
    };
  } catch (error) {
    console.error('Error al obtener resumen de nomina por email:', error);
    throw error;
  }
};

const ordenarNominasPorCampoNumerico = (nominas, campo, orden = 'desc') => {
  return nominas.sort((a, b) => {
    const valorA = parseFloat(a[campo]) || 0;
    const valorB = parseFloat(b[campo]) || 0;
    
    return orden.toLowerCase() === 'desc' ? valorB - valorA : valorA - valorB;
  });
};

const getNominasOrdenadosPorValor = async (orden = 'desc') => {
  const nominas = await getNominaConductores();
  return ordenarNominasPorCampoNumerico(nominas, 'total_nomina', orden);
};

const getNominasOrdenadosPorViajes = async (orden = 'desc') => {
  const nominas = await getNominaConductores();
  return ordenarNominasPorCampoNumerico(nominas, 'total_viajes_mes', orden);
};

const getNominaPorMes = async (mes) => {
  const nominas = await getNominaConductores();

  return nominas.filter((nomina) => {
    if (!nomina.fecha_pago) return false;

    const fecha = new Date(nomina.fecha_pago);

    return fecha.getMonth() + 1 === Number(mes);
  });
};

const getNominasPorTipo = async (valor) => {
  const nominas = await getNominaConductores();
  return filtrarNominasPorCampoTexto(nominas, 'tipo', valor);
};

const filtrarNominasPorCampoTexto = (nominas, campo, valor) => {
  return nominas.filter(nomina => 
    nomina[campo] && nomina[campo].toLowerCase() === valor.toLowerCase()
  );
};

const calcularNomina = async (emailConductor, mes) => {
  const viajes = await viajeHelper.getTodosLosViajes();

  const viajesConductor = viajes.filter(v =>
    v.correo_usuario === emailConductor &&
    (v.estado_viaje === 'aprobado' || v.estado_viaje === 'facturado') && 
    v.liquidado === 'no'
  );

  if (!viajesConductor.length) {
    return { mensaje: 'No hay viajes pendientes de liquidar', total_nomina: 0 };
  }

  const total_viajes_mes = viajesConductor.length;
  const diez_pcto_total_mes = viajesConductor.reduce((acc, v) => acc + (parseFloat(v.diez_pcto) || 0), 0);
  const saldo_anticipo_total_mes = viajesConductor.reduce((acc, v) => acc + (parseFloat(v.saldo_anticipo_conductor) || 0), 0);

  // Buscar préstamos pendientes
  const prestamos = await prestamoHelper.getPrestamos();
  const prestamosPendientes = prestamos.filter(p =>
    p.correo_usuario === emailConductor &&
    p.estado_prestamo === 'pendiente'
  );

  const total_prestamos_pendientes = prestamosPendientes.reduce((acc, p) => acc + (parseFloat(p.valor_prestado) || 0), 0);

  const usuarios = await usuarioHelper.leerUsuariosDesdeSheets();
  const conductor = usuarios.find(u => u.email === emailConductor);

  const total_nomina = diez_pcto_total_mes - saldo_anticipo_total_mes - total_prestamos_pendientes;

  return {
    emailConductor,
    nombre: conductor?.nombre || '',
    mes,
    total_viajes_mes,
    diez_pcto_total_mes,
    saldo_anticipo_total_mes,
    total_prestamos_pendientes,
    prestamos_ids: prestamosPendientes.map(p => p.consecutivo),
    total_nomina,
    viajes_ids: viajesConductor.map(v => v.consecutivo)
  };
};

const aprobarNomina = async (emailConductor, mes) => {
  const calculo = await calcularNomina(emailConductor, mes);

  if (!calculo.total_viajes_mes) {
    throw new Error('No hay viajes para liquidar');
  }

  const sheets = getSheetsClient();

  // Marcar viajes como liquidados
  const responseViajes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A2:AM1000',
  });

  const filasViajes = responseViajes.data.values;
  const placasAfectadas = new Set();

  for (const consecutivo of calculo.viajes_ids) {
    const filaIndex = filasViajes.findIndex(f => f[0]?.toLowerCase() === consecutivo.toLowerCase());
    if (filaIndex !== -1) {
      filasViajes[filaIndex][38] = 'si'; // AM - liquidado
      placasAfectadas.add(filasViajes[filaIndex][1]); // B - placa
      
      const filaEnHoja = filaIndex + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Viajes!A${filaEnHoja}:AM${filaEnHoja}`,
        valueInputOption: 'RAW',
        requestBody: { values: [filasViajes[filaIndex]] },
      });
    }
  }

  // Marcar préstamos como liquidados
  if (calculo.prestamos_ids.length > 0) {
    await prestamoHelper.marcarPrestamosLiquidados(calculo.prestamos_ids);
  }

  const fecha_pago = new Date().toISOString().split('T')[0];

  const consecutivo_nomina = await getSiguienteConsecutivoNomina()

  // Guardar registro tipo "viajes" en Nomina_Conductores
  const nuevaFila = [
    consecutivo_nomina,
    mes,
    emailConductor,
    calculo.nombre,
    0, // salario_base vacío
    0, // sso vacío
    calculo.total_viajes_mes,
    calculo.diez_pcto_total_mes,
    calculo.saldo_anticipo_total_mes,
    calculo.total_prestamos_pendientes,
    calculo.total_nomina,
    fecha_pago,
    'viajes'
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Nomina_Conductores!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

  // ===== REGISTRAR EN GASTOS_VEHICULOS (por cada placa afectada) =====
  for (const placa of placasAfectadas) {
    await gastosVehiculoHelper.registrarGasto({
      placa,
      tipo_gasto: 'nomina_viajes',
      codigo_referencia: `${emailConductor}_${mes}`,
      valor_gasto: calculo.total_nomina,
      descripcion: `Nómina viajes ${mes} - ${calculo.nombre}`,
      fecha_registro: fecha_pago
    });
  }

  return calculo;
};

const pagarSalarioMensual = async (emailConductor, mes) => {
  const sheets = getSheetsClient();
  
  // Verificar si ya se pagó el salario base este mes
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Nomina_Conductores!A2:M1000',
  });

  const registros = response.data.values || [];
  const yaPagado = registros.some(r => 
    r[2] === emailConductor && 
    r[1] === mes && 
    r[12] === 'salario'
  );

  if (yaPagado) {
    throw new Error('El salario base de este mes ya fue pagado');
  }

  const usuarios = await usuarioHelper.leerUsuariosDesdeSheets();
  const conductor = usuarios.find(u => u.email === emailConductor);

  if (!conductor) {
    throw new Error('Conductor no encontrado');
  }

  const placa_asignada = conductor.placa_asignada;
  if (!placa_asignada) {
    throw new Error('Conductor no tiene placa asignada');
  }

  const salario_base = parseFloat(conductor.salario_base) || 1000000;
  const sso = parseFloat(conductor.sso) || 500000;
  const total = salario_base + sso;
  const fecha_pago = new Date().toISOString().split('T')[0];
  
  const consecutivo_nomina = await getSiguienteConsecutivoNomina()

  const nuevaFila = [
    consecutivo_nomina,
    mes,
    emailConductor,
    conductor.nombre,
    salario_base,
    sso,
    0, // total_viajes_mes vacío
    0, // diez_pcto_total_mes vacío
    0, // saldo_anticipo_total_mes vacío
    0, // total_prestamos vacío
    total,
    fecha_pago,
    'salario'
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Nomina_Conductores!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

  const placas = placa_asignada.split(',').map(p => p.trim());
  
  for (const placa of placas) {
    await gastosVehiculoHelper.registrarGasto({
      placa,
      tipo_gasto: 'nomina_salario',
      codigo_referencia: `${emailConductor}_${mes}`,
      valor_gasto: total,
      descripcion: `Salario base ${mes} - ${conductor.nombre}`,
      fecha_registro: fecha_pago
    });
  }

  return { salario_base, sso, total };
};

export const nominaHelper = {
  getNominaConductores,
  getNominaByConsecutivo,
  getResumenNominaPorSolicitante,
  getNominaPorMes,
  getNominasOrdenadosPorValor,
  getNominasOrdenadosPorViajes,
  getNominasPorTipo,
  aprobarNomina,
  calcularNomina,
  pagarSalarioMensual,

};