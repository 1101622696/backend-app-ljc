// Todas las fechas de la app en hora de Colombia (UTC-5, sin horario de verano).
// Regla: en la hoja las fechas se guardan como texto 'AAAA-MM-DD' y las fechas con hora
// como 'AAAA-MM-DDTHH:mm:ss-05:00'. Nunca usar new Date().toISOString() para guardar fechas:
// después de las 7 p. m. da el día siguiente.

const DESFASE_MS = 5 * 60 * 60 * 1000;

const dos = (n) => String(n).padStart(2, '0');

/** Fecha y hora actual de Colombia: '2026-10-11T19:45:03-05:00' */
export const ahora = () => {
  const local = new Date(Date.now() - DESFASE_MS).toISOString(); // hora Colombia escrita como si fuera UTC
  return `${local.slice(0, 19)}-05:00`;
};

/** Fecha actual de Colombia: '2026-10-11' */
export const hoy = () => ahora().slice(0, 10);

/** Mes actual de Colombia: '2026-10' */
export const mesActual = () => hoy().slice(0, 7);

/**
 * Convierte lo que venga de la hoja o del formulario en Date (o null).
 * Acepta: '2026-10-11', '2026-10-11T08:00:00-05:00', ISO con Z, '11/10/2026', '11-10-2026',
 * números de serie de Sheets (días desde 1899-12-30) y objetos Date.
 * Las fechas sin hora se interpretan como medianoche de Colombia.
 */
export const parsearFecha = (valor) => {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date) return isNaN(valor) ? null : valor;

  if (typeof valor === 'number') {
    // Serie de Sheets
    const ms = Math.round((valor - 25569) * 86400 * 1000) + DESFASE_MS;
    const fecha = new Date(ms);
    return isNaN(fecha) ? null : fecha;
  }

  const texto = String(valor).trim();

  // AAAA-MM-DD (opcionalmente con hora)
  let m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const tieneZona = /([+-]\d{2}:?\d{2}|Z)$/.test(texto);
    if (m[4] && tieneZona) {
      const fecha = new Date(texto);
      return isNaN(fecha) ? null : fecha;
    }
    const [, a, mes, d, h = '0', min = '0', s = '0'] = m;
    const fecha = new Date(`${a}-${dos(mes)}-${dos(d)}T${dos(h)}:${dos(min)}:${dos(s)}-05:00`);
    return isNaN(fecha) ? null : fecha;
  }

  // DD/MM/AAAA o DD-MM-AAAA (formato colombiano). Si el "mes" pasa de 12, se asume MM/DD.
  m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    let [, d, mes, a] = m;
    if (Number(mes) > 12 && Number(d) <= 12) [d, mes] = [mes, d];
    const fecha = new Date(`${a}-${dos(mes)}-${dos(d)}T00:00:00-05:00`);
    return isNaN(fecha) ? null : fecha;
  }

  const fecha = new Date(texto);
  return isNaN(fecha) ? null : fecha;
};

/** Cualquier fecha → 'AAAA-MM-DD' en hora Colombia ('' si no es válida) */
export const aFechaISO = (valor) => {
  const fecha = parsearFecha(valor);
  if (!fecha) return '';
  return new Date(fecha.getTime() - DESFASE_MS).toISOString().slice(0, 10);
};

/** Suma días a una fecha y devuelve 'AAAA-MM-DD' */
export const sumarDias = (valor, dias) => {
  const fecha = parsearFecha(valor);
  if (!fecha) return '';
  return aFechaISO(new Date(fecha.getTime() + dias * 86400000));
};

/** Suma años a una fecha y devuelve 'AAAA-MM-DD' (29 de febrero → 28) */
export const sumarAnios = (valor, anios) => {
  const iso = aFechaISO(valor);
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  const nuevoAnio = a + anios;
  const diasDelMes = new Date(Date.UTC(nuevoAnio, m, 0)).getUTCDate();
  return `${nuevoAnio}-${dos(m)}-${dos(Math.min(d, diasDelMes))}`;
};

/** Días completos entre dos fechas (b - a). Negativo si b es anterior */
export const diasEntre = (a, b) => {
  const fa = parsearFecha(aFechaISO(a));
  const fb = parsearFecha(aFechaISO(b));
  if (!fa || !fb) return null;
  return Math.round((fb - fa) / 86400000);
};

/** Minutos transcurridos desde una fecha hasta ahora */
export const minutosDesde = (valor) => {
  const fecha = parsearFecha(valor);
  if (!fecha) return Infinity;
  return (Date.now() - fecha.getTime()) / 60000;
};

export const fechas = { ahora, hoy, mesActual, parsearFecha, aFechaISO, sumarDias, sumarAnios, diasEntre, minutosDesde };
