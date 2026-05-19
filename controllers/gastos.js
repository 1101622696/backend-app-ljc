import { gastosVehiculoHelper } from '../helpers/gastos.js';

const ORDENAMIENTO_HANDLERS = {
  valor_gasto: gastosVehiculoHelper.getVehiculoOrdenadosPorValor
};

const TIPOS_ORDENAMIENTO = Object.keys(ORDENAMIENTO_HANDLERS);

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
},

obtenerGastoporConsecutivo: async (req, res) => {
      try {
        const { consecutivo } = req.params;
        const gasto = await gastosVehiculoHelper.getGastoById(consecutivo);
    
        if (!gasto) {
          return res.status(404).json({ mensaje: 'gasto no encontrado' });
        }
    
        res.json(gasto);
      } catch (error) {
        console.error('Error al obtener gasto:', error);
        res.status(500).json({ mensaje: 'Error al obtener gasto' });
      }
},

obtenerGastosOrdenados: async (req, res) => {
  try {
    const { tipo = "tiempo", orden = "desc" } = req.query;
    
    if (orden !== "asc" && orden !== "desc") {
      return res
        .status(400)
        .json({ mensaje: 'El parámetro orden debe ser "asc" o "desc"' });
    }
    
    const tipoLower = tipo.toLowerCase();
    if (!TIPOS_ORDENAMIENTO.includes(tipoLower)) {
      return res
        .status(400)
        .json({ 
          mensaje: `El parámetro tipo debe ser uno de: ${TIPOS_ORDENAMIENTO.join(', ')}`,
          tiposPermitidos: TIPOS_ORDENAMIENTO
        });
    }
    
    const handlerFn = ORDENAMIENTO_HANDLERS[tipoLower];
    const gastos = await handlerFn(orden);
    
    res.json(gastos);
  } catch (error) {
    console.error("Error al obtener gastos ordenados:", error);
    res.status(500).json({ mensaje: "Error al obtener gastos" });
  }
},

};

export default httpGastosVehiculos;