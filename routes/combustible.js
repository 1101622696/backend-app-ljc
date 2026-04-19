import {Router} from 'express'
import httpCombustible from '../controllers/combustible.js'
import {validarJWT} from '../middlewares/validar-jwt.js'
import multer from 'multer';

const router=Router()
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', [validarJWT], httpCombustible.listarCombustibles);

router.post('/crear', [validarJWT, upload.array('archivos')], httpCombustible.registrarCombustible);

router.put('/legalizar/:consecutivo', [validarJWT], httpCombustible.legalizarCombustible);

export default router