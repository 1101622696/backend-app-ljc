import { mantenimientoHelper } from '../helpers/mantenimientos.js';
import { vehiculoHelper } from '../helpers/vehiculos.js';
import { hoy } from '../helpers/fechas.js';
import { aNumero } from '../helpers/hoja.js';
import { ErrorApp, responderError } from '../helpers/errores.js';
import { esAdmin, puedeVerPlaca, placasDe, ADMIN, PROPIETARIO } from '../middlewares/validar-rol.js';

const { formatoMiles, leerOdometro, validarValor } = mantenimientoHelper;

const ORDENAMIENTO_HANDLERS = {
  valor: mantenimientoHelper.getMantenimientosOrdenadosPorValor,
  fecha: mantenimientoHelper.getMantenimientosOrdenadosPorFechaRegistro,
};

const FILTRO_HANDLERS = {
  tipo: mantenimientoHelper.getMantenimientosPorTipo,
  placa: mantenimientoHelper.getMantenimientosPorPlaca,
  estado_factura: mantenimientoHelper.getMantenimientosPorEstadoFactura,
};

const TIPOS_ORDENAMIENTO = Object.keys(ORDENAMIENTO_HANDLERS);
const TIPOS_FILTRO = Object.keys(FILTRO_HANDLERS);

const normalizarPlaca = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');

/** Placa final: propietario solo una de las suyas; admin cualquiera (debe enviarla) */
const resolverPlaca = (usuario, placaBody) => {
  const placa = normalizarPlaca(placaBody);
  if (usuario.perfil === ADMIN) {
    if (!placa) throw new ErrorApp(400, 'Indique la placa del vehículo');
    return placa;
  }
  if (usuario.perfil === PROPIETARIO) {
    const mias = placasDe(usuario);
    if (!mias.length) throw new ErrorApp(400, 'No tiene placas asignadas');
    if (!placa) throw new ErrorApp(400, `Indique la placa del vehículo. Sus placas son: ${mias.join(', ')}`);
    if (!mias.includes(placa)) throw new ErrorApp(403, `La placa ${placa} no está asignada a usted. Sus placas son: ${mias.join(', ')}`);
    return placa;
  }
  throw new ErrorApp(403, 'Su perfil no puede registrar mantenimientos');
};

const buscarVehiculo = async (placa) => {
  const vehiculo = await vehiculoHelper.getVehiculoById(placa);
  if (!vehiculo) throw new ErrorApp(404, `No se encontró el vehículo con placa ${placa}`);
  return vehiculo;
};

/** El propietario solo puede ver y gestionar mantenimientos de sus placas */
const verificarAcceso = (usuario, registro) => {
  if (!puedeVerPlaca(usuario, registro.placa)) {
    throw new ErrorApp(403, 'No tiene permiso sobre este mantenimiento');
  }
};

