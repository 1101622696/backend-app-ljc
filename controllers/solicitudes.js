import { solicitudHelper } from '../helpers/solicitudes.js';
import { vehiculoHelper } from '../helpers/vehiculos.js';
import { ahora } from '../helpers/fechas.js';
import { aNumero } from '../helpers/hoja.js';
import { ErrorApp, responderError } from '../helpers/errores.js';
import { puedeVerPlaca, placasDe, ADMIN, PROPIETARIO, CONDUCTOR } from '../middlewares/validar-rol.js';

const normalizarPlaca = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
const formatoMiles = (n) => String(Math.round(aNumero(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Placa final de la solicitud:
 * - conductor: su placa asignada; si tiene varias, la que envíe (debe ser de las suyas)
 * - propietario: la envía y debe ser suya
 * - administrador: la envía (cualquiera)
 */
const resolverPlaca = (usuario, placaBody) => {
  const placa = normalizarPlaca(placaBody);
  const mias = placasDe(usuario);

  if (usuario.perfil === ADMIN) {
    if (!placa) throw new ErrorApp(400, 'Indique la placa del vehículo');
    return placa;
  }
  if (usuario.perfil === CONDUCTOR) {
    if (!mias.length) throw new ErrorApp(400, 'No tiene una placa asignada. Comuníquese con el administrador.');
    if (!placa) {
      if (mias.length === 1) return mias[0];
      throw new ErrorApp(400, `Indique la placa del vehículo. Sus placas son: ${mias.join(', ')}`);
    }
    if (!mias.includes(placa)) throw new ErrorApp(403, `La placa ${placa} no está asignada a usted. Sus placas son: ${mias.join(', ')}`);
    return placa;
  }
  if (usuario.perfil === PROPIETARIO) {
    if (!mias.length) throw new ErrorApp(400, 'No tiene placas asignadas');
    if (!placa) throw new ErrorApp(400, `Indique la placa del vehículo. Sus placas son: ${mias.join(', ')}`);
    if (!mias.includes(placa)) throw new ErrorApp(403, `La placa ${placa} no está asignada a usted. Sus placas son: ${mias.join(', ')}`);
    return placa;
  }
  throw new ErrorApp(403, 'Su perfil no puede crear solicitudes de mantenimiento');
};

/** Odómetro opcional: '' si no viene */
const leerOdometro = (valor) => {
  if (String(valor ?? '').trim() === '') return '';
  const numero = aNumero(valor);
  if (!(numero > 0)) throw new ErrorApp(400, 'El odómetro debe ser un número mayor a cero');
  return Math.round(numero);
};

const httpSolicitudes = {
  // Acepta FormData (con fotos) y JSON (el frontend lo envía así cuando no hay fotos)
  crearSolicitud: async (req, res) => {
    try {
      const usuario = req.usuariobdtoken;
      const { placa, tipo_mantenimiento, descripcion, odometro } = req.body || {};

      const placaFinal = resolverPlaca(usuario, placa);
      if (!String(descripcion ?? '').trim()) {
        throw new ErrorApp(400, 'Describa qué notó en el vehículo');
      }
      const odometroNuevo = leerOdometro(odometro);

      const vehiculo = await vehiculoHelper.getVehiculoById(placaFinal);
      if (!vehiculo) throw new ErrorApp(404, `No se encontró el vehículo con placa ${placaFinal}`);

      const odometroActual = aNumero(vehiculo.odometro);
      if (odometroNuevo !== '' && odometroNuevo < odometroActual) {
        throw new ErrorApp(400, `El odómetro no puede ser menor al registrado (${formatoMiles(odometroActual)} km)`);
      }

      const resultado = await solicitudHelper.guardarSolicitud({
        placa: placaFinal,
        tipo_mantenimiento,
        descripcion,
        odometro: odometroNuevo,
        correo_usuario: usuario.email,
        usuario: usuario.nombre,
        fecha_creacion: ahora(),
        archivos: req.files,
      });

      // Con la placa FINAL validada; si falla, la solicitud ya quedó guardada
      let odometro_actualizado = false;
      if (odometroNuevo !== '' && odometroNuevo > odometroActual) {
        try {
          await vehiculoHelper.actualizarOdometroVehiculo(placaFinal, odometroNuevo);
          odometro_actualizado = true;
        } catch (error) {
          console.error(`[solicitudes] No se pudo actualizar el odómetro de ${placaFinal}:`, error);
        }
      }

      res.status(200).json({
        mensaje: 'Solicitud guardada correctamente',
        consecutivo: resultado.consecutivo,
        placa: placaFinal,
        link: resultado.link,
        fecha_creacion: resultado.fecha_creacion,
        odometro_actualizado,
      });

      // Después de responder: siempre (con o sin fotos) y sin poder tumbar el servidor
      solicitudHelper
        .notificarSolicitud(
          { consecutivo: resultado.consecutivo, placa: placaFinal, descripcion, usuario: usuario.nombre },
          usuario.email
        )
        .catch((error) => console.error('[solicitudes] Error al notificar:', error));
    } catch (error) {
      responderError(res, error, 'Error al guardar solicitud');
    }
  },

  obtenerSolicitudes: async (req, res) => {
    try {
      res.json(await solicitudHelper.getSolicitudes(req.usuariobdtoken));
    } catch (error) {
      responderError(res, error, 'Error al obtener solicitudes');
    }
  },

  obtenerResumenPorPlaca: async (req, res) => {
    try {
      const { placa } = req.params;
      if (!placa) return res.status(400).json({ ok: false, mensaje: 'Placa requerida' });

      const placas = placa.split(',').map(normalizarPlaca).filter(Boolean);
      const resumen = await solicitudHelper.getResumenSolicitudesPorPlaca(placas);

      res.json({ ok: true, resumen, placas, mensaje: 'Resumen obtenido exitosamente' });
    } catch (error) {
      responderError(res, error, 'Error al obtener resumen de solicitudes por placa');
    }
  },

  obtenerSolicitudPorConsecutivo: async (req, res) => {
    try {
      const solicitud = await solicitudHelper.getSolicitudesByConsecutivo(req.params.consecutivo);
      if (!solicitud) throw new ErrorApp(404, 'Solicitud no encontrada');
      // La ruta deja pasar a todos los perfiles: cada uno solo ve las de sus placas
      if (!puedeVerPlaca(req.usuariobdtoken, solicitud.placa)) {
        throw new ErrorApp(403, 'No tiene permiso sobre esta solicitud');
      }
      res.json(solicitud);
    } catch (error) {
      responderError(res, error, 'Error al obtener solicitud');
    }
  },
};

export default httpSolicitudes;
