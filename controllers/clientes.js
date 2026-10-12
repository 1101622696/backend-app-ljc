import { clienteHelper } from '../helpers/clientes.js';
import { responderError } from '../helpers/errores.js';

const ORDENAMIENTO_HANDLERS = {
  viajes: clienteHelper.getClientesOrdenadosPorViajes,
  rete_ica: clienteHelper.getClientesOrdenadosPorReteIca,
  valor_estimado: clienteHelper.getClientesOrdenadosPorValorEstimado,
  valor_real: clienteHelper.getClientesOrdenadosPorValorReal,
  ganancia: clienteHelper.getClientesOrdenadosPorGanancia,
};

const FILTRO_HANDLERS = {
  rete_fuente: clienteHelper.getClientesPorReteFuente,
  tipo_pago: clienteHelper.getClientesPorTipoPago,
  estado: clienteHelper.getClientesPorEstado,
};

const TIPOS_ORDENAMIENTO = Object.keys(ORDENAMIENTO_HANDLERS);
const TIPOS_FILTRO = Object.keys(FILTRO_HANDLERS);

// Los totales (viajes, valores, ganancia) se calculan con los viajes que el usuario puede ver:
// el propietario ve la ganancia de SUS viajes con ese cliente; el admin, de todos.

const httpClientes = {
  crearCliente: async (req, res) => {
    try {
      const resultado = await clienteHelper.guardarCliente(req.body);
      res.status(201).json({ mensaje: 'Cliente guardado correctamente', codigo: resultado.codigo });
    } catch (error) {
      responderError(res, error, 'Error al guardar cliente');
    }
  },

  obtenerClientes: async (req, res) => {
    try {
      res.json(await clienteHelper.listarConTotales(req.usuariobdtoken));
    } catch (error) {
      responderError(res, error, 'Error al obtener clientes');
    }
  },

  obtenerClienteporCodigo: async (req, res) => {
    try {
      const cliente = await clienteHelper.obtenerConTotales(req.usuariobdtoken, req.params.codigo);
      if (!cliente) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
      res.json(cliente);
    } catch (error) {
      responderError(res, error, 'Error al obtener cliente');
    }
  },

  obtenerClientesOrdenados: async (req, res) => {
    try {
      const { tipo = 'viajes', orden = 'desc' } = req.query;
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
      res.json(await handler(orden, req.usuariobdtoken));
    } catch (error) {
      responderError(res, error, 'Error al ordenar clientes');
    }
  },

  obtenerClientesFiltrados: async (req, res) => {
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
      res.json(await handler(valor, req.usuariobdtoken));
    } catch (error) {
      responderError(res, error, 'Error al filtrar clientes');
    }
  },

  editarCliente: async (req, res) => {
    try {
      const resultado = await clienteHelper.editarClienteporCodigo(req.params.codigo, req.body);
      if (!resultado) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
      res.json({ mensaje: 'Cliente actualizado correctamente' });
    } catch (error) {
      responderError(res, error, 'Error al editar cliente');
    }
  },

  activarCliente: async (req, res) => {
    try {
      const resultado = await clienteHelper.actualizarEstadoEnSheets(req.params.codigo, 'activo');
      if (!resultado) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
      res.json({ mensaje: 'Cliente activado' });
    } catch (error) {
      responderError(res, error, 'Error al activar cliente');
    }
  },

  desactivarCliente: async (req, res) => {
    try {
      const resultado = await clienteHelper.actualizarEstadoEnSheets(req.params.codigo, 'inactivo');
      if (!resultado) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
      res.json({ mensaje: 'Cliente desactivado' });
    } catch (error) {
      responderError(res, error, 'Error al desactivar cliente');
    }
  },
};

export default httpClientes;
