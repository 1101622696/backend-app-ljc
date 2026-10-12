import { resumenVehiculoHelper } from '../helpers/resumen_vehiculo.js';
import { ErrorApp, responderError } from '../helpers/errores.js';

// guardar llega como booleano o texto desde el frontend. Si no se envía, se guarda (comportamiento anterior).
const quiereGuardar = (valor, porDefecto = true) => {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  return !['false', 'no', '0'].includes(String(valor).trim().toLowerCase());
};

const httpResumenVehiculo = {

  // POST /resumen-vehiculo/mensual { placa, anio, mes, guardar? }
  generarResumenMensual: async (req, res) => {
    try {
      const { placa, anio, mes, guardar } = req.body || {};
      if (!placa || !anio || !mes) throw new ErrorApp(400, 'Debe especificar placa, año y mes');

      const resumen = await resumenVehiculoHelper.generarResumenMensual(placa, anio, mes);
      const guardado = quiereGuardar(guardar);
      if (guardado) await resumenVehiculoHelper.guardarResumenMensual(resumen);

      res.status(200).json({
        mensaje: guardado ? 'Resumen mensual generado y guardado correctamente' : 'Resumen mensual generado correctamente',
        guardado,
        resumen,
      });
    } catch (error) {
      responderError(res, error, 'Error al generar resumen mensual');
    }
  },

  // POST /resumen-vehiculo/anual { placa, anio, guardar? }
  generarResumenAnual: async (req, res) => {
    try {
      const { placa, anio, guardar } = req.body || {};
      if (!placa || !anio) throw new ErrorApp(400, 'Debe especificar placa y año');

      const guardado = quiereGuardar(guardar);
      const resumen = await resumenVehiculoHelper.generarResumenAnual(placa, anio, { guardar: guardado });

      res.status(200).json({
        mensaje: guardado ? 'Resumen anual generado y guardado correctamente' : 'Resumen anual generado correctamente',
        guardado,
        resumen,
      });
    } catch (error) {
      responderError(res, error, 'Error al generar resumen anual');
    }
  },

  // GET /resumen-vehiculo/:placa/:anio → [12 meses + TOTAL] calculados al momento
  obtenerResumen: async (req, res) => {
    try {
      const { placa, anio } = req.params;
      const resumen = await resumenVehiculoHelper.getResumenVehiculo(placa, anio);
      res.json(resumen);
    } catch (error) {
      responderError(res, error, 'Error al obtener resumen');
    }
  },

  // GET /resumen-vehiculo/flota/:anio/:mes → [resumen de cada vehículo visible para el usuario]
  obtenerResumenFlota: async (req, res) => {
    try {
      const { anio, mes } = req.params;
      const resumen = await resumenVehiculoHelper.generarResumenFlota(anio, mes, req.usuariobdtoken);
      res.json(resumen);
    } catch (error) {
      responderError(res, error, 'Error al obtener resumen de la flota');
    }
  },

};

export default httpResumenVehiculo;
