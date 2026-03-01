import {Router} from 'express'
import httpGastosVehiculos from '../controllers/gastos.js'
import {validarJWT} from '../middlewares/validar-jwt.js'

const router=Router()

router.get('/gastos-vehiculos', [validarJWT], httpGastosVehiculos.listarGastos);

router.post('/gastos-vehiculos', [validarJWT], httpGastosVehiculos.registrarGasto);


export default router