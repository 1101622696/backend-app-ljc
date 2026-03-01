import {Router} from 'express'
import httpViajes from '../controllers/viajes.js'
import {validarJWT} from '../middlewares/validar-jwt.js'
import multer from 'multer';

const router=Router()

const upload = multer({ storage: multer.memoryStorage() });

router.get("/",[validarJWT],httpViajes.obtenerViajes)
router.get('/obtenerdatosviajes/:consecutivo',[validarJWT], httpViajes.obtenerViajePorConsecutivo);
router.get('/calcular-nomina/:email', [validarJWT], httpViajes.calcularNomina);
router.get('/resumen-solicitante', [validarJWT], httpViajes.obtenerResumenSolicitante); 
router.get('/facturar-cliente/:codigoCliente', [validarJWT], httpViajes.facturarCliente);

router.post('/crear', [validarJWT], httpViajes.crearViaje);
router.post('/aprobar-nomina/:email', [validarJWT], httpViajes.aprobarNomina);
router.post('/pagar-salario/:email', [validarJWT], httpViajes.pagarSalarioMensual);

router.put("/editar/:consecutivo",[validarJWT, upload.array('archivos')], httpViajes.editarViaje)
router.put('/cerrar-conductor/:consecutivo', [validarJWT], httpViajes.cerrarViajeYGastosConductor);
router.put('/aprobar-propietario/:consecutivo', [validarJWT], httpViajes.aprobarViajeYGastosPropietario);
router.put('/completar-saldo/:consecutivo', [validarJWT], httpViajes.completarSaldoCliente);
router.put('/facturar/:consecutivo', [validarJWT], httpViajes.facturarViaje);


export default router