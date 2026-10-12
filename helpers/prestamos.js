import { leerHoja, actualizarCampos, agregarFila, aNumero, siguienteConsecutivo, conCandado } from './hoja.js';
import { obtenerCarpeta, subirArchivos } from './carpetas.js';
import { usuarioHelper } from './usuarios.js';
import { ahora, hoy, aFechaISO } from './fechas.js';
import { ErrorApp } from './errores.js';

// ─────────────────────────────────────────────────────────────
// Hoja "Prestamos" (por nombre de columna).
// Estados: pendiente → desembolsado → liquidado (descontado en la nómina de salario)
//                    ↘ rechazado
// Se descuentan completos. Si el salario no alcanza, el saldo pasa a la siguiente nómina.
// ─────────────────────────────────────────────────────────────

const HOJA = 'Prestamos';
const CANDADO = 'prestamos';
const carpetaPadreId = process.env.CARPETA_PADRE_ID_PRESTAMOS;

export const ESTADOS_PRESTAMO = {
  PENDIENTE: 'pendiente',
  DESEMBOLSADO: 'desembolsado',
  RECHAZADO: 'rechazado',
  LIQUIDADO: 'liquidado',
};

const minuscula = (v) => String(v ?? '').trim().toLowerCase();

const normalizar = (f) => ({
  ...f,
  consecutivo: String(f.consecutivo ?? '').trim().toUpperCase(),
  correo_usuario: minuscula(f.correo_usuario),
  estado_prestamo: minuscula(f.estado_prestamo) || ESTADOS_PRESTAMO.PENDIENTE,
  valor_pedido: aNumero(f.valor_pedido),
  valor_prestado: aNumero(f.valor_prestado),
});

const numero = (c) => parseInt(String(c).replace(/\D/g, ''), 10) || 0;

async function leerPrestamos() {
  const { encabezados, filas } = await leerHoja(HOJA);
  return { encabezados, prestamos: filas.filter((f) => f.consecutivo).map(normalizar) };
}

const sinFila = ({ _fila, ...resto }) => resto;

/** Todos (uso interno) */
const getPrestamos = async () => (await leerPrestamos()).prestamos.map(sinFila);

// ── Permisos: el conductor ve los suyos; el propietario los de sus conductores; el admin todos ──

async function puedeVer(usuario, prestamo) {
  if (usuario.perfil === 'administrador') return true;
  if (prestamo.correo_usuario === usuario.email) return true;
  const conductor = await usuarioHelper.getUsuarioByEmail(prestamo.correo_usuario);
  return usuarioHelper.puedeGestionar(usuario, conductor);
}

async function exigirGestion(usuario, prestamo) {
  const conductor = await usuarioHelper.getUsuarioByEmail(prestamo.correo_usuario);
  if (!usuarioHelper.puedeGestionar(usuario, conductor)) throw new ErrorApp(403, 'No tiene permiso sobre este préstamo');
}

async function buscar(consecutivo) {
  const { encabezados, prestamos } = await leerPrestamos();
  const prestamo = prestamos.find((p) => p.consecutivo === String(consecutivo ?? '').trim().toUpperCase());
  if (!prestamo) throw new ErrorApp(404, 'Préstamo no encontrado');
  return { encabezados, prestamo };
}

// ── Consultas ──

/** Lista visible para el usuario, más reciente primero, con totales por estado */
const listar = async (usuario, { estado = '' } = {}) => {
  const { prestamos } = await leerPrestamos();
  const visibles = [];
  for (const p of prestamos) if (await puedeVer(usuario, p)) visibles.push(p);
  visibles.sort((a, b) => numero(b.consecutivo) - numero(a.consecutivo));

  const totales = {};
  visibles.forEach((p) => {
    totales[p.estado_prestamo] = (totales[p.estado_prestamo] || 0) + 1;
  });

  const datos = (estado ? visibles.filter((p) => p.estado_prestamo === minuscula(estado)) : visibles).map(sinFila);
  const porDescontar = visibles
    .filter((p) => p.estado_prestamo === ESTADOS_PRESTAMO.DESEMBOLSADO)
    .reduce((s, p) => s + p.valor_prestado, 0);

  return { datos, totales, por_descontar: porDescontar };
};

const obtener = async (usuario, consecutivo) => {
  const { prestamo } = await buscar(consecutivo);
  if (!(await puedeVer(usuario, prestamo))) throw new ErrorApp(404, 'Préstamo no encontrado');
  return sinFila(prestamo);
};

/** Para la nómina: préstamos desembolsados aún sin descontar de un conductor */
const desembolsadosSinDescontar = async (email) =>
  (await getPrestamos()).filter(
    (p) => p.correo_usuario === minuscula(email) && p.estado_prestamo === ESTADOS_PRESTAMO.DESEMBOLSADO
  );

// ── Acciones ──

