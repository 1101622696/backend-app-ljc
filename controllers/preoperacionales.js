import { preoperacionalHelper } from '../helpers/preoperacionales.js';
import { vehiculoHelper } from '../helpers/vehiculos.js';
import { viajeHelper } from '../helpers/viajes.js';
import { usuarioHelper } from '../helpers/usuarios.js';
import { firebaseHelper } from '../helpers/firebase.js';
import { aNumero } from '../helpers/hoja.js';
import { ahora } from '../helpers/fechas.js';
import { responderError, ErrorApp } from '../helpers/errores.js';
import { esAdmin, puedeVerPlaca } from '../middlewares/validar-rol.js';

// Ítems del checklist (mismo orden de columnas de la hoja Preoperacional)
const ITEMS = [
  'nivel_agua', 'nivel_aceite', 'galones', 'fugas_visibles', 'presion_frenos', 'fugas_audibles', 'freno_parqueo',
  'abs_sintestigo', 'prueba_freno', 'luces_altas_bajas', 'direccionales', 'luces_freno', 'luces_remolque',
  'testigo_tablero', 'filtro_aire', 'volante', 'sin_fugas', 'cambios_suave', 'sin_ruidos', 'cinturon_seguridad',
  'espejos', 'extintor_cabezote', 'extintor_trailer', 'botiquin', 'triangulos_reflectivos', 'kit_carretera',
  'senalizacion_conduzco', 'correas', 'estado_carpa', 'refrigerante', 'pito', 'alarma_retroceso', 'presion_llantas',
  'desgaste_llantas', 'tuercas_ajustadas', 'suspension_fisuras', 'acople_quintarueda', 'quinta_rueda', 'pasador_rey',
  'mangueras_aire', 'seguro_acople', 'placas_visibles',
];

// Ítems críticos: si alguno sale "No cumple" se avisa al propietario y al administrador (no bloquea el viaje)
const CRITICOS = {
  presion_frenos: 'Presión de frenos',
  freno_parqueo: 'Freno de parqueo',
  abs_sintestigo: 'ABS (testigo)',
  prueba_freno: 'Prueba de frenos',
  presion_llantas: 'Presión de llantas',
  desgaste_llantas: 'Desgaste de llantas',
  tuercas_ajustadas: 'Tuercas ajustadas',
};

// 'No cumple' alerta; 'No aplica' no
const noCumple = (valor) => /^no\s*cumple/i.test(String(valor ?? '').trim());

const avisarCriticos = async (viaje, datos, quien, consecutivoPreop) => {
  const fallas = Object.entries(CRITICOS).filter(([campo]) => noCumple(datos[campo])).map(([, etiqueta]) => etiqueta);
  if (!fallas.length) return;
  try {
    const destinatarios = (await usuarioHelper.obtenerDestinatariosNotificacion(viaje.placa)).filter((c) => c !== quien);
    await Promise.allSettled(
      destinatarios.map((correo) =>
        firebaseHelper.enviarNotificacion(
          correo,
          `⚠️ Preoperacional ${viaje.placa}: frenos/llantas`,
          `En el viaje ${viaje.consecutivo} no cumple: ${fallas.join(', ')}. Revise el preoperacional ${consecutivoPreop}.`,
          { tipo: 'preoperacional', consecutivo: consecutivoPreop }
        )
      )
    );
  } catch (error) {
    console.warn('[preoperacional] No se pudo avisar fallas críticas:', error.message);
  }
};

