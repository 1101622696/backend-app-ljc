import { alertasHelper } from '../helpers/alertas.js';

const httpAlertas = {

  // Permite disparar manualmente las alertas desde Postman o para pruebas
  ejecutarAlertas: async (req, res) => {
    try {
      await alertasHelper.alertaViajesPendientes();
      await alertasHelper.alertaDocumentosVehiculo();
      await alertasHelper.alertaLicencias();
      await alertasHelper.alertaNomina();
      res.json({ mensaje: 'Alertas ejecutadas correctamente' });
    } catch (error) {
      console.error('Error ejecutando alertas:', error);
      res.status(500).json({ mensaje: 'Error al ejecutar alertas' });
    }
  },

  ejecutarAlertasViajes: async (req, res) => {
    try {
      await alertasHelper.alertaViajesPendientes();
      res.json({ mensaje: 'Alerta de viajes ejecutada' });
    } catch (error) {
      res.status(500).json({ mensaje: error.message });
    }
  },

  ejecutarAlertasDocumentos: async (req, res) => {
    try {
      await alertasHelper.alertaDocumentosVehiculo();
      res.json({ mensaje: 'Alerta de documentos ejecutada' });
    } catch (error) {
      res.status(500).json({ mensaje: error.message });
    }
  },

  ejecutarAlertasLicencias: async (req, res) => {
    try {
      await alertasHelper.alertaLicencias();
      res.json({ mensaje: 'Alerta de licencias ejecutada' });
    } catch (error) {
      res.status(500).json({ mensaje: error.message });
    }
  },

  ejecutarAlertasNomina: async (req, res) => {
    try {
      await alertasHelper.alertaNomina();
      res.json({ mensaje: 'Alerta de nómina ejecutada' });
    } catch (error) {
      res.status(500).json({ mensaje: error.message });
    }
  },
};

export default httpAlertas;