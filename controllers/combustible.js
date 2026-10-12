import { combustibleHelper, normalizarPlaca } from '../helpers/combustible.js';
import { usuarioHelper } from '../helpers/usuarios.js';
import { firebaseHelper } from '../helpers/firebase.js';
import { ErrorApp, responderError } from '../helpers/errores.js';
import { ADMIN, PROPIETARIO, CONDUCTOR, esAdmin, placasDe, puedeVerPlaca } from '../middlewares/validar-rol.js';

const ORDENAMIENTO_HANDLERS = {
  tiempo: combustibleHelper.getCombustiblesOrdenadosPorFecha, // era el tipo por defecto y no existía
  galones: combustibleHelper.getCombustiblesOrdenadosPorGalones,
  valor_pagado: combustibleHelper.getCombustiblesOrdenadosPorValorPagado,
  precio_por_galon: combustibleHelper.getCombustiblesOrdenadosPorPrecioPorGalon,
  rendimiento_real: combustibleHelper.getCombustiblesOrdenadosPorRendimientoReal,
};

const FILTRO_HANDLERS = {
  alerta: combustibleHelper.getCombustiblesPorAlerta,
  estado_factura: combustibleHelper.getCombustiblesPorEstadoFactura,
  mes: combustibleHelper.getCombustiblesPorMes,
  tanque_lleno: combustibleHelper.getCombustiblesPorTanqueLleno,
};

const TIPOS_ORDENAMIENTO = Object.keys(ORDENAMIENTO_HANDLERS);
const TIPOS_FILTRO = Object.keys(FILTRO_HANDLERS);

/** Para los listados: el admin ve todo; los demás solo sus placas */
const filtroDe = (usuario) => (esAdmin(usuario) ? undefined : usuario);

/**
 * Placa con la que se registra el tanqueo según el perfil:
 * - conductor: su placa asignada (si tiene varias, debe enviar una de las suyas)
 * - propietario: debe enviar una de sus placas
 * - administrador: debe enviarla
 */
const resolverPlaca = (usuario, placaEnviada) => {
  const enviada = normalizarPlaca(placaEnviada);
  const mias = placasDe(usuario);

  switch (usuario?.perfil) {
    case CONDUCTOR:
      if (!mias.length) throw new ErrorApp(400, 'No tiene una placa asignada');
      if (enviada) {
        if (!mias.includes(enviada)) throw new ErrorApp(403, `La placa ${enviada} no está asignada a usted`, 'SIN_PERMISO');
        return enviada;
      }
      if (mias.length > 1) throw new ErrorApp(400, `Tiene varias placas asignadas (${mias.join(', ')}). Indique cuál tanqueó`);
      return mias[0];
    case PROPIETARIO:
      if (!mias.length) throw new ErrorApp(400, 'No tiene placas asignadas');
      if (!enviada) throw new ErrorApp(400, `Debe indicar la placa. Sus placas son: ${mias.join(', ')}`);
      if (!mias.includes(enviada)) throw new ErrorApp(403, `Placa no válida. Sus placas son: ${mias.join(', ')}`, 'SIN_PERMISO');
      return enviada;
    case ADMIN:
      if (!enviada) throw new ErrorApp(400, 'Debe indicar la placa');
      return enviada;
    default:
      throw new ErrorApp(403, 'Perfil no autorizado para registrar combustible', 'SIN_PERMISO');
  }
};

/** Push al propietario y a los administradores. Nunca lanza: se llama después de responder */
const notificarTanqueo = async (resultado, nombre) => {
  const destinatarios = await usuarioHelper.obtenerDestinatariosNotificacion(resultado.placa);
  const conAlerta = resultado.alerta === 'si';
  const titulo = conAlerta ? 'Vehículo tanqueado - rendimiento bajo' : 'Vehículo tanqueado';
  const mensaje = conAlerta
    ? `${nombre} tanqueó ${resultado.placa} (#${resultado.consecutivo}). Rendimiento bajo: ${resultado.rendimiento_real} km/gal (esperado ${resultado.rendimiento_esperado})`
    : `${nombre} ha tanqueado el vehículo ${resultado.placa}, #${resultado.consecutivo}`;

  // FCM exige que los datos sean texto
  const datos = { tipo: 'registro_combustible', consecutivo: resultado.consecutivo, placa: resultado.placa, alerta: resultado.alerta };

  const envios = await Promise.allSettled(
    destinatarios.map((email) => firebaseHelper.enviarNotificacion(email, titulo, mensaje, datos))
  );
  envios
    .filter((e) => e.status === 'rejected')
    .forEach((e) => console.error(`Notificación de combustible ${resultado.consecutivo} falló:`, e.reason));
};

