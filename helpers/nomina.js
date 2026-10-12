import { leerHoja, agregarFila, aNumero, siguienteConsecutivo, conCandado } from './hoja.js';
import { obtenerCarpeta, subirArchivos } from './carpetas.js';
import { viajeHelper } from './viajes.js';
import { prestamoHelper } from './prestamos.js';
import { usuarioHelper } from './usuarios.js';
import { libroGastos } from './libro_gastos.js';
import { ahora, hoy, mesActual } from './fechas.js';
import { ErrorApp } from './errores.js';

// ─────────────────────────────────────────────────────────────
// Nómina de conductores. Dos liquidaciones independientes:
//
// VIAJES (cuando quieran: al cabo de 1 viaje, 2, 15 días…)
//   saldo de viajes = Σ (10 % − saldo del anticipo) de los viajes liquidados
//                   + ajustes del 10 % de viajes facturados después de liquidarse
//
// SALARIO (una vez por mes)
//   salario base + seguridad social − préstamos desembolsados (completos)
//
// En ambas se suma el "arrastre": si la nómina anterior del conductor quedó negativa,
// esa deuda se descuenta en la siguiente (de cualquier tipo). Si el total queda negativo,
// se paga 0 y la diferencia pasa a la siguiente.
//
// En Gastos_Vehiculos queda el costo real por placa: el 10 % de los viajes (nomina_viajes)
// y el salario + SSO (nomina_salario). Los anticipos y préstamos NO son costo del vehículo.
// ─────────────────────────────────────────────────────────────

const HOJA = 'Nomina_Conductores';
const CANDADO = 'nomina';
const carpetaComprobantes = process.env.CARPETA_PADRE_ID_NOMINA;

const minuscula = (v) => String(v ?? '').trim().toLowerCase();
const numero = (c) => parseInt(String(c).replace(/\D/g, ''), 10) || 0;
const redondear = (n) => Math.round(n);

const normalizar = (f) => ({
  ...f,
  consecutivo_nomina: String(f.consecutivo_nomina ?? '').trim().toUpperCase(),
  tipo: minuscula(f.tipo),
  id_conductor: minuscula(f.id_conductor),
  mes: String(f.mes ?? '').trim(),
});

async function leerNomina() {
  const { encabezados, filas } = await leerHoja(HOJA);
  return { encabezados, nominas: filas.filter((f) => f.consecutivo_nomina).map(normalizar) };
}

const sinFila = ({ _fila, ...r }) => r;

// ── Permisos ──

async function conductorGestionable(usuario, email) {
  const conductor = await usuarioHelper.getUsuarioByEmail(email);
  if (!conductor || conductor.perfil !== 'conductor') throw new ErrorApp(404, 'Conductor no encontrado');
  const esElMismo = usuario.email === conductor.email;
  if (!esElMismo && !usuarioHelper.puedeGestionar(usuario, conductor)) {
    throw new ErrorApp(403, 'Ese conductor no es de sus placas');
  }
  return conductor;
}

const exigirGestion = (usuario) => {
  if (!['administrador', 'propietario'].includes(usuario.perfil)) {
    throw new ErrorApp(403, 'Solo el propietario o el administrador liquidan la nómina');
  }
};

// ── Arrastre (deuda que viene de la nómina anterior) ──

const arrastreDe = (nominas, email) => {
  const delConductor = nominas.filter((n) => n.id_conductor === minuscula(email));
  if (!delConductor.length) return 0;
  const ultima = delConductor.sort((a, b) => numero(b.consecutivo_nomina) - numero(a.consecutivo_nomina))[0];
  return Math.min(0, aNumero(ultima.saldo_siguiente));
};

const resultado = (total) => ({
  total_nomina: redondear(total),
  valor_pagado: redondear(Math.max(0, total)),
  saldo_siguiente: redondear(Math.min(0, total)),
});

// ─────────────────────────────────────────────────────────────
// Cálculo (vista previa, no guarda nada)
// ─────────────────────────────────────────────────────────────

