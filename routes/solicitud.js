import {Router} from 'express'
import httpSolicitudes from '../controllers/solicitudes.js'
import {validarJWT} from '../middlewares/validar-jwt.js'
import multer from 'multer';

const router=Router()

const upload = multer({ storage: multer.memoryStorage() });

router.get('/obtenerdatossolicitud/:consecutivo',[validarJWT], httpSolicitudes.obtenerSolicitudPorConsecutivo);
router.get("/resumen/email/:email",[validarJWT],httpSolicitudes.obtenerResumenPorEmail)
router.get("/resumensolicitante/email/:email",[validarJWT],httpSolicitudes.obtenerResumenSolicitante)
router.get("/resumenjefe/",[validarJWT],httpSolicitudes.obtenerResumenJefe)
router.get("/emailestado/consecutivo/:consecutivo",[validarJWT],httpSolicitudes.obtenerSolicitudPorConsecutivoConEstados)
router.get("/emailestado/estado/:estado",[validarJWT],httpSolicitudes.obtenerSolicitudesPorEstadoGeneral)
router.get("/buscar",[validarJWT],httpSolicitudes.buscarSolicitudesAvanzado)

router.post("/crear", [validarJWT, upload.array('archivos')], httpSolicitudes.crearSolicitud);

router.put("/editar/:consecutivo", [validarJWT, upload.array('archivos')], httpSolicitudes.editarSolicitud);

router.put("/aprobar/:consecutivo",[validarJWT],httpSolicitudes.aprobarestadoSolicitud)
router.put("/denegar/:consecutivo",[validarJWT],httpSolicitudes.denegarestadoSolicitud)
router.put("/cancelar/:consecutivo",[validarJWT],httpSolicitudes.cancelarEstadoSolicitud)
router.put("/enespera/:consecutivo",[validarJWT],httpSolicitudes.enEsperaSolicitud)

export default router