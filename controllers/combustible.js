import { combustibleHelper } from '../helpers/combustible.js';
import { vehiculoHelper } from '../helpers/vehiculos.js';
import { usuarioHelper } from '../helpers/usuarios.js';
import { firebaseHelper } from '../helpers/firebase.js';

const ORDENAMIENTO_HANDLERS = {
  galones: combustibleHelper.getCombustiblesOrdenadosPorGalones,
  valor_pagado: combustibleHelper.getCombustiblesOrdenadosPorValorPagado,
  precio_por_galon: combustibleHelper.getCombustiblesOrdenadosPorPrecioPorGalon,
  rendimiento_real: combustibleHelper.getCombustiblesOrdenadosPorRendimientoReal,
};

const FILTRO_HANDLERS = {
  alerta: combustibleHelper.getCombustiblesPorAlerta,
  estado_factura: combustibleHelper.getCombustiblesPorEstadoFactura,
  mes: combustibleHelper.getCombustiblesPorMes
};

const TIPOS_ORDENAMIENTO = Object.keys(ORDENAMIENTO_HANDLERS);
const TIPOS_FILTRO = Object.keys(FILTRO_HANDLERS);

const httpCombustible = {

registrarCombustible: async (req, res) => {
    try {
      const { email, nombre, perfil, placa_asignada } = req.usuariobdtoken;
      const { placa, odometro_actual, galones_cargados, valor_pagado } = req.body;

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

      const odometroVigente = parseInt(vehiculo.odometro) || 0;
    const odometroNuevo = parseInt(odometro_actual);
    
    if (odometroNuevo < odometroVigente) {
      return res.status(400).json({ 
        mensaje: `El odómetro no puede ser menor al registrado (${odometroVigente} km)` 
      });
    }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ mensaje: 'Debe adjuntar factura de combustible' });
      }

      let link_factura = null;
      if (req.files && req.files.length > 0) {
        link_factura = await combustibleHelper.procesarArchivos(req.files, placaFinal);
      }

      const resultado = await combustibleHelper.registrarCombustible({
        placa: placaFinal,
        odometro_actual: parseFloat(odometro_actual),
        galones_cargados: parseFloat(galones_cargados),
        valor_pagado: parseFloat(valor_pagado),
        correo_usuario: email,
        usuario: nombre,
        link_factura
      });

          await vehiculoHelper.actualizarOdometroVehiculo(placa, odometro_actual);
      
      res.status(200).json({
        mensaje: resultado.mensaje,
        consecutivo: resultado.consecutivo,
        rendimiento_real: resultado.rendimiento_real,
        alerta: resultado.alerta
      });

const propietario = await usuarioHelper.obtenerPropietarioPorPlaca(placaFinal)
if (propietario) {
  await firebaseHelper.enviarNotificacion(
    propietario.email,
    'Vehículo tanqueado',
    `${nombre} ha tanqueado el vehículo ${placaFinal}, #${resultado.consecutivo}`,
    { tipo: 'registro_combustible', consecutivo: resultado.consecutivo }
  )
}
// si el administrador tanquea una placa que no tiene propietario asignado, simplemente no se envía notificación.

    } catch (error) {
      console.error('Error al registrar combustible:', error);
      res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
},

// listarCombustibles: async (req, res) => {
//     try {
//       const data = await combustibleHelper.getCombustibles();
//       res.json(data);
//     } catch (error) {
//       console.error('Error al obtener datos:', error);
//       res.status(500).json({ mensaje: 'Error al obtener combustibles' });
//     }
// },

listarCombustibles: async (req, res) => {
  try {
    const pagina = parseInt(req.query.pagina) || 1
    const limite = parseInt(req.query.limite) || 50
    const data = await combustibleHelper.getCombustibles(pagina, limite)
    res.json(data)
  } catch (error) {
    console.error('Error al obtener datos:', error)
    res.status(500).json({ mensaje: 'Error al obtener combustibles' })
  }
},

obtenerCombustibleporConsecutivo: async (req, res) => {
    try {
      const { consecutivo } = req.params;
      const combustible = await combustibleHelper.getCombustibleById(consecutivo);
  
      if (!combustible) {
        return res.status(404).json({ mensaje: 'combustible no encontrado' });
      }
  
      res.json(combustible);
    } catch (error) {
      console.error('Error al obtener combustible:', error);
      res.status(500).json({ mensaje: 'Error al obtener combustible' });
    }
},

obtenerCombustiblesOrdenados: async (req, res) => {
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
    const combustibles = await handlerFn(orden);
    
    res.json(combustibles);
  } catch (error) {
    console.error("Error al obtener combustibles ordenados:", error);
    res.status(500).json({ mensaje: "Error al obtener combustibles" });
  }
},

obtenerCombustiblesFiltrados: async (req, res) => {
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
    const combustibles = await handlerFn(valor);
    
    res.json(combustibles);
  } catch (error) {
    console.error("Error al obtener combustibles filtrados:", error);
    res.status(500).json({ mensaje: "Error al obtener combustibles", error: error.message });
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

    const resumen = await combustibleHelper.getResumenCombustiblesPorPlaca(placas)

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

legalizarCombustible: async (req, res) => {
    try {
      const { consecutivo } = req.params;
      const { numero_factura } = req.body;

      const resultado = await combustibleHelper.legalizarCombustible(consecutivo, numero_factura);

      res.status(200).json({
        mensaje: resultado.mensaje,
        resumen: resultado
      });
    } catch (error) {
      console.error('Error al legalizar combustible:', error);
      res.status(500).json({ mensaje: error.message || 'Error interno del servidor' });
    }
},

editarCombustible: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const nuevosDatos = req.body;

if (req.files && req.files.length > 0) {

  // obtener combustible actual
  const combustibleActual =
    await combustibleHelper.getCombustibleById(consecutivo);

  let linkFactura = combustibleActual?.link_factura || '';

  // si ya existe carpeta, subir ahí
  if (linkFactura && linkFactura.includes('/folders/')) {

    const carpetaId = combustibleHelper.extraerFolderId(linkFactura);

    linkFactura =
      await combustibleHelper.subirArchivosACarpetaExistente(
        req.files,
        carpetaId
      );

  } else {

    // si no existe carpeta, crear nueva
    linkFactura =
      await combustibleHelper.procesarArchivos(
        req.files,
        combustibleActual?.placa || consecutivo
      );
  }

  nuevosDatos.link_factura = linkFactura;
}
    const resultado = await combustibleHelper.editarCombustibleporConsecutivo(consecutivo, nuevosDatos);

    if (!resultado) {
      return res.status(404).json({ mensaje: 'Combustbile no encontrado' });
    }

    res.status(200).json({ mensaje: 'Combustbile actualizado correctamente' });
  } catch (error) {
    console.error('Error al editar Combustbile:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
},

};


export default httpCombustible;