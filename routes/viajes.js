import { Router } from 'express'
import httpViajes from '../controllers/viajes.js'
import { validarJWT } from '../middlewares/validar-jwt.js'
import { tieneRol, validarPlaca, ADMIN, GESTION, TODOS } from '../middlewares/validar-rol.js'
import multer from 'multer';

const router = Router()

// Hasta 40 archivos de 15 MB por envío (manifiesto + soportes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 40 },
});

// Responde un mensaje claro si los archivos pasan el límite
const subir = (req, res, next) =>
  upload.any()(req, res, (error) => {
    if (!error) return next();
    const mensaje =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'Un archivo pesa más de 15 MB. Tome la foto de nuevo o redúzcala.'
        : error.code === 'LIMIT_FILE_COUNT'
          ? 'Son demasiados archivos en un solo envío (máximo 40).'
          : 'No se pudieron recibir los archivos';
    res.status(400).json({ mensaje });
  });

// ── Consultas ──
// Pantalla de viajes: cada perfil ve lo suyo (el controlador filtra por placas)
router.get('/mis-viajes', [validarJWT, tieneRol(TODOS)], httpViajes.listarMisViajes);
router.get('/clientes-opciones', [validarJWT, tieneRol(TODOS)], httpViajes.clientesOpciones);
router.get('/obtenerdatosviajes/:consecutivo', [validarJWT, tieneRol(TODOS)], httpViajes.obtenerViajePorConsecutivo);
router.get('/gastos/:consecutivo', [validarJWT, tieneRol(TODOS)], httpViajes.obtenerGastosViaje);
router.get('/resumen-solicitante/placa/:placa', [validarJWT, tieneRol(TODOS), validarPlaca()], httpViajes.obtenerResumenPorPlaca);
router.get('/facturar-cliente/:codigoCliente', [validarJWT, tieneRol(GESTION)], httpViajes.facturarCliente);

// Admin (compatibilidad / reportes)
router.get('/', [validarJWT, tieneRol(ADMIN)], httpViajes.obtenerViajes)
router.get('/ordenados', [validarJWT, tieneRol(ADMIN)], httpViajes.obtenerViajesOrdenados);
router.get('/filtrados', [validarJWT, tieneRol(ADMIN)], httpViajes.obtenerViajesFiltrados);

// ── Flujo del viaje ──
// 1. Solicitar anticipo (crear)
router.post('/crear', [validarJWT, tieneRol(TODOS), validarPlaca('body')], httpViajes.crearViaje);
// 2. Consignar anticipo (archivo: comprobante)
router.put('/consignar-anticipo/:consecutivo', [validarJWT, tieneRol(GESTION), subir], httpViajes.consignarAnticipo);
// 3. El preoperacional se registra desde /api/preoperacionales/crear con codigo_viaje
// 4. Cerrar (archivos: manifiesto, {tipo}_conductor_archivos)
router.put('/cerrar-conductor/:consecutivo', [validarJWT, tieneRol(TODOS), subir], httpViajes.cerrarViajeYGastosConductor);
// 5. Aprobar (puede corregir lo del conductor; archivos {tipo}_propietario_archivos)
router.put('/aprobar-propietario/:consecutivo', [validarJWT, tieneRol(GESTION), subir], httpViajes.aprobarViajeYGastosPropietario);
// 6. Facturar
router.put('/facturar/:consecutivo', [validarJWT, tieneRol(GESTION)], httpViajes.facturarViaje);
// 7. Pago del cliente
router.put('/completar-saldo/:consecutivo', [validarJWT, tieneRol(GESTION)], httpViajes.completarSaldoCliente);

// Editar (solo admin, antes de facturar)
router.put('/editar/:consecutivo', [validarJWT, tieneRol(ADMIN), subir], httpViajes.editarViaje)
router.put('/legalizar-factura/:consecutivo', [validarJWT, tieneRol(GESTION)], httpViajes.legalizarFactura);

export default router
