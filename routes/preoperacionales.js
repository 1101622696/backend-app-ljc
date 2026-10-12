import { Router } from 'express'
import httpPreoperacionales from '../controllers/preoperacionales.js'
import { validarJWT } from '../middlewares/validar-jwt.js'
import { tieneRol, validarPlaca, GESTION, TODOS } from '../middlewares/validar-rol.js'
import multer from 'multer';

const router = Router()
const upload = multer({ storage: multer.memoryStorage() });

// El listado general lo usan los 3 perfiles; el controlador filtra por placas si no es admin
router.get('/', [validarJWT, tieneRol(TODOS)], httpPreoperacionales.obtenerPreoperacionales)
router.get('/obtenerdatospreoperacional/:consecutivo', [validarJWT, tieneRol(TODOS)], httpPreoperacionales.obtenerPreoperacionalPorConsecutivo);
router.get('/resumen-solicitante/placa/:placa', [validarJWT, tieneRol(TODOS), validarPlaca()], httpPreoperacionales.obtenerResumenPorPlaca);

router.post('/crear', [validarJWT, tieneRol(TODOS), upload.array('archivos'), validarPlaca('body')], httpPreoperacionales.crearPreoperacional);
router.put('/editar/:consecutivo', [validarJWT, tieneRol(GESTION), upload.array('archivos'), validarPlaca('body')], httpPreoperacionales.editarPreoperacional)

export default router