/** Viajes. seleccion: lista de consecutivos a liquidar (vacía = todos los pendientes) */
async function calcularViajes(usuario, conductor, seleccion = []) {
  const { por_liquidar, con_ajuste } = await viajeHelper.pendientesConductor(
    usuario.perfil === 'conductor' ? null : usuario,
    conductor.email
  );
  const elegidos = seleccion.length
    ? por_liquidar.filter((v) => seleccion.map((s) => String(s).toUpperCase()).includes(v.consecutivo))
    : por_liquidar;

  const diez = elegidos.reduce((s, v) => s + aNumero(v.diez_pcto), 0);
  const saldoAnticipos = elegidos.reduce((s, v) => s + aNumero(v.saldo_anticipo_conductor), 0);
  const saldoViajes = elegidos.reduce((s, v) => s + aNumero(v.saldo_pendiente_conductor), 0);
  const ajustes = con_ajuste.reduce((s, v) => s + aNumero(v.ajuste_diez_pcto_pendiente), 0);

  const { nominas } = await leerNomina();
  const arrastre = arrastreDe(nominas, conductor.email);

  return {
    tipo: 'viajes',
    id_conductor: conductor.email,
    nombre: conductor.nombre,
    mes: mesActual(),
    viajes: elegidos.map((v) => ({
      consecutivo: v.consecutivo,
      placa: v.placa,
      destino: v.destino,
      fecha_inicio: v.fecha_inicio,
      estado_viaje: v.estado_viaje,
      diez_pcto: aNumero(v.diez_pcto),
      saldo_anticipo_conductor: aNumero(v.saldo_anticipo_conductor),
      saldo_pendiente_conductor: aNumero(v.saldo_pendiente_conductor),
    })),
    viajes_disponibles: por_liquidar.map((v) => v.consecutivo),
    ajustes: con_ajuste.map((v) => ({ consecutivo: v.consecutivo, placa: v.placa, ajuste: aNumero(v.ajuste_diez_pcto_pendiente) })),
    total_viajes_mes: elegidos.length,
    diez_pcto_total_mes: redondear(diez),
    saldo_anticipo_total_mes: redondear(saldoAnticipos),
    saldo_viajes: redondear(saldoViajes),
    ajustes_diez_pcto: redondear(ajustes),
    arrastre_anterior: arrastre,
    ...resultado(saldoViajes + ajustes + arrastre),
  };
}

/** Salario del mes 'AAAA-MM' */
async function calcularSalario(conductor, mes) {
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new ErrorApp(400, 'Mes no válido (AAAA-MM)');

  const salario = redondear(aNumero(conductor.salario_base));
  const sso = redondear(aNumero(conductor.sso));
  if (!salario) throw new ErrorApp(400, `${conductor.nombre} no tiene salario base configurado en Usuarios`);

  const prestamos = await prestamoHelper.desembolsadosSinDescontar(conductor.email);
  const totalPrestamos = prestamos.reduce((s, p) => s + aNumero(p.valor_prestado), 0);

  const { nominas } = await leerNomina();
  const yaPagada = nominas.find((n) => n.id_conductor === conductor.email && n.tipo === 'salario' && n.mes === mes);
  const arrastre = arrastreDe(nominas, conductor.email);

  return {
    tipo: 'salario',
    id_conductor: conductor.email,
    nombre: conductor.nombre,
    mes,
    ya_pagada: yaPagada ? yaPagada.consecutivo_nomina : '',
    salario_base: salario,
    sso,
    prestamos: prestamos.map((p) => ({
      consecutivo: p.consecutivo,
      valor_prestado: aNumero(p.valor_prestado),
      fecha_desembolso: p.fecha_desembolso,
    })),
    total_prestamos: redondear(totalPrestamos),
    arrastre_anterior: arrastre,
    ...resultado(salario + sso - totalPrestamos + arrastre),
  };
}

const calcular = async (usuario, email, { tipo = 'viajes', mes = '', viajes = [] } = {}) => {
  const conductor = await conductorGestionable(usuario, email);
  return tipo === 'salario' ? calcularSalario(conductor, mes || mesActual()) : calcularViajes(usuario, conductor, viajes);
};

// ─────────────────────────────────────────────────────────────
// Liquidar (guarda)
// ─────────────────────────────────────────────────────────────

async function subirComprobante(archivos, consecutivo) {
  if (!archivos?.length) return '';
  if (!carpetaComprobantes) {
    throw new ErrorApp(500, 'Falta CARPETA_PADRE_ID_NOMINA en el .env para guardar comprobantes de nómina');
  }
  const carpeta = await obtenerCarpeta(consecutivo, carpetaComprobantes);
  await subirArchivos(archivos, carpeta.id, 'Pago - ');
  return carpeta.link;
}

