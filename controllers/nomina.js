import { nominaHelper } from '../helpers/nomina.js';
import { firebaseHelper } from '../helpers/firebase.js';
import { responderError } from '../helpers/errores.js';

const peso = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

const avisarConductor = (email, titulo, mensaje, consecutivo) => {
  firebaseHelper
    .enviarNotificacion(email, titulo, mensaje, { tipo: 'nomina', consecutivo })
    .catch((e) => console.warn('[nomina] Notificación no enviada:', e.message));
};

/** Lista de consecutivos que llega como 'V-1,V-2' o como arreglo */
const lista = (valor) =>
  (Array.isArray(valor) ? valor : String(valor ?? '').split(','))
    .map((v) => String(v).trim())
    .filter(Boolean);

const httpNominas = {
  /** Por liquidar, por conductor (cada perfil ve lo suyo) */
  pendientes: async (req, res) => {
    try {
      res.json(await nominaHelper.pendientes(req.usuariobdtoken));
    } catch (error) {
      responderError(res, error, 'Error al consultar nómina pendiente');
    }
  },

  /** Vista previa. ?tipo=viajes|salario&mes=AAAA-MM&viajes=V-1,V-2 */
  calcularNomina: async (req, res) => {
    try {
      const { tipo = 'viajes', mes = '', viajes = '' } = req.query;
      res.json(await nominaHelper.calcular(req.usuariobdtoken, req.params.email, { tipo, mes, viajes: lista(viajes) }));
    } catch (error) {
      responderError(res, error, 'Error al calcular nómina');
    }
  },

  /** Liquidar viajes (archivo opcional: comprobante) */
  liquidarViajes: async (req, res) => {
    try {
      const r = await nominaHelper.liquidarViajes(
        req.usuariobdtoken,
        req.params.email,
        { viajes: lista(req.body.viajes), notas: req.body.notas },
        req.files || []
      );
      res.status(201).json({
        mensaje: r.saldo_siguiente < 0
          ? `Nómina ${r.consecutivo_nomina} registrada. Quedó un saldo de ${peso(-r.saldo_siguiente)} a descontar en la próxima.`
          : `Nómina ${r.consecutivo_nomina} registrada. A pagar: ${peso(r.valor_pagado)}`,
        nomina: r,
      });
      avisarConductor(
        r.id_conductor,
        'Nómina de viajes liquidada',
        `Se liquidaron ${r.total_viajes_mes} viaje(s). ${r.valor_pagado > 0 ? `Valor a recibir: ${peso(r.valor_pagado)}.` : `Queda debiendo ${peso(-r.saldo_siguiente)}.`}`,
        r.consecutivo_nomina
      );
    } catch (error) {
      responderError(res, error, 'Error al liquidar viajes');
    }
  },

  /** Pagar salario del mes (archivo opcional: comprobante) */
  pagarSalarioMensual: async (req, res) => {
    try {
      const r = await nominaHelper.pagarSalario(
        req.usuariobdtoken,
        req.params.email,
        { mes: req.body.mes, notas: req.body.notas },
        req.files || []
      );
      res.status(201).json({
        mensaje: `Salario de ${r.mes} registrado (${r.consecutivo_nomina}). A pagar: ${peso(r.valor_pagado)}`,
        nomina: r,
      });
      avisarConductor(
        r.id_conductor,
        `Salario de ${r.mes}`,
        `Salario + seguridad social${r.total_prestamos ? ` menos préstamos (${peso(r.total_prestamos)})` : ''}: ${peso(r.valor_pagado)}.`,
        r.consecutivo_nomina
      );
    } catch (error) {
      responderError(res, error, 'Error al pagar salario');
    }
  },

  /** Historial. ?tipo=viajes|salario&email= */
  obtenerNomina: async (req, res) => {
    try {
      const { tipo = '', email = '' } = req.query;
      res.json(await nominaHelper.historial(req.usuariobdtoken, { tipo, email }));
    } catch (error) {
      responderError(res, error, 'Error al obtener nóminas');
    }
  },

  /** Compatibilidad: el conductor pide su historial */
  obtenerResumenNominaSolicitante: async (req, res) => {
    try {
      const datos = await nominaHelper.historial(req.usuariobdtoken, { email: req.usuariobdtoken.email });
      res.json({ ok: true, resumen: { total: { count: datos.length, consecutivos: datos } } });
    } catch (error) {
      responderError(res, error, 'Error al obtener nómina del conductor');
    }
  },

  obtenerNominaPorConsecutivo: async (req, res) => {
    try {
      res.json(await nominaHelper.obtener(req.usuariobdtoken, req.params.consecutivo));
    } catch (error) {
      responderError(res, error, 'Error al obtener nómina');
    }
  },
};

export default httpNominas;