const httpPreoperacionales = {

// El preoperacional siempre va amarrado a un viaje (solicitado o con anticipo consignado).
// La placa sale del viaje. El odómetro es obligatorio y no puede bajar.
crearPreoperacional: async (req, res) => {
  try {
    const usuario = req.usuariobdtoken;
    const { codigo_viaje, odometro } = req.body;

    if (!codigo_viaje) throw new ErrorApp(400, 'Seleccione el viaje del preoperacional');
    const viaje = await viajeHelper.validarViajeParaPreoperacional(usuario, codigo_viaje);

    const vehiculo = await vehiculoHelper.getVehiculoById(viaje.placa);
    if (!vehiculo) throw new ErrorApp(404, `No existe el vehículo ${viaje.placa}`);

    const odometroNuevo = Math.round(aNumero(odometro));
    if (!odometroNuevo) throw new ErrorApp(400, 'Ingrese el odómetro');
    const odometroActual = Math.round(aNumero(vehiculo.odometro));
    if (odometroNuevo < odometroActual) {
      throw new ErrorApp(400, `El odómetro no puede ser menor al registrado (${odometroActual.toLocaleString('es-CO')} km)`);
    }

    const items = Object.fromEntries(ITEMS.map((campo) => [campo, req.body[campo] ?? '']));
    const fecha = ahora();

    // Consecutivo, carpeta de Drive, archivos y fila en una sola operación (mismo consecutivo en todo)
    const resultado = await preoperacionalHelper.guardarConArchivos(
      {
        ...items,
        codigo_viaje: viaje.consecutivo,
        placa: viaje.placa,
        odometro: odometroNuevo,
        correo_usuario: usuario.email,
        usuario: usuario.nombre,
        fecha_creacion: fecha, // con hora: sirve para medir km entre preoperacionales
      },
      req.files
    );

    await viajeHelper.registrarPreoperacional(viaje.consecutivo, {
      consecutivo_preoperacional: resultado.consecutivo,
      odometro: odometroNuevo,
      fecha,
    });

    res.status(201).json({ mensaje: 'Preoperacional guardado correctamente', consecutivo: resultado.consecutivo });

    // Después de responder: odómetro del vehículo y aviso de fallas críticas
    vehiculoHelper
      .actualizarOdometroVehiculo(viaje.placa, odometroNuevo)
      .catch((e) => console.warn('[preoperacional] No se actualizó el odómetro:', e.message));
    avisarCriticos(viaje, req.body, usuario.email, resultado.consecutivo);
  } catch (error) {
    responderError(res, error, 'Error al guardar el preoperacional');
  }
},

obtenerPreoperacionales: async (req, res) => {
  try {
    const data = await preoperacionalHelper.getPreoperacionales();
    // El administrador ve todos; propietario y conductor solo los de sus placas
    const usuario = req.usuariobdtoken;
    res.json(esAdmin(usuario) ? data : data.filter((p) => puedeVerPlaca(usuario, p.placa)));
  } catch (error) {
    responderError(res, error, 'Error al obtener preoperacionales');
  }
},

obtenerResumenPorPlaca: async (req, res) => {
  try {
    const { placa } = req.params;
    if (!placa) {
      return res.status(400).json({ ok: false, mensaje: 'Placa requerida' });
    }

    const placas = placa.split(',');
    const resumen = await preoperacionalHelper.getResumenPreoperacionalesPorPlaca(placas);

    res.json({ ok: true, resumen, placas, mensaje: 'Resumen obtenido exitosamente' });
  } catch (error) {
    console.error('Error al obtener resumen por placa:', error);
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
},

obtenerPreoperacionalPorConsecutivo: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const preoperacional = await preoperacionalHelper.getPreoperacionalesByConsecutivo(consecutivo);

    // Si no es de sus placas se responde igual que si no existiera
    if (!preoperacional || !puedeVerPlaca(req.usuariobdtoken, preoperacional.placa)) {
      return res.status(404).json({ mensaje: 'preoperacional no encontrado' });
    }

    res.json(preoperacional);
  } catch (error) {
    responderError(res, error, 'Error al obtener preoperacional');
  }
},

editarPreoperacional: async (req, res) => {
  try {
    const { consecutivo } = req.params;
    const existente = await preoperacionalHelper.getPreoperacionalesByConsecutivo(consecutivo);
    if (!existente || !puedeVerPlaca(req.usuariobdtoken, existente.placa)) {
      throw new ErrorApp(404, 'Preoperacional no encontrado');
    }

    const nuevosDatos = { ...req.body };
    // Archivos nuevos: van a la carpeta del consecutivo guardado (no al texto que llegó en la URL)
    if (req.files?.length) {
      nuevosDatos.link = await preoperacionalHelper.procesarArchivos(req.files, existente.consecutivo);
    }

    const resultado = await preoperacionalHelper.editarPreoperacionalPorConsecutivo(existente.consecutivo, nuevosDatos);
    if (!resultado) throw new ErrorApp(404, 'Preoperacional no encontrado');

    res.status(200).json({ mensaje: 'Preoperacional actualizado correctamente' });
  } catch (error) {
    responderError(res, error, 'Error al editar preoperacional');
  }
},

};

export default httpPreoperacionales;
