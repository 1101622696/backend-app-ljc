import jwt from 'jsonwebtoken';

const generarJWT = (id, perfil, email, nombre, placa_asignada) => {
  return new Promise((resolve, reject) => {
    const payload = { id, perfil, email, nombre, placa_asignada };
    
    jwt.sign(
      payload,
      process.env.SECRETORPRIVATEKEY,
      {
        expiresIn: '24h'
      },
      (err, token) => {
        if (err) {
          console.log(err);
          reject('No se pudo generar el token');
        } else {
          resolve(token);
        }
      }
    );
  });
};

export { generarJWT };