const httpMantenimientos = {
  crearMantenimiento: async (req, res) => {
    try {
      const usuario = req.usuariobdtoken;
      const { placa, tipo_mantenimiento, descripcion, valor_mantenimiento, odometro, numero_factura } = req.body;

      const placaFinal = resolverPlaca(usuario, placa);
      if (!String(tipo_mantenimiento ?? '').trim()) {
        throw new ErrorApp(400, 'Indique el tipo de mantenimiento (preventivo o correctivo)');
      }
      const valor = validarValor(valor_mantenimiento);
      const odometroNuevo = leerOdometro(odometro);

      const vehiculo = await buscarVehiculo(placaFinal);
      const odometroActual = aNumero(vehiculo.odometro);
      if (odometroNuevo !== '' && odometroNuevo < odometroActual) {
        throw new ErrorApp(400, `El odómetro no puede ser menor al registrado (${formatoMiles(odometroActual)} km)`);
      }

      const resultado = await mantenimientoHelper.guardarMantenimiento({
        placa: placaFinal,
        tipo_mantenimiento,
        descripcion,
        valor_mantenimiento: valor,
        odometro: odometroNuevo,
        correo_usuario: usuario.email,
        usuario: usuario.nombre,
        fecha_creacion: hoy(),
        numero_factura,
        archivos: req.files,
      });

      // Con la placa FINAL validada (antes usaba req.body.placa)
      let odometro_actualizado = false;
      if (odometroNuevo !== '' && odometroNuevo > odometroActual) {
        try {
          await vehiculoHelper.actualizarOdometroVehiculo(placaFinal, odometroNuevo);
          odometro_actualizado = true;
        } catch (error) {
          console.error(`[mantenimientos] No se pudo actualizar el odómetro de ${placaFinal}:`, error);
        }
      }

      const avisos = [];
      if (!resultado.gasto_registrado) avisos.push('no se pudo registrar como gasto del vehículo');
      if (odometroNuevo !== '' && odometroNuevo > odometroActual && !odometro_actualizado) avisos.push('no se pudo actualizar el odómetro del vehículo');

      res.status(200).json({
        mensaje: 'Mantenimiento guardado correctamente',
        consecutivo: resultado.consecutivo,
        placa: placaFinal,
        estado_factura: resultado.estado_factura,
        link: resultado.link,
        link_factura: resultado.link_factura,
        odometro_actualizado,
        ...(avisos.length && { advertencia: `El mantenimiento se guardó, pero ${avisos.join(' y ')}. Avise al administrador.` }),
      });
    } catch (error) {
      responderError(res, error, 'Error al guardar mantenimiento');
    }
  },

  obtenerMantenimientos: async (req, res) => {
    try {
      res.json(await mantenimientoHelper.getMantenimientos(req.usuariobdtoken));
    } catch (error) {
      responderError(res, error, 'Error al obtener mantenimientos');
    }
  },

  obtenerResumenPorPlaca: async (req, res) => {
    try {
      const { placa } = req.params;
      if (!placa) return res.status(400).json({ ok: false, mensaje: 'Placa requerida' });

      const placas = placa.split(',').map(normalizarPlaca).filter(Boolean);
      const resumen = await mantenimientoHelper.getResumenMantenimientosPorPlaca(placas);

      res.json({ ok: true, resumen, placas, mensaje: 'Resumen obtenido exitosamente' });
    } catch (error) {
      if (error instanceof ErrorApp) return res.status(error.estado).json({ ok: false, mensaje: error.message });
      console.error('Error al obtener resumen de mantenimientos por placa:', error);
      res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
    }
  },

  obtenerMantenimientoPorConsecutivo: async (req, res) => {
    try {
      const mantenimiento = await mantenimientoHelper.getMantenimientosByConsecutivo(req.params.consecutivo);
      if (!mantenimiento) throw new ErrorApp(404, 'Mantenimiento no encontrado');
      verificarAcceso(req.usuariobdtoken, mantenimiento);
      res.json(mantenimiento);
    } catch (error) {
      responderError(res, error, 'Error al obtener mantenimiento');
    }
  },

  obtenerMantenimientosOrdenados: async (req, res) => {
    try {
      // Antes el tipo por defecto era 'tiempo', que no existe: sin parámetros siempre daba 400
      const tipo = String(req.query.tipo || 'fecha').toLowerCase();
      const orden = String(req.query.orden || 'desc').toLowerCase();

      if (orden !== 'asc' && orden !== 'desc') {
        return res.status(400).json({ mensaje: 'El parámetro orden debe ser "asc" o "desc"' });
      }
      if (!TIPOS_ORDENAMIENTO.includes(tipo)) {
        return res.status(400).json({
          mensaje: `El parámetro tipo debe ser uno de: ${TIPOS_ORDENAMIENTO.join(', ')}`,
          tiposPermitidos: TIPOS_ORDENAMIENTO,
        });
      }

      res.json(await ORDENAMIENTO_HANDLERS[tipo](orden, req.usuariobdtoken));
    } catch (error) {
      responderError(res, error, 'Error al obtener mantenimientos ordenados');
    }
  },

  obtenerMantenimientosFiltrados: async (req, res) => {
    try {
      const { tipo, valor } = req.query;
      if (!tipo || !valor) {
        return res.status(400).json({ mensaje: 'Se requieren los parámetros tipo y valor' });
      }

      const tipoLower = String(tipo).toLowerCase();
      if (!TIPOS_FILTRO.includes(tipoLower)) {
        return res.status(400).json({
          mensaje: `El parámetro tipo debe ser uno de: ${TIPOS_FILTRO.join(', ')}`,
          tiposPermitidos: TIPOS_FILTRO,
        });
      }

      res.json(await FILTRO_HANDLERS[tipoLower](valor, req.usuariobdtoken));
    } catch (error) {
      responderError(res, error, 'Error al obtener mantenimientos filtrados');
    }
  },

  editarMantenimiento: async (req, res) => {
    try {
      const usuario = req.usuariobdtoken;
      let vehiculoNuevo = null;

      const resultado = await mantenimientoHelper.editarMantenimientoporConsecutivo(
        req.params.consecutivo,
        { ...req.body, archivos: req.files },
        {
          // Se valida antes de escribir nada en la hoja
          validar: async (anterior, cambios) => {
            verificarAcceso(usuario, anterior);
            const placaFinal = cambios.placa || anterior.placa;
            if (cambios.placa && !esAdmin(usuario) && !puedeVerPlaca(usuario, cambios.placa)) {
              throw new ErrorApp(403, `La placa ${cambios.placa} no está asignada a usted`);
            }
            if (cambios.placa || cambios.odometro !== undefined) vehiculoNuevo = await buscarVehiculo(placaFinal);
          },
        }
      );

      if (!resultado) throw new ErrorApp(404, 'Mantenimiento no encontrado');

      // Al editar un registro viejo el odómetro puede ser menor al actual (corrección);
      // solo se mueve el del vehículo si el nuevo es mayor
      const { actual } = resultado;
      if (vehiculoNuevo && actual.odometro !== '' && actual.odometro > aNumero(vehiculoNuevo.odometro)) {
        await vehiculoHelper.actualizarOdometroVehiculo(actual.placa, actual.odometro);
      }

      res.status(200).json({
        mensaje: 'Mantenimiento actualizado correctamente',
        consecutivo: actual.consecutivo,
        estado_factura: actual.estado_factura,
      });
    } catch (error) {
      responderError(res, error, 'Error al editar mantenimiento');
    }
  },

  legalizarMantenimiento: async (req, res) => {
    try {
      const usuario = req.usuariobdtoken;
      const resultado = await mantenimientoHelper.legalizarMantenimiento(
        req.params.consecutivo,
        { numero_factura: req.body?.numero_factura, archivos: req.files },
        { validar: (registro) => verificarAcceso(usuario, registro) }
      );
      res.json(resultado);
    } catch (error) {
      responderError(res, error, 'Error al legalizar mantenimiento');
    }
  },
};

export default httpMantenimientos;
