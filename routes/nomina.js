import { Router } from 'express'
import multer from 'multer'
import httpNominas from '../controllers/nomina.js'
import { validarJWT } from '../middlewares/validar-jwt.js'
import { tieneRol, GESTION, TODOS } from '../middlewares/validar-rol.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 5 } })

// Consultas (cada perfil ve lo suyo; el controlador filtra)
router.get('/', [validarJWT, tieneRol(TODOS)], httpNominas.obtenerNomina)
router.get('/pendientes', [validarJWT, tieneRol(TODOS)], httpNominas.pendientes)
router.get('/resumen-nomina-solicitante', [validarJWT, tieneRol(TODOS)], httpNominas.obtenerResumenNominaSolicitante)
router.get('/obtenerdatosnomina/:consecutivo', [validarJWT, tieneRol(TODOS)], httpNominas.obtenerNominaPorConsecutivo)
// Vista previa: el conductor puede ver la suya; propietario/admin la de sus conductores
router.get('/calcular-nomina/:email', [validarJWT, tieneRol(TODOS)], httpNominas.calcularNomina)

// Liquidar / pagar: propietario y administrador (comprobante opcional en "comprobante")
router.post('/liquidar-viajes/:email', [validarJWT, tieneRol(GESTION), upload.array('comprobante')], httpNominas.liquidarViajes)
router.post('/pagar-salario/:email', [validarJWT, tieneRol(GESTION), upload.array('comprobante')], httpNominas.pagarSalarioMensual)
// Nombre anterior
router.post('/aprobar-nomina/:email', [validarJWT, tieneRol(GESTION), upload.array('comprobante')], httpNominas.liquidarViajes)

export default router