const liquidarViajes = (usuario, email, { viajes = [], notas = '' } = {}, archivos = []) =>
  conCandado(CANDADO, async () => {
    exigirGestion(usuario);
    const conductor = await conductorGestionable(usuario, email);
    const calculo = await calcularViajes(usuario, conductor, viajes);

    if (!calculo.viajes.length && !calculo.ajustes.length) {
      throw new ErrorApp(409, `${conductor.nombre} no tiene viajes aprobados pendientes de liquidar`);
    }

    const { encabezados, nominas } = await leerNomina();
    const consecutivo = siguienteConsecutivo(nominas, 'consecutivo_nomina', 'NOM');
    const link = await subirComprobante(archivos, consecutivo);
    const placas = [...new Set(calculo.viajes.map((v) => v.placa))];

    await agregarFila(HOJA, encabezados, {
      consecutivo_nomina: consecutivo,
      tipo: 'viajes',
      mes: calculo.mes,
      id_conductor: conductor.email,
      nombre: conductor.nombre,
      fecha_liquidacion: ahora(),
      liquidado_por: usuario.email,
      viajes_liquidados: calculo.viajes.map((v) => v.consecutivo).join(', '),
      total_viajes_mes: calculo.total_viajes_mes,
      diez_pcto_total_mes: calculo.diez_pcto_total_mes,
      saldo_anticipo_total_mes: calculo.saldo_anticipo_total_mes,
      saldo_viajes: calculo.saldo_viajes,
      viajes_con_ajuste: calculo.ajustes.map((a) => a.consecutivo).join(', '),
      ajustes_diez_pcto: calculo.ajustes_diez_pcto,
      arrastre_anterior: calculo.arrastre_anterior,
      total_nomina: calculo.total_nomina,
      valor_pagado: calculo.valor_pagado,
      saldo_siguiente: calculo.saldo_siguiente,
      fecha_pago: hoy(),
      link_comprobante: link,
      placas: placas.join(', '),
      notas: String(notas ?? '').trim(),
    });

    await viajeHelper.marcarViajesLiquidados(calculo.viajes.map((v) => v.consecutivo), consecutivo);
    if (calculo.ajustes.length) await viajeHelper.aplicarAjustes(calculo.ajustes.map((a) => a.consecutivo));

    // Costo del 10 % por placa (incluye ajustes)
    const porPlaca = {};
    calculo.viajes.forEach((v) => {
      porPlaca[v.placa] = (porPlaca[v.placa] || 0) + v.diez_pcto;
    });
    calculo.ajustes.forEach((a) => {
      porPlaca[a.placa] = (porPlaca[a.placa] || 0) + a.ajuste;
    });
    for (const [placa, valor] of Object.entries(porPlaca)) {
      await libroGastos.registrarOActualizar({
        placa,
        tipo_gasto: 'nomina_viajes',
        codigo_referencia: consecutivo,
        valor_gasto: valor,
        descripcion: `10 % viajes ${conductor.nombre} (${consecutivo})`,
        fecha_registro: hoy(),
        link_soporte: link,
      });
    }

    return { consecutivo_nomina: consecutivo, ...calculo };
  });

const pagarSalario = (usuario, email, { mes = '', notas = '' } = {}, archivos = []) =>
  conCandado(CANDADO, async () => {
    exigirGestion(usuario);
    const conductor = await conductorGestionable(usuario, email);
    const calculo = await calcularSalario(conductor, mes || mesActual());
    if (calculo.ya_pagada) throw new ErrorApp(409, `El salario de ${calculo.mes} ya se pagó (${calculo.ya_pagada})`);

    const { encabezados, nominas } = await leerNomina();
    const consecutivo = siguienteConsecutivo(nominas, 'consecutivo_nomina', 'NOM');
    const link = await subirComprobante(archivos, consecutivo);
    const placas = usuarioHelper.placasDe(conductor);

    await agregarFila(HOJA, encabezados, {
      consecutivo_nomina: consecutivo,
      tipo: 'salario',
      mes: calculo.mes,
      id_conductor: conductor.email,
      nombre: conductor.nombre,
      fecha_liquidacion: ahora(),
      liquidado_por: usuario.email,
      salario_base: calculo.salario_base,
      sso: calculo.sso,
      prestamos_descontados: calculo.prestamos.map((p) => p.consecutivo).join(', '),
      total_prestamos: calculo.total_prestamos,
      arrastre_anterior: calculo.arrastre_anterior,
      total_nomina: calculo.total_nomina,
      valor_pagado: calculo.valor_pagado,
      saldo_siguiente: calculo.saldo_siguiente,
      fecha_pago: hoy(),
      link_comprobante: link,
      placas: placas.join(', '),
      notas: String(notas ?? '').trim(),
    });

    if (calculo.prestamos.length) {
      await prestamoHelper.marcarLiquidados(calculo.prestamos.map((p) => p.consecutivo), consecutivo);
    }

    // Salario + SSO es costo del vehículo; si maneja varias placas se reparte por partes iguales
    const costo = calculo.salario_base + calculo.sso;
    for (const placa of placas) {
      await libroGastos.registrarOActualizar({
        placa,
        tipo_gasto: 'nomina_salario',
        codigo_referencia: consecutivo,
        valor_gasto: costo / placas.length,
        descripcion: `Salario + SSO ${calculo.mes} ${conductor.nombre} (${consecutivo})`,
        fecha_registro: hoy(),
        link_soporte: link,
      });
    }

    return { consecutivo_nomina: consecutivo, ...calculo };
  });

