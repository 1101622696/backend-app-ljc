import { google } from 'googleapis';
import stream from 'stream';
import { usuarioHelper } from '../helpers/usuarios.js';
import { clienteHelper } from '../helpers/clientes.js';
import { prestamoHelper } from '../helpers/prestamos.js';
import { gastosVehiculoHelper } from '../helpers/gastos.js';

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

const obtenerDatosViaje = async (nombreHoja, rango = 'A1:BB1000') => {
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

const getViajes = async () => {
  const viajes = await obtenerDatosViaje('Viajes');
  
  return viajes.sort((a, b) => {
    const numA = parseInt(a.consecutivo.replace(/\D/g, ''), 10);
    const numB = parseInt(b.consecutivo.replace(/\D/g, ''), 10);
    
    return numB - numA;
  });
};

const getSiguienteConsecutivo = async () => {
  const viajes = await getViajes();
  
  if (!viajes.length) return "V-1";

  const ultimo = viajes[0].consecutivo;

  const numero = parseInt(ultimo.split('-')[1], 10) || 0;
  
  return `V-${numero + 1}`;
};

const guardarAnticipo = async ({ placa, cliente, destino, fecha_inicio, valor_anticipo_conductor, valor_tonelada_inicial, correo_usuario, usuario, fecha_creacion }) => {
  const sheets = await getSheetsClient();
  const consecutivo = await getSiguienteConsecutivo();

  const nuevaFila = [
    consecutivo,                    // A
    placa,                          // B
    cliente,                        // C
    destino,                        // D
    fecha_inicio,                   // E
    '',                             // F - valor_anticipo_cliente
    '',                             // G - saldo_pendiente_cliente_sin_descuento
    '',                             // H - saldo_pendiente_cliente_real
    '',                             // I - descuento_rete_fuente
    '',                             // J - descuento_rete_ica
    '',                             // K - total_descuentos_cliente
    'pendiente',                    // L - estado_saldo_cliente
    '',                             // M - valor_viaje_estimado
    '',                             // N - valor_viaje_real
    '',                             // O - diferencia_facturacion
    '',                             // P - toneladas_inicio
    '',                             // Q - toneladas_descargue
    '',                             // R - diferencia_kg
    valor_tonelada_inicial,         // S
    '',                             // T - valor_tonelada_final
    '',                             // U - diez_pcto
    valor_anticipo_conductor,       // V
    '',                             // W - saldo_anticipo_conductor
    '',                             // X - total_gastos_conductor
    '',                             // Y - saldo_pendiente_conductor
    '',                             // Z - fecha_fin_viaje
    '',                             // AA - cant_peajes_conductor
    '',                             // AB - valor_total_peajes_conductor
    '',                             // AC - valor_cargue_conductor
    '',                             // AD - valor_descargue_conductor
    '',                             // AE - engrase_conductor
    '',                             // AF - parqueadero_conductor
    '',                             // AG - fumigacion_conductor
    '',                             // AH - lavadas_conductor
    '',                             // AI - comision_despachador_conductor
    '',                             // AJ - otro_conductor
    '',                             // AK - valor_otro_conductor
    '',                             // AL - cant_peajes_propietario
    '',                             // AM - valor_total_peajes_propietario
    '',                             // AN - valor_cargue_propietario
    '',                             // AO - valor_descargue_propietario
    '',                             // AP - engrase_propietario
    '',                             // AQ - parqueadero_propietario
    '',                             // AR - fumigacion_propietario
    '',                             // AS - lavadas_propietario
    '',                             // AT - comision_despachador_propietario
    '',                             // AU - otro_propietario
    '',                             // AV - valor_otro_propietario
    '',                             // AW - total_gastos_propietario
    '',                             // AX - ganancia_viaje_estimada
    '',                             // AY - ganancia_viaje_real
    '',                             // AZ - url_descargue
    correo_usuario,                 // BA
    usuario,                        // BB
    fecha_creacion,                 // BC
    'solicitado',                   // BD - estado_viaje
    'no',                           // BE - liquidado
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Viajes!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

  return { consecutivo };
};

const getViajesByConsecutivo = async (consecutivo) => {
  const viajes = await getViajes();
  return viajes.find(viaje => 
    viaje.consecutivo && viaje.consecutivo.toLowerCase() === consecutivo.toLowerCase()
  );
};

const getResumenViajesPorSolicitante = async (email) => {
  try {
    const todoslosViajes = await getViajes();
    const viajesFiltrados = todoslosViajes.filter(s => s.correo_usuario  === email);

    const mapConDatos = (lista) => {
      return lista.map(r => ({
        consecutivo: r.consecutivo,
        fecha_creacion: r.fecha_creacion || '',
        correo_usuario : r.correo_usuario || '',
        usuario: r.usuario || '',
        placa: r.placa || '',
        cliente: r.cliente || '',
        destino: r.destino || '',
        fecha_inicio: r.fecha_inicio || '',
        estado_viaje: r.estado_viaje || '',
      }));  
    };

    return {
      total: {
        count: viajesFiltrados.length,
        consecutivos: mapConDatos(viajesFiltrados)
      }
    };
  } catch (error) {
    console.error('Error al obtener resumen de preoperacionales por email:', error);
    throw error;
  }
};

const cerrarViajeYGastosConductor = async (consecutivo, datos) => {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A2:BE1000',
  });

  const filas = response.data.values;
  const filaIndex = filas.findIndex(f => f[0]?.toLowerCase() === consecutivo.toLowerCase());
  if (filaIndex === -1) return null;

  const filaActual = filas[filaIndex];

  // Gastos conductor
  const cant_peajes_conductor = parseFloat(datos.cant_peajes_conductor) || 0;
  const valor_total_peajes_conductor = parseFloat(datos.valor_total_peajes_conductor) || 0;
  const valor_cargue_conductor = parseFloat(datos.valor_cargue_conductor) || 0;
  const valor_descargue_conductor = parseFloat(datos.valor_descargue_conductor) || 0;
  const engrase_conductor = parseFloat(datos.engrase_conductor) || 0;
  const parqueadero_conductor = parseFloat(datos.parqueadero_conductor) || 0;
  const fumigacion_conductor = parseFloat(datos.fumigacion_conductor) || 0;
  const lavadas_conductor = parseFloat(datos.lavadas_conductor) || 0;
  const comision_despachador_conductor = parseFloat(datos.comision_despachador_conductor) || 0;
  const valor_otro_conductor = parseFloat(datos.valor_otro_conductor) || 0;

  const total_gastos_conductor = valor_total_peajes_conductor + valor_cargue_conductor +
    valor_descargue_conductor + engrase_conductor + parqueadero_conductor + fumigacion_conductor + 
    lavadas_conductor + comision_despachador_conductor + valor_otro_conductor;

  // Toneladas
  const toneladas_inicio = parseFloat(datos.toneladas_inicio) || 0;
  const toneladas_descargue = parseFloat(datos.toneladas_descargue) || 0;
  const diferencia_kg = (toneladas_inicio - toneladas_descargue) * 1000;

  // Valor del viaje estimado
  const valor_tonelada_final = parseFloat(datos.valor_tonelada_final) || parseFloat(filaActual[18]) || 0; // T o S
  const valor_viaje_estimado = toneladas_descargue * valor_tonelada_final;

  // Cálculos conductor
  const valor_anticipo_conductor = parseFloat(filaActual[21]) || 0; // V
  const saldo_anticipo_conductor = valor_anticipo_conductor - total_gastos_conductor;
  const diez_pcto = valor_viaje_estimado * 0.10;
  const saldo_pendiente_conductor = diez_pcto - saldo_anticipo_conductor;

  // Actualizar fila
  filaActual[12] = valor_viaje_estimado;               // M
  filaActual[15] = toneladas_inicio;                   // P
  filaActual[16] = toneladas_descargue;                // Q
  filaActual[17] = diferencia_kg;                      // R
  filaActual[19] = valor_tonelada_final;               // T
  filaActual[20] = diez_pcto;                          // U
  filaActual[22] = saldo_anticipo_conductor;           // W
  filaActual[23] = total_gastos_conductor;             // X
  filaActual[24] = saldo_pendiente_conductor;          // Y
  filaActual[25] = datos.fecha_fin_viaje || '';        // Z
  filaActual[26] = cant_peajes_conductor;              // AA
  filaActual[27] = valor_total_peajes_conductor;       // AB
  filaActual[28] = valor_cargue_conductor;             // AC
  filaActual[29] = valor_descargue_conductor;          // AD
  filaActual[30] = engrase_conductor;                  // AE
  filaActual[31] = parqueadero_conductor;              // AF
  filaActual[32] = fumigacion_conductor;               // AG
  filaActual[33] = lavadas_conductor;                  // AH
  filaActual[34] = comision_despachador_conductor;     // AI
  filaActual[35] = datos.otro_conductor || '';         // AJ
  filaActual[36] = valor_otro_conductor;               // AK
  filaActual[51] = datos.url_descargue || '';          // AZ
  filaActual[55] = 'completado';                       // BD - estado_viaje

  const filaEnHoja = filaIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Viajes!A${filaEnHoja}:BE${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: { values: [filaActual] },
  });

  return { 
    valor_viaje_estimado, 
    diferencia_kg, 
    total_gastos_conductor, 
    saldo_anticipo_conductor,
    saldo_pendiente_conductor,
    diez_pcto
  };
};

