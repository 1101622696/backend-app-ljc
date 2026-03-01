import {Router} from 'express'
import httpClientes from '../controllers/clientes.js'
import {validarJWT} from '../middlewares/validar-jwt.js'

const router=Router()

router.get("/",[validarJWT],httpClientes.obtenerClientes)
router.get("/activos",[validarJWT],httpClientes.obtenerClientesActivos)
router.get("/inactivos",[validarJWT],httpClientes.obtenerClientesInactivos)
router.get('/obtenerdatoscliente/:codigo',[validarJWT], httpClientes.obtenerClienteporCodigo);

router.post("/crear", [validarJWT], httpClientes.crearCliente);

router.put("/editar/:codigo",[validarJWT], httpClientes.editarCliente)

router.put("/activar/:codigo",[validarJWT],httpClientes.activarCliente)
router.put("/desactivar/:codigo",[validarJWT],httpClientes.desactivarCliente)


export default router