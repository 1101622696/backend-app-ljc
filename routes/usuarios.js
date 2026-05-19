import {Router} from 'express'
import httpUsuarios from '../controllers/usuarios.js'
import multer from 'multer';
import {validarJWT} from '../middlewares/validar-jwt.js'

const router=Router()
const upload = multer({ storage: multer.memoryStorage() });

router.get("/",[validarJWT],httpUsuarios.getUsuariosDesdeSheets)
router.get("/poremail/:email",[validarJWT],httpUsuarios.obtenerUsuarioporEmail)
router.get("/ordenados", [validarJWT], httpUsuarios.obtenerUsuariosOrdenados);
router.get("/filtrados", [validarJWT], httpUsuarios.obtenerUsuariosFiltrados);

router.post("/crear",[validarJWT, upload.array('archivos')],httpUsuarios.crearUsuario)
router.post("/login",httpUsuarios.login)
router.post("/registrar-token-fcm", [validarJWT], httpUsuarios.registrarTokenFCM);

router.put("/editar/:email",[validarJWT],httpUsuarios.editarUsuario)
router.put("/editarpassword/:email",[validarJWT],httpUsuarios.editarPasswordUsuario)
router.put("/activar/:email",[validarJWT],httpUsuarios.activarUsuario)
router.put("/inactivar/:email",[validarJWT],httpUsuarios.desactivarUsuario)



export default router