import { gastosVehiculoHelper } from '../helpers/gastos.js';

const httpGastosVehiculos = {
  registrarGasto: async (req, res) => {
    try {
      const { email, nombre } = req.usuariobdtoken;
      const { placa, tipo_gasto, valor_gasto, descripcion } = req.body;

      const fecha_registro = new Date().toISOString().split('T')[0];

      const resultado = await gastosVehiculoHelper.registrarGasto({
        placa,
        tipo_gasto,
        codigo_referencia: `MANUAL-${Date.now()}`,
        valor_gasto: parseFloat(valor_gasto),
        descripcion: descripcion || `Gasto manual: ${tipo_gasto}`,
        fecha_registro
      });

      res.status(200).json({
        mensaje: 'Gasto registrado correctamente',
        consecutivo: resultado.consecutivo
      });
    } catch (error) {
      console.error('Error al registrar gasto:', error);
      res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
  },

  listarGastos: async (req, res) => {
    try {
      const gastos = await gastosVehiculoHelper.getGastosVehiculos();
      res.json(gastos);
    } catch (error) {
      console.error('Error al listar gastos:', error);
      res.status(500).json({ mensaje: 'Error al obtener gastos' });
    }
  }
};

export default httpGastosVehiculos;