const aprobarViajeYGastosPropietario = async (consecutivo, datos) => {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A2:BE1000',
  });

  const filas = response.data.values;
  const filaIndex = filas.findIndex(f => f[0]?.toLowerCase() === consecutivo.toLowerCase());
  if (filaIndex === -1) return null;

  const filaActual = filas[filaIndex];

  // Buscar cliente por código
  const codigoCliente = filaActual[2]; // C
  const clientes = await clienteHelper.getClientes();
  const cliente = clientes.find(c => c.codigo === codigoCliente);

  if (!cliente) {
    throw new Error('Cliente no encontrado');
  }

  const rete_fuente = cliente.rete_fuente || 'no';
  const rete_ica = parseFloat(cliente.rete_ica) || 0;

  // Gastos propietario
  const cant_peajes_propietario = parseFloat(datos.cant_peajes_propietario) || 0;
  const valor_total_peajes_propietario = parseFloat(datos.valor_total_peajes_propietario) || 0;
  const valor_cargue_propietario = parseFloat(datos.valor_cargue_propietario) || 0;
  const valor_descargue_propietario = parseFloat(datos.valor_descargue_propietario) || 0;
  const engrase_propietario = parseFloat(datos.engrase_propietario) || 0;
  const parqueadero_propietario = parseFloat(datos.parqueadero_propietario) || 0;
  const fumigacion_propietario = parseFloat(datos.fumigacion_propietario) || 0;
  const lavadas_propietario = parseFloat(datos.lavadas_propietario) || 0;
  const comision_despachador_propietario = parseFloat(datos.comision_despachador_propietario) || 0;
  const valor_otro_propietario = parseFloat(datos.valor_otro_propietario) || 0;

  const total_gastos_propietario = valor_total_peajes_propietario + valor_cargue_propietario +
    valor_descargue_propietario + engrase_propietario + parqueadero_propietario +
    fumigacion_propietario + lavadas_propietario + comision_despachador_propietario +
    valor_otro_propietario;

  // Cálculos cliente
  const valor_viaje_estimado = parseFloat(filaActual[12]) || 0; // M
  const valor_anticipo_cliente = parseFloat(datos.valor_anticipo_cliente) || 0;
  const saldo_pendiente_cliente_sin_descuento = valor_viaje_estimado - valor_anticipo_cliente;

  const descuento_rete_fuente = rete_fuente.toLowerCase() === 'si' 
    ? saldo_pendiente_cliente_sin_descuento * 0.01 
    : 0;
  const descuento_rete_ica = saldo_pendiente_cliente_sin_descuento * (rete_ica / 100);
  const total_descuentos_cliente = descuento_rete_fuente + descuento_rete_ica;
  const saldo_pendiente_cliente_real = saldo_pendiente_cliente_sin_descuento - total_descuentos_cliente;

  // Ganancia viaje estimada
  const diez_pcto = parseFloat(filaActual[20]) || 0; // U
  const total_gastos_conductor = parseFloat(filaActual[23]) || 0; // X
  const ganancia_viaje_estimada = valor_viaje_estimado - diez_pcto - total_gastos_conductor - total_gastos_propietario;

  // Actualizar fila
  filaActual[5] = valor_anticipo_cliente;                  // F
  filaActual[6] = saldo_pendiente_cliente_sin_descuento;   // G
  filaActual[7] = saldo_pendiente_cliente_real;            // H
  filaActual[8] = descuento_rete_fuente;                   // I
  filaActual[9] = descuento_rete_ica;                      // J
  filaActual[10] = total_descuentos_cliente;               // K
  filaActual[37] = cant_peajes_propietario;                // AL
  filaActual[38] = valor_total_peajes_propietario;         // AM
  filaActual[39] = valor_cargue_propietario;               // AN
  filaActual[40] = valor_descargue_propietario;            // AO
  filaActual[41] = engrase_propietario;                    // AP
  filaActual[42] = parqueadero_propietario;                // AQ
  filaActual[43] = fumigacion_propietario;                 // AR
  filaActual[44] = lavadas_propietario;                    // AS
  filaActual[45] = comision_despachador_propietario;       // AT
  filaActual[46] = datos.otro_propietario || '';           // AU
  filaActual[47] = valor_otro_propietario;                 // AV
  filaActual[48] = total_gastos_propietario;               // AW
  filaActual[49] = ganancia_viaje_estimada;                // AX
  filaActual[55] = 'aprobado';                             // BD - estado_viaje

  const filaEnHoja = filaIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Viajes!A${filaEnHoja}:BE${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: { values: [filaActual] },
  });

  // ===== REGISTRAR EN GASTOS_VEHICULOS =====
  const placa = filaActual[1]; // B
  await gastosVehiculoHelper.registrarGasto({
    placa,
    tipo_gasto: 'viaje',
    codigo_referencia: consecutivo,
    valor_gasto: total_gastos_propietario,
    descripcion: `Gastos propietario viaje ${consecutivo}`,
    fecha_registro: new Date().toISOString().split('T')[0]
  });

  return {
    saldo_pendiente_cliente_real,
    total_descuentos_cliente,
    ganancia_viaje_estimada,
    total_gastos_propietario
  };
};

