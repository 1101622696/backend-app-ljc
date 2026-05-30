import {Router} from 'express'
import httpViajes from '../controllers/viajes.js'
import {validarJWT} from '../middlewares/validar-jwt.js'
import multer from 'multer';

const router=Router()

const upload = multer({ storage: multer.memoryStorage() });

router.get("/",[validarJWT],httpViajes.obtenerViajes)
router.get('/obtenerdatosviajes/:consecutivo',[validarJWT], httpViajes.obtenerViajePorConsecutivo);
router.get('/resumen-solicitante/placa/:placa', [validarJWT], httpViajes.obtenerResumenPorPlaca); 
router.get('/resumen-placa', [validarJWT], httpViajes.obtenerResumenPorPlaca);
router.get('/facturar-cliente/:codigoCliente', [validarJWT], httpViajes.facturarCliente);
router.get('/gastos/:consecutivo', [validarJWT], httpViajes.obtenerGastosViaje);
router.get("/ordenados", [validarJWT], httpViajes.obtenerViajesOrdenados);
router.get("/filtrados", [validarJWT], httpViajes.obtenerViajesFiltrados);

router.post('/crear', [validarJWT], httpViajes.crearViaje);

router.put("/editar/:consecutivo",[validarJWT, upload.array('archivos')], httpViajes.editarViaje)
router.put('/cerrar-conductor/:consecutivo', [validarJWT, upload.any()], httpViajes.cerrarViajeYGastosConductor);
router.put('/aprobar-propietario/:consecutivo', [validarJWT, upload.any()], httpViajes.aprobarViajeYGastosPropietario);
router.put('/completar-saldo/:consecutivo', [validarJWT], httpViajes.completarSaldoCliente);
router.put('/facturar/:consecutivo', [validarJWT], httpViajes.facturarViaje);
router.put('/legalizar-factura/:consecutivo', [validarJWT], httpViajes.legalizarFactura);


export default router