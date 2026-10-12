import { Router } from 'express'
import httpSolicitudes from '../controllers/solicitudes.js'
import { validarJWT } from '../middlewares/validar-jwt.js'
import { tieneRol, validarPlaca, ADMIN, TODOS } from '../middlewares/validar-rol.js'
import multer from 'multer';

const router = Router()
const upload = multer({ storage: multer.memoryStorage() });

// Solicitudes de mantenimiento: el conductor las crea y ve las de su placa
router.get('/', [validarJWT, tieneRol(ADMIN)], httpSolicitudes.obtenerSolicitudes)
router.get('/obtenerdatossolicitud/:consecutivo', [validarJWT, tieneRol(TODOS)], httpSolicitudes.obtenerSolicitudPorConsecutivo);
router.get('/resumen-solicitante/placa/:placa', [validarJWT, tieneRol(TODOS), validarPlaca()], httpSolicitudes.obtenerResumenPorPlaca);

// multer solo procesa FormData; si llega JSON (sin fotos) lo deja pasar y req.body viene de express.json()
router.post('/crear', [validarJWT, tieneRol(TODOS), upload.array('archivos'), validarPlaca('body')], httpSolicitudes.crearSolicitud);

export default router
