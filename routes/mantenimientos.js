import {Router} from 'express'
import httpMantenimientos from '../controllers/mantenimientos.js'
import {validarJWT} from '../middlewares/validar-jwt.js'
import multer from 'multer';

const router=Router()

const upload = multer({ storage: multer.memoryStorage() });


router.get("/",[validarJWT],httpMantenimientos.obtenerMantenimientos)
router.get('/obtenerdatosmantenimiento/:consecutivo',[validarJWT], httpMantenimientos.obtenerMantenimientoPorConsecutivo);
router.get('/resumen-solicitante', [validarJWT], httpMantenimientos.obtenerResumenSolicitante); 

router.post("/crear", [validarJWT, upload.array('archivos')], httpMantenimientos.crearMantenimiento);

router.put("/editar/:consecutivo",[validarJWT, upload.array('archivos')], httpMantenimientos.editarMantenimiento)



export default router