import { Router } from 'express';
import httpAlertas from '../controllers/alertas.js';
import { validarJWT } from '../middlewares/validar-jwt.js';

const router = Router();

router.get('/',           [validarJWT], httpAlertas.ejecutarAlertas);
router.get('/viajes',     [validarJWT], httpAlertas.ejecutarAlertasViajes);
router.get('/documentos', [validarJWT], httpAlertas.ejecutarAlertasDocumentos);
router.get('/licencias',  [validarJWT], httpAlertas.ejecutarAlertasLicencias);
router.get('/nomina',     [validarJWT], httpAlertas.ejecutarAlertasNomina);

export default router;