import { Router } from 'express';
import httpDrive from '../controllers/drive.js';
import { validarJWT } from '../middlewares/validar-jwt.js';

const router = Router();

router.get('/archivos', httpDrive.listarArchivos);
router.get('/archivo/:fileId', httpDrive.servirArchivo);

export default router;