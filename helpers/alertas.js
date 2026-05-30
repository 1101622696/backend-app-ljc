import { getSheetsClient } from '../services/google.js';
import nodemailer from 'nodemailer';

const spreadsheetId = process.env.SPREADSHEET_ID;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const enviarEmail = async (destinatario, asunto, html) => {
  await transporter.sendMail({
    from: `LJC Transporte <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: asunto,
    html,
  });
};

const leerHoja = async (nombreHoja, rango) => {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${nombreHoja}!${rango}`,
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map((row, rowIndex) => ({
    ...Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])),
    _fila: rowIndex + 2,
  }));
};

const leerAlertas = async () => leerHoja('Alertas', 'A1:G500');

const agregarFilaAlertas = async (fila) => {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Alertas!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        fila.consecutivo,
        fila.tipo_alerta,
        fila.estado_alerta,
        fila.fecha_primera_deteccion,
        fila.ultimo_recordatorio,
        fila.cantidad_recordatorios,
        fila.email_destino,
      ]],
    },
  });
};

const actualizarFilaAlertas = async (numeroFila, datos) => {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Alertas!A${numeroFila}:G${numeroFila}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        datos.consecutivo,
        datos.tipo_alerta,
        datos.estado_alerta,
        datos.fecha_primera_deteccion,
        datos.ultimo_recordatorio,
        datos.cantidad_recordatorios,
        datos.email_destino,
      ]],
    },
  });
};

const ahora = () => new Date();

const parsearFecha = (str) => {
  if (!str) return null;
  // Soporta: 06-05-2034, 2026-06-10, 2026-04
  const limpia = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpia)) return new Date(limpia);
  if (/^\d{2}-\d{2}-\d{4}$/.test(limpia)) {
    const [d, m, y] = limpia.split('-');
    return new Date(`${y}-${m}-${d}`);
  }
  return null;
};

const horasDesde = (fechaStr) => {
    const fecha = new Date(fechaStr.trim() + ' GMT-0500');
  return (ahora() - fecha) / 36e5;

};

const diasHasta = (fechaStr) => {
  const fecha = parsearFecha(fechaStr);
  if (!fecha) return null;
  return Math.ceil((fecha - ahora()) / 864e5);
};

const formatearFecha = (date = new Date()) => {
  return date.toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).replace('T', ' ');
};

const obtenerUsuarios = async () => leerHoja('Usuarios', 'A1:AB15');

const obtenerPropietarioPorPlaca = async (placa) => {
  const usuarios = await obtenerUsuarios();
  return usuarios.find(u => {
    if (u.perfil !== 'propietario') return false;
    const placas = (u.placa_asignada || '').split(',').map(p => p.trim().toUpperCase());
    return placas.includes(placa.trim().toUpperCase());
  });
};

// ─── 1. ALERTA VIAJES PENDIENTES DE APROBAR ──────────────────────────────────
// Cron diario. Si un viaje lleva en estado "completado" ≥24h → primer email.
// Si lleva ≥48h → segundo email. Máximo 2 recordatorios.

