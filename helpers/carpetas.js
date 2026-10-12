import stream from 'stream';
import { getDriveClient } from '../services/google.js';

// Carpetas y archivos en Drive.
// - Escapa comillas en los nombres (antes un nombre con ' rompía la consulta)
// - Ignora carpetas en la papelera (antes podía reutilizar una carpeta borrada)
// - Recuerda los ids ya encontrados para no consultar Drive cada vez

const TIPO_CARPETA = 'application/vnd.google-apps.folder';
const cacheCarpetas = new Map();

const escapar = (texto) => String(texto).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export const linkCarpeta = (id) => (id ? `https://drive.google.com/drive/folders/${id}` : '');

/** Busca la carpeta por nombre dentro de padreId; si no existe la crea. Devuelve { id, link } */
export async function obtenerCarpeta(nombre, padreId) {
  if (!padreId) throw new Error(`Falta la carpeta padre para "${nombre}" (revise el .env)`);
  const llave = `${padreId}/${nombre}`;
  if (cacheCarpetas.has(llave)) return cacheCarpetas.get(llave);

  const drive = getDriveClient();
  const respuesta = await drive.files.list({
    q: `name = '${escapar(nombre)}' and mimeType = '${TIPO_CARPETA}' and '${escapar(padreId)}' in parents and trashed = false`,
    fields: 'files(id)',
    spaces: 'drive',
    pageSize: 1,
  });

  let id = respuesta.data.files?.[0]?.id;
  if (!id) {
    const creada = await drive.files.create({
      requestBody: { name: nombre, mimeType: TIPO_CARPETA, parents: [padreId] },
      fields: 'id',
    });
    id = creada.data.id;
  }

  const carpeta = { id, link: linkCarpeta(id) };
  cacheCarpetas.set(llave, carpeta);
  return carpeta;
}

/** Sube archivos de multer a la carpeta. prefijo se antepone al nombre (ej. 'peajes - ') */
export async function subirArchivos(archivos, carpetaId, prefijo = '') {
  const drive = getDriveClient();
  const subidos = [];
  for (const archivo of archivos || []) {
    const cuerpo = new stream.PassThrough();
    cuerpo.end(archivo.buffer);
    const respuesta = await drive.files.create({
      requestBody: { name: `${prefijo}${archivo.originalname}`, parents: [carpetaId] },
      media: { mimeType: archivo.mimetype, body: cuerpo },
      fields: 'id, webViewLink',
    });
    subidos.push(respuesta.data);
  }
  return subidos;
}

export const carpetasHelper = { obtenerCarpeta, subirArchivos, linkCarpeta };
