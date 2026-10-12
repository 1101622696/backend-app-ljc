import { Router } from 'express'
import httpUsuarios from '../controllers/usuarios.js'
import { validarJWT } from '../middlewares/validar-jwt.js'
import { tieneRol, ADMIN, GESTION, TODOS } from '../middlewares/validar-rol.js'

const router = Router()

// ── Sin sesión ──
router.post('/login', httpUsuarios.login)
router.post('/recuperar-password', httpUsuarios.solicitarRecuperacion)
router.post('/verificar-codigo', httpUsuarios.verificarCodigo)
router.post('/cambiar-password', httpUsuarios.cambiarPassword)

// ── Cualquier usuario con sesión ──
router.get('/me', [validarJWT], httpUsuarios.obtenerMiUsuario)
router.put('/cambiar-mi-password', [validarJWT], httpUsuarios.cambiarMiPassword)
router.post('/registrar-token-fcm', [validarJWT], httpUsuarios.registrarTokenFCM)
// El controlador revisa que sea él mismo, el admin o el propietario de sus conductores
router.get('/poremail/:email', [validarJWT, tieneRol(TODOS)], httpUsuarios.obtenerUsuarioporEmail)

// ── Administrador ──
router.get('/', [validarJWT, tieneRol(ADMIN)], httpUsuarios.getUsuariosDesdeSheets)
router.get('/ordenados', [validarJWT, tieneRol(ADMIN)], httpUsuarios.obtenerUsuariosOrdenados)
router.get('/filtrados', [validarJWT, tieneRol(ADMIN)], httpUsuarios.obtenerUsuariosFiltrados)

// ── Administrador y propietario (el propietario solo sobre los conductores de sus placas) ──
router.get('/porpropietario/:email', [validarJWT, tieneRol(GESTION)], httpUsuarios.obtenerUsuariosPorPropietario)
router.post('/crear', [validarJWT, tieneRol(GESTION)], httpUsuarios.crearUsuario)
router.put('/editar/:email', [validarJWT, tieneRol(GESTION)], httpUsuarios.editarUsuario)
router.put('/editarpassword/:email', [validarJWT, tieneRol(GESTION)], httpUsuarios.editarPasswordUsuario)
router.put('/activar/:email', [validarJWT, tieneRol(GESTION)], httpUsuarios.activarUsuario)
router.put('/inactivar/:email', [validarJWT, tieneRol(GESTION)], httpUsuarios.desactivarUsuario)

export default router
