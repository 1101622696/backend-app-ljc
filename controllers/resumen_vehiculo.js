import { resumenVehiculoHelper } from '../helpers/resumen_vehiculo.js';

const httpResumenVehiculo = {
  generarResumenMensual: async (req, res) => {
    try {
      const { placa, año, mes } = req.body;

      if (!placa || !año || !mes) {
        return res.status(400).json({ mensaje: 'Debe especificar placa, año y mes' });
      }

      const resumen = await resumenVehiculoHelper.generarResumenMensual(placa, año, mes);
      await resumenVehiculoHelper.guardarResumenMensual(resumen);

      res.status(200).json({
        mensaje: 'Resumen mensual generado correctamente',
        resumen
      });
    } catch (error) {
      console.error('Error al generar resumen mensual:', error);
      res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
  },

  generarResumenAnual: async (req, res) => {
    try {
      const { placa, año } = req.body;

      if (!placa || !año) {
        return res.status(400).json({ mensaje: 'Debe especificar placa y año' });
      }

      const resumen = await resumenVehiculoHelper.generarResumenAnual(placa, año);

      res.status(200).json({
        mensaje: 'Resumen anual generado correctamente',
        resumen
      });
    } catch (error) {
      console.error('Error al generar resumen anual:', error);
      res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
  },

  obtenerResumen: async (req, res) => {
    try {
      const { placa, año } = req.params;

      const resumen = await resumenVehiculoHelper.getResumenVehiculo(placa, año);

      res.json(resumen);
    } catch (error) {
      console.error('Error al obtener resumen:', error);
      res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
  }
};

export default httpResumenVehiculo;