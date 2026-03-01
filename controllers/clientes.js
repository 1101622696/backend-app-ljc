import {clienteHelper} from '../helpers/clientes.js';

const httpClientes = {

crearCliente: async (req, res) => {
  try {
    const {empresa, nit, telefono, email, tipo_pago, rete_fuente, rete_ica} = req.body;

    const estado = req.body.estado || "activo";
    const viajes = req.body.viajes || "0";
    const economia = req.body.viajes || "0";
    const fecha_creacion = new Date().toISOString().split('T')[0];
    const resultado = await clienteHelper.guardarCliente({ empresa, nit, estado, viajes, economia, telefono, email, tipo_pago, rete_fuente, rete_ica, fecha_creacion });
  
      res.status(200).json({
        mensaje: 'Cliente guardado  con link correctamente',
        codigo: resultado.codigo
      });

} catch (error) { 
      console.error('Error al guardar cliente:', error);
      res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
  },
  
  obtenerClientes: async (req, res) => {
    try {
      const data = await clienteHelper.getClientes();
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener Clientes' });
    }
  },
  obtenerClientesActivos: async (req, res) => {
    try {
      const data = await clienteHelper.getClienteByStatus('activo');
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener Clientes activos' });
    }
  },

    obtenerClientesInactivos: async (req, res) => {
    try {
      const data = await clienteHelper.getClienteByStatus('inactivo');
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener Clientes inactivos' });
    }
  },

  obtenerClienteporCodigo: async (req, res) => {
    try {
      const { codigo } = req.params;
      const cliente = await clienteHelper.getClienteById(codigo);
  
      if (!cliente) {
        return res.status(404).json({ mensaje: 'Cliente no encontrado' });
      }
  
      res.json(cliente);
    } catch (error) {
      console.error('Error al obtener Cliente:', error);
      res.status(500).json({ mensaje: 'Error al obtener Cliente' });
    }
  },

editarCliente: async (req, res) => {
  try {
    const { codigo } = req.params;
    const nuevosDatos = req.body;
    
    const resultado = await clienteHelper.editarClienteporCodigo(codigo, nuevosDatos);

    if (!resultado) {
      return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    }

    res.status(200).json({ mensaje: 'Cliente actualizado correctamente' });
  } catch (error) {
    console.error('Error al editar Cliente:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
},

activarCliente: async (req, res) => {
  try {
    const { codigo } = req.params;
    const { estado } = req.body; 
    
    const resultado = await clienteHelper.actualizarEstadoEnSheets(codigo, estado || "activo");
    
    if (!resultado) {
      return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    }

    res.status(200).json({ mensaje: 'Estado actualizado correctamente' });
  } catch (error) {
    console.error('Error al editar estado del Cliente:', error);
    res.status(500).json({ 
      mensaje: 'Error al actualizar estado', 
      error: error.message 
    });
  }
},

desactivarCliente: async (req, res) => {
  try {
    const { codigo } = req.params;
    const { estado } = req.body; 
    
    const resultado = await clienteHelper.actualizarEstadoEnSheets(codigo, estado || "inactivo");
    
    if (!resultado) {
      return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    }

    res.status(200).json({ mensaje: 'Estado actualizado correctamente' });
  } catch (error) {
    console.error('Error al editar estado del Cliente:', error);
    res.status(500).json({ 
      mensaje: 'Error al actualizar estado', 
      error: error.message 
    });
  }
},

  }
export default httpClientes;
