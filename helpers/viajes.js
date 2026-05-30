import stream from 'stream';
import { getDriveClient, getSheetsClient } from '../services/google.js';
import { clienteHelper } from '../helpers/clientes.js';
import { gastosVehiculoHelper } from '../helpers/gastos.js';
import { detalleGastosViajesHelper } from '../helpers/detalles_gastos.js';
import { get } from 'http';

const spreadsheetId = process.env.SPREADSHEET_ID;
const carpetaPadreId = process.env.CARPETA_PADRE_ID_VIAJES;

const obtenerDatosViaje = async (nombreHoja, rango = 'A1:AN1000') => {
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

const getViajes = async (pagina = 1, limite = 50) => {
  const sheets = getSheetsClient()
  const inicio = (pagina - 1) * limite + 2
  const fin = inicio + limite - 1

  const resHeaders = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A1:AN1',
  })
  const headers = (resHeaders.data.values?.[0] || []).map(h => h.trim().toLowerCase())

  const resData = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Viajes!A${inicio}:AN${fin}`,
  })

  const rows = resData.data.values || []
  const datos = rows
    .map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])))
    .sort((a, b) => {
      const numA = parseInt(a.consecutivo?.replace(/\D/g, ''), 10) || 0
      const numB = parseInt(b.consecutivo?.replace(/\D/g, ''), 10) || 0
      return numB - numA
    })

  return { datos, pagina, limite, hayMas: rows.length === limite }
}

const getTodosLosViajes = async () => {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A1:AN1000',
  })
  const rows = res.data.values || []
  if (rows.length === 0) return []
  const headers = rows[0].map(h => h.trim().toLowerCase())
  return rows.slice(1).map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
  )
}

const getResumenViajesPorPlaca = async (placas) => {
  try {
   
    const todoslosViajes = await getTodosLosViajes()

    const placasArray = Array.isArray(placas)
      ? placas
      : [placas]

    const placasUpper = placasArray.map(p =>p.trim().toUpperCase())

    const viajesFiltrados = todoslosViajes.filter(p => placasUpper.includes(p.placa?.trim().toUpperCase()))

    const mapConDatos = (lista) => {

      return lista.map(r => ({

        consecutivo: r.consecutivo || '',
        placa: r.placa || '',
        cliente: r.cliente || '',
        destino: r.destino || '',
        fecha_inicio: r.fecha_inicio || '',
        estado_viaje: r.estado_viaje || '',
        estado_preoperacional: r.estado_preoperacional || '',

      }))
    }
    return {
      total: {
        count: viajesFiltrados.length,
        consecutivos: mapConDatos(viajesFiltrados)
      }
    }
  } catch (error) {
    console.error('Error al obtener resumen de viajes por placa:', error);
    throw error;
  }
};

const getViajesByConsecutivo = async (consecutivo) => {
  const viajes = await getTodosLosViajes();
  return viajes.find(viaje => 
    viaje.consecutivo && viaje.consecutivo.toLowerCase() === consecutivo.toLowerCase()
  );
};

const filtrarViajesPorCampoTexto = (viajes, campo, valor) => {
  return viajes.filter(viaje => 
    viaje[campo] && viaje[campo].toLowerCase() === valor.toLowerCase()
  );
};

const getViajesPorEstadoSaldoCliente = async (valor) => {
  const viajes = await getTodosLosViajes();
  return filtrarViajesPorCampoTexto(viajes, 'estado_saldo_cliente', valor);
};

const getViajesPorEstadoViaje = async (valor) => {
  const viajes = await getTodosLosViajes();
  return filtrarViajesPorCampoTexto(viajes, 'estado_viaje', valor);
};

const ordenarViajesPorCampoNumerico = (viajes, campo, orden = 'desc') => {
  return viajes.sort((a, b) => {
    const valorA = parseFloat(a[campo]) || 0;
    const valorB = parseFloat(b[campo]) || 0;
    
    return orden.toLowerCase() === 'desc' ? valorB - valorA : valorA - valorB;
  });
};

const getViajesOrdenadosPorFechaInicio = async (orden = 'desc') => {
  const viajes = await getTodosLosViajes();
  
  return viajes.sort((a, b) => {
    const fechaA = new Date(a.fecha_inicio || 0);
    const fechaB = new Date(b.fecha_inicio || 0);
    
    return orden.toLowerCase() === 'desc' ? fechaB - fechaA : fechaA - fechaB;
  });
};

const getViajesOrdenadosPorFechaFin = async (orden = 'desc') => {
  const viajes = await getTodosLosViajes();
  
  return viajes.sort((a, b) => {
    const fechaA = new Date(a.fecha_fin_viaje || 0);
    const fechaB = new Date(b.fecha_fin_viaje || 0);
    
    return orden.toLowerCase() === 'desc' ? fechaB - fechaA : fechaA - fechaB;
  });
};

const getViajesOrdenadosPorValorViajeReal = async (orden = 'desc') => {
  const viajes = await getTodosLosViajes();
  return ordenarViajesPorCampoNumerico(viajes, 'valor_viaje_real', orden);
};

const getViajesOrdenadosPorValorToneladaInicial = async (orden = 'desc') => {
  const viajes = await getTodosLosViajes();
  return ordenarViajesPorCampoNumerico(viajes, 'valor_tonelada_inicial', orden);
};

const getViajesOrdenadosPorValorToneladaFinal = async (orden = 'desc') => {
  const viajes = await getTodosLosViajes();
  return ordenarViajesPorCampoNumerico(viajes, 'valor_tonelada_final', orden);
};

const getViajesOrdenadosPorDiezPcto = async (orden = 'desc') => {
  const viajes = await getTodosLosViajes();
  return ordenarViajesPorCampoNumerico(viajes, 'diez_pcto', orden);
};

const getViajesOrdenadosPorAnticipoConductor = async (orden = 'desc') => {
  const viajes = await getTodosLosViajes();
  return ordenarViajesPorCampoNumerico(viajes, 'valor_anticipo_conductor', orden);
};

const getViajesOrdenadosPorGastosConductor = async (orden = 'desc') => {
  const viajes = await getTodosLosViajes();
  return ordenarViajesPorCampoNumerico(viajes, 'total_gastos_conductor', orden);
};

const getViajesOrdenadosPorGastosPropietario = async (orden = 'desc') => {
  const viajes = await getTodosLosViajes();
  return ordenarViajesPorCampoNumerico(viajes, 'total_gastos_propietario', orden);
};

const getViajesOrdenadosPorGananciaEstimada = async (orden = 'desc') => {
  const viajes = await getTodosLosViajes();
  return ordenarViajesPorCampoNumerico(viajes, 'ganancia_viaje_estimada', orden);
};

const getViajesOrdenadosPorGananciaReal = async (orden = 'desc') => {
  const viajes = await getTodosLosViajes();
  return ordenarViajesPorCampoNumerico(viajes, 'ganancia_viaje_real', orden);
};

const getResumenViajesPorSolicitante = async (email) => {
  try {
    const todoslosViajes = await getTodosLosViajes();
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

const getSiguienteConsecutivo = async () => {
  const viajes = await getTodosLosViajes();
  
  if (!viajes.length) return "V-1";

  const maxNumero = Math.max(
    ...viajes.map((v) => parseInt(v.consecutivo?.split('-')[1], 10) || 0)
  );
  
  return `V-${maxNumero + 1}`;
};

const guardarAnticipo = async ({ placa, cliente, destino, fecha_inicio, valor_anticipo_conductor, valor_tonelada_inicial, correo_usuario, usuario, fecha_creacion, estado_preoperacional  }) => {
  const sheets = getSheetsClient();
  const consecutivo = await getSiguienteConsecutivo();

  // 39 columnas A hasta AM
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
    '',                             // P - notas_facturacion
    '',                             // Q - num_factura_cliente
    '',                             // R - toneladas_inicio
    '',                             // S - toneladas_descargue
    '',                             // T - diferencia_kg
    valor_tonelada_inicial,         // U - valor_tonelada_inicial
    '',                             // V - valor_tonelada_final
    '',                             // W - diez_pcto
    valor_anticipo_conductor,       // X - valor_anticipo_conductor
    '',                             // Y - saldo_anticipo_conductor
    '',                             // Z - total_gastos_conductor
    '',                             // AA - saldo_pendiente_conductor
    '',                             // AB - fecha_fin_viaje
    '',                             // AC - total_gastos_propietario
    '',                             // AD - ganancia_viaje_estimada
    '',                             // AE - ganancia_viaje_real
    '',                             // AF - link_manifiesto
    '',                             // AG - link_gastos_conductor
    '',                             // AH - link_gastos_propietario
    correo_usuario,                 // AI - correo_usuario
    usuario,                        // AJ - usuario
    fecha_creacion,                 // AK - fecha_creacion
    'solicitado',                   // AL - estado_viaje
    'no',                           // AM - liquidado
    estado_preoperacional           // AN - estado del preoperacional
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

const cerrarViajeYGastosConductor = async (consecutivo, datos, archivos) => {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A2:AM1000',
  });

  const filas = response.data.values;
  const filaIndex = filas.findIndex(f => f[0]?.toLowerCase() === consecutivo.toLowerCase());
  if (filaIndex === -1) return null;

  const filaActual = filas[filaIndex];

const gastosValidar = [
  'peajes', 'lavadas', 'parqueadero', 'engrase',
  'fumigacion', 'otro', 'cargue', 'descargue', 'comision'
];

const gastosConSoporte = [
  'peajes', 'lavadas', 'parqueadero', 'engrase',
  'fumigacion', 'otro'
];

for (const gasto of gastosConSoporte) {
  const valor = parseFloat(datos[`${gasto}_conductor`]) || 0;
  const tieneArchivos = archivos?.[`${gasto}_conductor_archivos`]?.length > 0;
  if (valor > 0 && !tieneArchivos) {
    throw new Error(`Debe adjuntar soporte para ${gasto}_conductor`);
  }
}

  // ===== VALIDAR Y SUBIR MANIFIESTO ===== (AGREGAR ESTO)
 if (!archivos || !archivos['manifiesto'] || archivos['manifiesto'].length === 0) {
  throw new Error('Debe adjuntar el manifiesto del viaje');
 }

 const linkManifiesto = await subirManifiesto(archivos['manifiesto'][0], consecutivo);

  const placa = filaActual[1]; // B
  let linkGastosConductor = null;
  
  if (archivos && Object.keys(archivos).length > 0) {
    linkGastosConductor = await procesarArchivosGastos(archivos, placa, consecutivo, 'conductor');
  }

  // ===== CALCULAR TOTALES =====
  const gastosConValor = {};
  let total_gastos_conductor = 0;
  
  for (const gasto of gastosValidar) {
    const valor = parseFloat(datos[`${gasto}_conductor`]) || 0;
    gastosConValor[`${gasto}_conductor`] = valor;
    total_gastos_conductor += valor;
    
    if (valor > 0) {
      gastosConValor[`tipo_factura_${gasto}_conductor`] = datos[`tipo_factura_${gasto}_conductor`];
      gastosConValor[`link_${gasto}_conductor`] = linkGastosConductor;
    }
  }

  // Toneladas
  const toneladas_inicio = parseFloat(datos.toneladas_inicio) || 0;
  const toneladas_descargue = parseFloat(datos.toneladas_descargue) || 0;
  const diferencia_kg = (toneladas_inicio - toneladas_descargue) * 1000;

  // Valor del viaje estimado
  const valor_tonelada_final = parseFloat(datos.valor_tonelada_final) || parseFloat(filaActual[18]) || 0; // T o S
  const valor_viaje_estimado = toneladas_descargue * valor_tonelada_final;

  // Cálculos conductor
  const valor_anticipo_conductor = parseFloat(filaActual[23]) || 0;
  const saldo_anticipo_conductor = valor_anticipo_conductor - total_gastos_conductor;
  const diez_pcto = valor_viaje_estimado * 0.10;
  const saldo_pendiente_conductor = diez_pcto - saldo_anticipo_conductor;

  // ===== REGISTRAR GASTOS EN DETALLE_GASTOS_VIAJES =====
  await detalleGastosViajesHelper.registrarGastosViaje(consecutivo, gastosConValor, 'conductor');
  
  filaActual[31] = linkManifiesto;
  filaActual[32] = linkGastosConductor || '';
  // ===== ACTUALIZAR VIAJE =====
  filaActual[12] = valor_viaje_estimado;               
  filaActual[17] = toneladas_inicio;                   
  filaActual[18] = toneladas_descargue;                
  filaActual[19] = diferencia_kg;                      
  filaActual[21] = valor_tonelada_final;               
  filaActual[22] = diez_pcto;                          
  filaActual[24] = saldo_anticipo_conductor;           
  filaActual[25] = total_gastos_conductor;             
  filaActual[26] = saldo_pendiente_conductor;          
  filaActual[27] = datos.fecha_fin_viaje || '';        
  filaActual[37] = 'completado';                       

  const filaEnHoja = filaIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Viajes!A${filaEnHoja}:AM${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: { values: [filaActual] },
  });

  return { 
    valor_viaje_estimado, 
    diferencia_kg, 
    total_gastos_conductor, 
    saldo_anticipo_conductor,
    saldo_pendiente_conductor,
    diez_pcto,
    placa: filaActual[1]
  };
};

const aprobarViajeYGastosPropietario = async (consecutivo, datos, archivos) => {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A2:AM1000',
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

  // ===== VALIDAR ARCHIVOS OBLIGATORIOS PROPIETARIO =====
  const gastosValidar = [
    'peajes', 'lavadas', 'parqueadero', 'engrase', 
    'fumigacion', 'otro', 'cargue', 'descargue', 'comision'
  ];
  
  for (const gasto of gastosValidar) {
    const valor = parseFloat(datos[`${gasto}_propietario`]) || 0;
    const tieneArchivos = archivos && archivos[`${gasto}_propietario_archivos`] && archivos[`${gasto}_propietario_archivos`].length > 0;
    
    if (valor > 0 && !tieneArchivos) {
      throw new Error(`Debe adjuntar soporte para ${gasto}_propietario`);
    }
  }

  // ===== SUBIR ARCHIVOS A DRIVE =====
  const placa = filaActual[1]; // B
  let linkGastosPropietario = null;
  
  if (archivos && Object.keys(archivos).length > 0) {
    linkGastosPropietario = await procesarArchivosGastos(archivos, placa, consecutivo, 'propietario');
  }

  // ===== CALCULAR TOTALES =====
  const gastosConValor = {};
  let total_gastos_propietario = 0;
  
  for (const gasto of gastosValidar) {
    const valor = parseFloat(datos[`${gasto}_propietario`]) || 0;
    gastosConValor[`${gasto}_propietario`] = valor;
    total_gastos_propietario += valor;
    
    if (valor > 0) {
      gastosConValor[`tipo_factura_${gasto}_propietario`] = datos[`tipo_factura_${gasto}_propietario`];
      gastosConValor[`link_${gasto}_propietario`] = linkGastosPropietario;
    }
  }

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
  const diez_pcto = parseFloat(filaActual[22]) || 0; 
  const total_gastos_conductor = parseFloat(filaActual[25]) || 0; // X
  const ganancia_viaje_estimada = valor_viaje_estimado - diez_pcto - total_gastos_conductor - total_gastos_propietario;

  // ===== REGISTRAR GASTOS EN DETALLE_GASTOS_VIAJES =====
  await detalleGastosViajesHelper.registrarGastosViaje(consecutivo, gastosConValor, 'propietario');

  // ===== ACTUALIZAR TODOS LOS GASTOS A "APROBADO" =====
  await detalleGastosViajesHelper.actualizarEstadoGastosViaje(consecutivo, 'aprobado');
  
  filaActual[33] = linkGastosPropietario || ''
  // ===== ACTUALIZAR VIAJE =====
  filaActual[5] = valor_anticipo_cliente;                  // F
  filaActual[6] = saldo_pendiente_cliente_sin_descuento;   // G
  filaActual[7] = saldo_pendiente_cliente_real;            // H
  filaActual[8] = descuento_rete_fuente;                   // I
  filaActual[9] = descuento_rete_ica;                      // J
  filaActual[10] = total_descuentos_cliente;               // K
  filaActual[28] = total_gastos_propietario;               // AW (nueva posición sin gastos individuales)
  filaActual[29] = ganancia_viaje_estimada;                // AX
  filaActual[37] = 'aprobado';                             // BD - estado_viaje

  const filaEnHoja = filaIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Viajes!A${filaEnHoja}:AM${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: { values: [filaActual] },
  });

  // ===== REGISTRAR EN GASTOS_VEHICULOS =====
  await gastosVehiculoHelper.registrarGasto({
    placa,
    tipo_gasto: 'viaje',
    codigo_referencia: consecutivo,
    valor_gasto: total_gastos_propietario,
    descripcion: `Gastos propietario viaje ${consecutivo}`,
    fecha_registro: new Date().toISOString().split('T')[0]
  });

    await actualizarContadoresViaje(consecutivo);

  return {
    saldo_pendiente_cliente_real,
    total_descuentos_cliente,
    ganancia_viaje_estimada,
    total_gastos_propietario
  };
};

const completarSaldoCliente = async (consecutivo) => {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A2:AM1000',
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
  const ganancia_viaje = parseFloat(filaActual[30]) || parseFloat(filaActual[29]) || 0; // AY o AX

  const filaEnHoja = filaIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Viajes!A${filaEnHoja}:AM${filaEnHoja}`,
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

