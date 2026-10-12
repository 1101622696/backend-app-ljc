// Permisos por perfil. Siempre van DESPUÉS de validarJWT.
//
//   router.put('/aprobar/:id', [validarJWT, tieneRol(ADMIN, PROPIETARIO)], ...)
//   router.get('/resumen/placa/:placa', [validarJWT, validarPlaca()], ...)

export const ADMIN = 'administrador';
export const PROPIETARIO = 'propietario';
export const CONDUCTOR = 'conductor';

export const TODOS = [ADMIN, PROPIETARIO, CONDUCTOR];
export const GESTION = [ADMIN, PROPIETARIO];

export const placasDe = (usuario) =>
  String(usuario?.placa_asignada ?? '')
    .split(',')
    .map((p) => p.replace(/\s+/g, '').toUpperCase())
    .filter(Boolean);

export const esAdmin = (usuario) => usuario?.perfil === ADMIN;

export const puedeVerPlaca = (usuario, placa) =>
  esAdmin(usuario) || placasDe(usuario).includes(String(placa ?? '').replace(/\s+/g, '').toUpperCase());

const sinPermiso = (res) =>
  res.status(403).json({ mensaje: 'No tiene permiso para esta acción', codigo: 'SIN_PERMISO' });

/** Solo deja pasar a los perfiles indicados */
export const tieneRol = (...perfiles) => (req, res, next) => {
  const perfil = req.usuariobdtoken?.perfil;
  if (!perfil || !perfiles.flat().includes(perfil)) return sinPermiso(res);
  next();
};

/**
 * Verifica que la(s) placa(s) pedidas sean del usuario (el admin pasa siempre).
 * Acepta varias placas separadas por coma.
 * origen: 'params' | 'body' | 'query'. En rutas con multer, ponerlo DESPUÉS de upload.
 */
export const validarPlaca = (origen = 'params', campo = 'placa') => (req, res, next) => {
  const usuario = req.usuariobdtoken;
  if (esAdmin(usuario)) return next();

  const valor = req[origen]?.[campo];
  if (!valor) return next(); // si falta, que lo valide el controlador

  const pedidas = String(valor).split(',').map((p) => p.trim()).filter(Boolean);
  if (pedidas.every((p) => puedeVerPlaca(usuario, p))) return next();

  return sinPermiso(res);
};
