import { Router } from 'express';
import httpAlertas, { validarCronKey } from '../controllers/alertas.js';
import { validarJWT } from '../middlewares/validar-jwt.js';
import { tieneRol, ADMIN } from '../middlewares/validar-rol.js';

const router = Router();

// Trigger diario de Apps Script (10 a. m.): sin JWT, protegido con el header x-cron-key = CRON_SECRET
router.post('/ejecutar', validarCronKey, httpAlertas.ejecutarDesdeCron);

// Disparar alertas manualmente: solo administrador
router.get('/',           [validarJWT, tieneRol(ADMIN)], httpAlertas.ejecutarAlertas);
router.get('/viajes',     [validarJWT, tieneRol(ADMIN)], httpAlertas.ejecutarAlertasViajes);
router.get('/documentos', [validarJWT, tieneRol(ADMIN)], httpAlertas.ejecutarAlertasDocumentos);
router.get('/licencias',  [validarJWT, tieneRol(ADMIN)], httpAlertas.ejecutarAlertasLicencias);
router.get('/nomina',     [validarJWT, tieneRol(ADMIN)], httpAlertas.ejecutarAlertasNomina);

export default router;
