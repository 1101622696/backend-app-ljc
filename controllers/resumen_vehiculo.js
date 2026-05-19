import { resumenVehiculoHelper } from '../helpers/resumen_vehiculo.js';

const httpResumenVehiculo = {

generarResumenMensual: async (req, res) => {
    try {
      const { placa, anio, mes } = req.body;

      if (!placa || !anio || !mes) {
        return res.status(400).json({ mensaje: 'Debe especificar placa, anio y mes' });
      }

      const resumen = await resumenVehiculoHelper.generarResumenMensual(placa, anio, mes);
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
      const { placa, anio } = req.body;

      if (!placa || !anio) {
        return res.status(400).json({ mensaje: 'Debe especificar placa y anio' });
      }

      const resumen = await resumenVehiculoHelper.generarResumenAnual(placa, anio);

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
      const { placa, anio } = req.params;

      const resumen = await resumenVehiculoHelper.getResumenVehiculo(placa, anio);

      res.json(resumen);
    } catch (error) {
      console.error('Error al obtener resumen:', error);
      res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
}

};

export default httpResumenVehiculo;