const alertaViajesPendientes = async () => {
  console.log('[ALERTA] Revisando viajes pendientes de aprobar...');

  const sheets = getSheetsClient();
  const resViajes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A1:AN1000',
  });

  const rowsViajes = resViajes.data.values || [];
  if (rowsViajes.length === 0) return;

  const headersV = rowsViajes[0].map(h => h.trim().toLowerCase());
  const viajes = rowsViajes.slice(1).map(row =>
    Object.fromEntries(headersV.map((h, i) => [h, row[i] ?? '']))
  );

  const viajesCompletados = viajes.filter(v => v.estado_viaje === 'completado');
  if (viajesCompletados.length === 0) return;

  const alertas = await leerAlertas();
  const ahoraStr = formatearFecha();

  for (const viaje of viajesCompletados) {
    const consecutivo = viaje.consecutivo;
    const alertaExistente = alertas.find(
      a => a.consecutivo === consecutivo && a.tipo_alerta === 'viaje_pendiente' && a.estado_alerta !== 'resuelta'
    );

    if (!alertaExistente) {
      // Primera detección: registrar en Alertas, no enviar email aún
      const propietario = await obtenerPropietarioPorPlaca(viaje.placa);
      if (!propietario) continue;

      await agregarFilaAlertas({
        consecutivo,
        tipo_alerta: 'viaje_pendiente',
        estado_alerta: 'completado',
        fecha_primera_deteccion: ahoraStr,
        ultimo_recordatorio: '',
        cantidad_recordatorios: 0,
        email_destino: propietario.email,
      });

    } else {
      const horas = horasDesde(alertaExistente.fecha_primera_deteccion);
      const cantidad = parseInt(alertaExistente.cantidad_recordatorios) || 0;

      if (horas >= 48 && cantidad < 2) {
        // Segundo recordatorio
        await enviarEmail(
          alertaExistente.email_destino,
          `⚠️ Urgente: viaje ${consecutivo} lleva 2 días sin aprobar`,
          `<p>El viaje <strong>${consecutivo}</strong> sigue en estado <em>completado</em> y han pasado más de 48 horas.</p>
           <p>Por favor, ingrese a la aplicación y apruebe o corrija el viaje a la brevedad.</p>`
        );
        await actualizarFilaAlertas(alertaExistente._fila, {
          ...alertaExistente,
          ultimo_recordatorio: ahoraStr,
          cantidad_recordatorios: cantidad + 1,
        });

      } else if (horas >= 24 && cantidad < 1) {
        // Primer recordatorio
        await enviarEmail(
          alertaExistente.email_destino,
          `Recordatorio: viaje ${consecutivo} pendiente de aprobar`,
          `<p>El viaje <strong>${consecutivo}</strong> fue cerrado por el conductor y lleva más de 24 horas esperando aprobación.</p>
           <p>Ingrese a la aplicación para revisarlo y aprobarlo.</p>`
        );
        await actualizarFilaAlertas(alertaExistente._fila, {
          ...alertaExistente,
          ultimo_recordatorio: ahoraStr,
          cantidad_recordatorios: cantidad + 1,
        });
      }
    }
  }

  // Marcar como resueltas las alertas de viajes que ya no están en "completado"
  for (const alerta of alertas) {
    if (alerta.tipo_alerta !== 'viaje_pendiente' || alerta.estado_alerta === 'resuelta') continue;
    const viajeActual = viajes.find(v => v.consecutivo === alerta.consecutivo);
    if (!viajeActual || viajeActual.estado_viaje !== 'completado') {
      await actualizarFilaAlertas(alerta._fila, { ...alerta, estado_alerta: 'resuelta' });
    }
  }

  console.log('[ALERTA] Viajes pendientes revisados.');
};

// ─── 2. ALERTA DOCUMENTOS VEHÍCULO (SOAT, PÓLIZA, TECNOMECÁNICA) ─────────────
// Recordatorios: 30 días, 15 días, 5 días, día de vencimiento.

const UMBRALES_DOCUMENTOS = [
  { dias: 30, sufijo: '_30d', asuntoFn: (tipo, placa) => `Aviso: ${tipo} del vehículo ${placa} vence en 30 días` },
  { dias: 15, sufijo: '_15d', asuntoFn: (tipo, placa) => `Aviso: ${tipo} del vehículo ${placa} vence en 15 días` },
  { dias: 5,  sufijo: '_5d',  asuntoFn: (tipo, placa) => `⚠️ Urgente: ${tipo} del vehículo ${placa} vence en 5 días` },
  { dias: 0,  sufijo: '_0d',  asuntoFn: (tipo, placa) => `🚨 Hoy vence el ${tipo} del vehículo ${placa}` },
];

const TIPOS_DOCUMENTO = [
  { campo: 'soat_vencimiento',   label: 'SOAT',            tipo_alerta: 'soat_vencimiento' },
  { campo: 'poliza_vencimiento', label: 'Póliza',          tipo_alerta: 'poliza_vencimiento' },
  { campo: 'tecnico_vencimiento',label: 'Tecnomecánica',   tipo_alerta: 'tecnico_vencimiento' },
];

