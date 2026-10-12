import { Router } from 'express'
import httpCombustible from '../controllers/combustible.js'
import { validarJWT } from '../middlewares/validar-jwt.js'
import { tieneRol, validarPlaca, ADMIN, GESTION, TODOS } from '../middlewares/validar-rol.js'
import multer from 'multer';

const router = Router()
const upload = multer({ storage: multer.memoryStorage() });

// Listados completos: solo admin (propietario y conductor consultan por sus placas)
router.get('/', [validarJWT, tieneRol(ADMIN)], httpCombustible.listarCombustibles);
router.get('/ordenados', [validarJWT, tieneRol(ADMIN)], httpCombustible.obtenerCombustiblesOrdenados);
router.get('/filtrados', [validarJWT, tieneRol(ADMIN)], httpCombustible.obtenerCombustiblesFiltrados);

router.get('/obtenerdatoscombustible/:consecutivo', [validarJWT, tieneRol(TODOS)], httpCombustible.obtenerCombustibleporConsecutivo);
router.get('/resumen-solicitante/placa/:placa', [validarJWT, tieneRol(TODOS), validarPlaca()], httpCombustible.obtenerResumenPorPlaca);
// Rendimiento acumulado del mes: ?mes=AAAA-MM (o MM del año actual; sin mes = mes actual)
router.get('/rendimiento-mensual/:placa', [validarJWT, tieneRol(TODOS), validarPlaca()], httpCombustible.obtenerRendimientoMensual);

// El conductor registra; legalizar y editar es de admin y propietario
router.post('/crear', [validarJWT, tieneRol(TODOS), upload.array('archivos'), validarPlaca('body')], httpCombustible.registrarCombustible);
router.put('/legalizar/:consecutivo', [validarJWT, tieneRol(GESTION)], httpCombustible.legalizarCombustible);
router.put('/editar/:consecutivo', [validarJWT, tieneRol(GESTION), upload.array('archivos'), validarPlaca('body')], httpCombustible.editarCombustible)

export default router
