import { viajeHelper } from '../helpers/viajes.js';
import { vehiculoHelper } from '../helpers/vehiculos.js';
import { usuarioHelper } from '../helpers/usuarios.js';
import { detalleGastosViajesHelper } from '../helpers/detalles_gastos.js';

const ORDENAMIENTO_HANDLERS = {
  anticipo_conductor: viajeHelper.getViajesOrdenadosPorAnticipoConductor,
  diezpcto: viajeHelper.getViajesOrdenadosPorDiezPcto,
  fecha_inicio: viajeHelper.getViajesOrdenadosPorFechaInicio,
  fecha_fin: viajeHelper.getViajesOrdenadosPorFechaFin,
  ganancia_estimada: viajeHelper.getViajesOrdenadosPorGananciaEstimada,
  ganancia_real: viajeHelper.getViajesOrdenadosPorGananciaReal,
  valor_gastos_conductor: viajeHelper.getViajesOrdenadosPorGastosConductor,
  valor_gastos_propietario: viajeHelper.getViajesOrdenadosPorGastosPropietario,
  valor_tonelada_inicial: viajeHelper.getViajesOrdenadosPorValorToneladaInicial,
  valor_tonelada_final: viajeHelper.getViajesOrdenadosPorValorToneladaFinal,
  valor_viaje_real: viajeHelper.getViajesOrdenadosPorValorViajeReal,
};

const FILTRO_HANDLERS = {
  estado: viajeHelper.getViajesPorEstadoSaldoCliente,
  estado_viaje: viajeHelper.getViajesPorEstadoViaje
};

const TIPOS_ORDENAMIENTO = Object.keys(ORDENAMIENTO_HANDLERS);
const TIPOS_FILTRO = Object.keys(FILTRO_HANDLERS);

const httpViajes = {

crearViaje: async (req, res) => {
  try {
    const { email, nombre, perfil, placa_asignada } = req.usuariobdtoken;
    const { cliente, destino, fecha_inicio, valor_anticipo_conductor, valor_tonelada_inicial, placa } = req.body;

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

    const fecha_creacion = new Date().toISOString().split('T')[0];
    
    // Determinar estado preoperacional (cada 3 viajes por placa)
 const viajesAnteriores = await viajeHelper.contarViajesPorPlaca(placaFinal);
 const numeroViaje = viajesAnteriores + 1; // este será el nuevo viaje
 const estadoPreoperacional = (numeroViaje % 2 === 1) ? 'se debe' : 'no se debe';

    const resultado = await viajeHelper.guardarAnticipo({ 
      placa: placaFinal,
      cliente, 
      destino, 
      fecha_inicio,
      valor_anticipo_conductor,
      valor_tonelada_inicial,
      correo_usuario: email, 
      usuario: nombre, 
      fecha_creacion,
      estado_preoperacional: estadoPreoperacional,
    });
   
    res.status(200).json({ 
      mensaje: 'Viaje creado correctamente', 
      consecutivo: resultado.consecutivo, 
    });

    const propietario = await usuarioHelper.obtenerPropietarioPorPlaca(placaFinal)
    if (propietario) {
      await firebaseHelper.enviarNotificacion(
        propietario.email,
        'Solicitud de Anticipo para Nuevo Viaje',
        `${nombre} ha solicitado un anticipo de ${valor_anticipo_conductor} para iniciar el viaje con destino a: ${destino} para el cliente ${cliente}, consecutivo del viaje: #${resultado.consecutivo}`,
        { tipo: 'registro_viaje', consecutivo: resultado.consecutivo }
      )
    }
    
  } catch (error) { 
    console.error('Error al crear viaje:', error); 
    res.status(500).json({ mensaje: 'Error interno del servidor' }); 
  } 
},

// obtenerViajes: async (req, res) => {
//     try {
//       const data = await viajeHelper.getViajes();
//       res.json(data);
//     } catch (error) {
//       console.error('Error al obtener datos:', error);
//       res.status(500).json({ mensaje: 'Error al obtener viajes' });
//     }
// },

obtenerViajes: async (req, res) => {
  try {
    const pagina = parseInt(req.query.pagina) || 1
    const limite = parseInt(req.query.limite) || 50
    const data = await viajeHelper.getViajes(pagina, limite)
    res.json(data)
  } catch (error) {
    console.error('Error al obtener datos:', error)
    res.status(500).json({ mensaje: 'Error al obtener viajes' })
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

    const resumen = await viajeHelper.getResumenViajesPorPlaca(placas)

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

obtenerViajePorConsecutivo: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const viaje = await viajeHelper.getViajesByConsecutivo(consecutivo);

    if (!viaje) {
      return res.status(404).json({ mensaje: 'viaje no encontrado' });
    }

    res.json(viaje);
  } catch (error) {
    console.error('Error al obtener viaje:', error);
    res.status(500).json({ mensaje: 'Error al obtener viaje' });
  }
},

cerrarViajeYGastosConductor: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    
    // Organizar archivos por fieldname
    const archivosOrganizados = {};
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        if (!archivosOrganizados[file.fieldname]) {
          archivosOrganizados[file.fieldname] = [];
        }
        archivosOrganizados[file.fieldname].push(file);
      });
    }
    
    const resultado = await viajeHelper.cerrarViajeYGastosConductor(consecutivo, req.body, archivosOrganizados)

    if (!resultado) return res.status(404).json({ mensaje: 'Viaje no encontrado' })