const completarSaldoCliente = async (consecutivo) => {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A2:BE1000',
  });

  const filas = response.data.values;
  const filaIndex = filas.findIndex(f => f[0]?.toLowerCase() === consecutivo.toLowerCase());
  if (filaIndex === -1) return null;

  const filaActual = filas[filaIndex];

  // Actualizar estado saldo cliente
  filaActual[11] = 'pagado'; // L - estado_saldo_cliente

  const codigoCliente = filaActual[2]; // C
  const valor_viaje_estimado = parseFloat(filaActual[12]) || 0; // M
  const valor_viaje_real = parseFloat(filaActual[13]) || valor_viaje_estimado; // N (si no está facturado, usa estimado)
  const ganancia_viaje = parseFloat(filaActual[50]) || parseFloat(filaActual[49]) || 0; // AY o AX

  const filaEnHoja = filaIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Viajes!A${filaEnHoja}:BE${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: { values: [filaActual] },
  });

  // Actualizar 3 economías del cliente
  await clienteHelper.actualizarEconomiaCliente(
    codigoCliente, 
    valor_viaje_estimado, 
    valor_viaje_real, 
    ganancia_viaje
  );

  return true;
};

const calcularNomina = async (emailConductor, mes) => {
  const viajes = await getViajes();

  const viajesConductor = viajes.filter(v =>
    v.correo_usuario === emailConductor &&
    v.estado_viaje === 'aprobado' && // Cambio: era "completado"
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

  const sheets = await getSheetsClient();

  // Marcar viajes como liquidados
  const responseViajes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A2:BE1000',
  });

  const filasViajes = responseViajes.data.values;
  const placasAfectadas = new Set();

  for (const consecutivo of calculo.viajes_ids) {
    const filaIndex = filasViajes.findIndex(f => f[0]?.toLowerCase() === consecutivo.toLowerCase());
    if (filaIndex !== -1) {
      filasViajes[filaIndex][56] = 'si'; // BE - liquidado
      placasAfectadas.add(filasViajes[filaIndex][1]); // B - placa
      
      const filaEnHoja = filaIndex + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Viajes!A${filaEnHoja}:BE${filaEnHoja}`,
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

  // Guardar registro tipo "viajes" en Nomina_Conductores
  const nuevaFila = [
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
  const sheets = await getSheetsClient();
  
  // Verificar si ya se pagó el salario base este mes
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Nomina_Conductores!A2:L1000',
  });

  const registros = response.data.values || [];
  const yaPagado = registros.some(r => 
    r[1] === emailConductor && 
    r[0] === mes && 
    r[11] === 'salario'
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

  const nuevaFila = [
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

const editarViajePorConsecutivo = async (consecutivo, nuevosDatos) => {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A2:BB1000',
  });

  const filas = response.data.values;
  const filaIndex = filas.findIndex(f => f[0]?.toLowerCase() === consecutivo.toLowerCase());

  if (filaIndex === -1) return null;

  const filaActual = filas[filaIndex];

  // Verificar que no esté liquidado
  if (filaActual[56] === 'si') { // BA
    throw new Error('No se puede editar un viaje ya liquidado');
  }

  // Actualizar campos editables básicos
  if (nuevosDatos.placa) filaActual[1] = nuevosDatos.placa;
  if (nuevosDatos.cliente) filaActual[2] = nuevosDatos.cliente;
  if (nuevosDatos.destino) filaActual[3] = nuevosDatos.destino;
  if (nuevosDatos.fecha_inicio) filaActual[4] = nuevosDatos.fecha_inicio;
  if (nuevosDatos.valor_anticipo_cliente !== undefined) filaActual[5] = nuevosDatos.valor_anticipo_cliente;
  if (nuevosDatos.toneladas_inicio !== undefined) filaActual[13] = nuevosDatos.toneladas_inicio;
  if (nuevosDatos.toneladas_descargue !== undefined) filaActual[14] = nuevosDatos.toneladas_descargue;
  if (nuevosDatos.valor_tonelada_inicial !== undefined) filaActual[16] = nuevosDatos.valor_tonelada_inicial;
  if (nuevosDatos.valor_tonelada_final !== undefined) filaActual[17] = nuevosDatos.valor_tonelada_final;
  if (nuevosDatos.valor_anticipo_conductor !== undefined) filaActual[19] = nuevosDatos.valor_anticipo_conductor;
  if (nuevosDatos.fecha_fin_viaje) filaActual[23] = nuevosDatos.fecha_fin_viaje;

  // Gastos conductor
  if (nuevosDatos.cant_peajes_conductor !== undefined) filaActual[24] = nuevosDatos.cant_peajes_conductor;
  if (nuevosDatos.valor_total_peajes_conductor !== undefined) filaActual[25] = nuevosDatos.valor_total_peajes_conductor;
  if (nuevosDatos.valor_cargue_conductor !== undefined) filaActual[26] = nuevosDatos.valor_cargue_conductor;
  if (nuevosDatos.valor_descargue_conductor !== undefined) filaActual[27] = nuevosDatos.valor_descargue_conductor;
  if (nuevosDatos.engrase_conductor !== undefined) filaActual[28] = nuevosDatos.engrase_conductor;
  if (nuevosDatos.parqueadero_conductor !== undefined) filaActual[29] = nuevosDatos.parqueadero_conductor;
  if (nuevosDatos.fumigacion_conductor !== undefined) filaActual[30] = nuevosDatos.fumigacion_conductor;
  if (nuevosDatos.lavadas_conductor !== undefined) filaActual[31] = nuevosDatos.lavadas_conductor;
  if (nuevosDatos.comision_despachador_conductor !== undefined) filaActual[32] = nuevosDatos.comision_despachador_conductor;
  if (nuevosDatos.otro_conductor) filaActual[33] = nuevosDatos.otro_conductor;
  if (nuevosDatos.valor_otro_conductor !== undefined) filaActual[34] = nuevosDatos.valor_otro_conductor;

  // Gastos propietario
  if (nuevosDatos.cant_peajes_propietario !== undefined) filaActual[35] = nuevosDatos.cant_peajes_propietario;
  if (nuevosDatos.valor_total_peajes_propietario !== undefined) filaActual[36] = nuevosDatos.valor_total_peajes_propietario;
  if (nuevosDatos.valor_cargue_propietario !== undefined) filaActual[37] = nuevosDatos.valor_cargue_propietario;
  if (nuevosDatos.valor_descargue_propietario !== undefined) filaActual[38] = nuevosDatos.valor_descargue_propietario;
  if (nuevosDatos.engrase_propietario !== undefined) filaActual[39] = nuevosDatos.engrase_propietario;
  if (nuevosDatos.parqueadero_propietario !== undefined) filaActual[40] = nuevosDatos.parqueadero_propietario;
  if (nuevosDatos.fumigacion_propietario !== undefined) filaActual[41] = nuevosDatos.fumigacion_propietario;
  if (nuevosDatos.lavadas_propietario !== undefined) filaActual[42] = nuevosDatos.lavadas_propietario;
  if (nuevosDatos.comision_despachador_propietario !== undefined) filaActual[43] = nuevosDatos.comision_despachador_propietario;
  if (nuevosDatos.otro_propietario) filaActual[44] = nuevosDatos.otro_propietario;
  if (nuevosDatos.valor_otro_propietario !== undefined) filaActual[45] = nuevosDatos.valor_otro_propietario;
  if (nuevosDatos.url_descargue) filaActual[48] = nuevosDatos.url_descargue;

  // ===== RECALCULAR TODOS LOS CAMPOS =====

  // 1. Valor del viaje
  const toneladas_descargue = parseFloat(filaActual[14]) || 0;
  const valor_tonelada_final = parseFloat(filaActual[17]) || parseFloat(filaActual[16]) || 0;
  const valor_viaje = toneladas_descargue * valor_tonelada_final;
  filaActual[12] = valor_viaje;

  // 2. Diferencia toneladas
  const toneladas_inicio = parseFloat(filaActual[13]) || 0;
  filaActual[15] = (toneladas_inicio - toneladas_descargue) * 1000;

  // 3. Diez por ciento
  const diez_pcto = valor_viaje * 0.10;
  filaActual[18] = diez_pcto;

  // 4. Total gastos conductor
  const total_gastos_conductor = 
    (parseFloat(filaActual[25]) || 0) + // valor_total_peajes_conductor
    (parseFloat(filaActual[26]) || 0) + // valor_cargue_conductor
    (parseFloat(filaActual[27]) || 0) + // valor_descargue_conductor
    (parseFloat(filaActual[28]) || 0) + // engrase_conductor
    (parseFloat(filaActual[29]) || 0) + // parqueadero_conductor
    (parseFloat(filaActual[30]) || 0) + // fumigacion_conductor
    (parseFloat(filaActual[31]) || 0) + // lavadas_conductor
    (parseFloat(filaActual[32]) || 0) + // comision_despachador_conductor
    (parseFloat(filaActual[34]) || 0);  // valor_otro_conductor
  
  filaActual[21] = total_gastos_conductor;

  // 5. Saldo anticipo conductor
  const valor_anticipo_conductor = parseFloat(filaActual[19]) || 0;
  const saldo_anticipo_conductor = valor_anticipo_conductor - total_gastos_conductor;
  filaActual[20] = saldo_anticipo_conductor;

  // 6. Saldo pendiente conductor
  filaActual[22] = diez_pcto - saldo_anticipo_conductor;

  // 7. Total gastos propietario
  const total_gastos_propietario = 
    (parseFloat(filaActual[36]) || 0) + // valor_total_peajes_propietario
    (parseFloat(filaActual[37]) || 0) + // valor_cargue_propietario
    (parseFloat(filaActual[38]) || 0) + // valor_descargue_propietario
    (parseFloat(filaActual[39]) || 0) + // engrase_propietario
    (parseFloat(filaActual[40]) || 0) + // parqueadero_propietario
    (parseFloat(filaActual[41]) || 0) + // fumigacion_propietario
    (parseFloat(filaActual[42]) || 0) + // lavadas_propietario
    (parseFloat(filaActual[43]) || 0) + // comision_despachador_propietario
    (parseFloat(filaActual[45]) || 0);  // valor_otro_propietario
  
  filaActual[46] = total_gastos_propietario;

  // 8. Buscar datos del cliente para descuentos (SOLO si hay anticipo cliente)
  const valor_anticipo_cliente = parseFloat(filaActual[5]) || 0;
  
  if (valor_anticipo_cliente > 0) {
    const codigoCliente = filaActual[2];
    const clientes = await clienteHelper.getClientes();
    const cliente = clientes.find(c => c.codigo === codigoCliente);

    if (cliente) {
      const rete_fuente = cliente.rete_fuente || 'no';
      const rete_ica = parseFloat(cliente.rete_ica) || 0;

      const saldo_pendiente_cliente_sin_descuento = valor_viaje - valor_anticipo_cliente;
      const descuento_rete_fuente = rete_fuente.toLowerCase() === 'si' 
        ? saldo_pendiente_cliente_sin_descuento * 0.01 
        : 0;
      const descuento_rete_ica = saldo_pendiente_cliente_sin_descuento * (rete_ica / 100);
      const total_descuentos_cliente = descuento_rete_fuente + descuento_rete_ica;
      const saldo_pendiente_cliente_real = saldo_pendiente_cliente_sin_descuento - total_descuentos_cliente;

      filaActual[6] = saldo_pendiente_cliente_sin_descuento;
      filaActual[7] = saldo_pendiente_cliente_real;
      filaActual[8] = descuento_rete_fuente;
      filaActual[9] = descuento_rete_ica;
      filaActual[10] = total_descuentos_cliente;
    }
  }

  // 9. Ganancia viaje
  filaActual[46] = valor_viaje - diez_pcto - total_gastos_conductor - total_gastos_propietario;

  // Guardar cambios
  const filaEnHoja = filaIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Viajes!A${filaEnHoja}:BB${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: { values: [filaActual] },
  });

  return true;
};

const facturarCliente = async (codigoCliente) => {
  const viajes = await getViajes();

  const viajesCliente = viajes.filter(v =>
    v.cliente === codigoCliente &&
    v.estado_saldo_cliente === 'pendiente'
  );

  if (!viajesCliente.length) {
    return { 
      mensaje: 'No hay viajes pendientes de pago para este cliente', 
      total_pendiente: 0 
    };
  }

  const total_pendiente = viajesCliente.reduce((acc, v) => 
    acc + (parseFloat(v.saldo_pendiente_cliente_real) || 0), 0
  );

  const clientes = await clienteHelper.getClientes();
  const cliente = clientes.find(c => c.codigo === codigoCliente);

  return {
    codigoCliente,
    nombre_empresa: cliente?.empresa || '',
    tipo_pago: cliente?.tipo_pago || '',
    total_viajes: viajesCliente.length,
    total_pendiente,
    viajes: viajesCliente.map(v => ({
      consecutivo: v.consecutivo,
      placa: v.placa,
      destino: v.destino,
      fecha_inicio: v.fecha_inicio,
      fecha_fin_viaje: v.fecha_fin_viaje,
      valor_viaje: v.valor_viaje,
      valor_anticipo_cliente: v.valor_anticipo_cliente,
      saldo_pendiente_cliente_real: v.saldo_pendiente_cliente_real
    }))
  };
};

const facturarViaje = async (consecutivo, valor_viaje_real) => {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A2:BE1000',
  });

  const filas = response.data.values;
  const filaIndex = filas.findIndex(f => f[0]?.toLowerCase() === consecutivo.toLowerCase());
  if (filaIndex === -1) return null;

  const filaActual = filas[filaIndex];

  // Verificar que esté aprobado
  if (filaActual[55] !== 'aprobado') { // BD
    throw new Error('El viaje debe estar aprobado antes de facturar');
  }

  const valor_viaje_estimado = parseFloat(filaActual[12]) || 0; // M
  const diferencia_facturacion = valor_viaje_real - valor_viaje_estimado;

  // Recalcular 10% con valor real
  const diez_pcto_nuevo = valor_viaje_real * 0.10;
  const diez_pcto_anterior = parseFloat(filaActual[20]) || 0; // U
  const diferencia_diez_pcto = diez_pcto_nuevo - diez_pcto_anterior;

  // Actualizar 10% del conductor
  filaActual[20] = diez_pcto_nuevo; // U

  // Recalcular saldo pendiente conductor
  const saldo_anticipo_conductor = parseFloat(filaActual[22]) || 0; // W
  const saldo_pendiente_conductor_nuevo = diez_pcto_nuevo - saldo_anticipo_conductor;
  filaActual[24] = saldo_pendiente_conductor_nuevo; // Y

  // Recalcular ganancia real del propietario
  const total_gastos_conductor = parseFloat(filaActual[23]) || 0; // X
  const total_gastos_propietario = parseFloat(filaActual[48]) || 0; // AW
  const ganancia_viaje_real = valor_viaje_real - diez_pcto_nuevo - total_gastos_conductor - total_gastos_propietario;

  filaActual[13] = valor_viaje_real;           // N
  filaActual[14] = diferencia_facturacion;     // O
  filaActual[50] = ganancia_viaje_real;        // AY
  filaActual[55] = 'facturado';                // BD

  const filaEnHoja = filaIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Viajes!A${filaEnHoja}:BE${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: { values: [filaActual] },
  });

  // Verificar si el viaje ya fue liquidado
  const liquidado = filaActual[56] === 'si'; // BE

  return { 
    valor_viaje_real, 
    diferencia_facturacion, 
    ganancia_viaje_real,
    diferencia_diez_pcto,
    ya_liquidado: liquidado,
    mensaje: liquidado 
      ? `Se aplicará ajuste de $${diferencia_diez_pcto.toFixed(2)} en la próxima nómina` 
      : 'Cambios aplicados correctamente'
  };
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



export const viajeHelper = {
  getViajes,
  guardarAnticipo,
  getSiguienteConsecutivo,  
  getViajesByConsecutivo,
  getResumenViajesPorSolicitante,
  editarViajePorConsecutivo,
  procesarArchivos,
  subirArchivosACarpetaExistente,
  buscarCarpetaPorNombre,
  aprobarNomina,
  completarSaldoCliente,
  cerrarViajeYGastosConductor,
  calcularNomina,
  pagarSalarioMensual,
  facturarCliente,
  aprobarViajeYGastosPropietario,
  facturarViaje

};