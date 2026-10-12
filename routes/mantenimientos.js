import { Router } from 'express'
import httpMantenimientos from '../controllers/mantenimientos.js'
import { validarJWT } from '../middlewares/validar-jwt.js'
import { tieneRol, validarPlaca, ADMIN, GESTION } from '../middlewares/validar-rol.js'
import multer from 'multer';

const router = Router()
const upload = multer({ storage: multer.memoryStorage() });

// Mantenimientos: administrador y propietario (el conductor usa Solicitudes)
router.get('/', [validarJWT, tieneRol(ADMIN)], httpMantenimientos.obtenerMantenimientos)
router.get('/ordenados', [validarJWT, tieneRol(ADMIN)], httpMantenimientos.obtenerMantenimientosOrdenados);
router.get('/filtrados', [validarJWT, tieneRol(ADMIN)], httpMantenimientos.obtenerMantenimientosFiltrados);
router.get('/obtenerdatosmantenimiento/:consecutivo', [validarJWT, tieneRol(GESTION)], httpMantenimientos.obtenerMantenimientoPorConsecutivo);
router.get('/resumen-solicitante/placa/:placa', [validarJWT, tieneRol(GESTION), validarPlaca()], httpMantenimientos.obtenerResumenPorPlaca);

router.post('/crear', [validarJWT, tieneRol(GESTION), upload.array('archivos'), validarPlaca('body')], httpMantenimientos.crearMantenimiento);
router.put('/editar/:consecutivo', [validarJWT, tieneRol(GESTION), upload.array('archivos'), validarPlaca('body')], httpMantenimientos.editarMantenimiento)
// Factura después de creado: numero_factura + archivo (o el link ya guardado). La placa se valida contra el registro
router.put('/legalizar/:consecutivo', [validarJWT, tieneRol(GESTION), upload.array('archivos')], httpMantenimientos.legalizarMantenimiento)

export default router