// ─────────────────────────────────────────────────────────────
// Consultas
// ─────────────────────────────────────────────────────────────

/** Historial visible: admin todo; propietario sus conductores; conductor lo suyo */
const historial = async (usuario, { tipo = '', email = '' } = {}) => {
  const { nominas } = await leerNomina();
  const visibles = [];
  for (const n of nominas) {
    if (usuario.perfil === 'administrador' || n.id_conductor === usuario.email) {
      visibles.push(n);
      continue;
    }
    const conductor = await usuarioHelper.getUsuarioByEmail(n.id_conductor);
    if (usuarioHelper.puedeGestionar(usuario, conductor)) visibles.push(n);
  }
  return visibles
    .filter((n) => (!tipo || n.tipo === minuscula(tipo)) && (!email || n.id_conductor === minuscula(email)))
    .sort((a, b) => numero(b.consecutivo_nomina) - numero(a.consecutivo_nomina))
    .map(sinFila);
};

const obtener = async (usuario, consecutivo) => {
  const lista = await historial(usuario);
  const nomina = lista.find((n) => n.consecutivo_nomina === String(consecutivo ?? '').trim().toUpperCase());
  if (!nomina) throw new ErrorApp(404, 'Nómina no encontrada');
  return nomina;
};

/**
 * Resumen por conductor de lo pendiente (pantalla "Por liquidar").
 * Conductor: solo él. Propietario: sus conductores. Admin: todos los conductores activos.
 */
const pendientes = async (usuario) => {
  let conductores;
  if (usuario.perfil === 'conductor') {
    conductores = [await usuarioHelper.getUsuarioByEmail(usuario.email)];
  } else {
    conductores = (await usuarioHelper.getUsuarios()).filter(
      (u) => u.perfil === 'conductor' && u.estado === 'activo' && usuarioHelper.puedeGestionar(usuario, u)
    );
  }

  const { nominas } = await leerNomina();
  const mes = mesActual();
  const lista = [];

  for (const c of conductores.filter(Boolean)) {
    const { por_liquidar, con_ajuste } = await viajeHelper.pendientesConductor(usuario.perfil === 'conductor' ? null : usuario, c.email);
    const prestamos = await prestamoHelper.desembolsadosSinDescontar(c.email);
    const saldoViajes = por_liquidar.reduce((s, v) => s + aNumero(v.saldo_pendiente_conductor), 0);
    const ajustes = con_ajuste.reduce((s, v) => s + aNumero(v.ajuste_diez_pcto_pendiente), 0);
    lista.push({
      email: c.email,
      nombre: c.nombre,
      placas: usuarioHelper.placasDe(c).join(', '),
      viajes_por_liquidar: por_liquidar.length,
      saldo_viajes: redondear(saldoViajes),
      ajustes_diez_pcto: redondear(ajustes),
      prestamos_por_descontar: redondear(prestamos.reduce((s, p) => s + aNumero(p.valor_prestado), 0)),
      arrastre_anterior: arrastreDe(nominas, c.email),
      salario_mes_pagado: nominas.some((n) => n.id_conductor === c.email && n.tipo === 'salario' && n.mes === mes),
      salario_base: redondear(aNumero(c.salario_base)),
      sso: redondear(aNumero(c.sso)),
      mes,
    });
  }
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
};

// Compatibilidad: las alertas y otros módulos usan getNominaConductores
const getNominaConductores = async () => (await leerNomina()).nominas.map(sinFila);

export const nominaHelper = {
  calcular,
  liquidarViajes,
  pagarSalario,
  historial,
  obtener,
  pendientes,
  getNominaConductores,
};
