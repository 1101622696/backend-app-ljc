import { driveHelper } from '../helpers/drive.js';

const estadoDesdeError = (error) => {
  const codigo = error?.code || error?.status;
  return codigo === 400 || codigo === 404 ? codigo : 500;
};

const mensajeDe = (estado, porDefecto) =>
  estado === 404 ? 'No se encontraron los archivos' : estado === 400 ? 'Identificador de Drive no válido' : porDefecto;

const httpDrive = {
  /**
   * GET /api/drive/archivos
   *   ?folderId=XXX  → archivos de la carpeta
   *   ?fileId=XXX    → [metadata del archivo]
   *   ?id=XXX        → detecta solo si es carpeta o archivo
   * Solo lo que el usuario puede ver (ver helpers/drive.js).
   */
  listarArchivos: async (req, res) => {
    try {
      const { folderId, fileId, id } = req.query;
      const objetivo = String(id || fileId || folderId || '');
      if (!objetivo) return res.status(400).json({ mensaje: 'Se requiere folderId, fileId o id' });

      const meta = await driveHelper.metadataConPermiso(req.usuariobdtoken, objetivo);

      if (driveHelper.esCarpeta(meta.mimeType)) {
        return res.json(await driveHelper.listarArchivosCarpeta(meta.id));
      }
      const { name, mimeType, size, modifiedTime } = meta;
      res.json([{ id: meta.id, name, mimeType, size, modifiedTime }]);
    } catch (error) {
      const estado = estadoDesdeError(error);
      if (estado === 500) console.error('Error al listar archivos Drive:', error.message);
      res.status(estado).json({ mensaje: mensajeDe(estado, 'Error al listar archivos') });
    }
  },

  /** GET /api/drive/archivo/:fileId → el archivo en sí (la app lo pide con el token y lo recibe como blob) */
  servirArchivo: async (req, res) => {
    try {
      const meta = await driveHelper.metadataConPermiso(req.usuariobdtoken, req.params.fileId);

      if (driveHelper.esCarpeta(meta.mimeType)) {
        return res.status(400).json({ mensaje: 'El identificador corresponde a una carpeta' });
      }
      if (driveHelper.esDocumentoGoogle(meta.mimeType)) {
        return res.status(415).json({ mensaje: 'Los documentos de Google no se pueden descargar directamente' });
      }

      const stream = await driveHelper.obtenerStreamArchivo(meta.id);

      // filename*=UTF-8'' permite tildes y ñ; con filename="Revisión.pdf" Node lanza error
      const nombreCodificado = encodeURIComponent(meta.name || 'archivo');
      const tipo = meta.mimeType || 'application/octet-stream';
      // Imágenes y PDF se muestran; lo demás (html, svg, office…) se entrega como descarga y sin ejecutar nada
      const seMuestra = /^image\/(jpeg|png|gif|webp|heic|heif)$/i.test(tipo) || tipo === 'application/pdf';
      res.setHeader('Content-Type', tipo);
      res.setHeader('Content-Disposition', `${seMuestra ? 'inline' : 'attachment'}; filename="archivo"; filename*=UTF-8''${nombreCodificado}`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', 'sandbox');
      // Sin caché HTTP: el permiso se revisa en cada petición (la app guarda su propia copia en memoria)
      res.setHeader('Cache-Control', 'private, no-store');
      if (meta.size) res.setHeader('Content-Length', meta.size);

      stream.on('error', (error) => {
        console.error('Error en el stream de Drive:', error.message);
        if (!res.headersSent) {
          ['Content-Type', 'Content-Disposition', 'Content-Length', 'Content-Security-Policy'].forEach((h) => res.removeHeader(h));
          res.status(500).json({ mensaje: 'Error al obtener archivo' });
        } else {
          res.destroy(error); // corta la descarga en vez de dejarla colgada
        }
      });

      stream.pipe(res);
    } catch (error) {
      const estado = estadoDesdeError(error);
      if (estado === 500) console.error('Error al servir archivo Drive:', error.message);
      if (!res.headersSent) {
        res.status(estado).json({ mensaje: estado === 404 ? 'Archivo no encontrado' : mensajeDe(estado, 'Error al obtener archivo') });
      }
    }
  },
};

export default httpDrive;