const httpCombustible = {

  registrarCombustible: async (req, res) => {
    try {
      const usuario = req.usuariobdtoken;
      const { placa, odometro_actual, galones_cargados, valor_pagado, tanque_lleno } = req.body;

      const placaFinal = resolverPlaca(usuario, placa);

      if (!req.files || req.files.length === 0) {
        throw new ErrorApp(400, 'Debe adjuntar la factura de combustible');
      }

      // El helper valida números, odómetro vs. vehículo, y actualiza el odómetro con placaFinal
      const resultado = await combustibleHelper.registrarCombustible({
        placa: placaFinal,
        odometro_actual,
        galones_cargados,
        valor_pagado,
        tanque_lleno,
        correo_usuario: usuario.email,
        usuario: usuario.nombre,
        archivos: req.files,
      });

      res.status(200).json({
        mensaje: resultado.mensaje,
        consecutivo: resultado.consecutivo,
        rendimiento_real: resultado.rendimiento_real,
        alerta: resultado.alerta,
        // nuevos
        placa: resultado.placa,
        rendimiento_calculado: resultado.rendimiento_calculado,
        rendimiento_esperado: resultado.rendimiento_esperado,
        km_recorridos: resultado.km_recorridos,
        precio_por_galon: resultado.precio_por_galon,
        tanque_lleno: resultado.tanque_lleno,
        advertencias: resultado.advertencias,
      });

      // Después de responder: un fallo aquí no puede tumbar el servidor ni cambiar la respuesta
      notificarTanqueo(resultado, usuario.nombre).catch((error) =>
        console.error(`No se pudo notificar el combustible ${resultado.consecutivo}:`, error)
      );
    } catch (error) {
      responderError(res, error, 'Error al registrar combustible');
    }
  },

  listarCombustibles: async (req, res) => {
    try {
      const { pagina = 1, limite = 50 } = req.query;
      const data = await combustibleHelper.getCombustibles(pagina, limite, filtroDe(req.usuariobdtoken));
      res.json(data);
    } catch (error) {
      responderError(res, error, 'Error al obtener combustibles');
    }
  },

  obtenerCombustibleporConsecutivo: async (req, res) => {
    try {
      const { consecutivo } = req.params;
      const combustible = await combustibleHelper.getCombustibleById(consecutivo);

      if (!combustible) throw new ErrorApp(404, 'Combustible no encontrado');
      if (!puedeVerPlaca(req.usuariobdtoken, combustible.placa)) {
        throw new ErrorApp(403, 'No tiene permiso para ver este registro', 'SIN_PERMISO');
      }

      res.json(combustible);
    } catch (error) {
      responderError(res, error, 'Error al obtener combustible');
    }
  },

  obtenerCombustiblesOrdenados: async (req, res) => {
    try {
      const { tipo = 'tiempo', orden = 'desc' } = req.query;
      const ordenLower = String(orden).toLowerCase();
      if (ordenLower !== 'asc' && ordenLower !== 'desc') {
        throw new ErrorApp(400, 'El parámetro orden debe ser "asc" o "desc"');
      }

      const tipoLower = String(tipo).toLowerCase();
      if (!TIPOS_ORDENAMIENTO.includes(tipoLower)) {
        return res.status(400).json({
          mensaje: `El parámetro tipo debe ser uno de: ${TIPOS_ORDENAMIENTO.join(', ')}`,
          tiposPermitidos: TIPOS_ORDENAMIENTO,
        });
      }

      const combustibles = await ORDENAMIENTO_HANDLERS[tipoLower](ordenLower, filtroDe(req.usuariobdtoken));
      res.json(combustibles);
    } catch (error) {
      responderError(res, error, 'Error al obtener combustibles ordenados');
    }
  },

  obtenerCombustiblesFiltrados: async (req, res) => {
    try {
      const { tipo, valor } = req.query;
      if (!tipo || !valor) throw new ErrorApp(400, 'Se requieren los parámetros tipo y valor');

      const tipoLower = String(tipo).toLowerCase();
      if (!TIPOS_FILTRO.includes(tipoLower)) {
        return res.status(400).json({
          mensaje: `El parámetro tipo debe ser uno de: ${TIPOS_FILTRO.join(', ')}`,
          tiposPermitidos: TIPOS_FILTRO,
        });
      }

      const combustibles = await FILTRO_HANDLERS[tipoLower](valor, filtroDe(req.usuariobdtoken));
      res.json(combustibles);
    } catch (error) {
      responderError(res, error, 'Error al obtener combustibles filtrados');
    }
  },

  obtenerResumenPorPlaca: async (req, res) => {
    try {
      const { placa } = req.params;
      if (!placa) return res.status(400).json({ ok: false, mensaje: 'Placa requerida' });

      const placas = placa.split(',').map(normalizarPlaca).filter(Boolean);
      const resumen = await combustibleHelper.getResumenCombustiblesPorPlaca(placas);

      res.json({ ok: true, resumen, placas, mensaje: 'Resumen obtenido exitosamente' });
    } catch (error) {
      if (error instanceof ErrorApp) return res.status(error.estado).json({ ok: false, mensaje: error.message });
      console.error('Error al obtener resumen por placa:', error);
      res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
    }
  },

  /** GET /rendimiento-mensual/:placa?mes=AAAA-MM (o MM; sin mes = mes actual) */
  obtenerRendimientoMensual: async (req, res) => {
    try {
      const { placa } = req.params;
      if (!placa || placa.includes(',')) throw new ErrorApp(400, 'Indique una sola placa');
      const resultado = await combustibleHelper.rendimientoMensual(placa, req.query.mes);
      res.json(resultado);
    } catch (error) {
      responderError(res, error, 'Error al obtener rendimiento mensual');
    }
  },

  legalizarCombustible: async (req, res) => {
    try {
      const { consecutivo } = req.params;
      const { numero_factura } = req.body;

      const resultado = await combustibleHelper.legalizarCombustible(
        consecutivo, numero_factura, filtroDe(req.usuariobdtoken)
      );

      res.status(200).json({ mensaje: resultado.mensaje, resumen: resultado });
    } catch (error) {
      responderError(res, error, 'Error al legalizar combustible');
    }
  },

  editarCombustible: async (req, res) => {
    try {
      const { consecutivo } = req.params;
      const { placa, odometro_actual, galones_cargados, valor_pagado, tanque_lleno } = req.body;

      // Solo los campos editables (el resto del body se ignora); el helper valida y recalcula
      const resultado = await combustibleHelper.editarCombustibleporConsecutivo(
        consecutivo,
        { placa, odometro_actual, galones_cargados, valor_pagado, tanque_lleno, archivos: req.files || [] },
        filtroDe(req.usuariobdtoken)
      );

      if (!resultado) throw new ErrorApp(404, 'Combustible no encontrado');

      res.status(200).json({
        mensaje: 'Combustible actualizado correctamente',
        // nuevos
        consecutivo: resultado.consecutivo,
        rendimiento_real: resultado.rendimiento_real,
        rendimiento_calculado: resultado.rendimiento_calculado,
        alerta: resultado.alerta,
        km_recorridos: resultado.km_recorridos,
        precio_por_galon: resultado.precio_por_galon,
        tanque_lleno: resultado.tanque_lleno,
      });
    } catch (error) {
      responderError(res, error, 'Error al editar combustible');
    }
  },
};

export default httpCombustible;
