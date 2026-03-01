import {Router} from 'express'
import httpSolicitudes from '../controllers/solicitudes.js'
import {validarJWT} from '../middlewares/validar-jwt.js'
import multer from 'multer';

const router=Router()

const upload = multer({ storage: multer.memoryStorage() });

router.get("/",[validarJWT],httpSolicitudes.obtenerSolicitudes)
router.get('/obtenerdatossolicitud/:consecutivo',[validarJWT], httpSolicitudes.obtenerSolicitudPorConsecutivo);

router.get('/resumen-solicitante', [validarJWT], httpSolicitudes.obtenerResumenSolicitante); 

router.post("/crear", [validarJWT, upload.array('archivos')], httpSolicitudes.crearSolicitud);



export default router