import { prestamoHelper } from '../helpers/prestamos.js';

const httpPrestamos = {

crearPrestamo: async (req, res) => {
  try {
    const { email, nombre } = req.usuariobdtoken;
    const { valor_pedido} = req.body;

    const fecha_creacion = new Date().toISOString().split('T')[0];
    const estado_prestamo = "pendiente";
    const valor_prestado = 0;
    let Link = null;
    let consecutivo;

    if (req.files && req.files.length > 0) {
      consecutivo = await prestamoHelper.getSiguienteConsecutivo();
      Link = await prestamoHelper.procesarArchivos(req.files, consecutivo);

    const resultado = await prestamoHelper.guardarPrestamo({ 
      valor_pedido,
      valor_prestado,
      correo_usuario: email, 
      usuario: nombre, 
      fecha_creacion,
      estado_prestamo, 
      Link
    });
       
    consecutivo = resultado.consecutivo;

    res.status(200).json({ 
      mensaje: 'Prestamo solicitado correctamente', 
      consecutivo: resultado.consecutivo, 
    });
   
  } else {
    const resultado = await prestamoHelper.guardarPrestamo({ 
      valor_pedido,
      valor_prestado,
      correo_usuario: email, 
      usuario: nombre, 
      fecha_creacion,
      estado_prestamo,
      Link: null, 
    });
      
    
    consecutivo = resultado.consecutivo;
      
      res.status(200).json({ 
        mensaje: 'Prestamo solicitado correctamente', 
        consecutivo: resultado.consecutivo, 
      });
    }
  
  } catch (error) { 
    console.error('Error al guardar el Prestamo:', error); 
    res.status(500).json({ mensaje: 'Error interno del servidor' }); 
  } 
  },

  obtenerPrestamos: async (req, res) => {
    try {
      const data = await prestamoHelper.getPrestamos();
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener prestamos' });
    }
  },

obtenerResumenSolicitante: async (req, res) => {
  try {
    // const { email } = req.params;
    const email = req.usuariobdtoken.email;
    
    if (!email) {
      return res.status(400).json({
        ok: false,
        mensaje: 'Email es requerido'
      });
    }

    const resumen = await prestamoHelper.getResumenPrestamosPorSolicitante(email);
    
    res.json({
      ok: true,
      resumen,
      email,
      mensaje: 'Resumen obtenido exitosamente'
    });
  } catch (error) {
    console.error('Error al obtener resumen por email:', error);
    res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor',
      error: error.message
    });
  }
},

obtenerPrestamoPorConsecutivo: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const prestamo = await prestamoHelper.getPrestamoByConsecutivo(consecutivo);

    if (!prestamo) {
      return res.status(404).json({ mensaje: 'Prestamo no encontrado' });
    }

    res.json(prestamo);
  } catch (error) {
    console.error('Error al obtener prestamo:', error);
    res.status(500).json({ mensaje: 'Error al obtener prestamo' });
  }
},

editarPrestamo: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const nuevosDatos = req.body;
    
    if (req.files && req.files.length > 0) {
      const Link = await prestamoHelper.procesarArchivos(req.files, consecutivo);
      nuevosDatos.Link = Link;
    }

    const resultado = await prestamoHelper.editarPrestamoporConsecutivo(consecutivo, nuevosDatos);

    if (!resultado) {
      return res.status(404).json({ mensaje: 'Prestamo no encontrado' });
    }

    res.status(200).json({ mensaje: 'Prestamo actualizado correctamente' });
  } catch (error) {
    console.error('Error al editar Prestamo:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
},

}

export default httpPrestamos;
