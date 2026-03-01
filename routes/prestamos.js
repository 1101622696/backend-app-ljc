import {Router} from 'express'
import httpPrestamos from '../controllers/prestamos.js'
import {validarJWT} from '../middlewares/validar-jwt.js'
import multer from 'multer';

const router=Router()

const upload = multer({ storage: multer.memoryStorage() });


router.get("/",[validarJWT],httpPrestamos.obtenerPrestamos)
router.get('/obtenerdatosprestamo/:consecutivo',[validarJWT], httpPrestamos.obtenerPrestamoPorConsecutivo);
router.get('/resumen-solicitante', [validarJWT], httpPrestamos.obtenerResumenSolicitante); 

router.post("/crear", [validarJWT, upload.array('archivos')], httpPrestamos.crearPrestamo);

router.put("/editar/:consecutivo",[validarJWT, upload.array('archivos')], httpPrestamos.editarPrestamo)



export default router