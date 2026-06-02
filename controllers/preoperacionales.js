import { preoperacionalHelper } from '../helpers/preoperacionales.js';
import { vehiculoHelper } from '../helpers/vehiculos.js';

const httpPreoperacionales = {

crearPreoperacional: async (req, res) => {
  try {
    const { email, nombre, perfil, placa_asignada } = req.usuariobdtoken;
    const { codigo_viaje, placa, odometro, nivel_agua, nivel_aceite, galones, fugas_visibles, presion_frenos, fugas_audibles, freno_parqueo, abs_sintestigo, prueba_freno, luces_altas_bajas, direccionales, luces_freno, luces_remolque, testigo_tablero, filtro_aire, volante, sin_fugas, cambios_suave, sin_ruidos, cinturon_seguridad, espejos, extintor_cabezote, extintor_trailer, botiquin, triangulos_reflectivos, kit_carretera, senalizacion_conduzco, correas, estado_carpa, refrigerante, pito, alarma_retroceso, presion_llantas, desgaste_llantas, tuercas_ajustadas, suspension_fisuras, acople_quintarueda, quinta_rueda, pasador_rey, mangueras_aire, seguro_acople, placas_visibles} = req.body;

     let placaFinal;
    
    if (perfil === 'conductor') {
      if (!placa_asignada) {
        return res.status(400).json({ mensaje: 'No tienes una placa asignada' });
      }
      placaFinal = placa_asignada;
      
    } else if (perfil === 'propietario') {
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
      if (!placa) {
        return res.status(400).json({ mensaje: 'Debes especificar una placa' });
      }
      placaFinal = placa;
      
    } else {
      return res.status(403).json({ mensaje: 'Perfil no autorizado para crear viajes' });
    }
    
    const vehiculo = await vehiculoHelper.getVehiculoById(placaFinal);
    
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

    const resultado = await preoperacionalHelper.guardarPreoperacional({ 
      codigo_viaje, 
      placa: placaFinal,
      odometro,
      nivel_agua, 
      nivel_aceite, 
      galones, 
      fugas_visibles, 
      presion_frenos, 
      fugas_audibles, 
      freno_parqueo, 
      abs_sintestigo, 
      prueba_freno, 
      luces_altas_bajas, 
      direccionales, 
      luces_freno, 
      luces_remolque, 
      testigo_tablero, 
      filtro_aire, 
      volante, 
      sin_fugas, 
      cambios_suave, 
      sin_ruidos, 
      cinturon_seguridad, 
      espejos, 
      extintor_cabezote, 
      extintor_trailer, 
      botiquin, 
      triangulos_reflectivos, 
      kit_carretera, 
      senalizacion_conduzco, 
      correas, 
      estado_carpa, 
      refrigerante, 
      pito, 
      alarma_retroceso, 
      presion_llantas, 
      desgaste_llantas, 
      tuercas_ajustadas, 
      suspension_fisuras, 
      acople_quintarueda, 
      quinta_rueda, 
      pasador_rey, 
      mangueras_aire, 
      seguro_acople, 
      placas_visibles,
      correo_usuario: email, 
      usuario: nombre, 
      fecha_creacion,
      Link, 
    });
      
    res.status(200).json({ 
      mensaje: 'Preoperacional guardado correctamente', 
      consecutivo: resultado.consecutivo, 
    });

  } else {
        const resultado = await preoperacionalHelper.guardarPreoperacional({ 
      codigo_viaje, 
      placa: placaFinal,
      odometro,
      nivel_agua, 
      nivel_aceite, 
      galones, 
      fugas_visibles, 
      presion_frenos, 
      fugas_audibles, 
      freno_parqueo, 
      abs_sintestigo, 
      prueba_freno, 
      luces_altas_bajas, 
      direccionales, 
      luces_freno, 
      luces_remolque, 
      testigo_tablero, 
      filtro_aire, 
      volante, 
      sin_fugas, 
      cambios_suave, 
      sin_ruidos, 
      cinturon_seguridad, 
      espejos, 
      extintor_cabezote, 
      extintor_trailer, 
      botiquin, 
      triangulos_reflectivos, 
      kit_carretera, 
      senalizacion_conduzco, 
      correas, 
      estado_carpa, 
      refrigerante, 
      pito, 
      alarma_retroceso, 
      presion_llantas, 
      desgaste_llantas, 
      tuercas_ajustadas, 
      suspension_fisuras, 
      acople_quintarueda, 
      quinta_rueda, 
      pasador_rey, 
      mangueras_aire, 
      seguro_acople, 
      placas_visibles,
      correo_usuario: email, 
      usuario: nombre, 
      fecha_creacion, 
      Link: null, 
    });
      
    res.status(200).json({ 
      mensaje: 'Preoperacional guardado correctamente sin archivos', 
      consecutivo: resultado.consecutivo, 
    });
  }
    await vehiculoHelper.actualizarOdometroVehiculo(placaFinal, odometro);

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

    const resumen = await preoperacionalHelper.getResumenPreoperacionalesPorPlaca(placas)

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
