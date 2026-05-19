import {Router} from 'express'
import httpResumenVehiculo from '../controllers/resumen_vehiculo.js'
import {validarJWT} from '../middlewares/validar-jwt.js'

const router=Router()

router.get('/resumen-vehiculo/:placa/:anio', [validarJWT], httpResumenVehiculo.obtenerResumen);

router.post('/resumen-vehiculo/mensual', [validarJWT], httpResumenVehiculo.generarResumenMensual);
router.post('/resumen-vehiculo/anual', [validarJWT], httpResumenVehiculo.generarResumenAnual);


export default router