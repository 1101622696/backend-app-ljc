import jwt from 'jsonwebtoken';

// El token solo identifica al usuario. Perfil, placas y estado se leen de la hoja
// en cada petición (validar-jwt.js), así un cambio de placa o perfil aplica de inmediato.
//
// pv = "versión de contraseña" (columna password_actualizada). Si la contraseña cambia,
// los tokens anteriores dejan de servir: así se saca a un celular perdido o robado.
//
// Dura 365 días: los conductores no deben iniciar sesión a cada rato.

const generarJWT = (email, versionPassword = '') => {
  return new Promise((resolve, reject) => {
    jwt.sign(
      { uid: email, pv: String(versionPassword || '') },
      process.env.SECRETORPRIVATEKEY,
      { expiresIn: '365d' },
      (err, token) => {
        if (err) {
          console.error('No se pudo generar el token:', err);
          reject(new Error('No se pudo generar el token'));
        } else {
          resolve(token);
        }
      }
    );
  });
};

export { generarJWT };
