import { getSheetsClient } from '../services/google.js';

// Acceso a las hojas POR NOMBRE DE COLUMNA (encabezado), no por posición.
// Así agregar o mover columnas en el Sheet no daña nada.
// Este archivo crece en el bloque 3; por ahora lo usan usuarios y accesos.

const spreadsheetId = process.env.SPREADSHEET_ID;

export const normalizarEncabezado = (h) => String(h ?? '').trim().toLowerCase();

/** 1 → A, 27 → AA */
export const letraColumna = (numero) => {
  let letra = '';
  while (numero > 0) {
    const resto = (numero - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    numero = Math.floor((numero - 1) / 26);
  }
  return letra;
};

/**
 * Lee la hoja completa (sin límite fijo de filas).
 * Los números llegan como números (UNFORMATTED_VALUE): '1.250.000' ya no se lee como 1,25.
 * Cada fila trae _fila = número de la fila en el Sheet (para actualizarla después).
 */
export async function leerHoja(nombreHoja) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: nombreHoja,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const valores = res.data.values || [];
  if (!valores.length) return { encabezados: [], filas: [] };

  const encabezados = valores[0].map(normalizarEncabezado);
  const filas = [];

  for (let i = 1; i < valores.length; i++) {
    const fila = valores[i] || [];
    if (!fila.some((v) => v !== '' && v !== null && v !== undefined)) continue; // fila vacía
    const objeto = { _fila: i + 1 };
    encabezados.forEach((encabezado, j) => {
      if (encabezado) objeto[encabezado] = fila[j] ?? '';
    });
    filas.push(objeto);
  }

  return { encabezados, filas };
}

/**
 * Actualiza solo las celdas indicadas de una fila: { columna: valor }.
 * Las demás celdas de la fila no se tocan.
 * opciones.omitirFaltantes: si la columna no existe, la salta (con aviso en el log) en vez de fallar.
 */
export async function actualizarCampos(nombreHoja, encabezados, numeroFila, cambios, opciones = {}) {
  const data = [];

  for (const [campo, valor] of Object.entries(cambios)) {
    const indice = encabezados.indexOf(normalizarEncabezado(campo));
    if (indice === -1) {
      if (opciones.omitirFaltantes) {
        console.warn(`[hoja] ${nombreHoja} no tiene la columna "${campo}". Agréguela al final de los encabezados.`);
        continue;
      }
      throw new Error(`La hoja ${nombreHoja} no tiene la columna "${campo}"`);
    }
    data.push({
      range: `${nombreHoja}!${letraColumna(indice + 1)}${numeroFila}`,
      values: [[valor ?? '']],
    });
  }

  if (!data.length) return;

  await getSheetsClient().spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'RAW', data },
  });
}

/** Agrega una fila al final usando los encabezados para ubicar cada valor */
export async function agregarFila(nombreHoja, encabezados, objeto) {
  const fila = encabezados.map((encabezado) => (encabezado ? objeto[encabezado] ?? '' : ''));

  await getSheetsClient().spreadsheets.values.append({
    spreadsheetId,
    range: `${nombreHoja}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [fila] },
  });
}

/** Avisa en el log qué columnas faltan en una hoja (se llama al iniciar el servidor) */
export async function verificarColumnas(nombreHoja, requeridas) {
  try {
    const { encabezados } = await leerHoja(`${nombreHoja}!1:1`);
    const faltan = requeridas.filter((c) => !encabezados.includes(normalizarEncabezado(c)));
    if (faltan.length) {
      console.warn(`[hoja] A la hoja "${nombreHoja}" le faltan las columnas: ${faltan.join(', ')}`);
    }
    return faltan;
  } catch (error) {
    console.warn(`[hoja] No se pudo revisar la hoja "${nombreHoja}": ${error.message}`);
    return requeridas;
  }
}

/**
 * Convierte a número lo que venga del formulario o de la hoja, entendiendo formato colombiano:
 *   1250000 | '1250000' | '1.250.000' | '$ 1.250.000' | '12,5' | '12.5' → número
 * Vacío o inválido → 0
 */
export const aNumero = (valor) => {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  let texto = String(valor ?? '').replace(/[$\s]/g, '').replace(/COP/i, '');
  if (!texto) return 0;
  // Formato colombiano: el punto es de miles (1.250.000 · 600.000 · 1.250.000,5) y la coma es decimal.
  // Excepción: 0.966 no puede ser de miles. Los decimales (galones) se envían con coma: 117,883.
  if (/^-?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(texto)) texto = texto.replace(/\./g, '');
  texto = texto.replace(',', '.');
  const numero = parseFloat(texto);
  return Number.isFinite(numero) ? numero : 0;
};

/** Siguiente consecutivo tipo 'V-12' a partir de las filas ya leídas */
export const siguienteConsecutivo = (filas, campo, prefijo) => {
  const maximo = filas.reduce((max, f) => {
    const n = parseInt(String(f[campo] ?? '').replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefijo}-${maximo + 1}`;
};

/**
 * Ejecuta las tareas con la misma llave una detrás de otra (nunca al tiempo).
 * Evita consecutivos repetidos y que un doble toque cierre/apruebe un viaje dos veces.
 * Funciona porque el backend corre en una sola instancia (Render).
 */
const colas = new Map();
export const conCandado = (llave, tarea) => {
  const anterior = colas.get(llave) || Promise.resolve();
  const actual = anterior.catch(() => {}).then(tarea);
  colas.set(llave, actual);
  actual.finally(() => {
    if (colas.get(llave) === actual) colas.delete(llave);
  }).catch(() => {});
  return actual;
};

export const hoja = {
  leerHoja,
  actualizarCampos,
  agregarFila,
  verificarColumnas,
  letraColumna,
  normalizarEncabezado,
  aNumero,
  siguienteConsecutivo,
  conCandado,
};
