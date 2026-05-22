import { driveHelper } from '../helpers/drive.js';

const httpDrive = {

  listarArchivos: async (req, res) => {
    try {
      const { folderId, fileId } = req.query;

      if (!folderId && !fileId) {
        return res.status(400).json({ mensaje: 'Se requiere folderId o fileId' });
      }

      const archivos = fileId
        ? await driveHelper.obtenerMetadataArchivo(fileId)
        : await driveHelper.listarArchivosCarpeta(folderId);

      res.json(archivos);
    } catch (error) {
      console.error('Error al listar archivos Drive:', error);
      res.status(500).json({ mensaje: 'Error al listar archivos' });
    }
  },

  servirArchivo: async (req, res) => {
    try {
      const { fileId } = req.params;
      const { nombre, mimeType, stream } = await driveHelper.obtenerStreamArchivo(fileId);

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      stream.pipe(res);
    } catch (error) {
      console.error('Error al servir archivo Drive:', error);
      res.status(500).json({ mensaje: 'Error al obtener archivo' });
    }
  },
};

export default httpDrive;