res.status(200).json({ mensaje: 'Viaje cerrado correctamente', resumen: resultado })

const propietario = await usuarioHelper.obtenerPropietarioPorPlaca(resultado.placa)
if (propietario) {
  await firebaseHelper.enviarNotificacion(
    propietario.email,
    'Viaje listo para aprobar',
    `El conductor ha cerrado el viaje #${consecutivo}, ingrese para revisarlo y aprobarlo`,
    { tipo: 'aprobar_viaje', consecutivo }
  )
}

  } catch (error) {
    console.error('Error al cerrar viaje:', error);
    res.status(500).json({ mensaje: error.message || 'Error interno del servidor' });
  }
},

completarSaldoCliente: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const resultado = await viajeHelper.completarSaldoCliente(consecutivo);
    if (!resultado) return res.status(404).json({ mensaje: 'Viaje no encontrado' });
    res.status(200).json({ mensaje: 'Saldo del cliente completado' });
  } catch (error) {
    console.error('Error al completar saldo:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
},

// calcularNomina: async (req, res) => {
//   try {
//     const { email } = req.params;
//     const { mes } = req.query; // ?mes=2026-01
//     const resultado = await viajeHelper.calcularNomina(email, mes);
//     res.status(200).json({ ok: true, resultado });
//   } catch (error) {
//     console.error('Error al calcular nómina:', error);
//     res.status(500).json({ mensaje: 'Error interno del servidor' });
//   }
// },

// aprobarNomina: async (req, res) => {
//   try {
//     const { email } = req.params;
//     const { mes } = req.body;
//     const resultado = await viajeHelper.aprobarNomina(email, mes);
//     res.status(200).json({ ok: true, mensaje: 'Nómina aprobada y liquidada', resultado });
//   } catch (error) {
//     console.error('Error al aprobar nómina:', error);
//     res.status(400).json({ 
//     ok: false,
//     mensaje: error.message 
//   });
//   }
// },

editarViaje: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const nuevosDatos = req.body;

    const resultado = await viajeHelper.editarViajePorConsecutivo(consecutivo, nuevosDatos);

    if (!resultado) {
      return res.status(404).json({ mensaje: 'Viaje no encontrado' });
    }

    res.status(200).json({ mensaje: 'Viaje actualizado correctamente' });
  } catch (error) {
    console.error('Error al editar Viaje:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
},

// pagarSalarioMensual: async (req, res) => {
//   try {
//     const { email } = req.params;
//     const { mes } = req.body; // "2025-01"
//     const resultado = await viajeHelper.pagarSalarioMensual(email, mes);
//     res.status(200).json({ ok: true, mensaje: 'Salario mensual pagado', resultado });
//   } catch (error) {
//     console.error('Error al pagar salario:', error);
//     res.status(400).json({ 
//     ok: false,
//     mensaje: error.message 
//   });
//   }
// },

aprobarViajeYGastosPropietario: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    
    // Organizar archivos por fieldname
    const archivosOrganizados = {};
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        if (!archivosOrganizados[file.fieldname]) {
          archivosOrganizados[file.fieldname] = [];
        }
        archivosOrganizados[file.fieldname].push(file);
      });
    }
    
    const resultado = await viajeHelper.aprobarViajeYGastosPropietario(consecutivo, req.body, archivosOrganizados);
    if (!resultado) return res.status(404).json({ mensaje: 'Viaje no encontrado' });
    res.status(200).json({ mensaje: 'Viaje aprobado correctamente', resumen: resultado });
  } catch (error) {
    console.error('Error al aprobar viaje:', error);
    res.status(500).json({ mensaje: error.message || 'Error interno del servidor' });
  }
},

