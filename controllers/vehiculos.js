import {vehiculoHelper} from '../helpers/vehiculos.js';

const ORDENAMIENTO_HANDLERS = {
  fechapoliza: vehiculoHelper.getVehiculosOrdenadosPorFechaPoliza,
  fechasoat: vehiculoHelper.getVehiculosOrdenadosPorFechaSoat,
  fechatecnico: vehiculoHelper.getVehiculosOrdenadosPorFechaTecnico,
  distancia: vehiculoHelper.getVehiculoOrdenadosPorDistancia,
  viajes: vehiculoHelper.getVehiculoOrdenadosPorViajes
};

const FILTRO_HANDLERS = {
  estado: vehiculoHelper.getVehiculosPorEstado
};

const TIPOS_ORDENAMIENTO = Object.keys(ORDENAMIENTO_HANDLERS);
const TIPOS_FILTRO = Object.keys(FILTRO_HANDLERS);

const httpVehiculos = {

crearVehiculo: async (req, res) => {
  try {
    const {placa, licencia, marca, modelo, referencia, odometro, clase_vehiculo, color, servicio, capacidad, combustible, numero_motor, numero_chasis, fecha_matricula, soat_expedicion, capacidad_ton, tecnico_expedicion, poliza_expedicion} = req.body;

    const estado = req.body.estado || "activo";
    const viajes = req.body.viajes || "0";
    const fecha_creacion = new Date().toISOString().split('T')[0];
    
    // Calcular vencimientos (1 año después de expedición)
    const soat_vencimiento = soat_expedicion 
      ? new Date(new Date(soat_expedicion).setFullYear(new Date(soat_expedicion).getFullYear() + 1)).toISOString().split('T')[0]
      : null;
    
    const tecnico_vencimiento = tecnico_expedicion 
      ? new Date(new Date(tecnico_expedicion).setFullYear(new Date(tecnico_expedicion).getFullYear() + 1)).toISOString().split('T')[0]
      : null;

    const poliza_vencimiento = poliza_expedicion 
      ? new Date(new Date(poliza_expedicion).setFullYear(new Date(tecnico_expedicion).getFullYear() + 1)).toISOString().split('T')[0]
      : null;

    
    // Calcular estado SOAT basado en meses transcurridos
    let soat = "activo";
    if (soat_expedicion) {
      const expedicionDate = new Date(soat_expedicion);
      const hoy = new Date();
      const mesesTranscurridos = (hoy.getFullYear() - expedicionDate.getFullYear()) * 12 + (hoy.getMonth() - expedicionDate.getMonth());
      
      if (mesesTranscurridos > 12) {
        soat = "vencido";
      } else if (mesesTranscurridos >= 10) {
        soat = "proxima a vencer";
      }
    }
    
    // Calcular estado TÉCNICO basado en meses transcurridos
    let tecnico = "activo";
    if (tecnico_expedicion) {
      const expedicionDate = new Date(tecnico_expedicion);
      const hoy = new Date();
      const mesesTranscurridos = (hoy.getFullYear() - expedicionDate.getFullYear()) * 12 + (hoy.getMonth() - expedicionDate.getMonth());
      
      if (mesesTranscurridos > 12) {
        tecnico = "vencido";
      } else if (mesesTranscurridos >= 10) {
        tecnico = "proxima a vencer";
      }
    }

        let poliza = "activo";
    if (poliza_expedicion) {
      const expedicionDate = new Date(poliza_expedicion);
      const hoy = new Date();
      const mesesTranscurridos = (hoy.getFullYear() - expedicionDate.getFullYear()) * 12 + (hoy.getMonth() - expedicionDate.getMonth());
      
      if (mesesTranscurridos > 12) {
        poliza = "vencido";
      } else if (mesesTranscurridos >= 10) {
        poliza = "proxima a vencer";
      }
    }
    
        let Link = null;
        if (req.files && req.files.length > 0) {
          // Primero obtener la placa para usarlo como nombre de la carpeta
          const placafoldername = placa;
          Link = await vehiculoHelper.procesarArchivos(req.files, placafoldername);
      
    const resultado = await vehiculoHelper.guardarVehiculo({ placa, viajes, licencia, marca, modelo, referencia, odometro, clase_vehiculo, color, servicio, capacidad, combustible, numero_motor, numero_chasis, fecha_matricula, soat, soat_expedicion, soat_vencimiento, capacidad_ton, tecnico, tecnico_expedicion, tecnico_vencimiento, poliza, poliza_expedicion, poliza_vencimiento, Link, estado, fecha_creacion });
  
      res.status(200).json({
        mensaje: 'vehiculo guardado  con link correctamente',
        placa: resultado.placa,
       
      });
  } else {
    const resultado = await vehiculoHelper.guardarVehiculo({ 
      placa, 
      viajes, 
      licencia, 
      marca, 
      modelo, 
      referencia, 
      odometro, 
      clase_vehiculo, 
      color, 
      servicio, 
      capacidad, 
      combustible, 
      numero_motor, 
      numero_chasis, 
      fecha_matricula, 
      soat, 
      soat_expedicion, 
      soat_vencimiento, 
      capacidad_ton, 
      tecnico, 
      tecnico_expedicion, 
      tecnico_vencimiento,
      poliza, 
      poliza_expedicion, 
      poliza_vencimiento,
      Link: null,
      estado, 
      fecha_creacion
    
    });
    
    res.status(200).json({ 
      mensaje: 'Vehiculo guardado sin archivos correctamente', 
      placa: resultado.placa, 
    });
  }
} catch (error) { 
      console.error('Error al guardar vehiculo:', error);
      res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
  },
  
  obtenerVehiculos: async (req, res) => {
    try {
      const data = await vehiculoHelper.getVehiculos();
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener Vehiculos' });
    }
  },
  obtenerVehiculosActivos: async (req, res) => {
    try {
      const data = await vehiculoHelper.getVehiculoByStatus('activo');
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener vehiculos activos' });
    }
  },

    obtenerVehiculosInactivos: async (req, res) => {
    try {
      const data = await vehiculoHelper.getVehiculoByStatus('inactivo');
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener Vehiculos inactivos' });
    }
  },

   obtenerVehiculosOrdenados: async (req, res) => {
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
    const vehiculos = await handlerFn(orden);
    
    res.json(vehiculos);
  } catch (error) {
    console.error("Error al obtener vehiculos ordenados:", error);
    res.status(500).json({ mensaje: "Error al obtener vehiculos" });
  }
},

  obtenerVehiculosFiltrados: async (req, res) => {
  try {
    const { tipo, valor } = req.query;
    
    // console.log("Parámetros recibidos:", req.query);
    // console.log(`tipo: "${tipo}", valor: "${valor}"`);
    
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
    const vehiculos = await handlerFn(valor);
    
    res.json(vehiculos);
  } catch (error) {
    console.error("Error al obtener vehiculos filtrados:", error);
    res.status(500).json({ mensaje: "Error al obtener vehiculos", error: error.message });
  }
},

  obtenerVehiculoporPlaca: async (req, res) => {
    try {
      const { placa } = req.params;
      const vehiculo = await vehiculoHelper.getVehiculoById(placa);
  
      if (!vehiculo) {
        return res.status(404).json({ mensaje: 'vehiculo no encontrado' });
      }
  
      res.json(vehiculo);
    } catch (error) {
      console.error('Error al obtener vehiculo:', error);
      res.status(500).json({ mensaje: 'Error al obtener vehiculo' });
    }
  },

editarVehiculo: async (req, res) => {
  try {
    const { placa } = req.params;
    const nuevosDatos = req.body;
    
    // Calcular vencimientos y estados si se actualizan las fechas de expedición
    if (nuevosDatos.soat_expedicion) {
      // Calcular vencimiento (1 año después)
      nuevosDatos.soat_vencimiento = new Date(
        new Date(nuevosDatos.soat_expedicion).setFullYear(
          new Date(nuevosDatos.soat_expedicion).getFullYear() + 1
        )
      ).toISOString().split('T')[0];
      
      // Calcular estado SOAT
      const expedicionDate = new Date(nuevosDatos.soat_expedicion);
      const hoy = new Date();
      const mesesTranscurridos = (hoy.getFullYear() - expedicionDate.getFullYear()) * 12 + (hoy.getMonth() - expedicionDate.getMonth());
      
      if (mesesTranscurridos > 12) {
        nuevosDatos.soat = "vencido";
      } else if (mesesTranscurridos >= 10) {
        nuevosDatos.soat = "proxima a vencer";
      } else {
        nuevosDatos.soat = "activo";
      }
    }
    
    if (nuevosDatos.tecnico_expedicion) {
      // Calcular vencimiento (1 año después)
      nuevosDatos.tecnico_vencimiento = new Date(
        new Date(nuevosDatos.tecnico_expedicion).setFullYear(
          new Date(nuevosDatos.tecnico_expedicion).getFullYear() + 1
        )
      ).toISOString().split('T')[0];
      
      // Calcular estado TÉCNICO
      const expedicionDate = new Date(nuevosDatos.tecnico_expedicion);
      const hoy = new Date();
      const mesesTranscurridos = (hoy.getFullYear() - expedicionDate.getFullYear()) * 12 + (hoy.getMonth() - expedicionDate.getMonth());
      
      if (mesesTranscurridos > 12) {
        nuevosDatos.tecnico = "vencido";
      } else if (mesesTranscurridos >= 10) {
        nuevosDatos.tecnico = "proxima a vencer";
      } else {
        nuevosDatos.tecnico = "activo";
      }
    }
    
    if (nuevosDatos.poliza_expedicion) {
      // Calcular vencimiento poliza (1 año después)
      nuevosDatos.poliza_vencimiento = new Date(
        new Date(nuevosDatos.poliza_expedicion).setFullYear(
          new Date(nuevosDatos.poliza_expedicion).getFullYear() + 1
        )
      ).toISOString().split('T')[0];
      
      // Calcular estado PÓLIZA
      const expedicionDate = new Date(nuevosDatos.poliza_expedicion);
      const hoy = new Date();
      const mesesTranscurridos = (hoy.getFullYear() - expedicionDate.getFullYear()) * 12 + (hoy.getMonth() - expedicionDate.getMonth());
      
      if (mesesTranscurridos > 12) {
        nuevosDatos.poliza = "vencido";
      } else if (mesesTranscurridos >= 10) {
        nuevosDatos.poliza = "proxima a vencer";
      } else {
        nuevosDatos.poliza = "activo";
      }
    }
    
    if (req.files && req.files.length > 0) {
      const Link = await vehiculoHelper.procesarArchivos(req.files, placa);
      nuevosDatos.Link = Link;
    }

    const resultado = await vehiculoHelper.editarVehiculoporPlaca(placa, nuevosDatos);

    if (!resultado) {
      return res.status(404).json({ mensaje: 'Vehiculo no encontrado' });
    }

    res.status(200).json({ mensaje: 'Vehiculo actualizado correctamente' });
  } catch (error) {
    console.error('Error al editar Vehiculo:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
},

activarVehiculo: async (req, res) => {
  try {
    const { placa } = req.params;
    const { estado } = req.body; 
    
    const resultado = await vehiculoHelper.actualizarEstadoEnSheets(placa, estado || "activo");
    
    if (!resultado) {
      return res.status(404).json({ mensaje: 'Vehiculo no encontrado' });
    }

    res.status(200).json({ mensaje: 'Estado actualizado correctamente' });
  } catch (error) {
    console.error('Error al editar estado del vehiculo:', error);
    res.status(500).json({ 
      mensaje: 'Error al actualizar estado', 
      error: error.message 
    });
  }
},

desactivarVehiculo: async (req, res) => {
  try {
    const { placa } = req.params;
    const { estado } = req.body; 
    
    const resultado = await vehiculoHelper.actualizarEstadoEnSheets(placa, estado || "inactivo");
    
    if (!resultado) {
      return res.status(404).json({ mensaje: 'Vehiculo no encontrado' });
    }

    res.status(200).json({ mensaje: 'Estado actualizado correctamente' });
  } catch (error) {
    console.error('Error al editar estado del vehiculo:', error);
    res.status(500).json({ 
      mensaje: 'Error al actualizar estado', 
      error: error.message 
    });
  }
},

  }
export default httpVehiculos;
