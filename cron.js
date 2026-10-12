import { alertasHelper } from './helpers/alertas.js';
import { guardarResumenDiario } from './helpers/satrack.js';

// Las tareas diarias (alertas + resumen de Satrack) las dispara el trigger de Apps Script:
//   POST /api/alertas/ejecutar   con el header x-cron-key = CRON_SECRET   (10 a. m.)
// Render gratis duerme el servidor y un cron interno no corre mientras duerme.
//
// Cron interno opcional (plan pago, servidor siempre encendido): ALERTAS_CRON_INTERNO=si en el .env.
// Si corren ambos no se duplican correos ni filas (candados + llaves en las hojas).

export default function iniciarCron() {
  if (String(process.env.ALERTAS_CRON_INTERNO || '').toLowerCase() !== 'si') return;

  import('node-cron')
    .then(({ default: cron }) => {
      cron.schedule(
        '0 10 * * *',
        async () => {
          try {
            const r = await alertasHelper.ejecutarTodas();
            console.info('[cron] Alertas:', JSON.stringify(r.total));
          } catch (e) {
            console.error('[cron] Error en alertas:', e);
          }
          try {
            await guardarResumenDiario();
          } catch (e) {
            console.error('[cron] Error en resumen Satrack:', e);
          }
        },
        { timezone: 'America/Bogota' }
      );
      console.info('[cron] Tareas diarias programadas: 10:00 a. m. (Colombia)');
    })
    .catch((e) => console.warn('[cron] node-cron no disponible; use el trigger de Apps Script:', e.message));
}
