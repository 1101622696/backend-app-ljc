import { getDriveClient } from '../services/google.js';

const listarArchivosCarpeta = async (folderId) => {
  const drive = getDriveClient();
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'name',
  });
  return response.data.files;
};

const obtenerMetadataArchivo = async (fileId) => {
  const drive = getDriveClient();
  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType',
  });
  return [meta.data];
};

const obtenerStreamArchivo = async (fileId) => {
  const drive = getDriveClient();
  const meta = await drive.files.get({
    fileId,
    fields: 'name, mimeType',
  });
  const stream = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  return {
    nombre: meta.data.name,
    mimeType: meta.data.mimeType,
    stream: stream.data,
  };
};

export const driveHelper = {
  listarArchivosCarpeta,
  obtenerMetadataArchivo,
  obtenerStreamArchivo,
};