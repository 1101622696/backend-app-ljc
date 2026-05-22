import {Router} from 'express'
import httpGastosVehiculos from '../controllers/gastos.js'
import {validarJWT} from '../middlewares/validar-jwt.js'

const router=Router()

router.get('/gastos-vehiculos', [validarJWT], httpGastosVehiculos.listarGastos);
router.get('/obtenerdatosgasto/:consecutivo',[validarJWT], httpGastosVehiculos.obtenerGastoporConsecutivo);
router.get("/ordenados", [validarJWT], httpGastosVehiculos.obtenerGastosOrdenados);
router.get('/resumen-solicitante/placa/:placa', [validarJWT], httpGastosVehiculos.obtenerResumenPorPlaca); 

router.post('/gastos-vehiculos', [validarJWT], httpGastosVehiculos.registrarGasto);

router.put("/editar/:consecutivo",[validarJWT], httpGastosVehiculos.editarGasto)

export default router