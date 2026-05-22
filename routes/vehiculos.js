import {Router} from 'express'
import httpVehiculos from '../controllers/vehiculos.js'
import {validarJWT} from '../middlewares/validar-jwt.js'
import multer from 'multer';

const router=Router()

const upload = multer({ storage: multer.memoryStorage() });

router.get("/",[validarJWT],httpVehiculos.obtenerVehiculos)
router.get('/obtenerdatosvehiculo/:placa',[validarJWT], httpVehiculos.obtenerVehiculoporPlaca);
router.get("/ordenados", [validarJWT], httpVehiculos.obtenerVehiculosOrdenados);
router.get("/filtrados", [validarJWT], httpVehiculos.obtenerVehiculosFiltrados);
router.get('/resumen-solicitante/placa/:placa', [validarJWT], httpVehiculos.obtenerResumenPorPlaca); 

router.post("/crear", [validarJWT, upload.array('archivos')], httpVehiculos.crearVehiculo);

router.put("/editar/:placa",[validarJWT, upload.array('archivos')], httpVehiculos.editarVehiculo)

router.put("/activar/:placa",[validarJWT],httpVehiculos.activarVehiculo)
router.put("/desactivar/:placa",[validarJWT],httpVehiculos.desactivarVehiculo)

export default router