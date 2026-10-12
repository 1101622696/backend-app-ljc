import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { generarJWT } from './generar-jwt.js';
import { getSheetsClient } from '../services/google.js';
import { enviarCodigoRecuperacion } from './email.js';
import { leerHoja, actualizarCampos, agregarFila } from './hoja.js';
import { accesosHelper } from './accesos.js';
import { ahora, minutosDesde, parsearFecha, sumarAnios, aFechaISO } from './fechas.js';
import { ErrorApp } from './errores.js';

// ─────────────────────────────────────────────────────────────
// Hoja "Usuarios". Se lee y escribe por NOMBRE de columna.
// Columnas nuevas que deben existir al final de los encabezados:
//   password_actualizada | debe_cambiar_password | intentos_codigo
// ─────────────────────────────────────────────────────────────

const HOJA = 'Usuarios';
const PERFILES = ['administrador', 'propietario', 'conductor'];
const MIN_PASSWORD = 6;
const CACHE_MS = 30_000;
const VIGENCIA_CODIGO_MIN = 15;
const MAX_INTENTOS_CODIGO = 5;

// Marca de versión de la contraseña (con milisegundos). Va en el token como pv.
const nuevaVersion = () => new Date().toISOString();

// Campos que nunca salen del backend
const CAMPOS_PRIVADOS = [
  'password', 'codigo', 'fecha_codigo', 'token', 'fecha_actualizacion_token',
  'password_actualizada', 'intentos_codigo', '_fila',
];

// Campos de datos personales que se pueden crear/editar desde el formulario
const CAMPOS_PERSONALES = [
  'nombre', 'tipo_documento', 'documento', 'ciudad_expedicion', 'fecha_expedicion',
  'pais_nacimiento', 'ciudad_nacimiento', 'fecha_nacimiento', 'grupo_sanguineo_rh', 'genero',
  'estado_civil', 'telefono', 'tipo_licencia', 'num_licencia', 'fecha_expedicion_licencia',
  'fecha_vencimiento_licencia',
];
const CAMPOS_NOMINA = ['salario_base', 'sso'];
const CAMPOS_BANCO = ['banco', 'num_cuenta']; // solo el administrador

// ── Utilidades ──

const normalizarEmail = (email) => String(email ?? '').trim().toLowerCase();

const listaPlacas = (texto) => [
  ...new Set(
    String(texto ?? '')
      .split(',')
      .map((p) => p.replace(/\s+/g, '').toUpperCase()) // 'snt 473' → 'SNT473'
      .filter(Boolean)
  ),
];

const placasDe = (usuario) => listaPlacas(usuario?.placa_asignada);

const esHash = (valor) => /^\$2[aby]\$\d{2}\$/.test(String(valor ?? ''));

const hashear = (texto) => bcrypt.hash(String(texto), 10);

