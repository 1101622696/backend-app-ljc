import { Router } from 'express'
import httpVehiculos from '../controllers/vehiculos.js'
import { validarJWT } from '../middlewares/validar-jwt.js'
import { tieneRol, validarPlaca, ADMIN, GESTION, TODOS } from '../middlewares/validar-rol.js'
import multer from 'multer';

const router = Router()
const upload = multer({ storage: multer.memoryStorage() });

// El listado lo usan los 3 perfiles (selects de placa); el controlador filtra por placas si no es admin
router.get('/', [validarJWT, tieneRol(TODOS)], httpVehiculos.obtenerVehiculos)
router.get('/ordenados', [validarJWT, tieneRol(ADMIN)], httpVehiculos.obtenerVehiculosOrdenados);
router.get('/filtrados', [validarJWT, tieneRol(ADMIN)], httpVehiculos.obtenerVehiculosFiltrados);
router.get('/obtenerdatosvehiculo/:placa', [validarJWT, tieneRol(TODOS), validarPlaca()], httpVehiculos.obtenerVehiculoporPlaca);
router.get('/resumen-solicitante/placa/:placa', [validarJWT, tieneRol(TODOS), validarPlaca()], httpVehiculos.obtenerResumenPorPlaca);

// Crear/editar/activar: admin y propietario (el conductor solo ve su vehículo)
router.post('/crear', [validarJWT, tieneRol(GESTION), upload.array('archivos')], httpVehiculos.crearVehiculo);
router.put('/editar/:placa', [validarJWT, tieneRol(GESTION), upload.array('archivos'), validarPlaca()], httpVehiculos.editarVehiculo)
router.put('/activar/:placa', [validarJWT, tieneRol(GESTION), validarPlaca()], httpVehiculos.activarVehiculo)
router.put('/desactivar/:placa', [validarJWT, tieneRol(GESTION), validarPlaca()], httpVehiculos.desactivarVehiculo)

export default router
