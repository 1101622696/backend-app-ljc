import { satrackHelper } from '../helpers/satrack.js'
import { ErrorApp, responderError } from '../helpers/errores.js'

const httpSatrack = {

  // GET /posiciones → admin: todas; propietario: solo sus placas
  posiciones: async (req, res) => {
    try {
      const data = await satrackHelper.obtenerUltimasPosiciones(req.usuariobdtoken)
      res.json({ ok: true, data })
    } catch (error) {
      responderError(res, error, 'Error Satrack posiciones')
    }
  },

  // GET /historial/:serviceCode?fechaInicio=&fechaFin=&pagina=
  historial: async (req, res) => {
    try {
      const { serviceCode } = req.params
      const { fechaInicio, fechaFin, pagina = 1 } = req.query

      if (!fechaInicio || !fechaFin) throw new ErrorApp(400, 'Debe enviar fechaInicio y fechaFin')

      // El propietario solo puede ver el GPS de sus vehículos
      const vehiculo = await satrackHelper.verificarAccesoServiceCode(req.usuariobdtoken, serviceCode)

      const data = await satrackHelper.obtenerHistorial(serviceCode, fechaInicio, fechaFin, pagina)
      res.json({ ok: true, placa: vehiculo?.placa || null, data })
    } catch (error) {
      responderError(res, error, 'Error Satrack historial')
    }
  },

  // POST /guardar-resumen { fecha? } → si no se envía fecha, ayer (hora Colombia)
  guardarResumen: async (req, res) => {
    try {
      const { fecha } = req.body || {}
      const { fecha: fechaFinal, filas, sin_eventos, errores } = await satrackHelper.procesarResumenDiario(fecha)
      res.json({ ok: true, fecha: fechaFinal, filas_guardadas: filas.length, resultado: filas, sin_eventos, errores })
    } catch (error) {
      responderError(res, error, 'Error Satrack resumen')
    }
  },

}

export default httpSatrack
