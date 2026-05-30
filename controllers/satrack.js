import { satrackHelper } from '../helpers/satrack.js'

const httpSatrack = {

posiciones: async (req, res) => {
    try {
      const data = await satrackHelper.obtenerUltimasPosiciones()
      res.json({ ok: true, data })
    } catch (error) {
      console.error('Error Satrack posiciones:', error)
      res.status(500).json({ mensaje: 'Error al obtener posiciones' })
    }
},

historial: async (req, res) => {
    try {
      const { serviceCode } = req.params
      const { fechaInicio, fechaFin, pagina = 1 } = req.query

      if (!fechaInicio || !fechaFin) {
        return res.status(400).json({ mensaje: 'Debe enviar fechaInicio y fechaFin' })
      }

      const data = await satrackHelper.obtenerHistorial(serviceCode, fechaInicio, fechaFin, pagina)
      res.json({ ok: true, data })
    } catch (error) {
      console.error('Error Satrack historial:', error)
      res.status(500).json({ mensaje: 'Error al obtener historial' })
    }
},

guardarResumen: async (req, res) => {
    try {
      const { fecha } = req.body 
      const fechaFinal = fecha || new Date().toISOString().split('T')[0]
      const resultado = await satrackHelper.guardarResumenDiario(fechaFinal)
      res.json({ ok: true, filas_guardadas: resultado.length, resultado })
    } catch (error) {
      console.error('Error Satrack resumen:', error)
      res.status(500).json({ mensaje: 'Error al guardar resumen' })
    }
}

}

export default httpSatrack