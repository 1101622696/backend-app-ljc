import {Router} from 'express'
import httpPreoperacionales from '../controllers/preoperacionales.js'
import {validarJWT} from '../middlewares/validar-jwt.js'
import multer from 'multer';

const router=Router()

const upload = multer({ storage: multer.memoryStorage() });

router.get("/",[validarJWT],httpPreoperacionales.obtenerPreoperacionales)
router.get('/obtenerdatospreoperacional/:consecutivo',[validarJWT], httpPreoperacionales.obtenerPreoperacionalPorConsecutivo);
router.get('/resumen-solicitante/placa/:placa', [validarJWT], httpPreoperacionales.obtenerResumenPorPlaca); 

router.post("/crear", [validarJWT, upload.array('archivos')], httpPreoperacionales.crearPreoperacional);

router.put("/editar/:consecutivo",[validarJWT, upload.array('archivos')], httpPreoperacionales.editarPreoperacional)

export default router