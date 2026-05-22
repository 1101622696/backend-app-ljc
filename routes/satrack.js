import { Router } from 'express'
import httpSatrack from '../controllers/satrack.js'
import { validarJWT } from '../middlewares/validar-jwt.js'

const router = Router()

router.get('/posiciones', [validarJWT], httpSatrack.posiciones)
router.get('/historial/:serviceCode', [validarJWT], httpSatrack.historial)
router.post('/guardar-resumen', [validarJWT], httpSatrack.guardarResumen)

export default router