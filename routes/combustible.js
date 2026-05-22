import {Router} from 'express'
import httpCombustible from '../controllers/combustible.js'
import {validarJWT} from '../middlewares/validar-jwt.js'
import multer from 'multer';

const router=Router()
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', [validarJWT], httpCombustible.listarCombustibles);
router.get('/obtenerdatoscombustible/:consecutivo',[validarJWT], httpCombustible.obtenerCombustibleporConsecutivo);
router.get("/ordenados", [validarJWT], httpCombustible.obtenerCombustiblesOrdenados);
router.get("/filtrados", [validarJWT], httpCombustible.obtenerCombustiblesFiltrados);
router.get('/resumen-solicitante/placa/:placa', [validarJWT], httpCombustible.obtenerResumenPorPlaca); 

router.post('/crear', [validarJWT, upload.array('archivos')], httpCombustible.registrarCombustible);

router.put('/legalizar/:consecutivo', [validarJWT], httpCombustible.legalizarCombustible);
router.put("/editar/:consecutivo",[validarJWT, upload.array('archivos')], httpCombustible.editarCombustible)

export default router