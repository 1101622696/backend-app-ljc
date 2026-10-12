import { viajeHelper } from '../helpers/viajes.js';
import { usuarioHelper } from '../helpers/usuarios.js';
import { firebaseHelper } from '../helpers/firebase.js';
import { responderError } from '../helpers/errores.js';
import { clienteHelper } from '../helpers/clientes.js';

// ── Notificaciones: se envían DESPUÉS de responder y nunca tumban el servidor ──

const peso = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

const notificar = (correos, titulo, mensaje, datos = {}) => {
  const lista = [...new Set((Array.isArray(correos) ? correos : [correos]).filter(Boolean))];
  Promise.allSettled(lista.map((correo) => firebaseHelper.enviarNotificacion(correo, titulo, mensaje, datos))).then(
    (resultados) =>
      resultados
        .filter((r) => r.status === 'rejected')
        .forEach((r) => console.warn('[viajes] Notificación no enviada:', r.reason?.message))
  );
};

/** Propietario de la placa + administradores, sin incluir a quien hizo la acción */
const avisarGestion = async (viaje, quien, titulo, mensaje) => {
  try {
    const destinatarios = (await usuarioHelper.obtenerDestinatariosNotificacion(viaje.placa)).filter((c) => c !== quien);
    notificar(destinatarios, titulo, mensaje, { tipo: 'viaje', consecutivo: viaje.consecutivo });
  } catch (error) {
    console.warn('[viajes] No se pudo notificar:', error.message);
  }
};

const avisarConductor = (viaje, quien, titulo, mensaje) => {
  if (viaje.correo_usuario && viaje.correo_usuario !== quien) {
    notificar(viaje.correo_usuario, titulo, mensaje, { tipo: 'viaje', consecutivo: viaje.consecutivo });
  }
};

const archivosDe = (req) => viajeHelper.agruparArchivos(req.files);

// ── Campos permitidos para ordenar / filtrar (admin) ──

const ORDENAMIENTOS = {
  anticipo_conductor: 'valor_anticipo_conductor',
  diezpcto: 'diez_pcto',
  fecha_inicio: 'fecha_inicio',
  fecha_fin: 'fecha_fin_viaje',
  ganancia_estimada: 'ganancia_viaje_estimada',
  ganancia_real: 'ganancia_viaje_real',
  valor_gastos_conductor: 'total_gastos_conductor',
  valor_gastos_propietario: 'total_gastos_propietario',
  valor_tonelada_inicial: 'valor_tonelada_inicial',
  valor_tonelada_final: 'valor_tonelada_final',
  valor_viaje_real: 'valor_viaje_real',
};

const FILTROS = {
  estado: 'estado_saldo_cliente',
  estado_viaje: 'estado_viaje',
  placa: 'placa',
};

