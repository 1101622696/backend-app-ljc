import { Router } from 'express';
import httpDrive from '../controllers/drive.js';
import { validarJWT } from '../middlewares/validar-jwt.js';

const router = Router();

// GET /api/drive/archivos?folderId=xxx  → lista archivos de carpeta
// GET /api/drive/archivos?fileId=xxx    → metadata de un archivo
// router.get('/archivos', [validarJWT], httpDrive.listarArchivos);
router.get('/archivos', httpDrive.listarArchivos);

// GET /api/drive/archivo/:fileId        → sirve el archivo como stream
router.get('/archivo/:fileId', httpDrive.servirArchivo);

export default router;