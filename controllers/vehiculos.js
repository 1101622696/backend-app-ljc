import { vehiculoHelper } from '../helpers/vehiculos.js';
import { responderError } from '../helpers/errores.js';
import { esAdmin, puedeVerPlaca } from '../middlewares/validar-rol.js';

const ORDENAMIENTO_HANDLERS = {
  fechapoliza: vehiculoHelper.getVehiculosOrdenadosPorFechaPoliza,
  fechasoat: vehiculoHelper.getVehiculosOrdenadosPorFechaSoat,
  fechatecnico: vehiculoHelper.getVehiculosOrdenadosPorFechaTecnico,
  distancia: vehiculoHelper.getVehiculoOrdenadosPorDistancia,
  viajes: vehiculoHelper.getVehiculoOrdenadosPorViajes,
};

const FILTRO_HANDLERS = {
  estado: vehiculoHelper.getVehiculosPorEstado,
};

const TIPOS_ORDENAMIENTO = Object.keys(ORDENAMIENTO_HANDLERS);
const TIPOS_FILTRO = Object.keys(FILTRO_HANDLERS);

const httpVehiculos = {
  crearVehiculo: async (req, res) => {
    try {
      const resultado = await vehiculoHelper.crearVehiculo(req.usuariobdtoken, req.body, req.files || []);
      res.status(201).json({ mensaje: 'Vehículo guardado correctamente', placa: resultado.placa });
    } catch (error) {
      responderError(res, error, 'Error al guardar vehículo');
    }
  },

  /** El administrador ve todos; propietario y conductor solo los de sus placas */
  obtenerVehiculos: async (req, res) => {
    try {
      const data = await vehiculoHelper.getVehiculos();
      const usuario = req.usuariobdtoken;
      res.json(esAdmin(usuario) ? data : data.filter((v) => puedeVerPlaca(usuario, v.placa)));
    } catch (error) {
      responderError(res, error, 'Error al obtener vehículos');
    }
  },

  obtenerResumenPorPlaca: async (req, res) => {
    try {
      const placas = String(req.params.placa || '').split(',').map((p) => p.trim()).filter(Boolean);
      if (!placas.length) return res.status(400).json({ ok: false, mensaje: 'Placa requerida' });
      const resumen = await vehiculoHelper.getResumenVehiculosPorPlaca(placas);
      res.json({ ok: true, resumen, placas, mensaje: 'Resumen obtenido exitosamente' });
    } catch (error) {
      responderError(res, error, 'Error al obtener resumen por placa');
    }
  },

  obtenerVehiculosOrdenados: async (req, res) => {
    try {
      const { tipo = 'distancia', orden = 'desc' } = req.query;
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
      responderError(res, error, 'Error al ordenar vehículos');
    }
  },

  obtenerVehiculosFiltrados: async (req, res) => {
    try {
      const { tipo, valor } = req.query;
      if (!tipo || !valor) return res.status(400).json({ mensaje: 'Se requieren los parámetros tipo y valor' });
      const handler = FILTRO_HANDLERS[String(tipo).toLowerCase()];
      if (!handler) {
        return res.status(400).json({
          mensaje: `El parámetro tipo debe ser uno de: ${TIPOS_FILTRO.join(', ')}`,
          tiposPermitidos: TIPOS_FILTRO,
        });
      }
      res.json(await handler(valor));
    } catch (error) {
      responderError(res, error, 'Error al filtrar vehículos');
    }
  },

  obtenerVehiculoporPlaca: async (req, res) => {
    try {
      const vehiculo = await vehiculoHelper.getVehiculoById(req.params.placa);
      if (!vehiculo) return res.status(404).json({ mensaje: 'Vehículo no encontrado' });
      res.json(vehiculo);
    } catch (error) {
      responderError(res, error, 'Error al obtener vehículo');
    }
  },

  editarVehiculo: async (req, res) => {
    try {
      const resultado = await vehiculoHelper.editarVehiculoporPlaca(req.params.placa, req.body, req.files || []);
      if (!resultado) return res.status(404).json({ mensaje: 'Vehículo no encontrado' });
      res.json({ mensaje: 'Vehículo actualizado correctamente' });
    } catch (error) {
      responderError(res, error, 'Error al editar vehículo');
    }
  },

  activarVehiculo: async (req, res) => {
    try {
      const resultado = await vehiculoHelper.actualizarEstadoEnSheets(req.params.placa, 'activo');
      if (!resultado) return res.status(404).json({ mensaje: 'Vehículo no encontrado' });
      res.json({ mensaje: 'Vehículo activado' });
    } catch (error) {
      responderError(res, error, 'Error al activar vehículo');
    }
  },

  desactivarVehiculo: async (req, res) => {
    try {
      const resultado = await vehiculoHelper.actualizarEstadoEnSheets(req.params.placa, 'inactivo');
      if (!resultado) return res.status(404).json({ mensaje: 'Vehículo no encontrado' });
      res.json({ mensaje: 'Vehículo desactivado' });
    } catch (error) {
      responderError(res, error, 'Error al desactivar vehículo');
    }
  },
};

export default httpVehiculos;
