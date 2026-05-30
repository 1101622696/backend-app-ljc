import { solicitudHelper } from '../helpers/solicitudes.js';
import { vehiculoHelper } from '../helpers/vehiculos.js';
import { usuarioHelper } from '../helpers/usuarios.js';
import { firebaseHelper } from '../helpers/firebase.js';

const httpSolicitudes = {

crearSolicitud: async (req, res) => {
  try {
    const { email, nombre, perfil, placa_asignada } = req.usuariobdtoken;
    const { placa, tipo_mantenimiento, descripcion, odometro} = req.body;

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
      consecutivo = await solicitudHelper.getSiguienteConsecutivo();
      Link = await solicitudHelper.procesarArchivos(req.files, consecutivo);

    const resultado = await solicitudHelper.guardarSolicitud({ 
      placa: placaFinal,
      tipo_mantenimiento, 
      descripcion,
      odometro, 
      correo_usuario: email, 
      usuario: nombre, 
      fecha_creacion, 
      Link
    });
   
    await vehiculoHelper.actualizarOdometroVehiculo(placa, odometro);
    
    consecutivo = resultado.consecutivo;

    res.status(200).json({ 
      mensaje: 'Solicitud guardada correctamente', 
      consecutivo: resultado.consecutivo, 
    });
   
  }else {
    const resultado = await solicitudHelper.guardarSolicitud({ 
      placa: placaFinal,
      tipo_mantenimiento, 
      descripcion,
      odometro, 
      correo_usuario: email, 
      usuario: nombre, 
      fecha_creacion, 
      Link: null, 
    });
      
    await vehiculoHelper.actualizarOdometroVehiculo(placa, odometro);
    
    consecutivo = resultado.consecutivo;
      
      res.status(200).json({ 
        mensaje: 'Solicitud guardada correctamente', 
        consecutivo: resultado.consecutivo, 
      });
  
const destinatarios = await usuarioHelper.obtenerDestinatariosNotificacion(placaFinal)
for (const email of destinatarios) {
  await firebaseHelper.enviarNotificacion(
    email,
        'Solicitud de Mantenimiento',
        `${nombre} ha solicitado un mantenimiento para la placa ${placaFinal} consecutivo de la solicitud: #${resultado.consecutivo}`,
        { tipo: 'solicitud_mantenimiento', consecutivo: resultado.consecutivo }
      )
    }
    }

  } catch (error) { 
    console.error('Error al guardar solicitud:', error); 
    res.status(500).json({ mensaje: 'Error interno del servidor' }); 
  } 
},

obtenerSolicitudes: async (req, res) => {
    try {
      const data = await solicitudHelper.getSolicitudes();
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener solicitudes' });
    }
},

obtenerResumenPorPlaca: async (req, res) => {
  try {
    const { placa } = req.params
    if (!placa) {
      return res.status(400).json({
        ok: false,
        mensaje: 'Placa requerida'
      })
    }

    const placas = placa.split(',')

    const resumen = await solicitudHelper.getResumenSolicitudesPorPlaca(placas)

    res.json({
      ok: true,
      resumen,
      placas,
      mensaje: 'Resumen obtenido exitosamente'
    })

  } catch (error) {
    console.error('Error al obtener resumen por placa:', error)
    res.status(500).json({
      ok: false,
      mensaje: 'Error interno del servidor',
      error: error.message
    })
  }
},

obtenerSolicitudPorConsecutivo: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const solicitud = await solicitudHelper.getSolicitudesByConsecutivo(consecutivo);

    if (!solicitud) {
      return res.status(404).json({ mensaje: 'Solicitud no encontrada' });
    }

    res.json(solicitud);
  } catch (error) {
    console.error('Error al obtener solicitud:', error);
    res.status(500).json({ mensaje: 'Error al obtener solicitud' });
  }
},

}

export default httpSolicitudes;
