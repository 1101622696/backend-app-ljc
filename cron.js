import cron from 'node-cron';
import { alertasHelper } from './helpers/alertas.js';

// Ejecuta todas las alertas cada día a las 10:00 AM (hora Colombia, UTC-5)
// En cron UTC, 10am Colombia = 15:00 UTC
const iniciarCron = () => {
cron.schedule('0 10 * * *', async () => {
    console.log(`[CRON] Ejecutando alertas: ${new Date().toISOString()}`);
    try {
      await alertasHelper.alertaViajesPendientes();
      await alertasHelper.alertaDocumentosVehiculo();
      await alertasHelper.alertaLicencias();
      await alertasHelper.alertaNomina();
    } catch (error) {
      console.error('[CRON] Error en tarea de alertas:', error);
    }
  }, {
    timezone: 'America/Bogota',
  });

  console.log('[CRON] Tarea de alertas programada: 10:00 AM (Colombia)');
};

export default iniciarCron;