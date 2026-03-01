import { mantenimientoHelper } from '../helpers/mantenimientos.js';
import { vehiculoHelper } from '../helpers/vehiculos.js';

const httpMantenimientos = {

crearMantenimiento: async (req, res) => {
  try {
    const { email, nombre, perfil, placa_asignada } = req.usuariobdtoken;
    const { placa, tipo_mantenimiento, descripcion, valor_mantenimiento, odometro} = req.body;

     let placaFinal;
    
    if (perfil === 'conductor') {
      if (!placa_asignada) {
        return res.status(400).json({ mensaje: 'No tienes una placa asignada' });
      }
      placaFinal = placa_asignada;
      
    } else if (perfil === 'propietario') {
      // Propietario: Puede elegir entre sus placas asignadas (separadas por coma)
      if (!placa_asignada) {
        return res.status(400).json({ mensaje: 'No tienes placas asignadas' });
      }
      
      const placasPermitidas = placa_asignada.split(',').map(p => p.trim().toLowerCase());
      
      if (!placa || !placasPermitidas.includes(placa.toLowerCase())) {
        return res.status(400).json({ 
          mensaje: 'Placa no válida. Tus placas asignadas son: ' + placa_asignada 
        });
      }
      
      placaFinal = placa;
      
    } else if (perfil === 'administrador') {
      // Administrador: Puede usar cualquier placa, pero debe especificarla
      if (!placa) {
        return res.status(400).json({ mensaje: 'Debes especificar una placa' });
      }
      placaFinal = placa;
      
    } else {
      return res.status(403).json({ mensaje: 'Perfil no autorizado para crear preoperacionales' });
    }

    const vehiculo = await vehiculoHelper.getVehiculoById(placa);
    
    if (!vehiculo) {
      return res.status(404).json({ mensaje: 'Vehículo no encontrado con esa placa' });
    }
    
    const odometroActual = parseInt(vehiculo.odometro) || 0;
    const odometroNuevo = parseInt(odometro);
    
    if (odometroNuevo < odometroActual) {
      return res.status(400).json({ 
        mensaje: `El odómetro no puede ser menor al registrado (${odometroActual} km)` 
      });
    }

    const fecha_creacion = new Date().toISOString().split('T')[0];
    let Link = null;
    let consecutivo;

    if (req.files && req.files.length > 0) {
      consecutivo = await mantenimientoHelper.getSiguienteConsecutivo();
      Link = await mantenimientoHelper.procesarArchivos(req.files, consecutivo);

    const resultado = await mantenimientoHelper.guardarMantenimiento({ 
      placa: placaFinal,
      tipo_mantenimiento, 
      descripcion,
      valor_mantenimiento,
      odometro, 
      correo_usuario: email, 
      usuario: nombre, 
      fecha_creacion, 
      Link
    });
   
    await vehiculoHelper.actualizarOdometroVehiculo(placa, odometro);
    
    consecutivo = resultado.consecutivo;

    res.status(200).json({ 
      mensaje: 'Mantenimiento guardado correctamente', 
      consecutivo: resultado.consecutivo, 
    });
   
  }else {
    const resultado = await mantenimientoHelper.guardarMantenimiento({ 
      placa: placaFinal,
      tipo_mantenimiento, 
      descripcion,
      valor_mantenimiento,
      odometro, 
      correo_usuario: email, 
      usuario: nombre, 
      fecha_creacion, 
      Link: null, 
    });
      
    await vehiculoHelper.actualizarOdometroVehiculo(placa, odometro);
    
    consecutivo = resultado.consecutivo;
      
      res.status(200).json({ 
        mensaje: 'Mantenimiento guardado correctamente', 
        consecutivo: resultado.consecutivo, 
      });
    }
  
  } catch (error) { 
    console.error('Error al guardar solicitud:', error); 
    res.status(500).json({ mensaje: 'Error interno del servidor' }); 
  } 
  },

  obtenerMantenimientos: async (req, res) => {
    try {
      const data = await mantenimientoHelper.getMantenimientos();
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener mantenimientos' });
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

    const resumen = await mantenimientoHelper.getResumenMantenimientosPorSolicitante(email);
    
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

obtenerMantenimientoPorConsecutivo: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const mantenimiento = await mantenimientoHelper.getMantenimientosByConsecutivo(consecutivo);

    if (!mantenimiento) {
      return res.status(404).json({ mensaje: 'Mantenimiento no encontrado' });
    }

    res.json(mantenimiento);
  } catch (error) {
    console.error('Error al obtener mantenimiento:', error);
    res.status(500).json({ mensaje: 'Error al obtener mantenimiento' });
  }
},

editarMantenimiento: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const nuevosDatos = req.body;
    
    if (req.files && req.files.length > 0) {
      const Link = await mantenimientoHelper.procesarArchivos(req.files, consecutivo);
      nuevosDatos.Link = Link;
    }

    const resultado = await mantenimientoHelper.editarMantenimientoporConsecutivo(consecutivo, nuevosDatos);

    if (!resultado) {
      return res.status(404).json({ mensaje: 'Mantenimiento no encontrado' });
    }

    res.status(200).json({ mensaje: 'Mantenimiento actualizado correctamente' });
  } catch (error) {
    console.error('Error al editar Mantenimiento:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
},

}

export default httpMantenimientos;
