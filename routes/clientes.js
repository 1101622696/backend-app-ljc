import { Router } from 'express'
import httpClientes from '../controllers/clientes.js'
import { validarJWT } from '../middlewares/validar-jwt.js'
import { tieneRol, GESTION } from '../middlewares/validar-rol.js'

const router = Router()

// Clientes: administrador y propietario. El conductor no los ve.
// (Pendiente bloque de clientes: que el propietario vea solo la ganancia de sus viajes.)
router.get('/', [validarJWT, tieneRol(GESTION)], httpClientes.obtenerClientes)
router.get('/obtenerdatoscliente/:codigo', [validarJWT, tieneRol(GESTION)], httpClientes.obtenerClienteporCodigo)
router.get('/ordenados', [validarJWT, tieneRol(GESTION)], httpClientes.obtenerClientesOrdenados)
router.get('/filtrados', [validarJWT, tieneRol(GESTION)], httpClientes.obtenerClientesFiltrados)

router.post('/crear', [validarJWT, tieneRol(GESTION)], httpClientes.crearCliente)

router.put('/editar/:codigo', [validarJWT, tieneRol(GESTION)], httpClientes.editarCliente)
router.put('/activar/:codigo', [validarJWT, tieneRol(GESTION)], httpClientes.activarCliente)
router.put('/desactivar/:codigo', [validarJWT, tieneRol(GESTION)], httpClientes.desactivarCliente)

export default router