const editarViajePorConsecutivo = async (consecutivo, nuevosDatos) => {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A2:AN1000',
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
    range: `Viajes!A${filaEnHoja}:AN${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: { values: [filaActual] },
  });

  return true;
};

const facturarCliente = async (codigoCliente) => {
  const viajes = await getTodosLosViajes();

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
      valor_viaje_estimado: v.valor_viaje_estimado,
      // valor_anticipo_cliente: v.valor_anticipo_cliente,
      // saldo_pendiente_cliente_real: v.saldo_pendiente_cliente_real
    }))
  };
};

const facturarViaje = async (consecutivo, valor_viaje_real, notas_facturacion, num_factura_cliente) => {

  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A2:AN1000',
  });

  const filas = response.data.values;
  const filaIndex = filas.findIndex(f => f[0]?.toLowerCase() === consecutivo.toLowerCase());
  if (filaIndex === -1) return null;

  const filaActual = filas[filaIndex];

  // Verificar que esté aprobado
  if (filaActual[37] !== 'aprobado') { // AL
    throw new Error('El viaje debe estar aprobado antes de facturar');
  }

  const valor_viaje_estimado = parseFloat(filaActual[12]) || 0; 
  const diferencia_facturacion = valor_viaje_real - valor_viaje_estimado;

  // Opción A: Recalcular 10% con valor real
  const diez_pcto_nuevo = valor_viaje_real * 0.10;
  const diez_pcto_anterior = parseFloat(filaActual[22]) || 0; 
  const diferencia_diez_pcto = diez_pcto_nuevo - diez_pcto_anterior;

  // Actualizar 10% del conductor
  filaActual[22] = diez_pcto_nuevo; 

  // Recalcular saldo pendiente conductor
  const saldo_anticipo_conductor = parseFloat(filaActual[24]) || 0; 
  const saldo_pendiente_conductor_nuevo = diez_pcto_nuevo - saldo_anticipo_conductor;
  filaActual[26] = saldo_pendiente_conductor_nuevo; 

  // Recalcular ganancia real del propietario
  const total_gastos_conductor = parseFloat(filaActual[25]) || 0; 
  const total_gastos_propietario = parseFloat(filaActual[28]) || 0; 
  const ganancia_viaje_real = valor_viaje_real - diez_pcto_nuevo - total_gastos_conductor - total_gastos_propietario;

  // Actualizar columnas
  filaActual[13] = valor_viaje_real;           
  filaActual[14] = diferencia_facturacion;     
  filaActual[30] = ganancia_viaje_real;        
  filaActual[15] = notas_facturacion || '';     
  filaActual[16] = num_factura_cliente || '';   
  filaActual[37] = 'facturado';                 

  const filaEnHoja = filaIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Viajes!A${filaEnHoja}:AN${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: { values: [filaActual] },
  });

  // Verificar si el viaje ya fue liquidado
  const liquidado = filaActual[38] === 'si'; // AM

  return { 
    valor_viaje_real, 
    diferencia_facturacion, 
    ganancia_viaje_real,
    diferencia_diez_pcto,
    ya_liquidado: liquidado,
    mensaje: liquidado 
      ? `⚠️ Se aplicará ajuste de $${diferencia_diez_pcto.toFixed(2)} en la próxima nómina` 
      : 'Cambios aplicados correctamente'
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

const procesarArchivosGastos = async (archivos, placa, consecutivo, quien) => {
  if (!archivos || Object.keys(archivos).length === 0) {
    console.log("No hay archivos");
    return null;
  }

  let carpetaViaje = await buscarCarpetaPorNombre(consecutivo, carpetaPadreId);
  if (!carpetaViaje) {
    carpetaViaje = await crearCarpeta(consecutivo, carpetaPadreId);
  }

  const nombreSubcarpeta =
    quien === 'conductor'
      ? 'Gastos_Conductor'
      : 'Gastos_Propietario';

  let carpetaGastos = await buscarCarpetaPorNombre(nombreSubcarpeta, carpetaViaje.id);
  if (!carpetaGastos) {
    carpetaGastos = await crearCarpeta(nombreSubcarpeta, carpetaViaje.id);
  }

  for (const key in archivos) {
  if (key.endsWith('_archivos')) {
    const files = archivos[key];
    for (const file of files) {
      await subirArchivo(file, carpetaGastos.id);
    }
  }
}

  return carpetaGastos.webViewLink;
};

const subirManifiesto = async (archivo, consecutivo) => {
  const drive = getDriveClient();
  const carpetaPadreId = process.env.CARPETA_PADRE_ID_VIAJES;
  
  // Buscar o crear carpeta del viaje
  let carpetaViaje = await buscarCarpetaPorNombre(consecutivo, carpetaPadreId);
  if (!carpetaViaje) {
    carpetaViaje = await crearCarpeta(consecutivo, carpetaPadreId);
  }
  
  // Subir archivo directamente a la carpeta del viaje (no en subcarpeta)
  const enlace = await subirArchivo(archivo, carpetaViaje.id);
  
  return enlace;
};

const contarViajesPorPlaca = async (placa) => {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!B:B', // columna B es la placa
  });

  const filas = response.data.values || [];
  // fila 0 es el encabezado, filtramos por placa
  return filas.slice(1).filter(fila => 
    fila[0] && fila[0].toString().toLowerCase() === placa.toLowerCase()
  ).length;
};

const actualizarContadoresViaje = async (consecutivo) => {
  const sheets = getSheetsClient();

  // 1. Obtener datos del viaje
  const responseViajes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A2:AM1000',
  });
  const filas = responseViajes.data.values;
  const viaje = filas.find(f => f[0]?.toLowerCase() === consecutivo.toLowerCase());
  
  if (!viaje) return;

  const placa = viaje[1]; // Columna B
  const codigoCliente = viaje[2]; // Columna C
  const correoUsuario = viaje[34]; // Columna AI (correo_usuario)

  // 2. Actualizar CLIENTES
  const responseClientes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Clientes!A1:N100',
  });
  const filasClientes = responseClientes.data.values;
  const headersClientes = filasClientes[0].map(h => h.trim().toLowerCase());
  const indiceCodigoCliente = headersClientes.indexOf('codigo');
  const indiceViajesCliente = headersClientes.indexOf('viajes');

  const filaClienteIndex = filasClientes.slice(1).findIndex(f => f[indiceCodigoCliente] === codigoCliente);
  if (filaClienteIndex !== -1) {
    const filaCliente = filasClientes[filaClienteIndex + 1];
    const viajesActuales = parseInt(filaCliente[indiceViajesCliente] || 0);
    filaCliente[indiceViajesCliente] = viajesActuales + 1;
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Clientes!A${filaClienteIndex + 2}:N${filaClienteIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values: [filaCliente] },
    });
  }

  // 3. Actualizar VEHICULOS
  const responseVehiculos = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Vehiculos!A1:AC100',
  });
  const filasVehiculos = responseVehiculos.data.values;
  const headersVehiculos = filasVehiculos[0].map(h => h.trim().toLowerCase());
  const indicePlacaVehiculo = headersVehiculos.indexOf('placa');
  const indiceViajesVehiculo = headersVehiculos.indexOf('viajes');

  const filaVehiculoIndex = filasVehiculos.slice(1).findIndex(f => f[indicePlacaVehiculo] === placa);
  if (filaVehiculoIndex !== -1) {
    const filaVehiculo = filasVehiculos[filaVehiculoIndex + 1];
    const viajesActuales = parseInt(filaVehiculo[indiceViajesVehiculo] || 0);
    filaVehiculo[indiceViajesVehiculo] = viajesActuales + 1;
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Vehiculos!A${filaVehiculoIndex + 2}:AC${filaVehiculoIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values: [filaVehiculo] },
    });
  }

  // 4. Actualizar USUARIOS
  const responseUsuarios = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Usuarios!A1:AB15',
  });
  const filasUsuarios = responseUsuarios.data.values;
  const headersUsuarios = filasUsuarios[0].map(h => h.trim().toLowerCase());
  const indiceEmailUsuario = headersUsuarios.indexOf('email');
  const indiceViajesRealizados = headersUsuarios.indexOf('viajes_realizados');

  const filaUsuarioIndex = filasUsuarios.slice(1).findIndex(f => f[indiceEmailUsuario] === correoUsuario);
  if (filaUsuarioIndex !== -1) {
    const filaUsuario = filasUsuarios[filaUsuarioIndex + 1];
    const viajesActuales = parseInt(filaUsuario[indiceViajesRealizados] || 0);
    filaUsuario[indiceViajesRealizados] = viajesActuales + 1;
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Usuarios!A${filaUsuarioIndex + 2}:AB${filaUsuarioIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values: [filaUsuario] },
    });
  }
};

export const viajeHelper = {
  getViajes,
  getTodosLosViajes,
  getResumenViajesPorPlaca,
  guardarAnticipo,
  getSiguienteConsecutivo,  
  getViajesByConsecutivo,
  getViajesOrdenadosPorAnticipoConductor,
  getViajesOrdenadosPorDiezPcto,
  getViajesOrdenadosPorFechaFin,
  getViajesOrdenadosPorFechaInicio,
  getViajesOrdenadosPorGananciaEstimada,
  getViajesOrdenadosPorGananciaReal,
  getViajesOrdenadosPorGastosConductor,
  getViajesOrdenadosPorGastosPropietario,
  getViajesOrdenadosPorValorToneladaFinal,
  getViajesOrdenadosPorValorToneladaInicial,
  getViajesOrdenadosPorValorViajeReal,
  getViajesPorEstadoSaldoCliente,
  getViajesPorEstadoViaje,
  editarViajePorConsecutivo,
  buscarCarpetaPorNombre,
  completarSaldoCliente,
  cerrarViajeYGastosConductor,
  facturarCliente,
  aprobarViajeYGastosPropietario,
  facturarViaje,
  subirManifiesto,
  contarViajesPorPlaca,
  actualizarContadoresViaje
};
