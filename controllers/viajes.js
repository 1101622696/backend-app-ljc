import { viajeHelper } from '../helpers/viajes.js';
import { vehiculoHelper } from '../helpers/vehiculos.js';

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
    
    const resultado = await viajeHelper.guardarAnticipo({ 
      placa: placaFinal,
      cliente, 
      destino, 
      fecha_inicio,
      valor_anticipo_conductor,
      valor_tonelada_inicial,
      correo_usuario: email, 
      usuario: nombre, 
      fecha_creacion 
    });
   
    res.status(200).json({ 
      mensaje: 'Viaje creado correctamente', 
      consecutivo: resultado.consecutivo, 
    });

  } catch (error) { 
    console.error('Error al crear viaje:', error); 
    res.status(500).json({ mensaje: 'Error interno del servidor' }); 
  } 
},

  obtenerViajes: async (req, res) => {
    try {
      const data = await viajeHelper.getViajes();
      res.json(data);
    } catch (error) {
      console.error('Error al obtener datos:', error);
      res.status(500).json({ mensaje: 'Error al obtener viajes' });
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

    const resumen = await viajeHelper.getResumenViajesPorSolicitante(email);
    
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
    const resultado = await viajeHelper.cerrarViajeYGastosConductor(consecutivo, req.body);
    if (!resultado) return res.status(404).json({ mensaje: 'Viaje no encontrado' });
    res.status(200).json({ mensaje: 'Viaje cerrado correctamente', resumen: resultado });
  } catch (error) {
    console.error('Error al cerrar viaje:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
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

calcularNomina: async (req, res) => {
  try {
    const { email } = req.params;
    const { mes } = req.query; // ?mes=2026-01
    const resultado = await viajeHelper.calcularNomina(email, mes);
    res.status(200).json({ ok: true, resultado });
  } catch (error) {
    console.error('Error al calcular nómina:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
},

aprobarNomina: async (req, res) => {
  try {
    const { email } = req.params;
    const { mes } = req.body;
    const resultado = await viajeHelper.aprobarNomina(email, mes);
    res.status(200).json({ ok: true, mensaje: 'Nómina aprobada y liquidada', resultado });
  } catch (error) {
    console.error('Error al aprobar nómina:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
},

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

pagarSalarioMensual: async (req, res) => {
  try {
    const { email } = req.params;
    const { mes } = req.body; // "2025-01"
    const resultado = await viajeHelper.pagarSalarioMensual(email, mes);
    res.status(200).json({ ok: true, mensaje: 'Salario mensual pagado', resultado });
  } catch (error) {
    console.error('Error al pagar salario:', error);
    res.status(500).json({ mensaje: error.message });
  }
},

aprobarViajeYGastosPropietario: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const resultado = await viajeHelper.aprobarViajeYGastosPropietario(consecutivo, req.body);
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
    const { valor_viaje_real } = req.body;
    
    if (!valor_viaje_real) {
      return res.status(400).json({ mensaje: 'Debe especificar el valor_viaje_real' });
    }

    const resultado = await viajeHelper.facturarViaje(consecutivo, parseFloat(valor_viaje_real));
    
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

}



export default httpViajes;
