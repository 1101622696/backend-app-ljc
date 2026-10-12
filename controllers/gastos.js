import { gastosVehiculoHelper } from '../helpers/gastos.js';
import { responderError } from '../helpers/errores.js';
import { esAdmin, puedeVerPlaca } from '../middlewares/validar-rol.js';

const ORDENAMIENTO_HANDLERS = {
  valor_gasto: gastosVehiculoHelper.getVehiculoOrdenadosPorValor,
  fecha: gastosVehiculoHelper.getGastosOrdenadosPorFecha,
};
const TIPOS_ORDENAMIENTO = Object.keys(ORDENAMIENTO_HANDLERS);

const httpGastosVehiculos = {
  /** Gasto manual (soat, técnico, póliza, impuesto, llantas, repuestos, otro…) con soportes opcionales */
  registrarGasto: async (req, res) => {
    try {
      const { advertencia, ...resultado } = await gastosVehiculoHelper.registrarGastoManual(req.body, req.files || []);
      res.status(201).json({ mensaje: advertencia || 'Gasto registrado correctamente', advertencia, ...resultado });
    } catch (error) {
      responderError(res, error, 'Error al registrar gasto');
    }
  },

  listarGastos: async (req, res) => {
    try {
      res.json(await gastosVehiculoHelper.getGastosVehiculos());
    } catch (error) {
      responderError(res, error, 'Error al listar gastos');
    }
  },

  obtenerResumenPorPlaca: async (req, res) => {
    try {
      const placas = String(req.params.placa || '').split(',').map((p) => p.trim()).filter(Boolean);
      if (!placas.length) return res.status(400).json({ ok: false, mensaje: 'Placa requerida' });
      const resumen = await gastosVehiculoHelper.getResumenGastosPorPlaca(placas);
      res.json({ ok: true, resumen, placas, mensaje: 'Resumen obtenido exitosamente' });
    } catch (error) {
      responderError(res, error, 'Error al obtener resumen por placa');
    }
  },

  obtenerGastoporConsecutivo: async (req, res) => {
    try {
      const gasto = await gastosVehiculoHelper.getGastoById(req.params.consecutivo);
      const usuario = req.usuariobdtoken;
      if (!gasto || (!esAdmin(usuario) && !puedeVerPlaca(usuario, gasto.placa))) {
        return res.status(404).json({ mensaje: 'Gasto no encontrado' });
      }
      res.json(gasto);
    } catch (error) {
      responderError(res, error, 'Error al obtener gasto');
    }
  },

  obtenerGastosOrdenados: async (req, res) => {
    try {
      const { tipo = 'fecha', orden = 'desc' } = req.query;
      if (orden !== 'asc' && orden !== 'desc') {
        return res.status(400).json({ mensaje: 'El parámetro orden debe ser "asc" o "desc"' });
      }
      const handler = ORDENAMIENTO_HANDLERS[String(tipo).toLowerCase()];
      if (!handler) {
        return res.status(400).json({
          mensaje: `El parámetro tipo debe ser uno de: ${TIPOS_ORDENAMIENTO.join(', ')}`,
          tiposPermitidos: TIPOS_ORDENAMIENTO,
        });
      }
      res.json(await handler(orden));
    } catch (error) {
      responderError(res, error, 'Error al ordenar gastos');
    }
  },

  editarGasto: async (req, res) => {
    try {
      const actual = await gastosVehiculoHelper.getGastoById(req.params.consecutivo);
      const usuario = req.usuariobdtoken;
      if (!actual || (!esAdmin(usuario) && !puedeVerPlaca(usuario, actual.placa))) {
        return res.status(404).json({ mensaje: 'Gasto no encontrado' });
      }
      await gastosVehiculoHelper.editarGastoporConsecutivo(req.params.consecutivo, req.body, req.files || []);
      res.json({ mensaje: 'Gasto actualizado correctamente' });
    } catch (error) {
      responderError(res, error, 'Error al editar gasto');
    }
  },
};

export default httpGastosVehiculos;
