import { leerHoja, actualizarCampos, agregarFila, aNumero, conCandado } from './hoja.js';
import { ahora, hoy, mesActual, aFechaISO, diasEntre, minutosDesde } from './fechas.js';
import { enviarCorreo, emailHelper } from './email.js';
import { usuarioHelper } from './usuarios.js';
import { vehiculoHelper } from './vehiculos.js';
import { viajeHelper } from './viajes.js';
import { nominaHelper } from './nomina.js';

const HOJA = 'Alertas';
const CANDADO = 'alertas';
const COLUMNAS = [
  'consecutivo', 'tipo_alerta', 'estado_alerta', 'fecha_primera_deteccion',
  'ultimo_recordatorio', 'cantidad_recordatorios', 'email_destino',
];

const ESTADO = { PENDIENTE: 'pendiente', ENVIADA: 'enviada', RESUELTA: 'resuelta' };

// Documentos: avisos a 30, 15, 5 y 0 días (y uno cuando ya está vencido)
const UMBRALES = [0, 5, 15, 30];
const DOCUMENTOS_VEHICULO = [
  { campo: 'soat_vencimiento', clave: 'soat', nombre: 'SOAT', articulo: 'el', femenino: false },
  { campo: 'tecnico_vencimiento', clave: 'tecnico', nombre: 'revisión técnico-mecánica', articulo: 'la', femenino: true },
  { campo: 'poliza_vencimiento', clave: 'poliza', nombre: 'póliza', articulo: 'la', femenino: true },
];

// Viajes sin aprobar: el cron corre una vez al día y Apps Script lo dispara en una ventana
// de 1 hora, así que "24 h" se mide con 2 h de margen (si no, el aviso se correría un día).
const MARGEN_MIN = 120;
const PRIMER_AVISO_MIN = 24 * 60 - MARGEN_MIN;
const SEGUNDO_AVISO_MIN = 48 * 60 - MARGEN_MIN;
const MAX_RECORDATORIOS_VIAJE = 2;

const DIA_AVISO_SALARIO = 27;
const DIAS_SIN_LIQUIDAR = 15;
const DIAS_ENTRE_AVISOS_VIAJES = 7;
const ESTADOS_LIQUIDABLES = ['aprobado', 'facturado', 'pagado'];

// ── Utilidades ──

const esc = (texto) => emailHelper.escaparHtml(texto);
const minuscula = (v) => String(v ?? '').trim().toLowerCase();
const normalizarPlaca = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
const textoDias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;
const resumenVacio = () => ({ revisados: 0, enviados: 0, errores: 0 });

const normalizarAlerta = (fila) => ({
  ...fila,
  consecutivo: String(fila.consecutivo ?? '').trim(),
  tipo_alerta: minuscula(fila.tipo_alerta),
  estado_alerta: minuscula(fila.estado_alerta),
  cantidad_recordatorios: aNumero(fila.cantidad_recordatorios),
});

/** Lee la hoja Alertas completa (sin límite de filas) */
async function leerAlertas() {
  const { encabezados, filas } = await leerHoja(HOJA);
  return {
    // Si la hoja está vacía se usa el orden original de columnas
    encabezados: encabezados.length ? encabezados : COLUMNAS,
    alertas: filas.map(normalizarAlerta),
  };
}

/** Fila existente (no resuelta) para la llave consecutivo + tipo */
const buscarAlerta = (alertas, consecutivo, tipo) => {
  const c = String(consecutivo).trim().toLowerCase();
  const t = minuscula(tipo);
  return alertas.find((a) => a.consecutivo.toLowerCase() === c && a.tipo_alerta === t && a.estado_alerta !== ESTADO.RESUELTA) || null;
};

