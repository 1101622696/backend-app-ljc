import { guardarResumenDiario } from '../helpers/satrack.js';
import crypto from 'crypto';
import { alertasHelper } from '../helpers/alertas.js';
import { responderError } from '../helpers/errores.js';

// Compara en tiempo constante (sha256 iguala el largo, así no se filtra por tiempo ni por longitud)
const igualSeguro = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

/**
 * Middleware para el trigger de Apps Script: header x-cron-key === CRON_SECRET.
 * Sin CRON_SECRET en el entorno la ruta queda deshabilitada (503), nunca abierta.
 */
export const validarCronKey = (req, res, next) => {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    return res.status(503).json({ mensaje: 'La ejecución automática de alertas no está configurada (falta CRON_SECRET)' });
  }
  const clave = req.header('x-cron-key');
  if (!clave || !igualSeguro(clave, secreto)) {
    return res.status(401).json({ mensaje: 'Clave de cron inválida' });
  }
  next();
};

const ejecutar = (tarea, mensaje, contexto) => async (req, res) => {
  try {
    const resumen = await tarea();
    res.json({ mensaje, resumen });
  } catch (error) {
    responderError(res, error, contexto);
  }
};

const httpAlertas = {
  ejecutarAlertas: ejecutar(alertasHelper.ejecutarTodas, 'Alertas ejecutadas correctamente', 'Error ejecutando alertas'),
  ejecutarAlertasViajes: ejecutar(alertasHelper.alertaViajesPendientes, 'Alerta de viajes ejecutada', 'Error en alerta de viajes'),
  ejecutarAlertasDocumentos: ejecutar(alertasHelper.alertaDocumentosVehiculo, 'Alerta de documentos ejecutada', 'Error en alerta de documentos'),
  ejecutarAlertasLicencias: ejecutar(alertasHelper.alertaLicencias, 'Alerta de licencias ejecutada', 'Error en alerta de licencias'),
  ejecutarAlertasNomina: ejecutar(alertasHelper.alertaNomina, 'Alerta de nómina ejecutada', 'Error en alerta de nómina'),
  // Llamada por el trigger diario de Apps Script (POST /api/alertas/ejecutar):
  // alertas + resumen de Satrack de ayer. Si una parte falla, la otra se ejecuta igual.
  ejecutarDesdeCron: async (req, res) => {
    const resultado = {};
    try {
      resultado.alertas = await alertasHelper.ejecutarTodas();
    } catch (error) {
      console.error('[cron] Error en alertas:', error);
      resultado.alertas = { error: 'falló' };
    }
    try {
      const filas = await guardarResumenDiario();
      resultado.satrack = { filas_guardadas: Array.isArray(filas) ? filas.length : 0 };
    } catch (error) {
      console.error('[cron] Error en resumen Satrack:', error);
      resultado.satrack = { error: 'falló' };
    }
    res.json({ mensaje: 'Tareas diarias ejecutadas', resultado });
  },
};

export default httpAlertas;