/** El conductor pide un préstamo (o el admin/propietario lo registra por él) */
const solicitar = (usuario, datos) =>
  conCandado(CANDADO, async () => {
    let conductor;
    if (usuario.perfil === 'conductor') {
      conductor = await usuarioHelper.getUsuarioByEmail(usuario.email);
    } else {
      conductor = await usuarioHelper.getUsuarioByEmail(datos.correo_conductor);
      if (!conductor || conductor.perfil !== 'conductor') throw new ErrorApp(400, 'Seleccione el conductor');
      if (!usuarioHelper.puedeGestionar(usuario, conductor)) throw new ErrorApp(403, 'Ese conductor no es de sus placas');
    }

    const valor = Math.round(aNumero(datos.valor_pedido));
    if (valor <= 0) throw new ErrorApp(400, 'Ingrese el valor del préstamo');

    const { encabezados, prestamos } = await leerPrestamos();
    const abierto = prestamos.find((p) => p.correo_usuario === conductor.email && p.estado_prestamo === ESTADOS_PRESTAMO.PENDIENTE);
    if (abierto) throw new ErrorApp(409, `Ya tiene el préstamo ${abierto.consecutivo} pendiente de respuesta`);

    const nuevo = {
      consecutivo: siguienteConsecutivo(prestamos, 'consecutivo', 'P'),
      correo_usuario: conductor.email,
      usuario: conductor.nombre,
      valor_pedido: valor,
      motivo: String(datos.motivo ?? '').trim(),
      fecha_creacion: ahora(),
      estado_prestamo: ESTADOS_PRESTAMO.PENDIENTE,
      valor_prestado: 0,
      registrado_por: usuario.email,
    };
    await agregarFila(HOJA, encabezados, nuevo);
    return { ...nuevo, placas: usuarioHelper.placasDe(conductor) };
  });

/** Propietario/admin registra el desembolso con comprobante */
const desembolsar = (usuario, consecutivo, datos, archivos = []) =>
  conCandado(CANDADO, async () => {
    const { encabezados, prestamo } = await buscar(consecutivo);
    await exigirGestion(usuario, prestamo);
    if (prestamo.estado_prestamo !== ESTADOS_PRESTAMO.PENDIENTE) {
      throw new ErrorApp(409, `El préstamo ya está ${prestamo.estado_prestamo}`);
    }

    const valor = Math.round(aNumero(datos.valor_prestado));
    if (valor <= 0) throw new ErrorApp(400, 'Ingrese el valor prestado');
    if (!archivos.length) throw new ErrorApp(400, 'Adjunte el comprobante del desembolso');

    const carpeta = await obtenerCarpeta(prestamo.consecutivo, carpetaPadreId);
    await subirArchivos(archivos, carpeta.id, 'Desembolso - ');

    const cambios = {
      valor_prestado: valor,
      fecha_desembolso: aFechaISO(datos.fecha_desembolso) || hoy(),
      desembolsado_por: usuario.email,
      link_comprobante: carpeta.link,
      estado_prestamo: ESTADOS_PRESTAMO.DESEMBOLSADO,
    };
    await actualizarCampos(HOJA, encabezados, prestamo._fila, cambios, { omitirFaltantes: true });
    return { ...sinFila(prestamo), ...cambios };
  });

const rechazar = (usuario, consecutivo, datos) =>
  conCandado(CANDADO, async () => {
    const { encabezados, prestamo } = await buscar(consecutivo);
    await exigirGestion(usuario, prestamo);
    if (prestamo.estado_prestamo !== ESTADOS_PRESTAMO.PENDIENTE) {
      throw new ErrorApp(409, `El préstamo ya está ${prestamo.estado_prestamo}`);
    }
    const cambios = {
      estado_prestamo: ESTADOS_PRESTAMO.RECHAZADO,
      motivo_rechazo: String(datos.motivo_rechazo ?? '').trim(),
      desembolsado_por: usuario.email,
    };
    await actualizarCampos(HOJA, encabezados, prestamo._fila, cambios, { omitirFaltantes: true });
    return { ...sinFila(prestamo), ...cambios };
  });

/** La nómina de salario los marca como descontados */
const marcarLiquidados = (consecutivos, consecutivoNomina) =>
  conCandado(CANDADO, async () => {
    const { encabezados, prestamos } = await leerPrestamos();
    for (const c of consecutivos) {
      const p = prestamos.find((x) => x.consecutivo === String(c).trim().toUpperCase());
      if (!p || p.estado_prestamo !== ESTADOS_PRESTAMO.DESEMBOLSADO) continue;
      await actualizarCampos(
        HOJA,
        encabezados,
        p._fila,
        { estado_prestamo: ESTADOS_PRESTAMO.LIQUIDADO, consecutivo_nomina: consecutivoNomina, fecha_liquidacion: ahora() },
        { omitirFaltantes: true }
      );
    }
  });

// Compatibilidad con código anterior
const marcarPrestamosLiquidados = (consecutivos) => marcarLiquidados(consecutivos, '');

export const prestamoHelper = {
  ESTADOS_PRESTAMO,
  getPrestamos,
  listar,
  obtener,
  desembolsadosSinDescontar,
  solicitar,
  desembolsar,
  rechazar,
  marcarLiquidados,
  marcarPrestamosLiquidados,
};