facturarCliente: async (req, res) => {
  try {
    const { codigoCliente } = req.params;
    const resultado = await viajeHelper.facturarCliente(codigoCliente);
    res.status(200).json({ ok: true, resultado });
  } catch (error) {
    console.error('Error al facturar cliente:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
},

facturarViaje: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const { valor_viaje_real, notas_facturacion, num_factura_cliente } = req.body;
    
    if (!valor_viaje_real) {
      return res.status(400).json({ mensaje: 'Debe especificar el valor_viaje_real' });
    }

    const resultado = await viajeHelper.facturarViaje(
      consecutivo, 
      parseFloat(valor_viaje_real),
      notas_facturacion,
      num_factura_cliente
    );
    
    if (!resultado) {
      return res.status(404).json({ mensaje: 'Viaje no encontrado' });
    }

    res.status(200).json({ 
      mensaje: resultado.mensaje,
      resumen: resultado
    });
  } catch (error) {
    console.error('Error al facturar viaje:', error);
    res.status(500).json({ mensaje: error.message || 'Error interno del servidor' });
  }
},

legalizarFactura: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const { tipo_gasto, quien, numero_factura } = req.body;
    
    if (!tipo_gasto || !quien) {
      return res.status(400).json({ mensaje: 'Debe especificar tipo_gasto y quien' });
    }

    const resultado = await detalleGastosViajesHelper.legalizarFacturaIndividual(
      consecutivo,
      tipo_gasto,
      quien,
      numero_factura
    );
    
    if (!resultado) {
      return res.status(404).json({ mensaje: 'Gasto no encontrado' });
    }

    res.status(200).json({ mensaje: 'Factura legalizada correctamente' });
  } catch (error) {
    console.error('Error al legalizar factura:', error);
    res.status(500).json({ mensaje: error.message || 'Error interno del servidor' });
  }
},

obtenerGastosViaje: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const gastos = await detalleGastosViajesHelper.getGastosViaje(consecutivo);
    res.json(gastos);
  } catch (error) {
    console.error('Error al obtener gastos:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
},

listarArchivosCarpeta: async (req, res) => {
  try {
    const { folderId, fileId } = req.query;

    const archivos = await detalleGastosViajesHelper.listarArchivosCarpeta({
      folderId,
      fileId
    });

    res.json(archivos);

  } catch (error) {
    console.error('Error al listar archivos:', error);

    res.status(500).json({
      mensaje: 'Error al listar archivos',
      error: error.message
    });
  }
},

servirArchivo: async (req, res) => {
  try {
    const { fileId } = req.params;

    const { nombre, mimeType, stream } =
      await detalleGastosViajesHelper.obtenerStreamArchivo(fileId);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    stream.pipe(res);

  } catch (error) {
    console.error('Error al servir archivo:', error);

    res.status(500).json({
      mensaje: 'Error al obtener archivo'
    });
  }
},

obtenerViajesOrdenados: async (req, res) => {
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
    const viajes = await handlerFn(orden);
    
    res.json(viajes);
  } catch (error) {
    console.error("Error al obtener viajes ordenados:", error);
    res.status(500).json({ mensaje: "Error al obtener viajes" });
  }
},

obtenerViajesFiltrados: async (req, res) => {
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
    const viajes = await handlerFn(valor);
    
    res.json(viajes);
  } catch (error) {
    console.error("Error al obtener viajes filtrados:", error);
    res.status(500).json({ mensaje: "Error al obtener viajes", error: error.message });
  }
},

// obtenerResumenPorPlaca: async (req, res) => {
//   try {
//     const { perfil, placa_asignada } = req.usuariobdtoken;

//     let placas = [];

//     if (perfil === 'administrador') {
//       placas = null; // null = traer todos
//     } else {
//       if (!placa_asignada) {
//         return res.status(400).json({
//           ok: false,
//           mensaje: 'No tienes placas asignadas'
//         });
//       }

//       placas = placa_asignada
//         .split(',')
//         .map(p => p.trim().toLowerCase());
//     }

//     const resumen = await viajeHelper.getResumenViajesPorPlaca(placas);

//     res.json({
//       ok: true,
//       resumen,
//       mensaje: 'Resumen por placa obtenido correctamente'
//     });

//   } catch (error) {
//     console.error('Error al obtener viajes por placa:', error);
//     res.status(500).json({
//       ok: false,
//       mensaje: 'Error interno del servidor',
//       error: error.message
//     });
//   }
// },

}

export default httpViajes;