/** Compara contra hash; si la contraseña guardada aún está en texto plano, compara directo */
const verificarPassword = async (ingresada, guardada) => {
  if (guardada === '' || guardada === null || guardada === undefined) return false;
  if (esHash(guardada)) return bcrypt.compare(String(ingresada), String(guardada));
  const a = Buffer.from(String(ingresada));
  const b = Buffer.from(String(guardada));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const validarNuevaPassword = (password) => {
  if (!password || String(password).length < MIN_PASSWORD) {
    throw new ErrorApp(400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
  }
};

const normalizarUsuario = (fila) => ({
  ...fila,
  email: normalizarEmail(fila.email),
  perfil: String(fila.perfil ?? '').trim().toLowerCase(),
  estado: String(fila.estado ?? '').trim().toLowerCase() || 'activo',
  placa_asignada: listaPlacas(fila.placa_asignada).join(', '),
  debe_cambiar_password: String(fila.debe_cambiar_password ?? '').trim().toLowerCase() === 'si' ? 'si' : 'no',
});

/** Quita contraseñas, códigos y tokens. Nunca devolver un usuario sin pasar por aquí */
const sanitizar = (usuario) => {
  if (!usuario) return null;
  const limpio = { ...usuario };
  CAMPOS_PRIVADOS.forEach((campo) => delete limpio[campo]);
  return limpio;
};

// ── Lectura con caché (validar-jwt lee usuarios en cada petición) ──

let cache = null;
let cacheHasta = 0;

const invalidarCache = () => {
  cache = null;
  cacheHasta = 0;
};

async function leerUsuarios({ fresco = false } = {}) {
  if (!fresco && cache && Date.now() < cacheHasta) return cache;
  const { encabezados, filas } = await leerHoja(HOJA);
  const usuarios = filas.filter((f) => normalizarEmail(f.email)).map(normalizarUsuario);
  cache = { encabezados, usuarios };
  cacheHasta = Date.now() + CACHE_MS;
  return cache;
}

async function escribir(usuario, cambios) {
  const { encabezados } = await leerUsuarios();
  await actualizarCampos(HOJA, encabezados, usuario._fila, cambios, { omitirFaltantes: true });
  invalidarCache();
}

// ── Consultas (devuelven datos COMPLETOS: solo para uso interno del backend) ──

const getUsuarios = async () => (await leerUsuarios()).usuarios;
const leerUsuariosDesdeSheets = getUsuarios; // nombre anterior, lo usan nómina y otros módulos

const getUsuarioByEmail = async (email) => {
  const correo = normalizarEmail(email);
  return (await getUsuarios()).find((u) => u.email === correo) || null;
};

const getUsuarioByStatus = async (estado) =>
  (await getUsuarios()).filter((u) => u.estado === String(estado).toLowerCase());

const getUsuarioPorEstado = getUsuarioByStatus;

const getUsuarioPorPerfil = async (perfil) =>
  (await getUsuarios()).filter((u) => u.perfil === String(perfil).toLowerCase());

/** Conductores que manejan alguna de las placas del propietario */
const getUsuariosPorPropietario = async (emailPropietario) => {
  const usuarios = await getUsuarios();
  const propietario = usuarios.find((u) => u.email === normalizarEmail(emailPropietario));
  if (!propietario) return [];
  const placas = placasDe(propietario);
  return usuarios.filter((u) => u.perfil === 'conductor' && placasDe(u).some((p) => placas.includes(p)));
};

const getUsuariosOrdenadosPorViajes = async (orden = 'desc') => {
  const usuarios = [...(await getUsuarios())];
  return usuarios.sort((a, b) => {
    const va = Number(a.viajes_realizados) || 0;
    const vb = Number(b.viajes_realizados) || 0;
    return orden === 'desc' ? vb - va : va - vb;
  });
};

const getUsuariosOrdenadosPorFechaLicencia = async (orden = 'desc') => {
  const usuarios = [...(await getUsuarios())];
  return usuarios.sort((a, b) => {
    const fa = parsearFecha(a.fecha_vencimiento_licencia)?.getTime() || 0;
    const fb = parsearFecha(b.fecha_vencimiento_licencia)?.getTime() || 0;
    return orden === 'desc' ? fb - fa : fa - fb;
  });
};

const obtenerPropietarioPorPlaca = async (placa) => {
  const buscada = String(placa ?? '').replace(/\s+/g, '').toUpperCase();
  return (
    (await getUsuarios()).find(
      (u) => u.perfil === 'propietario' && u.estado === 'activo' && placasDe(u).includes(buscada)
    ) || null
  );
};

/** Correos a notificar por una placa: el propietario de la placa + todos los administradores activos */
const obtenerDestinatariosNotificacion = async (placa) => {
  const usuarios = await getUsuarios();
  const buscada = String(placa ?? '').replace(/\s+/g, '').toUpperCase();
  const destinatarios = new Set();

  usuarios
    .filter((u) => u.perfil === 'propietario' && u.estado === 'activo' && placasDe(u).includes(buscada))
    .forEach((u) => destinatarios.add(u.email));

  usuarios
    .filter((u) => u.perfil === 'administrador' && u.estado === 'activo')
    .forEach((u) => destinatarios.add(u.email));

  return [...destinatarios];
};

// ── Permisos sobre otros usuarios ──

/** ¿Quien (usuario del token) puede ver/gestionar a objetivo? */
const puedeGestionar = (quien, objetivo) => {
  if (!quien || !objetivo) return false;
  if (quien.perfil === 'administrador') return true;
  if (quien.perfil === 'propietario') {
    if (objetivo.perfil !== 'conductor') return false;
    const mias = listaPlacas(quien.placa_asignada);
    return placasDe(objetivo).some((p) => mias.includes(p));
  }
  return false;
};

const puedeVer = (quien, objetivo) =>
  !!quien && !!objetivo && (normalizarEmail(quien.email) === objetivo.email || puedeGestionar(quien, objetivo));

// ── Login ──

const loginUsuario = async ({ email, password, ip = '', version = '' }) => {
  const correo = normalizarEmail(email);
  if (!correo || !password) throw new ErrorApp(400, 'El correo y la contraseña son obligatorios');

  const bloqueo = await accesosHelper.estaBloqueado(correo);
  if (bloqueo.bloqueado) {
    throw new ErrorApp(429, `Demasiados intentos fallidos. Intente de nuevo en ${bloqueo.minutos} minuto(s).`);
  }

  const { usuarios } = await leerUsuarios({ fresco: true });
  const usuario = usuarios.find((u) => u.email === correo);
  const correcta = usuario ? await verificarPassword(password, usuario.password) : false;

  if (!correcta) {
    await accesosHelper.registrarAcceso({
      email: correo, resultado: 'fallido', motivo: usuario ? 'password' : 'usuario_no_existe', ip, version,
    });
    throw new ErrorApp(400, 'Usuario o contraseña incorrecta');
  }

  if (usuario.estado !== 'activo') {
    await accesosHelper.registrarAcceso({ email: correo, resultado: 'fallido', motivo: 'inactivo', ip, version });
    throw new ErrorApp(403, 'Su usuario está inactivo. Comuníquese con el administrador.');
  }

  // Migración transparente: si la contraseña está en texto plano se guarda con hash
  // y se obliga a cambiarla (las contraseñas viejas eran compartidas, p. ej. LJC2026).
  let versionPassword = usuario.password_actualizada || '';
  let debeCambiar = usuario.debe_cambiar_password === 'si';

  if (!esHash(usuario.password)) {
    versionPassword = versionPassword || nuevaVersion();
    debeCambiar = true;
    await escribir(usuario, {
      password: await hashear(password),
      password_actualizada: versionPassword,
      debe_cambiar_password: 'si',
    });
  }

  await accesosHelper.registrarAcceso({ email: correo, resultado: 'ok', ip, version });

  const token = await generarJWT(usuario.email, versionPassword);
  return {
    token,
    usuario: { ...sanitizar(usuario), debe_cambiar_password: debeCambiar ? 'si' : 'no' },
  };
};

// ── Crear / editar ──

const tomarCampos = (datos, campos) => {
  const resultado = {};
  campos.forEach((campo) => {
    if (datos[campo] !== undefined && datos[campo] !== null) {
      resultado[campo] = typeof datos[campo] === 'string' ? datos[campo].trim() : datos[campo];
    }
  });
  return resultado;
};

const aNumero = (valor) => {
  if (valor === '' || valor === undefined || valor === null) return '';
  const n = Number(String(valor).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : '';
};

const prepararFechas = (datos) => {
  ['fecha_expedicion', 'fecha_nacimiento', 'fecha_expedicion_licencia', 'fecha_vencimiento_licencia'].forEach((campo) => {
    if (datos[campo] !== undefined && datos[campo] !== '') datos[campo] = aFechaISO(datos[campo]) || datos[campo];
  });
  if (datos.fecha_expedicion_licencia && !datos.fecha_vencimiento_licencia) {
    datos.fecha_vencimiento_licencia = sumarAnios(datos.fecha_expedicion_licencia, 2);
  }
  return datos;
};

/**
 * Valida las placas que alguien intenta asignar.
 * El propietario solo puede asignar placas que él mismo tiene.
 */
const validarPlacas = (quien, placasTexto) => {
  const placas = listaPlacas(placasTexto);
  if (quien.perfil === 'propietario') {
    const mias = listaPlacas(quien.placa_asignada);
    const ajenas = placas.filter((p) => !mias.includes(p));
    if (ajenas.length) throw new ErrorApp(403, `No puede asignar placas que no son suyas: ${ajenas.join(', ')}`);
  }
  return placas.join(', ');
};

const guardarUsuario = async (quien, datos) => {
  const email = normalizarEmail(datos.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorApp(400, 'Correo electrónico no válido');
  if (!datos.nombre) throw new ErrorApp(400, 'El nombre es obligatorio');

  const perfil = quien.perfil === 'propietario' ? 'conductor' : String(datos.perfil || '').toLowerCase();
  if (!PERFILES.includes(perfil)) throw new ErrorApp(400, 'Perfil no válido');

  validarNuevaPassword(datos.password);

  const { encabezados, usuarios } = await leerUsuarios({ fresco: true });
  if (usuarios.some((u) => u.email === email)) throw new ErrorApp(409, 'Ya existe un usuario con ese correo');

  const nuevo = prepararFechas({
    ...tomarCampos(datos, CAMPOS_PERSONALES),
    ...tomarCampos(datos, CAMPOS_NOMINA),
    ...(quien.perfil === 'administrador' ? tomarCampos(datos, CAMPOS_BANCO) : {}),
  });
  nuevo.salario_base = aNumero(nuevo.salario_base);
  nuevo.sso = aNumero(nuevo.sso);

  await agregarFila(HOJA, encabezados, {
    ...nuevo,
    email,
    perfil,
    estado: 'activo',
    placa_asignada: validarPlacas(quien, datos.placa_asignada),
    password: await hashear(datos.password),
    password_actualizada: nuevaVersion(),
    debe_cambiar_password: 'si', // la contraseña la puso otra persona: se cambia en el primer ingreso
    viajes_realizados: 0,
    intentos_codigo: 0,
  });

  invalidarCache();
  return { nombre: nuevo.nombre, email };
};

const editarUsuario = async (quien, email, datos) => {
  const { usuarios } = await leerUsuarios({ fresco: true });
  const objetivo = usuarios.find((u) => u.email === normalizarEmail(email));
  if (!objetivo) return null;
  if (!puedeGestionar(quien, objetivo)) throw new ErrorApp(403, 'No tiene permiso para editar este usuario');

  const cambios = prepararFechas({
    ...tomarCampos(datos, CAMPOS_PERSONALES),
    ...tomarCampos(datos, CAMPOS_NOMINA),
  });

  if (quien.perfil === 'administrador') {
    Object.assign(cambios, tomarCampos(datos, CAMPOS_BANCO));
    if (datos.perfil !== undefined) {
      const perfil = String(datos.perfil).toLowerCase();
      if (!PERFILES.includes(perfil)) throw new ErrorApp(400, 'Perfil no válido');
      if (normalizarEmail(quien.email) === objetivo.email && perfil !== 'administrador') {
        throw new ErrorApp(400, 'No puede quitarse a sí mismo el perfil de administrador');
      }
      cambios.perfil = perfil;
    }
  }

  if (datos.placa_asignada !== undefined) {
    cambios.placa_asignada = validarPlacas(quien, datos.placa_asignada);
  }

  if (cambios.nombre === '') throw new ErrorApp(400, 'El nombre no puede quedar vacío');
  if (cambios.salario_base !== undefined) cambios.salario_base = aNumero(cambios.salario_base);
  if (cambios.sso !== undefined) cambios.sso = aNumero(cambios.sso);

  // El correo NO se cambia (es la llave de viajes, nóminas, préstamos...). La contraseña tiene su propio flujo.
  await escribir(objetivo, cambios);
  return true;
};

/** Admin / propietario pone una contraseña temporal a otro usuario. Cierra sus sesiones abiertas */
const restablecerPassword = async (quien, email, nuevaPassword) => {
  validarNuevaPassword(nuevaPassword);
  const { usuarios } = await leerUsuarios({ fresco: true });
  const objetivo = usuarios.find((u) => u.email === normalizarEmail(email));
  if (!objetivo) return null;
  if (!puedeGestionar(quien, objetivo)) throw new ErrorApp(403, 'No tiene permiso sobre este usuario');

  await escribir(objetivo, {
    password: await hashear(nuevaPassword),
    password_actualizada: nuevaVersion(),
    debe_cambiar_password: 'si',
  });
  return true;
};

/** El usuario cambia su propia contraseña. Devuelve un token nuevo (los anteriores dejan de servir) */
const cambiarMiPassword = async (email, actual, nueva) => {
  validarNuevaPassword(nueva);
  const { usuarios } = await leerUsuarios({ fresco: true });
  const usuario = usuarios.find((u) => u.email === normalizarEmail(email));
  if (!usuario) throw new ErrorApp(404, 'Usuario no encontrado');

  if (!(await verificarPassword(actual, usuario.password))) throw new ErrorApp(400, 'La contraseña actual no es correcta');
  if (String(actual) === String(nueva)) throw new ErrorApp(400, 'La nueva contraseña debe ser diferente a la actual');

  const version = nuevaVersion();
  await escribir(usuario, {
    password: await hashear(nueva),
    password_actualizada: version,
    debe_cambiar_password: 'no',
  });

  const token = await generarJWT(usuario.email, version);
  return { token, usuario: { ...sanitizar(usuario), debe_cambiar_password: 'no' } };
};

const actualizarEstadoEnSheets = async (quien, email, nuevoEstado) => {
  const estado = String(nuevoEstado).toLowerCase();
  if (!['activo', 'inactivo'].includes(estado)) throw new ErrorApp(400, 'Estado no válido');

  const { usuarios } = await leerUsuarios({ fresco: true });
  const objetivo = usuarios.find((u) => u.email === normalizarEmail(email));
  if (!objetivo) return null;
  if (!puedeGestionar(quien, objetivo)) throw new ErrorApp(403, 'No tiene permiso sobre este usuario');
  if (normalizarEmail(quien.email) === objetivo.email) throw new ErrorApp(400, 'No puede desactivarse a sí mismo');

  await escribir(objetivo, { estado });
  return true;
};

// ── Recuperación de contraseña por correo ──

const MENSAJE_CODIGO_ENVIADO = 'Si el correo está registrado, le enviamos un código de verificación';

const solicitarRecuperacion = async (email) => {
  const { usuarios } = await leerUsuarios({ fresco: true });
  const usuario = usuarios.find((u) => u.email === normalizarEmail(email));

  // Misma respuesta exista o no el correo (no revela quién está registrado)
  if (!usuario || usuario.estado !== 'activo') return { mensaje: MENSAJE_CODIGO_ENVIADO };

  // Evita reenviar si pidió uno hace menos de 1 minuto
  if (usuario.codigo && minutosDesde(usuario.fecha_codigo) < 1) return { mensaje: MENSAJE_CODIGO_ENVIADO };

  const codigo = String(crypto.randomInt(100000, 1000000));
  await escribir(usuario, {
    codigo: await hashear(codigo),
    fecha_codigo: ahora(),
    intentos_codigo: 0,
  });

  try {
    await enviarCodigoRecuperacion(usuario.email, usuario.nombre, codigo);
  } catch (error) {
    console.error('Error enviando código de recuperación:', error.message);
    throw new ErrorApp(500, 'No se pudo enviar el correo. Intente más tarde o comuníquese con el administrador.');
  }

  return { mensaje: MENSAJE_CODIGO_ENVIADO };
};

const comprobarCodigo = async (email, codigo) => {
  const { usuarios } = await leerUsuarios({ fresco: true });
  const usuario = usuarios.find((u) => u.email === normalizarEmail(email));

  if (!usuario || !usuario.codigo) throw new ErrorApp(400, 'Solicite un código nuevo');
  if (minutosDesde(usuario.fecha_codigo) > VIGENCIA_CODIGO_MIN) throw new ErrorApp(400, 'El código venció. Solicite uno nuevo');

  const intentos = Number(usuario.intentos_codigo) || 0;
  if (intentos >= MAX_INTENTOS_CODIGO) throw new ErrorApp(429, 'Demasiados intentos. Solicite un código nuevo');

  const correcto = esHash(usuario.codigo)
    ? await bcrypt.compare(String(codigo ?? '').trim(), usuario.codigo)
    : String(codigo ?? '').trim() === String(usuario.codigo);

  if (!correcto) {
    await escribir(usuario, { intentos_codigo: intentos + 1 });
    throw new ErrorApp(400, 'Código incorrecto');
  }
  return usuario;
};

const verificarCodigo = async (email, codigo) => {
  await comprobarCodigo(email, codigo);
  return { mensaje: 'Código válido' };
};

const cambiarPassword = async (email, codigo, nuevaPassword) => {
  validarNuevaPassword(nuevaPassword);
  const usuario = await comprobarCodigo(email, codigo);

  await escribir(usuario, {
    password: await hashear(nuevaPassword),
    password_actualizada: nuevaVersion(),
    debe_cambiar_password: 'no',
    codigo: '',
    fecha_codigo: '',
    intentos_codigo: 0,
  });

  return { mensaje: 'Contraseña actualizada correctamente' };
};

export const usuarioHelper = {
  // lectura interna
  getUsuarios,
  leerUsuariosDesdeSheets,
  getUsuarioByEmail,
  getUsuarioByStatus,
  getUsuarioPorEstado,
  getUsuarioPorPerfil,
  getUsuariosPorPropietario,
  getUsuariosOrdenadosPorViajes,
  getUsuariosOrdenadosPorFechaLicencia,
  obtenerPropietarioPorPlaca,
  obtenerDestinatariosNotificacion,
  // permisos y formato
  sanitizar,
  puedeVer,
  puedeGestionar,
  placasDe,
  listaPlacas,
  normalizarEmail,
  invalidarCache,
  // escritura
  loginUsuario,
  guardarUsuario,
  editarUsuario,
  restablecerPassword,
  cambiarMiPassword,
  actualizarEstadoEnSheets,
  solicitarRecuperacion,
  verificarCodigo,
  cambiarPassword,
  // compatibilidad
  getSheetsClient,
};
