// Encabezados de la hoja Viajes (fila 1), en el orden recomendado.
// El orden NO es obligatorio (todo se lee por nombre), pero sí que existan todos.
export const COLUMNAS_VIAJES = [
  // Solicitud
  'consecutivo', 'placa', 'cliente', 'destino', 'fecha_inicio', 'correo_usuario', 'usuario', 'creado_por', 'fecha_creacion',
  'estado_viaje',
  // Anticipo
  'valor_anticipo_conductor', 'valor_anticipo_consignado', 'fecha_consignacion', 'link_consignacion', 'consignado_por',
  // Preoperacional
  'estado_preoperacional', 'consecutivo_preoperacional', 'fecha_preoperacional', 'odometro_preoperacional',
  // Carga y valor
  'valor_tonelada_inicial', 'valor_tonelada_final', 'kilos_cargue', 'kilos_descargue', 'toneladas_inicio',
  'toneladas_descargue', 'diferencia_kg', 'valor_viaje_estimado',
  // Conductor
  'diez_pcto', 'total_gastos_conductor', 'saldo_anticipo_conductor', 'saldo_pendiente_conductor',
  'ajuste_diez_pcto_pendiente', 'liquidado', 'fecha_liquidacion', 'consecutivo_nomina',
  // Propietario
  'total_gastos_propietario', 'ganancia_viaje_estimada',
  // Cliente
  'valor_anticipo_cliente', 'descuento_rete_fuente', 'descuento_rete_ica', 'total_descuentos_cliente',
  'saldo_pendiente_cliente_sin_descuento', 'saldo_pendiente_cliente_real', 'estado_saldo_cliente',
  // Facturación
  'valor_viaje_real', 'diferencia_facturacion', 'num_factura_cliente', 'notas_facturacion', 'ganancia_viaje_real',
  // Comparación con lo prometido
  'diferencia_precio', 'valor_merma',
  // Fechas y responsables
  'fecha_fin_viaje', 'fecha_cierre', 'fecha_aprobacion', 'aprobado_por', 'fecha_facturacion', 'fecha_pago_cliente',
  'editado_por', 'fecha_edicion',
  // Archivos
  'link_carpeta', 'link_manifiesto', 'link_gastos_conductor', 'link_gastos_propietario',
];

// Hoja Nomina_Conductores. tipo, mes e id_conductor van al principio (las alertas leen A:M).
export const COLUMNAS_NOMINA = [
  'consecutivo_nomina', 'tipo', 'mes', 'id_conductor', 'nombre', 'fecha_liquidacion', 'liquidado_por',
  // viajes
  'viajes_liquidados', 'total_viajes_mes', 'diez_pcto_total_mes', 'saldo_anticipo_total_mes', 'saldo_viajes',
  'viajes_con_ajuste', 'ajustes_diez_pcto',
  // salario
  'salario_base', 'sso', 'prestamos_descontados', 'total_prestamos',
  // resultado
  'arrastre_anterior', 'total_nomina', 'valor_pagado', 'saldo_siguiente', 'fecha_pago', 'link_comprobante', 'placas', 'notas',
];

// Hoja Prestamos
export const COLUMNAS_PRESTAMOS = [
  'consecutivo', 'correo_usuario', 'usuario', 'valor_pedido', 'motivo', 'fecha_creacion', 'registrado_por',
  'estado_prestamo', 'valor_prestado', 'fecha_desembolso', 'desembolsado_por', 'link_comprobante', 'motivo_rechazo',
  'consecutivo_nomina', 'fecha_liquidacion',
];
