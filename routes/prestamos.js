import { Router } from 'express'
import multer from 'multer'
import httpPrestamos from '../controllers/prestamos.js'
import { validarJWT } from '../middlewares/validar-jwt.js'
import { tieneRol, GESTION, TODOS } from '../middlewares/validar-rol.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 5 } })

// Consultas: el conductor ve los suyos, el propietario los de sus conductores, el admin todos
router.get('/', [validarJWT, tieneRol(TODOS)], httpPrestamos.listar)
router.get('/obtenerdatosprestamo/:consecutivo', [validarJWT, tieneRol(TODOS)], httpPrestamos.obtenerPrestamoPorConsecutivo)

// El conductor pide (el propietario/admin puede registrarlo por él con correo_conductor)
router.post('/crear', [validarJWT, tieneRol(TODOS)], httpPrestamos.crearPrestamo)

// Propietario / admin
router.put('/desembolsar/:consecutivo', [validarJWT, tieneRol(GESTION), upload.array('comprobante')], httpPrestamos.desembolsar)
router.put('/rechazar/:consecutivo', [validarJWT, tieneRol(GESTION)], httpPrestamos.rechazar)

export default router
