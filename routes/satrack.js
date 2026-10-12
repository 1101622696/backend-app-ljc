import { Router } from 'express'
import httpSatrack from '../controllers/satrack.js'
import { validarJWT } from '../middlewares/validar-jwt.js'
import { tieneRol, ADMIN, GESTION } from '../middlewares/validar-rol.js'

const router = Router()

// GPS: administrador y propietario. El conductor no lo ve.
// El propietario solo recibe sus camiones (se filtra en el controlador/helper con puedeVerPlaca).
router.get('/posiciones', [validarJWT, tieneRol(GESTION)], httpSatrack.posiciones)
router.get('/historial/:serviceCode', [validarJWT, tieneRol(GESTION)], httpSatrack.historial)
router.post('/guardar-resumen', [validarJWT, tieneRol(ADMIN)], httpSatrack.guardarResumen)

export default router