async function registrarAlerta(ctx, datos) {
  const fila = {
    consecutivo: datos.consecutivo,
    tipo_alerta: datos.tipo_alerta,
    estado_alerta: datos.estado_alerta || ESTADO.ENVIADA,
    fecha_primera_deteccion: datos.fecha_primera_deteccion || ahora(),
    ultimo_recordatorio: datos.ultimo_recordatorio ?? ahora(),
    cantidad_recordatorios: datos.cantidad_recordatorios ?? 1,
    email_destino: datos.email_destino || '',
  };
  await agregarFila(HOJA, ctx.encabezados, fila);
  // También en memoria: evita repetir la misma llave dentro de esta misma ejecución
  ctx.alertas.push(normalizarAlerta(fila));
}

const actualizarAlerta = (ctx, alerta, cambios) =>
  actualizarCampos(HOJA, ctx.encabezados, alerta._fila, cambios, { omitirFaltantes: true }).then(() =>
    Object.assign(alerta, normalizarAlerta({ ...alerta, ...cambios }))
  );

/** Destinatarios de varias placas sin repetir (propietarios + administradores activos) */
async function destinatariosDe(placas, extra = []) {
  const correos = new Set(extra.map(minuscula).filter(Boolean));
  const lista = placas.length ? placas : [''];
  for (const placa of lista) {
    (await usuarioHelper.obtenerDestinatariosNotificacion(placa)).forEach((c) => correos.add(minuscula(c)));
  }
  return [...correos].filter(Boolean);
}

/**
 * Envía UN correo a todos los destinatarios y, si salió bien, ejecuta registrar().
 * Si falla, lo cuenta como error y sigue (no corta el ciclo).
 */
async function enviarYRegistrar(resumen, { destinatarios, asunto, html, contexto }, registrar) {
  if (!destinatarios.length) {
    resumen.errores++;
    console.error(`[alertas] ${contexto}: no hay destinatarios (¿hay administradores activos?)`);
    return false;
  }
  try {
    // Sin saltos de línea: el correo va en un encabezado MIME
    const para = destinatarios.map((c) => c.replace(/[\r\n,;]/g, '')).join(', ');
    await enviarCorreo({ para, asunto, html: plantilla(html) });
  } catch (error) {
    resumen.errores++;
    console.error(`[alertas] ${contexto}: no se pudo enviar el correo:`, error.message);
    return false;
  }
  try {
    await registrar(destinatarios.join(', '));
    resumen.enviados++;
    return true;
  } catch (error) {
    // El correo salió pero no quedó registrado: puede repetirse mañana
    resumen.enviados++;
    resumen.errores++;
    console.error(`[alertas] ${contexto}: correo enviado pero no se registró en la hoja Alertas:`, error.message);
    return true;
  }
}

const plantilla = (contenido) => `
  <div style="font-family: Arial, sans-serif; font-size: 14px; color: #222">
    ${contenido}
    <p style="color: #777; font-size: 12px">Mensaje automático de LJC Transportes. No responda este correo.</p>
  </div>`;

/** Ejecuta la alerta con candado y con resumen; un error general no tumba a las demás */
const conResumen = (nombre, tarea) => () =>
  conCandado(CANDADO, async () => {
    const resumen = resumenVacio();
    try {
      await tarea(resumen);
    } catch (error) {
      resumen.errores++;
      console.error(`[alertas] Error en ${nombre}:`, error);
    }
    return resumen;
  });

// ─────────────────────────────────────────────────────────────
// 1. VIAJES "COMPLETADO" SIN APROBAR
// Primera detección: se registra sin correo. ~24 h → 1er correo. ~48 h → 2º (máximo 2).
// Cuando el viaje cambia de estado la alerta queda 'resuelta'.
// ─────────────────────────────────────────────────────────────

const TIPO_VIAJE = 'viaje_pendiente';

