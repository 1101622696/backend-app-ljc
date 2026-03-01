import {Router} from 'express'
import httpCombustible from '../controllers/combustible.js'
import {validarJWT} from '../middlewares/validar-jwt.js'

const router=Router()

router.get('/', [validarJWT], httpCombustible.listarCombustibles);
router.post('/crear', [validarJWT], httpCombustible.registrarCombustible);

export default router