const httpViajes = {
  // ── Consultas ──

  /** Lista de la pantalla de viajes (todos los perfiles; cada uno ve lo suyo) */
  listarMisViajes: async (req, res) => {
    try {
      const { estado = '', placa = '' } = req.query;
      const pagina = parseInt(req.query.pagina, 10) || 1;
      const limite = Math.min(parseInt(req.query.limite, 10) || 100, 500);
      res.json(await viajeHelper.listarViajes(req.usuariobdtoken, { estado, placa, pagina, limite }));
    } catch (error) {
      responderError(res, error, 'Error al listar viajes');
    }
  },

  /** Admin: todos, más reciente primero (se mantiene por compatibilidad) */
  obtenerViajes: async (req, res) => {
    try {
      const pagina = parseInt(req.query.pagina, 10) || 1;
      const limite = Math.min(parseInt(req.query.limite, 10) || 50, 500);
      res.json(await viajeHelper.listarViajes(req.usuariobdtoken, { pagina, limite }));
    } catch (error) {
      responderError(res, error, 'Error al obtener viajes');
    }
  },

  obtenerViajePorConsecutivo: async (req, res) => {
    try {
      res.json(await viajeHelper.obtenerViaje(req.usuariobdtoken, req.params.consecutivo));
    } catch (error) {
      responderError(res, error, 'Error al obtener viaje');
    }
  },

  obtenerGastosViaje: async (req, res) => {
    try {
      res.json(await viajeHelper.obtenerGastosViaje(req.usuariobdtoken, req.params.consecutivo));
    } catch (error) {
      responderError(res, error, 'Error al obtener gastos del viaje');
    }
  },

  /** Lo usa Preoperacionales. Respuesta: { ok, resumen: { total: { count, consecutivos } } } */
  obtenerResumenPorPlaca: async (req, res) => {
    try {
      const placas = String(req.params.placa || '').split(',').map((p) => p.trim()).filter(Boolean);
      if (!placas.length) return res.status(400).json({ ok: false, mensaje: 'Placa requerida' });
      const resumen = await viajeHelper.getResumenViajesPorPlaca(placas);
      res.json({ ok: true, resumen, placas });
    } catch (error) {
      responderError(res, error, 'Error al obtener resumen por placa');
    }
  },

  obtenerViajesOrdenados: async (req, res) => {
    try {
      const { tipo = '', orden = 'desc' } = req.query;
      const campo = ORDENAMIENTOS[String(tipo).toLowerCase()];
      if (!campo || !['asc', 'desc'].includes(orden)) {
        return res.status(400).json({ mensaje: `tipo debe ser uno de: ${Object.keys(ORDENAMIENTOS).join(', ')}` });
      }
      res.json(await viajeHelper.ordenarViajes(campo, orden));
    } catch (error) {
      responderError(res, error, 'Error al ordenar viajes');
    }
  },

  obtenerViajesFiltrados: async (req, res) => {
    try {
      const { tipo = '', valor = '' } = req.query;
      const campo = FILTROS[String(tipo).toLowerCase()];
      if (!campo || !valor) {
        return res.status(400).json({ mensaje: `tipo debe ser uno de: ${Object.keys(FILTROS).join(', ')}; y valor es obligatorio` });
      }
      res.json(await viajeHelper.filtrarViajes(campo, valor));
    } catch (error) {
      responderError(res, error, 'Error al filtrar viajes');
    }
  },

  /** Clientes activos (solo código y nombre) para el formulario de anticipo. Lo usa también el conductor */
  clientesOpciones: async (req, res) => {
    try {
      const clientes = await clienteHelper.getClientes();
      res.json(
        clientes
          .filter((c) => c.codigo && String(c.estado ?? '').trim().toLowerCase() !== 'inactivo')
          .map((c) => ({ codigo: String(c.codigo).trim(), empresa: c.empresa || '' }))
          .sort((a, b) => a.empresa.localeCompare(b.empresa))
      );
    } catch (error) {
      responderError(res, error, 'Error al listar clientes');
    }
  },

  facturarCliente: async (req, res) => {
    try {
      res.json({ ok: true, resultado: await viajeHelper.facturarCliente(req.usuariobdtoken, req.params.codigoCliente) });
    } catch (error) {
      responderError(res, error, 'Error al consultar viajes por cobrar');
    }
  },

  // ── Flujo ──

  /** 1. El conductor pide el anticipo (o el propietario/admin lo registra por él) */
  crearViaje: async (req, res) => {
    try {
      const usuario = req.usuariobdtoken;
      const viaje = await viajeHelper.crearViaje(usuario, req.body);
      res.status(201).json({ mensaje: `Viaje ${viaje.consecutivo} creado. Anticipo solicitado.`, consecutivo: viaje.consecutivo });

      avisarGestion(
        viaje,
        usuario.email,
        `Anticipo solicitado — ${viaje.placa}`,
        `${viaje.usuario} pide ${peso(viaje.valor_anticipo_conductor)} para el viaje ${viaje.consecutivo} a ${viaje.destino} (${viaje.cliente_nombre}).`
      );
      avisarConductor(viaje, usuario.email, `Nuevo viaje ${viaje.consecutivo}`, `Se registró un viaje a ${viaje.destino} a su nombre.`);
    } catch (error) {
      responderError(res, error, 'Error al crear viaje');
    }
  },

  /** 2. Propietario/admin registra la consignación del anticipo */
  consignarAnticipo: async (req, res) => {
    try {
      const usuario = req.usuariobdtoken;
      const viaje = await viajeHelper.consignarAnticipo(usuario, req.params.consecutivo, req.body, archivosDe(req));
      res.json({ mensaje: 'Anticipo consignado', viaje: viaje.consecutivo });

      avisarConductor(
        viaje,
        usuario.email,
        `Anticipo consignado — ${viaje.consecutivo}`,
        `Le consignaron ${peso(viaje.valor_anticipo_consignado)} para el viaje a ${viaje.destino}.` +
          (viaje.estado_preoperacional !== 'realizado' ? ' Recuerde hacer el preoperacional.' : '')
      );
    } catch (error) {
      responderError(res, error, 'Error al consignar anticipo');
    }
  },

  /** 4. Cerrar viaje */
  cerrarViajeYGastosConductor: async (req, res) => {
    try {
      const usuario = req.usuariobdtoken;
      const viaje = await viajeHelper.cerrarViaje(usuario, req.params.consecutivo, req.body, archivosDe(req));
      res.json({
        mensaje: 'Viaje cerrado. Queda pendiente de aprobación.',
        resumen: {
          valor_viaje_estimado: viaje.valor_viaje_estimado,
          diez_pcto: viaje.diez_pcto,
          total_gastos_conductor: viaje.total_gastos_conductor,
          saldo_anticipo_conductor: viaje.saldo_anticipo_conductor,
          saldo_pendiente_conductor: viaje.saldo_pendiente_conductor,
        },
      });

      avisarGestion(
        viaje,
        usuario.email,
        `Viaje ${viaje.consecutivo} listo para aprobar`,
        `${viaje.usuario} cerró el viaje a ${viaje.destino}. Gastos: ${peso(viaje.total_gastos_conductor)}. Ingrese para revisarlo.`
      );
    } catch (error) {
      responderError(res, error, 'Error al cerrar viaje');
    }
  },

  /** 5. Aprobar */
  aprobarViajeYGastosPropietario: async (req, res) => {
    try {
      const usuario = req.usuariobdtoken;
      const viaje = await viajeHelper.aprobarViaje(usuario, req.params.consecutivo, req.body, archivosDe(req));
      res.json({
        mensaje: 'Viaje aprobado',
        resumen: {
          valor_viaje_estimado: viaje.valor_viaje_estimado,
          diez_pcto: viaje.diez_pcto,
          saldo_pendiente_conductor: viaje.saldo_pendiente_conductor,
          total_gastos_propietario: viaje.total_gastos_propietario,
          saldo_pendiente_cliente_real: viaje.saldo_pendiente_cliente_real,
          ganancia_viaje_estimada: viaje.ganancia_viaje_estimada,
        },
      });

      const saldo = Number(viaje.saldo_pendiente_conductor) || 0;
      avisarConductor(
        viaje,
        usuario.email,
        `Viaje ${viaje.consecutivo} aprobado`,
        saldo >= 0
          ? `Su saldo a favor en este viaje es ${peso(saldo)}. Se paga en la nómina.`
          : `En este viaje quedó debiendo ${peso(-saldo)}. Se cruza en la nómina.`
      );
    } catch (error) {
      responderError(res, error, 'Error al aprobar viaje');
    }
  },

  /** 6. Facturar */
  facturarViaje: async (req, res) => {
    try {
      const { viaje, ajuste } = await viajeHelper.facturarViaje(req.usuariobdtoken, req.params.consecutivo, req.body);
      const mensaje = ajuste
        ? `Viaje facturado. Como ya estaba liquidado, queda un ajuste de ${peso(ajuste)} para la próxima nómina.`
        : 'Viaje facturado';
      res.json({
        mensaje,
        resumen: {
          valor_viaje_real: viaje.valor_viaje_real,
          diferencia_facturacion: viaje.diferencia_facturacion,
          diez_pcto: viaje.diez_pcto,
          saldo_pendiente_cliente_real: viaje.saldo_pendiente_cliente_real,
          ganancia_viaje_real: viaje.ganancia_viaje_real,
          ajuste_diez_pcto: ajuste,
        },
      });
    } catch (error) {
      responderError(res, error, 'Error al facturar viaje');
    }
  },

  /** 7. El cliente pagó */
  completarSaldoCliente: async (req, res) => {
    try {
      await viajeHelper.registrarPagoCliente(req.usuariobdtoken, req.params.consecutivo, req.body || {});
      res.json({ mensaje: 'Pago del cliente registrado' });
    } catch (error) {
      responderError(res, error, 'Error al registrar pago del cliente');
    }
  },

  /** 8. Editar (admin, antes de facturar) */
  editarViaje: async (req, res) => {
    try {
      await viajeHelper.editarViaje(req.usuariobdtoken, req.params.consecutivo, req.body, archivosDe(req));
      res.json({ mensaje: 'Viaje actualizado' });
    } catch (error) {
      responderError(res, error, 'Error al editar viaje');
    }
  },

  legalizarFactura: async (req, res) => {
    try {
      const { tipo_gasto, quien, numero_factura } = req.body;
      if (!tipo_gasto || !quien) return res.status(400).json({ mensaje: 'Debe especificar tipo_gasto y quien' });
      const ok = await viajeHelper.legalizarFactura(req.usuariobdtoken, req.params.consecutivo, tipo_gasto, quien, numero_factura);
      if (!ok) return res.status(404).json({ mensaje: 'Gasto no encontrado' });
      res.json({ mensaje: 'Factura legalizada' });
    } catch (error) {
      responderError(res, error, 'Error al legalizar factura');
    }
  },
};

export default httpViajes;
