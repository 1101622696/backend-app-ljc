import { usuarioHelper } from '../helpers/usuarios.js';
import { firebaseHelper } from '../helpers/firebase.js';
import { responderError } from '../helpers/errores.js';

const ORDENAMIENTO_HANDLERS = {
  fecha_vencimiento_licencia: usuarioHelper.getUsuariosOrdenadosPorFechaLicencia,
  viajes: usuarioHelper.getUsuariosOrdenadosPorViajes,
};

const FILTRO_HANDLERS = {
  perfil: usuarioHelper.getUsuarioPorPerfil,
  estado: usuarioHelper.getUsuarioPorEstado,
};

const TIPOS_ORDENAMIENTO = Object.keys(ORDENAMIENTO_HANDLERS);
const TIPOS_FILTRO = Object.keys(FILTRO_HANDLERS);

const limpiarLista = (usuarios) => usuarios.map(usuarioHelper.sanitizar);

const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();

const httpUsuarios = {
  // ── Consultas ──

  /** Solo administrador: todos los usuarios (sin contraseñas ni códigos) */
  getUsuariosDesdeSheets: async (req, res) => {
    try {
      const usuarios = await usuarioHelper.getUsuarios();
      res.json({ usuarios: limpiarLista(usuarios) });
    } catch (error) {
      responderError(res, error, 'Error leyendo usuarios');
    }
  },

  /** El usuario de la sesión. La app lo llama al abrir para refrescar perfil y placas */
  obtenerMiUsuario: async (req, res) => {
    try {
      const usuario = await usuarioHelper.getUsuarioByEmail(req.usuariobdtoken.email);
      if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
      res.json(usuarioHelper.sanitizar(usuario));
    } catch (error) {
      responderError(res, error, 'Error obteniendo usuario de la sesión');
    }
  },

  /** Él mismo, el admin, o el propietario si es conductor de sus placas */
  obtenerUsuarioporEmail: async (req, res) => {
    try {
      const usuario = await usuarioHelper.getUsuarioByEmail(req.params.email);
      if (!usuario || !usuarioHelper.puedeVer(req.usuariobdtoken, usuario)) {
        return res.status(404).json({ mensaje: 'Usuario no encontrado' });
      }
      res.json(usuarioHelper.sanitizar(usuario));
    } catch (error) {
      responderError(res, error, 'Error al obtener usuario');
    }
  },

  /** Conductores de las placas del propietario. El propietario solo puede pedir los suyos */
  obtenerUsuariosPorPropietario: async (req, res) => {
    try {
      const { perfil, email } = req.usuariobdtoken;
      const pedido = usuarioHelper.normalizarEmail(req.params.email);
      if (perfil !== 'administrador' && pedido !== email) {
        return res.status(403).json({ mensaje: 'No tiene permiso para esta acción' });
      }
      const usuarios = await usuarioHelper.getUsuariosPorPropietario(pedido);
      res.json(limpiarLista(usuarios));
    } catch (error) {
      responderError(res, error, 'Error al obtener usuarios del propietario');
    }
  },

  obtenerUsuariosOrdenados: async (req, res) => {
    try {
      const { tipo = '', orden = 'desc' } = req.query;
      if (orden !== 'asc' && orden !== 'desc') {
        return res.status(400).json({ mensaje: 'El parámetro orden debe ser "asc" o "desc"' });
      }
      const handler = ORDENAMIENTO_HANDLERS[String(tipo).toLowerCase()];
      if (!handler) {
        return res.status(400).json({
          mensaje: `El parámetro tipo debe ser uno de: ${TIPOS_ORDENAMIENTO.join(', ')}`,
          tiposPermitidos: TIPOS_ORDENAMIENTO,
        });
      }
      res.json(limpiarLista(await handler(orden)));
    } catch (error) {
      responderError(res, error, 'Error al obtener usuarios ordenados');
    }
  },

  obtenerUsuariosFiltrados: async (req, res) => {
    try {
      const { tipo, valor } = req.query;
      if (!tipo || !valor) return res.status(400).json({ mensaje: 'Se requieren los parámetros tipo y valor' });
      const handler = FILTRO_HANDLERS[String(tipo).toLowerCase()];
      if (!handler) {
        return res.status(400).json({
          mensaje: `El parámetro tipo debe ser uno de: ${TIPOS_FILTRO.join(', ')}`,
          tiposPermitidos: TIPOS_FILTRO,
        });
      }
      res.json(limpiarLista(await handler(valor)));
    } catch (error) {
      responderError(res, error, 'Error al obtener usuarios filtrados');
    }
  },

  // ── Sesión ──

  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      const resultado = await usuarioHelper.loginUsuario({
        email,
        password,
        ip: ipDe(req),
        version: req.header('x-app-version') || '',
      });
      res.json(resultado);
    } catch (error) {
      // msg se mantiene por compatibilidad con la app actual
      if (error.estado) return res.status(error.estado).json({ mensaje: error.message, msg: error.message });
      responderError(res, error, 'Error en login');
    }
  },

  cambiarMiPassword: async (req, res) => {
    try {
      const { actual, nueva } = req.body;
      const resultado = await usuarioHelper.cambiarMiPassword(req.usuariobdtoken.email, actual, nueva);
      res.json({ mensaje: 'Contraseña actualizada correctamente', ...resultado });
    } catch (error) {
      responderError(res, error, 'Error cambiando contraseña');
    }
  },

  registrarTokenFCM: async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ mensaje: 'El token FCM es obligatorio', msg: 'El token FCM es obligatorio' });
      const ok = await firebaseHelper.guardarTokenFCM(req.usuariobdtoken.email, token);
      usuarioHelper.invalidarCache();
      if (!ok) return res.status(500).json({ mensaje: 'Error al registrar token FCM', msg: 'Error al registrar token FCM' });
      res.json({ mensaje: 'Token FCM registrado correctamente', msg: 'Token FCM registrado correctamente' });
    } catch (error) {
      responderError(res, error, 'Error al registrar token FCM');
    }
  },

  // ── Gestión (admin y propietario) ──

  crearUsuario: async (req, res) => {
    try {
      const resultado = await usuarioHelper.guardarUsuario(req.usuariobdtoken, req.body);
      res.status(201).json({ mensaje: 'Usuario guardado correctamente', ...resultado });
    } catch (error) {
      responderError(res, error, 'Error al guardar usuario');
    }
  },

  editarUsuario: async (req, res) => {
    try {
      const resultado = await usuarioHelper.editarUsuario(req.usuariobdtoken, req.params.email, req.body);
      if (!resultado) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
      res.json({ mensaje: 'Usuario actualizado correctamente' });
    } catch (error) {
      responderError(res, error, 'Error al editar usuario');
    }
  },

  /** Contraseña temporal puesta por admin/propietario. El usuario deberá cambiarla al entrar */
  editarPasswordUsuario: async (req, res) => {
    try {
      const resultado = await usuarioHelper.restablecerPassword(req.usuariobdtoken, req.params.email, req.body.password);
      if (!resultado) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
      res.json({ mensaje: 'Contraseña temporal asignada. El usuario deberá cambiarla al ingresar.' });
    } catch (error) {
      responderError(res, error, 'Error al restablecer contraseña');
    }
  },

  activarUsuario: async (req, res) => {
    try {
      const resultado = await usuarioHelper.actualizarEstadoEnSheets(req.usuariobdtoken, req.params.email, 'activo');
      if (!resultado) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
      res.json({ mensaje: 'Usuario activado' });
    } catch (error) {
      responderError(res, error, 'Error al activar usuario');
    }
  },

  desactivarUsuario: async (req, res) => {
    try {
      const resultado = await usuarioHelper.actualizarEstadoEnSheets(req.usuariobdtoken, req.params.email, 'inactivo');
      if (!resultado) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
      res.json({ mensaje: 'Usuario desactivado' });
    } catch (error) {
      responderError(res, error, 'Error al desactivar usuario');
    }
  },

  // ── Recuperación por correo (sin sesión) ──

  solicitarRecuperacion: async (req, res) => {
    try {
      res.json(await usuarioHelper.solicitarRecuperacion(req.body.email));
    } catch (error) {
      responderError(res, error, 'Error en recuperación');
    }
  },

  verificarCodigo: async (req, res) => {
    try {
      const { email, codigo } = req.body;
      res.json(await usuarioHelper.verificarCodigo(email, codigo));
    } catch (error) {
      responderError(res, error, 'Error verificando código');
    }
  },

  cambiarPassword: async (req, res) => {
    try {
      const { email, codigo, nuevaPassword } = req.body;
      res.json(await usuarioHelper.cambiarPassword(email, codigo, nuevaPassword));
    } catch (error) {
      responderError(res, error, 'Error cambiando contraseña con código');
    }
  },
};

export default httpUsuarios;