const alertaDocumentosVehiculo = async () => {
  console.log('[ALERTA] Revisando documentos de vehículos...');

  const sheets = getSheetsClient();
  const resVeh = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Vehiculos!A1:AD100',
  });

  const rowsVeh = resVeh.data.values || [];
  if (rowsVeh.length === 0) return;

  const headersVeh = rowsVeh[0].map(h => h.trim().toLowerCase());
  const vehiculos = rowsVeh.slice(1).map(row =>
    Object.fromEntries(headersVeh.map((h, i) => [h, row[i] ?? '']))
  );

  const alertas = await leerAlertas();
  const ahoraStr = formatearFecha();

  for (const vehiculo of vehiculos) {
    const placa = vehiculo.placa?.trim().toUpperCase();
    if (!placa) continue;

    const propietario = await obtenerPropietarioPorPlaca(placa);
    if (!propietario) continue;

    for (const tipoDoc of TIPOS_DOCUMENTO) {
      const fechaStr = vehiculo[tipoDoc.campo];
      if (!fechaStr) continue;

      const dias = diasHasta(fechaStr);
      if (dias === null || dias < 0) continue; // Ya venció, no spammear

      for (const umbral of UMBRALES_DOCUMENTOS) {
        if (dias > umbral.dias) continue;

        const tipo_alerta_clave = `${tipoDoc.tipo_alerta}${umbral.sufijo}`;
        const yaEnviada = alertas.find(
          a => a.consecutivo === placa &&
               a.tipo_alerta === tipo_alerta_clave &&
               a.estado_alerta !== 'resuelta'
        );

        if (yaEnviada) continue;

        const cuerpo = `
          <p>El documento <strong>${tipoDoc.label}</strong> del vehículo <strong>${placa}</strong> 
          ${dias === 0 ? 'vence <strong>hoy</strong>' : `vence en <strong>${dias} días</strong>`}.</p>
          <p>Recuerde gestionar la renovación a tiempo para evitar inconvenientes.</p>
        `;

        await enviarEmail(
          propietario.email,
          umbral.asuntoFn(tipoDoc.label, placa),
          cuerpo
        );

        await agregarFilaAlertas({
          consecutivo: placa,
          tipo_alerta: tipo_alerta_clave,
          estado_alerta: 'enviada',
          fecha_primera_deteccion: ahoraStr,
          ultimo_recordatorio: ahoraStr,
          cantidad_recordatorios: 1,
          email_destino: propietario.email,
        });

        break; // Solo el umbral más cercano activo, no acumular varios el mismo día
      }
    }
  }

  console.log('[ALERTA] Documentos de vehículos revisados.');
};

// ─── 3. ALERTA LICENCIAS DE CONDUCCIÓN ────────────────────────────────────────
// Aplica a todos los usuarios con email y fecha_vencimiento_licencia.
// Recordatorios: 30 días, 15 días, 5 días, día de vencimiento.

const alertaLicencias = async () => {
  console.log('[ALERTA] Revisando licencias de conducción...');

  const usuarios = await obtenerUsuarios();
  const alertas = await leerAlertas();
  const ahoraStr = formatearFecha();

  for (const usuario of usuarios) {
    const email = usuario.email?.trim();
    const fechaStr = usuario.fecha_vencimiento_licencia?.trim();
    if (!email || !fechaStr) continue;

    const dias = diasHasta(fechaStr);
    if (dias === null || dias < 0) continue;

    for (const umbral of UMBRALES_DOCUMENTOS) {
      if (dias > umbral.dias) continue;

      const tipo_alerta_clave = `licencia${umbral.sufijo}`;
      const yaEnviada = alertas.find(
        a => a.consecutivo === email &&
             a.tipo_alerta === tipo_alerta_clave &&
             a.estado_alerta !== 'resuelta'
      );

      if (yaEnviada) continue;

      const nombre = usuario.nombre || email;
      const cuerpo = `
        <p>Hola ${nombre}, tu licencia de conducción 
        ${dias === 0 ? 'vence <strong>hoy</strong>' : `vence en <strong>${dias} días</strong>`}.</p>
        <p>Recuerda renovarla a tiempo en el organismo de tránsito correspondiente.</p>
      `;

      await enviarEmail(
        email,
        dias === 0
          ? '🚨 Tu licencia de conducción vence hoy'
          : `Aviso: tu licencia de conducción vence en ${dias} días`,
        cuerpo
      );

      await agregarFilaAlertas({
        consecutivo: email,
        tipo_alerta: tipo_alerta_clave,
        estado_alerta: 'enviada',
        fecha_primera_deteccion: ahoraStr,
        ultimo_recordatorio: ahoraStr,
        cantidad_recordatorios: 1,
        email_destino: email,
      });

      break;
    }
  }

  console.log('[ALERTA] Licencias revisadas.');
};

// ─── 4. ALERTA NÓMINA ─────────────────────────────────────────────────────────
// Tipo salario: avisar al propietario si llega el día 27 y no hay nómina "salario"
//               del mes actual para ese conductor.
// Tipo viajes:  avisar si hay viajes aprobados/facturados de hace +15 días
//               sin nómina "viajes" en ese período.