const alertaViajesPendientes = conResumen('viajes pendientes', async (resumen) => {
  const viajes = await viajeHelper.getTodosLosViajes();
  const ctx = await leerAlertas();
  const porConsecutivo = new Map(viajes.map((v) => [String(v.consecutivo).toUpperCase(), v]));

  for (const viaje of viajes.filter((v) => v.estado_viaje === 'completado')) {
    resumen.revisados++;
    try {
      const alerta = buscarAlerta(ctx.alertas, viaje.consecutivo, TIPO_VIAJE);

      if (!alerta) {
        await registrarAlerta(ctx, {
          consecutivo: viaje.consecutivo,
          tipo_alerta: TIPO_VIAJE,
          estado_alerta: ESTADO.PENDIENTE,
          ultimo_recordatorio: '',
          cantidad_recordatorios: 0,
        });
        continue;
      }

      const minutos = minutosDesde(alerta.fecha_primera_deteccion);
      if (!Number.isFinite(minutos)) {
        // Fecha ilegible (filas viejas escritas con USER_ENTERED): se reinicia el conteo
        await actualizarAlerta(ctx, alerta, { fecha_primera_deteccion: ahora() });
        continue;
      }

      const cantidad = alerta.cantidad_recordatorios;
      if (cantidad >= MAX_RECORDATORIOS_VIAJE) continue;
      const toca = cantidad === 0 ? minutos >= PRIMER_AVISO_MIN : minutos >= SEGUNDO_AVISO_MIN;
      if (!toca) continue;

      const segundo = cantidad >= 1;
      const consecutivo = esc(viaje.consecutivo);
      const placa = esc(viaje.placa);
      const conductor = esc(viaje.usuario || viaje.correo_usuario || '');
      const destinatarios = await destinatariosDe([viaje.placa]);

      await enviarYRegistrar(
        resumen,
        {
          destinatarios,
          contexto: `viaje ${viaje.consecutivo}`,
          asunto: segundo
            ? `Urgente: el viaje ${viaje.consecutivo} (${viaje.placa}) lleva 2 días sin aprobar`
            : `Recordatorio: viaje ${viaje.consecutivo} (${viaje.placa}) pendiente de aprobar`,
          html: `
            <p>El viaje <strong>${consecutivo}</strong> del vehículo <strong>${placa}</strong>${conductor ? `, cerrado por ${conductor},` : ''}
            sigue <em>pendiente de aprobación</em> desde hace más de ${segundo ? '48' : '24'} horas.</p>
            <p>Ingrese a la aplicación para revisarlo y aprobarlo${segundo ? ' lo antes posible' : ''}.</p>`,
        },
        (para) =>
          actualizarAlerta(ctx, alerta, {
            ultimo_recordatorio: ahora(),
            cantidad_recordatorios: cantidad + 1,
            email_destino: para,
          })
      );
    } catch (error) {
      resumen.errores++;
      console.error(`[alertas] Error revisando el viaje ${viaje.consecutivo}:`, error.message);
    }
  }

  // Resolver las alertas de viajes que ya no están en "completado"
  for (const alerta of ctx.alertas) {
    if (alerta.tipo_alerta !== TIPO_VIAJE || alerta.estado_alerta === ESTADO.RESUELTA || !alerta._fila) continue;
    const viaje = porConsecutivo.get(alerta.consecutivo.toUpperCase());
    if (viaje && viaje.estado_viaje === 'completado') continue;
    try {
      await actualizarAlerta(ctx, alerta, { estado_alerta: ESTADO.RESUELTA });
    } catch (error) {
      resumen.errores++;
      console.error(`[alertas] No se pudo resolver la alerta del viaje ${alerta.consecutivo}:`, error.message);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 2 y 3. VENCIMIENTO DE DOCUMENTOS (vehículo y licencias)
// La llave lleva la FECHA de vencimiento: 'soat_2027-04-20_15d'. Al renovar cambia la fecha
// y vuelven los avisos. Solo se envía el umbral que corresponde HOY.
// ─────────────────────────────────────────────────────────────

/** Qué aviso corresponde hoy: { sufijo, dias } o null si faltan más de 30 días / fecha inválida */
function avisoDeHoy(fechaVencimiento) {
  const fecha = aFechaISO(fechaVencimiento);
  if (!fecha) return null;
  const dias = diasEntre(hoy(), fecha);
  if (dias === null) return null;
  if (dias < 0) return { fecha, dias, sufijo: 'vencido' };
  const umbral = UMBRALES.find((u) => u >= dias);
  if (umbral === undefined) return null;
  return { fecha, dias, sufijo: `${umbral}d` };
}

const frase = ({ dias, fecha }, femenino = false) => {
  if (dias < 0) return `está <strong>${femenino ? 'vencida' : 'vencido'}</strong> desde el ${fecha}`;
  if (dias === 0) return `vence <strong>hoy</strong> (${fecha})`;
  return `vence en <strong>${textoDias(dias)}</strong> (${fecha})`;
};

/** 'Aviso: el SOAT del vehículo SNT473 vence en 12 días' */
const asuntoDocumento = (doc, placa, { dias, fecha }) => {
  const que = `${doc.articulo} ${doc.nombre} del vehículo ${placa}`;
  if (dias < 0) return `Vencido: ${que} venció el ${fecha}`;
  if (dias === 0) return `Hoy vence ${que}`;
  return `Aviso: ${que} vence en ${textoDias(dias)}`;
};

const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

const alertaDocumentosVehiculo = conResumen('documentos de vehículos', async (resumen) => {
  const vehiculos = await vehiculoHelper.getVehiculos();
  const ctx = await leerAlertas();

  for (const vehiculo of vehiculos) {
    const placa = normalizarPlaca(vehiculo.placa);
    if (!placa || minuscula(vehiculo.estado) === 'inactivo') continue;

    for (const doc of DOCUMENTOS_VEHICULO) {
      const aviso = avisoDeHoy(vehiculo[doc.campo]);
      if (!aviso) continue;
      resumen.revisados++;

      const tipo = `${doc.clave}_${aviso.fecha}_${aviso.sufijo}`;
      if (buscarAlerta(ctx.alertas, placa, tipo)) continue;

      try {
        const destinatarios = await destinatariosDe([placa]);
        await enviarYRegistrar(
          resumen,
          {
            destinatarios,
            contexto: `${doc.nombre} ${placa}`,
            asunto: asuntoDocumento(doc, placa, aviso),
            html: `
              <p>${mayuscula(doc.articulo)} ${esc(doc.nombre)} del vehículo <strong>${esc(placa)}</strong> ${frase(aviso, doc.femenino)}.</p>
              <p>${aviso.dias < 0 ? 'El vehículo no debe circular con este documento vencido.' : 'Recuerde gestionar la renovación a tiempo.'}
              Cuando lo renueve, actualice la fecha en la aplicación.</p>`,
          },
          (para) => registrarAlerta(ctx, { consecutivo: placa, tipo_alerta: tipo, email_destino: para })
        );
      } catch (error) {
        resumen.errores++;
        console.error(`[alertas] Error revisando ${doc.nombre} de ${placa}:`, error.message);
      }
    }
  }
});

const alertaLicencias = conResumen('licencias', async (resumen) => {
  const usuarios = await usuarioHelper.getUsuarios();
  const conductores = usuarios.filter((u) => u.perfil === 'conductor' && u.estado === 'activo' && u.email);
  const ctx = await leerAlertas();

  for (const conductor of conductores) {
    const aviso = avisoDeHoy(conductor.fecha_vencimiento_licencia);
    if (!aviso) continue;
    resumen.revisados++;

    const email = minuscula(conductor.email);
    const tipo = `licencia_${aviso.fecha}_${aviso.sufijo}`;
    if (buscarAlerta(ctx.alertas, email, tipo)) continue;

    try {
      // El conductor + propietario de su(s) placa(s) + administradores
      const destinatarios = await destinatariosDe(usuarioHelper.placasDe(conductor), [email]);
      const nombre = conductor.nombre || email;
      const asunto =
        aviso.dias < 0
          ? `Vencida: licencia de conducción de ${nombre} (venció el ${aviso.fecha})`
          : aviso.dias === 0
            ? `Hoy vence la licencia de conducción de ${nombre}`
            : `Aviso: la licencia de conducción de ${nombre} vence en ${textoDias(aviso.dias)}`;

      await enviarYRegistrar(
        resumen,
        {
          destinatarios,
          contexto: `licencia ${email}`,
          asunto,
          html: `
            <p>La licencia de conducción de <strong>${esc(nombre)}</strong> ${frase(aviso, true)}.</p>
            <p>${aviso.dias < 0 ? 'No debe conducir con la licencia vencida.' : 'Recuerde renovarla a tiempo en el organismo de tránsito.'}
            Cuando la renueve, actualice la fecha en la aplicación.</p>`,
        },
        (para) => registrarAlerta(ctx, { consecutivo: email, tipo_alerta: tipo, email_destino: para })
      );
    } catch (error) {
      resumen.errores++;
      console.error(`[alertas] Error revisando la licencia de ${email}:`, error.message);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 4. NÓMINA
// (a) Desde el día 27: conductor activo sin nómina 'salario' del mes → un aviso por mes y conductor.
// (b) Viajes aprobados/facturados/pagados sin liquidar hace más de 15 días → un aviso por
//     conductor cada 7 días mientras sigan pendientes (se mira viaje por viaje: liquidado !== 'si').
// ─────────────────────────────────────────────────────────────

const TIPO_NOMINA_VIAJES = 'nomina_viajes';

// 'mes' puede llegar como serie de Sheets si alguien lo escribió a mano
const mesDe = (valor) => (typeof valor === 'number' ? aFechaISO(valor).slice(0, 7) : String(valor ?? '').trim().slice(0, 7));

const alertaNomina = conResumen('nómina', async (resumen) => {
  const [usuarios, nominas, viajes, ctx] = await Promise.all([
    usuarioHelper.getUsuarios(),
    nominaHelper.getNominaConductores(),
    viajeHelper.getTodosLosViajes(),
    leerAlertas(),
  ]);
  const porEmail = new Map(usuarios.map((u) => [u.email, u]));
  const mes = mesActual();

  // (a) Salario del mes
  if (Number(hoy().slice(8, 10)) >= DIA_AVISO_SALARIO) {
    const conductores = usuarios.filter((u) => u.perfil === 'conductor' && u.estado === 'activo' && u.email);
    for (const conductor of conductores) {
      resumen.revisados++;
      const email = minuscula(conductor.email);
      const tieneSalario = nominas.some(
        (n) => minuscula(n.tipo) === 'salario' && mesDe(n.mes) === mes && minuscula(n.id_conductor) === email
      );
      if (tieneSalario) continue;

      const tipo = `nomina_salario_${mes}`;
      if (buscarAlerta(ctx.alertas, email, tipo)) continue;

      try {
        const nombre = conductor.nombre || email;
        await enviarYRegistrar(
          resumen,
          {
            destinatarios: await destinatariosDe(usuarioHelper.placasDe(conductor)),
            contexto: `salario ${email} ${mes}`,
            asunto: `Recordatorio: nómina de salario de ${nombre} (${mes}) pendiente`,
            html: `
              <p>El conductor <strong>${esc(nombre)}</strong> no tiene registrada la nómina de
              <strong>salario</strong> del mes <strong>${esc(mes)}</strong>.</p>
              <p>Recuerde procesarla antes de fin de mes.</p>`,
          },
          (para) => registrarAlerta(ctx, { consecutivo: email, tipo_alerta: tipo, email_destino: para })
        );
      } catch (error) {
        resumen.errores++;
        console.error(`[alertas] Error revisando el salario de ${email}:`, error.message);
      }
    }
  }

  // (b) Viajes sin liquidar hace más de 15 días, agrupados por conductor
  const pendientes = new Map();
  for (const viaje of viajes) {
    if (!ESTADOS_LIQUIDABLES.includes(viaje.estado_viaje) || minuscula(viaje.liquidado) === 'si') continue;
    const referencia = aFechaISO(viaje.fecha_fin_viaje) || aFechaISO(viaje.fecha_inicio);
    const dias = referencia ? diasEntre(referencia, hoy()) : null;
    if (dias === null || dias <= DIAS_SIN_LIQUIDAR) continue;
    const email = minuscula(viaje.correo_usuario);
    if (!email) continue;
    if (!pendientes.has(email)) pendientes.set(email, []);
    pendientes.get(email).push({ ...viaje, dias });
  }

  for (const [email, lista] of pendientes) {
    resumen.revisados++;
    const alerta = buscarAlerta(ctx.alertas, email, TIPO_NOMINA_VIAJES);
    if (alerta) {
      const desde = diasEntre(alerta.ultimo_recordatorio, hoy());
      if (desde !== null && desde < DIAS_ENTRE_AVISOS_VIAJES) continue; // ya se avisó esta semana
    }

    try {
      const nombre = porEmail.get(email)?.nombre || lista[0].usuario || email;
      const placas = [...new Set(lista.map((v) => v.placa).filter(Boolean))];
      const filas = lista
        .map((v) => `<li><strong>${esc(v.consecutivo)}</strong> (${esc(v.placa)}) — ${esc(v.estado_viaje)}, hace ${v.dias} días</li>`)
        .join('');

      await enviarYRegistrar(
        resumen,
        {
          destinatarios: await destinatariosDe(placas),
          contexto: `viajes sin liquidar ${email}`,
          asunto: `Recordatorio: ${lista.length} ${lista.length === 1 ? 'viaje' : 'viajes'} sin liquidar de ${nombre}`,
          html: `
            <p>El conductor <strong>${esc(nombre)}</strong> tiene viajes aprobados hace más de
            ${DIAS_SIN_LIQUIDAR} días que aún no se liquidan en nómina:</p>
            <ul>${filas}</ul>
            <p>Recuerde liquidarlos cuando lo considere.</p>`,
        },
        (para) =>
          alerta
            ? actualizarAlerta(ctx, alerta, {
                ultimo_recordatorio: ahora(),
                cantidad_recordatorios: alerta.cantidad_recordatorios + 1,
                email_destino: para,
              })
            : registrarAlerta(ctx, { consecutivo: email, tipo_alerta: TIPO_NOMINA_VIAJES, email_destino: para })
      );
    } catch (error) {
      resumen.errores++;
      console.error(`[alertas] Error revisando viajes sin liquidar de ${email}:`, error.message);
    }
  }

  // Conductores que ya no tienen viajes pendientes: la alerta queda resuelta (si vuelven a tener, avisa de nuevo)
  for (const alerta of ctx.alertas) {
    if (alerta.tipo_alerta !== TIPO_NOMINA_VIAJES || alerta.estado_alerta === ESTADO.RESUELTA || !alerta._fila) continue;
    if (pendientes.has(alerta.consecutivo.toLowerCase())) continue;
    try {
      await actualizarAlerta(ctx, alerta, { estado_alerta: ESTADO.RESUELTA });
    } catch (error) {
      resumen.errores++;
      console.error(`[alertas] No se pudo resolver la alerta de nómina de ${alerta.consecutivo}:`, error.message);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// Todas (cron / Apps Script). En el mismo orden del cron original.
// ─────────────────────────────────────────────────────────────

const ejecutarTodas = async () => {
  const inicio = ahora();
  const viajes = await alertaViajesPendientes();
  const documentos = await alertaDocumentosVehiculo();
  const licencias = await alertaLicencias();
  const nomina = await alertaNomina();

  const partes = { viajes, documentos, licencias, nomina };
  const total = resumenVacio();
  for (const r of Object.values(partes)) {
    total.revisados += r.revisados;
    total.enviados += r.enviados;
    total.errores += r.errores;
  }
  return { inicio, fin: ahora(), ...partes, total };
};

export const alertasHelper = {
  alertaViajesPendientes,
  alertaDocumentosVehiculo,
  alertaLicencias,
  alertaNomina,
  ejecutarTodas,
};
