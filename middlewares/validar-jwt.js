import jwt from 'jsonwebtoken';
import { usuarioHelper } from '../helpers/usuarios.js';

// Rutas que se permiten aunque el usuario deba cambiar su contraseña
const PERMITIDAS_SIN_CAMBIAR_PASSWORD = [
  '/api/usuarios/me',
  '/api/usuarios/cambiar-mi-password',
  '/api/usuarios/registrar-token-fcm',
];

const sesionInvalida = (res, mensaje) =>
  res.status(401).json({ mensaje, msg: mensaje, codigo: 'SESION_INVALIDA' });

const validarJWT = async (req, res, next) => {
  const token = req.header('x-token');
  if (!token) return sesionInvalida(res, 'No hay token en la petición');

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.SECRETORPRIVATEKEY);
  } catch {
    return sesionInvalida(res, 'Su sesión no es válida. Inicie sesión de nuevo.');
  }

  try {
    // Tokens nuevos traen uid; los anteriores traían email / id
    const email = usuarioHelper.normalizarEmail(decoded.uid || decoded.email || decoded.id);
    const usuario = await usuarioHelper.getUsuarioByEmail(email);

    if (!usuario) return sesionInvalida(res, 'El usuario ya no existe');
    if (usuario.estado !== 'activo') return sesionInvalida(res, 'Su usuario fue desactivado');

    // Si la contraseña cambió después de emitir el token, la sesión se cierra
    if (usuario.password_actualizada && String(decoded.pv || '') !== String(usuario.password_actualizada)) {
      return sesionInvalida(res, 'Su contraseña cambió. Inicie sesión de nuevo.');
    }

    // Perfil y placas SIEMPRE desde la hoja (no desde el token)
    req.usuariobdtoken = {
      id: usuario.email,
      email: usuario.email,
      nombre: usuario.nombre,
      perfil: usuario.perfil,
      placa_asignada: usuario.placa_asignada || null,
      placas: usuarioHelper.placasDe(usuario),
    };

    if (
      usuario.debe_cambiar_password === 'si' &&
      !PERMITIDAS_SIN_CAMBIAR_PASSWORD.some((ruta) => req.originalUrl.startsWith(ruta))
    ) {
      return res.status(403).json({
        mensaje: 'Debe cambiar su contraseña antes de continuar',
        codigo: 'DEBE_CAMBIAR_PASSWORD',
      });
    }

    next();
  } catch (error) {
    console.error('Error validando token:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
};

export { validarJWT };
