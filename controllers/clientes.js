import {clienteHelper} from '../helpers/clientes.js';

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
  estado: clienteHelper.getClientesPorEstado
};

const TIPOS_ORDENAMIENTO = Object.keys(ORDENAMIENTO_HANDLERS);
const TIPOS_FILTRO = Object.keys(FILTRO_HANDLERS);

const httpClientes = {

crearCliente: async (req, res) => {
  try {
    const {empresa, nit, telefono, email, tipo_pago, rete_fuente, rete_ica} = req.body;

    const estado = req.body.estado || "activo";
    const economia = req.body.viajes || "0";
    const fecha_creacion = new Date().toISOString().split('T')[0];
    const resultado = await clienteHelper.guardarCliente({ empresa, nit, estado, economia, telefono, email, tipo_pago, rete_fuente, rete_ica, fecha_creacion });
  
      res.status(200).json({
        mensaje: 'Cliente guardado correctamente',
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

obtenerClientesOrdenados: async (req, res) => {
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
    const clientes = await handlerFn(orden);
    
    res.json(clientes);
  } catch (error) {
    console.error("Error al obtener clientes ordenados:", error);
    res.status(500).json({ mensaje: "Error al obtener clientes" });
  }
},

obtenerClientesFiltrados: async (req, res) => {
  try {
    const { tipo, valor } = req.query;
    
    if (!tipo || !valor) {
      return res
        .status(400)
        .json({ mensaje: 'Se requieren los parámetros tipo y valor' });
    }
    
    const tipoLower = tipo.toLowerCase();
    if (!TIPOS_FILTRO.includes(tipoLower)) {
      return res
        .status(400)
        .json({ 
          mensaje: `El parámetro tipo debe ser uno de: ${TIPOS_FILTRO.join(', ')}`,
          tiposPermitidos: TIPOS_FILTRO
        });
    }
    
    const handlerFn = FILTRO_HANDLERS[tipoLower];
    const clientes = await handlerFn(valor);
    
    res.json(clientes);
  } catch (error) {
    console.error("Error al obtener clientes filtrados:", error);
    res.status(500).json({ mensaje: "Error al obtener clientes", error: error.message });
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
