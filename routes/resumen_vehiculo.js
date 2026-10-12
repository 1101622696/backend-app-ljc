import { Router } from 'express'
import httpResumenVehiculo from '../controllers/resumen_vehiculo.js'
import { validarJWT } from '../middlewares/validar-jwt.js'
import { tieneRol, validarPlaca, GESTION } from '../middlewares/validar-rol.js'

const router = Router()

// Flota: el propietario solo recibe sus placas (se filtra en el helper con puedeVerPlaca)
router.get('/resumen-vehiculo/flota/:anio/:mes', [validarJWT, tieneRol(GESTION)], httpResumenVehiculo.obtenerResumenFlota);
router.get('/resumen-vehiculo/:placa/:anio', [validarJWT, tieneRol(GESTION), validarPlaca()], httpResumenVehiculo.obtenerResumen);
router.post('/resumen-vehiculo/mensual', [validarJWT, tieneRol(GESTION), validarPlaca('body')], httpResumenVehiculo.generarResumenMensual);
router.post('/resumen-vehiculo/anual', [validarJWT, tieneRol(GESTION), validarPlaca('body')], httpResumenVehiculo.generarResumenAnual);

export default router
