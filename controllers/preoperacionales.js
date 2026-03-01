import { preoperacionalHelper } from '../helpers/preoperacionales.js';
import { vehiculoHelper } from '../helpers/vehiculos.js';

const httpPreoperacionales = {

crearPreoperacional: async (req, res) => {
  try {
    const { email, nombre } = req.usuariobdtoken;
    const { codigo_viaje, placa, odometro, nivel_agua, nivel_aceite, galones, estado_cabina, cinturon_seguridad, airbag, calibracion_frenos, panoramicos_espejos, estado_trailer, ruedas_trailer, extintor_cabina, f_vencimiento_ext_c, extintor_trailer, f_vencimiento_ext_t, senalizacion, kit_carretera, direccionales, botiquin, cintas_reflectivas, senalizacion_conduzco, estado_bandas, ruedas_cabezote, correas, aire_acondicionado, estado_carpa, refrigerante, pito, alarma_retroceso, luces, cierre_puertas_capot, bateria, placas_visibles } = req.body;

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
      consecutivo = await preoperacionalHelper.getSiguienteConsecutivo();
      Link = await preoperacionalHelper.procesarArchivos(req.files, consecutivo);
    }

    const resultado = await preoperacionalHelper.guardarPreoperacional({ 
      codigo_viaje, 
      placa,
      odometro, 
      nivel_agua, 
      nivel_aceite, 
      galones, 
      estado_cabina, 
      cinturon_seguridad, 
      airbag, 
      calibracion_frenos, 
      panoramicos_espejos, 
      estado_trailer, 
      ruedas_trailer, 
      extintor_cabina, 
      f_vencimiento_ext_c, 
      extintor_trailer, 
      f_vencimiento_ext_t, 
      senalizacion, 
      kit_carretera, 
      direccionales, 
      botiquin, 
      cintas_reflectivas, 
      senalizacion_conduzco, 
      estado_bandas,
      ruedas_cabezote,
      correas,
      aire_acondicionado,
      estado_carpa,
      refrigerante,
      pito,
      alarma_retroceso,
      luces,
      cierre_puertas_capot,
      bateria,
      placas_visibles,
      Link, 
      correo_usuario: email, 
      usuario: nombre, 
      fecha_creacion 
    });
   
    await vehiculoHelper.actualizarOdometroVehiculo(placa, odometro);

    res.status(200).json({ 
      mensaje: 'Preoperacional guardado correctamente', 
      consecutivo: resultado.consecutivo, 
    });

  } catch (error) { 
    console.error('Error al guardar el preoperacional:', error); 
    res.status(500).json({ mensaje: 'Error interno del servidor' }); 
  } 
},

  obtenerPreoperacionales: async (req, res) => {
    try {
      const data = await preoperacionalHelper.getPreoperacionales();
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener preoperacionales' });
    }
  },

obtenerResumenSolicitante: async (req, res) => {
  try {
    const { email } = req.params;
    // const email = req.usuariobdtoken.email;
    
    if (!email) {
      return res.status(400).json({
        ok: false,
        mensaje: 'Email es requerido'
      });
    }

    const resumen = await preoperacionalHelper.getResumenPreoperacionalesPorSolicitante(email);
    
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

obtenerPreoperacionalPorConsecutivo: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const preoperacional = await preoperacionalHelper.getPreoperacionalesByConsecutivo(consecutivo);

    if (!preoperacional) {
      return res.status(404).json({ mensaje: 'preoperacional no encontrado' });
    }

    res.json(preoperacional);
  } catch (error) {
    console.error('Error al obtener preoperacional:', error);
    res.status(500).json({ mensaje: 'Error al obtener preoperacional' });
  }
},

editarPreoperacional: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const nuevosDatos = req.body;
    const { email, nombre } = req.usuariobdtoken;
    
    // Procesar archivos si se han enviado
    if (req.files && req.files.length > 0) {
      // Procesará los archivos reutilizando la carpeta si existe
      const Link = await preoperacionalHelper.procesarArchivos(req.files, consecutivo);
      nuevosDatos.Link = Link;
    }

    const resultado = await preoperacionalHelper.editarPreoperacionalPorConsecutivo(consecutivo, nuevosDatos);

    if (!resultado) {
      return res.status(404).json({ mensaje: 'Preoperacional no encontrado' });
    }

    res.status(200).json({ mensaje: 'Preoperacional actualizado correctamente' });
  } catch (error) {
    console.error('Error al editar Preoperacional:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
},


}

export default httpPreoperacionales;
