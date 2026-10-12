// Obliga a actualizar la app cuando el backend ya no es compatible con versiones viejas.
//
// La app envía su versión en el header x-app-version (la del package.json del frontend).
// Si MIN_APP_VERSION está definida en el .env y la versión es menor (o la app no envía el header,
// como las versiones actuales), responde 426 con código ACTUALIZAR_APP.
// Si MIN_APP_VERSION no está definida, no hace nada.

const RUTAS_LIBRES = ['/api/health', '/api/cron'];

const partes = (version) =>
  String(version || '0.0.0')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);

const esMenor = (a, b) => {
  const pa = partes(a);
  const pb = partes(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
};

export const validarVersionApp = (req, res, next) => {
  const minima = process.env.MIN_APP_VERSION;
  if (!minima || RUTAS_LIBRES.some((r) => req.originalUrl.startsWith(r))) return next();

  const version = req.header('x-app-version');
  if (!version || esMenor(version, minima)) {
    return res.status(426).json({
      mensaje: 'Hay una nueva versión de la app. Descárguela para continuar.',
      codigo: 'ACTUALIZAR_APP',
      version_minima: minima,
    });
  }
  next();
};
