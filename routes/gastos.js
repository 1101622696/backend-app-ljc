import { Router } from 'express'
import multer from 'multer'
import httpGastosVehiculos from '../controllers/gastos.js'
import { validarJWT } from '../middlewares/validar-jwt.js'
import { tieneRol, validarPlaca, ADMIN, GESTION } from '../middlewares/validar-rol.js'

const router = Router()

// Soportes del gasto manual (fotos o PDF). multer va ANTES de validarPlaca('body'):
// con archivos el cuerpo llega como multipart y sin multer req.body estaría vacío.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 10 } })

// Gastos de vehículos: administrador y propietario. El conductor no los ve.
router.get('/gastos-vehiculos', [validarJWT, tieneRol(ADMIN)], httpGastosVehiculos.listarGastos);
router.get('/ordenados', [validarJWT, tieneRol(ADMIN)], httpGastosVehiculos.obtenerGastosOrdenados);
router.get('/obtenerdatosgasto/:consecutivo', [validarJWT, tieneRol(GESTION)], httpGastosVehiculos.obtenerGastoporConsecutivo);
router.get('/resumen-solicitante/placa/:placa', [validarJWT, tieneRol(GESTION), validarPlaca()], httpGastosVehiculos.obtenerResumenPorPlaca);

router.post('/gastos-vehiculos', [validarJWT, tieneRol(GESTION), upload.array('archivos'), validarPlaca('body')], httpGastosVehiculos.registrarGasto);
router.put('/editar/:consecutivo', [validarJWT, tieneRol(GESTION), upload.array('archivos'), validarPlaca('body')], httpGastosVehiculos.editarGasto)

export default router
