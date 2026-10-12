import { Router } from 'express';
import httpDrive from '../controllers/drive.js';
import { validarJWT } from '../middlewares/validar-jwt.js';
import { tieneRol, TODOS } from '../middlewares/validar-rol.js';

const router = Router();

// Ambas exigen sesión. La app envía el token en el encabezado (x-token) y recibe el archivo como blob;
// ya no hay <img src="..."> directo al backend. El permiso por registro lo revisa helpers/drive.js.
router.get('/archivos', [validarJWT, tieneRol(TODOS)], httpDrive.listarArchivos);
router.get('/archivo/:fileId', [validarJWT, tieneRol(TODOS)], httpDrive.servirArchivo);

export default router;
