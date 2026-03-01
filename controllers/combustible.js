import { combustibleHelper } from '../helpers/combustible.js';
import { vehiculoHelper } from '../helpers/vehiculos.js';

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

      let link_factura = null;
      if (req.files && req.files.length > 0) {
        const consecutivo = await combustibleHelper.getSiguienteConsecutivo();
        link_factura = await combustibleHelper.procesarArchivos(req.files, `COMB_${consecutivo}`);
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
    await vehiculoHelper.actualizarOdometroVehiculo(placaFinal, odometro_actual);

      res.status(200).json({
        mensaje: resultado.mensaje,
        consecutivo: resultado.consecutivo,
        rendimiento_real: resultado.rendimiento_real,
        alerta: resultado.alerta
      });
    } catch (error) {
      console.error('Error al registrar combustible:', error);
      res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
  },

  listarCombustibles: async (req, res) => {
    try {
      const combustibles = await combustibleHelper.getCombustibles();
      res.json(combustibles);
    } catch (error) {
      console.error('Error al listar combustibles:', error);
      res.status(500).json({ mensaje: 'Error al obtener combustibles' });
    }
  }
};

export default httpCombustible;