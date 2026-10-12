import { leerHoja, agregarFila } from './hoja.js';
import { ahora, minutosDesde } from './fechas.js';

// Hoja "Accesos": registro de inicios de sesión y bloqueo por intentos fallidos.
// Encabezados: fecha | email | resultado | motivo | ip | version_app
//
// Regla: 5 intentos fallidos seguidos en 15 minutos → bloqueado 15 minutos.
// Como queda en la hoja, el bloqueo sobrevive a los reinicios de Render.

const HOJA = 'Accesos';
const MAX_FALLIDOS = 5;
const VENTANA_MIN = 15;

let encabezadosCache = null;

async function obtenerEncabezados() {
  if (!encabezadosCache) {
    const { encabezados } = await leerHoja(`${HOJA}!1:1`);
    encabezadosCache = encabezados;
  }
  return encabezadosCache;
}

/** Nunca lanza error: si la hoja no existe, solo avisa en el log */
async function registrarAcceso({ email, resultado, motivo = '', ip = '', version = '' }) {
  try {
    const encabezados = await obtenerEncabezados();
    if (!encabezados.length) {
      console.warn('[accesos] La hoja "Accesos" no existe o no tiene encabezados');
      return;
    }
    await agregarFila(HOJA, encabezados, {
      fecha: ahora(),
      email: String(email || '').toLowerCase(),
      resultado,
      motivo,
      ip,
      version_app: version,
    });
  } catch (error) {
    console.warn('[accesos] No se pudo registrar el acceso:', error.message);
  }
}

/** { bloqueado: boolean, minutos: number } */
async function estaBloqueado(email) {
  try {
    const { filas } = await leerHoja(HOJA);
    const correo = String(email || '').toLowerCase();

    const recientes = filas
      .filter((f) => String(f.email).toLowerCase() === correo && minutosDesde(f.fecha) <= VENTANA_MIN)
      .sort((a, b) => a._fila - b._fila);

    // Fallidos seguidos desde el último ingreso correcto
    let seguidos = 0;
    let ultimoFallo = null;
    for (const f of recientes) {
      if (f.resultado === 'ok') {
        seguidos = 0;
        ultimoFallo = null;
      } else if (f.resultado === 'fallido') {
        seguidos++;
        ultimoFallo = f.fecha;
      }
    }

    if (seguidos >= MAX_FALLIDOS) {
      const restantes = Math.max(1, Math.ceil(VENTANA_MIN - minutosDesde(ultimoFallo)));
      return { bloqueado: true, minutos: restantes };
    }
    return { bloqueado: false, minutos: 0 };
  } catch (error) {
    console.warn('[accesos] No se pudo revisar el bloqueo:', error.message);
    return { bloqueado: false, minutos: 0 };
  }
}

export const accesosHelper = { registrarAcceso, estaBloqueado };
