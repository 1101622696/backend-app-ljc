import {Router} from 'express'
import httpNominas from '../controllers/nomina.js'
import {validarJWT} from '../middlewares/validar-jwt.js'

const router=Router()

router.get("/",[validarJWT],httpNominas.obtenerNomina)
router.get('/obtenerdatosnomina/:consecutivo',[validarJWT], httpNominas.obtenerNominaPorConsecutivo);
router.get('/calcular-nomina/:email', [validarJWT], httpNominas.calcularNomina);
router.get('/resumen-nomina-solicitante', [validarJWT], httpNominas.obtenerResumenNominaSolicitante); 
router.get("/ordenados", [validarJWT], httpNominas.obtenerNominaOrdenados);
router.get("/filtrados", [validarJWT], httpNominas.obtenerNominaFiltrados);

router.post('/aprobar-nomina/:email', [validarJWT], httpNominas.aprobarNomina);
router.post('/pagar-salario/:email', [validarJWT], httpNominas.pagarSalarioMensual);

export default router


