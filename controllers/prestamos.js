import { prestamoHelper } from '../helpers/prestamos.js';
import { usuarioHelper } from '../helpers/usuarios.js';
import { firebaseHelper } from '../helpers/firebase.js';
import { responderError } from '../helpers/errores.js';

const peso = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

const notificar = (correos, titulo, mensaje, consecutivo) => {
  [...new Set(correos.filter(Boolean))].forEach((correo) =>
    firebaseHelper
      .enviarNotificacion(correo, titulo, mensaje, { tipo: 'prestamo', consecutivo })
      .catch((e) => console.warn('[prestamos] Notificación no enviada:', e.message))
  );
};

const httpPrestamos = {
  /** Lista visible para el usuario. ?estado= */
  listar: async (req, res) => {
    try {
      res.json(await prestamoHelper.listar(req.usuariobdtoken, { estado: req.query.estado || '' }));
    } catch (error) {
      responderError(res, error, 'Error al listar préstamos');
    }
  },

  obtenerPrestamoPorConsecutivo: async (req, res) => {
    try {
      res.json(await prestamoHelper.obtener(req.usuariobdtoken, req.params.consecutivo));
    } catch (error) {
      responderError(res, error, 'Error al obtener préstamo');
    }
  },

  crearPrestamo: async (req, res) => {
    try {
      const usuario = req.usuariobdtoken;
      const p = await prestamoHelper.solicitar(usuario, req.body);
      res.status(201).json({ mensaje: `Préstamo ${p.consecutivo} solicitado`, consecutivo: p.consecutivo });

      // Propietario(s) de sus placas + administradores
      const destinatarios = new Set();
      for (const placa of p.placas) {
        (await usuarioHelper.obtenerDestinatariosNotificacion(placa)).forEach((c) => destinatarios.add(c));
      }
      if (!p.placas.length) {
        (await usuarioHelper.getUsuarioPorPerfil('administrador')).forEach((a) => destinatarios.add(a.email));
      }
      destinatarios.delete(usuario.email);
      notificar(
        [...destinatarios],
        'Solicitud de préstamo',
        `${p.usuario} pide un préstamo de ${peso(p.valor_pedido)}${p.motivo ? ` (${p.motivo})` : ''}.`,
        p.consecutivo
      );
    } catch (error) {
      responderError(res, error, 'Error al solicitar préstamo');
    }
  },

  desembolsar: async (req, res) => {
    try {
      const p = await prestamoHelper.desembolsar(req.usuariobdtoken, req.params.consecutivo, req.body, req.files || []);
      res.json({ mensaje: 'Desembolso registrado. Se descontará en la próxima nómina de salario.' });
      notificar(
        [p.correo_usuario],
        'Préstamo desembolsado',
        `Le consignaron ${peso(p.valor_prestado)} del préstamo ${p.consecutivo}. Se descuenta de su salario.`,
        p.consecutivo
      );
    } catch (error) {
      responderError(res, error, 'Error al desembolsar préstamo');
    }
  },

  rechazar: async (req, res) => {
    try {
      const p = await prestamoHelper.rechazar(req.usuariobdtoken, req.params.consecutivo, req.body);
      res.json({ mensaje: 'Préstamo rechazado' });
      notificar(
        [p.correo_usuario],
        'Préstamo no aprobado',
        `Su préstamo ${p.consecutivo} no fue aprobado${p.motivo_rechazo ? `: ${p.motivo_rechazo}` : ''}.`,
        p.consecutivo
      );
    } catch (error) {
      responderError(res, error, 'Error al rechazar préstamo');
    }
  },
};

export default httpPrestamos;