const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const alertaNomina = async () => {
  console.log('[ALERTA] Revisando nómina pendiente...');

  const usuarios = await obtenerUsuarios();
  const conductores = usuarios.filter(u => u.perfil === 'conductor');

  const sheets = getSheetsClient();

  // Leer nómina
  const resNom = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Nomina_Conductores!A1:M500',
  });
  const rowsNom = resNom.data.values || [];
  const nominaData = rowsNom.length > 1
    ? (() => {
        const headers = rowsNom[0].map(h => h.trim().toLowerCase());
        return rowsNom.slice(1).map(row =>
          Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
        );
      })()
    : [];

  // Leer viajes
  const resViajes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Viajes!A1:AN1000',
  });
  const rowsViajes = resViajes.data.values || [];
  const viajesData = rowsViajes.length > 1
    ? (() => {
        const headers = rowsViajes[0].map(h => h.trim().toLowerCase());
        return rowsViajes.slice(1).map(row =>
          Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
        );
      })()
    : [];

  const alertas = await leerAlertas();
  const ahoraStr = formatearFecha();
  const diaActual = new Date().getDate();
  const mes = mesActual();

  for (const conductor of conductores) {
    const emailConductor = conductor.email?.trim();
    if (!emailConductor) continue;

    const placaConductor = conductor.placa_asignada?.trim().toUpperCase();
    const propietario = placaConductor
      ? await obtenerPropietarioPorPlaca(placaConductor)
      : null;
    if (!propietario) continue;

    // ── 4a. Salario base: avisar día 27 si no hay registro "salario" del mes ──
    if (diaActual >= 27) {
      const tieneSalario = nominaData.some(
        n => n.id_conductor === emailConductor && n.mes === mes && n.tipo === 'salario'
      );

      if (!tieneSalario) {
        const claveAlerta = `nomina_salario_${mes}`;
        const yaEnviada = alertas.find(
          a => a.consecutivo === emailConductor &&
               a.tipo_alerta === claveAlerta &&
               a.estado_alerta !== 'resuelta'
        );

        if (!yaEnviada) {
          await enviarEmail(
            propietario.email,
            `Recordatorio: nómina de salario de ${conductor.nombre || emailConductor} pendiente`,
            `<p>El conductor <strong>${conductor.nombre || emailConductor}</strong> no tiene registrada 
             la nómina de <strong>salario base</strong> del mes <strong>${mes}</strong>.</p>
             <p>Recuerde procesarla antes de fin de mes.</p>`
          );
          await agregarFilaAlertas({
            consecutivo: emailConductor,
            tipo_alerta: claveAlerta,
            estado_alerta: 'enviada',
            fecha_primera_deteccion: ahoraStr,
            ultimo_recordatorio: ahoraStr,
            cantidad_recordatorios: 1,
            email_destino: propietario.email,
          });
        }
      }
    }

    // ── 4b. Viajes: avisar si hay viajes aprobados/facturados sin pago hace +15d ──
    const viajesSinPagar = viajesData.filter(v => {
      if (v.placa?.trim().toUpperCase() !== placaConductor) return false;
      if (!['aprobado', 'facturado'].includes(v.estado_viaje)) return false;

      // Verificar si ya existe nómina tipo "viajes" que cubra este consecutivo
      const tienePago = nominaData.some(
        n => n.id_conductor === emailConductor &&
             n.tipo === 'viajes' &&
             n.consecutivo_nomina // tiene registro = fue pagado
      );
      if (tienePago) return false;

      // Revisar antigüedad: usar fecha_inicio como referencia
      const fechaViaje = parsearFecha(v.fecha_inicio);
      if (!fechaViaje) return false;
      const diasTranscurridos = (ahora() - fechaViaje) / 864e5;
      return diasTranscurridos > 15;
    });

    if (viajesSinPagar.length > 0) {
      const consecutivos = viajesSinPagar.map(v => v.consecutivo).join(', ');
      const claveAlerta = `nomina_viajes_${emailConductor}_${mes}`;

      const yaEnviada = alertas.find(
        a => a.consecutivo === emailConductor &&
             a.tipo_alerta === claveAlerta &&
             a.estado_alerta !== 'resuelta'
      );

      if (!yaEnviada) {
        await enviarEmail(
          propietario.email,
          `Recordatorio: viajes sin liquidar de ${conductor.nombre || emailConductor}`,
          `<p>El conductor <strong>${conductor.nombre || emailConductor}</strong> tiene viajes 
           aprobados hace más de 15 días sin liquidar:</p>
           <p><strong>${consecutivos}</strong></p>
           <p>Recuerde procesar el pago de viajes cuando lo considere.</p>`
        );
        await agregarFilaAlertas({
          consecutivo: emailConductor,
          tipo_alerta: claveAlerta,
          estado_alerta: 'enviada',
          fecha_primera_deteccion: ahoraStr,
          ultimo_recordatorio: ahoraStr,
          cantidad_recordatorios: 1,
          email_destino: propietario.email,
        });
      }
    }
  }

  console.log('[ALERTA] Nómina revisada.');
};

export const alertasHelper = {
  alertaViajesPendientes,
  alertaDocumentosVehiculo,
  alertaLicencias,
  alertaNomina,
};