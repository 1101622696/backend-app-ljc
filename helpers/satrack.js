import axios from 'axios'
import { leerHoja, actualizarCampos, agregarFila, aNumero, conCandado } from './hoja.js'
import { vehiculoHelper } from './vehiculos.js'
import { hoy, sumarDias, aFechaISO, parsearFecha, ahora } from './fechas.js'
import { ErrorApp } from './errores.js'
import { puedeVerPlaca, esAdmin } from '../middlewares/validar-rol.js'

// ─────────────────────────────────────────────────────────────
// Integración con la API de GPS de Satrack.
//
// Variables de entorno:
//   SATRACK_CLIENT_ID, SATRACK_CLIENT_SECRET  credenciales (obligatorias)
//   SATRACK_LOCATION_URL  API GraphQL de ubicaciones. Por defecto https://locationintegrationapi.satrack.com/api/location
//                         Si Satrack no responde por https, ponerla con http:// en el .env
//                         (el token viajaría sin cifrar; usarlo solo si no hay otra opción).
//   SATRACK_AUTH_URL      autenticación. Por defecto https://externalsecurityapi.satrack.com/api/v1/Keycloak/authenticate
//   SATRACK_ZONA          'utc' (por defecto) o 'colombia': zona en que Satrack recibe y entrega las fechas SIN zona.
//                         Si las horas salen corridas 5 horas, cambiar este valor.
//
// guardarResumenDiario(fecha?) queda exportada para el cron / Apps Script:
//   await satrackHelper.guardarResumenDiario()            → ayer (hora Colombia)
//   await satrackHelper.guardarResumenDiario('2026-10-10') → ese día
// ─────────────────────────────────────────────────────────────

const AUTH_URL_DEFECTO = 'https://externalsecurityapi.satrack.com/api/v1/Keycloak/authenticate'
const LOCATION_URL_DEFECTO = 'https://locationintegrationapi.satrack.com/api/location'

// Se leen al usarse (no al importar) por si dotenv carga después
const urlAuth = () => process.env.SATRACK_AUTH_URL || AUTH_URL_DEFECTO
const urlLocation = () => process.env.SATRACK_LOCATION_URL || LOCATION_URL_DEFECTO
const zonaSatrack = () => (String(process.env.SATRACK_ZONA || '').trim().toLowerCase() === 'colombia' ? 'colombia' : 'utc')

const HOJA_RESUMEN = 'Satrack_Resumen'
const CANDADO_RESUMEN = 'satrack_resumen'
const TIMEOUT_MS = 30000
const POR_PAGINA = 100
const MAX_PAGINAS = 200 // tope de seguridad: 20.000 eventos por vehículo y día
const MAX_DIAS_HISTORIAL = 31
const DESFASE_MS = 5 * 60 * 60 * 1000

// Solo letras, números y guion: así nunca puede romper la consulta GraphQL
const REGEX_SERVICE_CODE = /^[A-Za-z0-9-]{1,20}$/

const normalizarPlaca = (p) => String(p ?? '').replace(/\s+/g, '').toUpperCase()
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100

// ─────────────── Validaciones y formato ───────────────

const validarServiceCode = (valor) => {
  const codigo = String(valor ?? '').trim()
  if (!REGEX_SERVICE_CODE.test(codigo)) {
    throw new ErrorApp(400, 'El código de Satrack no es válido (solo letras, números y guion, máximo 20 caracteres)')
  }
  return codigo
}

/**
 * Literal de texto GraphQL. Solo se usa con valores ya validados (service code con lista blanca
 * y fechas que genera el propio servidor), y JSON.stringify escapa comillas y barras igual que GraphQL.
 * No se usan variables GraphQL porque Satrack no documenta los tipos de los argumentos
 * (String vs DateTime) y un tipo mal declarado hace fallar toda la consulta.
 */
const literal = (texto) => JSON.stringify(String(texto))

const dos = (n) => String(n).padStart(2, '0')

/** Date → 'AAAA/MM/DD HH:mm:ss' en la zona que espera Satrack */
const formatoSatrack = (fecha) => {
  const ms = fecha.getTime() - (zonaSatrack() === 'colombia' ? DESFASE_MS : 0)
  const iso = new Date(ms).toISOString()
  return `${iso.slice(0, 10).replace(/-/g, '/')} ${iso.slice(11, 19)}`
}

/** Date → '2026-10-11T08:15:00-05:00' (hora Colombia) */
const isoColombia = (fecha) => `${new Date(fecha.getTime() - DESFASE_MS).toISOString().slice(0, 19)}-05:00`

/**
 * Fecha que entrega Satrack → Date. Si trae zona (Z, -05:00) se respeta;
 * si no trae, se interpreta en SATRACK_ZONA.
 */
const fechaSatrack = (valor) => {
  if (valor === null || valor === undefined || valor === '') return null
  if (valor instanceof Date) return isNaN(valor) ? null : valor
  if (typeof valor === 'number') {
    const f = new Date(valor > 1e11 ? valor : valor * 1000) // milisegundos o segundos
    return isNaN(f) ? null : f
  }
  let texto = String(valor).trim().replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/, '$1-$2-$3')
  const conHora = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(\.\d+)?$/)
  if (conHora) {
    const [, a, m, d, h, mi, s = '0', frac = ''] = conHora
    const base = `${a}-${dos(m)}-${dos(d)}T${dos(h)}:${mi}:${dos(s)}${frac}`
    texto = base + (zonaSatrack() === 'colombia' ? '-05:00' : 'Z')
    const f = new Date(texto)
    return isNaN(f) ? null : f
  }
  return parsearFecha(texto)
}

/** Fecha de Satrack → texto en hora Colombia ('' si no se entiende) */
const aHoraColombia = (valor) => {
  const f = fechaSatrack(valor)
  return f ? isoColombia(f) : ''
}

/**
 * Fecha que envía el usuario (query) → Date. Se interpreta en hora Colombia si no trae zona.
 * Acepta '2026-10-10', '2026-10-10 08:00', '2026/10/10 08:00:00', ISO con zona, '10/10/2026'.
 * finDeDia: si solo viene la fecha, se toma hasta las 23:59:59.
 */
// Formatos aceptados completos (nada de texto adicional después de la fecha)
const REGEX_FECHA_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/
const REGEX_FECHA_CO = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/

const leerFechaUsuario = (valor, nombre, finDeDia = false) => {
  const invalida = () => new ErrorApp(400, `La ${nombre} no es válida. Use el formato AAAA-MM-DD HH:mm`)
  let texto = String(valor ?? '').trim()
  if (!texto || texto.length > 40) throw invalida()
  texto = texto.replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/, '$1-$2-$3')

  const iso = texto.match(REGEX_FECHA_ISO)
  const co = !iso && texto.match(REGEX_FECHA_CO)
  if (!iso && !co) throw invalida()

  const soloFecha = co || /^\d{4}-\d{1,2}-\d{1,2}$/.test(texto)
  if (finDeDia && soloFecha) texto = `${aFechaISO(texto) || texto} 23:59:59`

  const fecha = parsearFecha(texto)
  if (!fecha) throw invalida()
  // Rechaza fechas imposibles que JavaScript "corre" (31 de febrero → 3 de marzo)
  if (iso && !iso[4]) {
    const esperada = `${iso[1]}-${dos(iso[2])}-${dos(iso[3])}`
    if (aFechaISO(fecha) !== esperada) throw invalida()
  }
  return fecha
}

const validarRango = (inicio, fin) => {
  if (fin < inicio) throw new ErrorApp(400, 'La fecha final no puede ser anterior a la fecha inicial')
  if (fin - inicio > MAX_DIAS_HISTORIAL * 86400000) {
    throw new ErrorApp(400, `El historial se puede consultar máximo por ${MAX_DIAS_HISTORIAL} días`)
  }
}

const validarPagina = (valor) => {
  const texto = String(valor ?? 1).trim()
  const n = /^\d{1,4}$/.test(texto) ? Number(texto) : NaN
  if (!(n >= 1)) throw new ErrorApp(400, 'La página debe ser un número mayor o igual a 1')
  return n
}

// ─────────────── Token (caché en memoria) ───────────────

let cacheToken = { token: null, expira: 0 }
let autenticando = null // promesa compartida: si llegan varias peticiones a la vez, se autentica una sola vez

/** Segundos que se guarda el token: 5 min antes de vencer, o el 80 % de su vida si dura poco */
const segundosEnCache = (expiresIn) => {
  const vida = aNumero(expiresIn) > 0 ? aNumero(expiresIn) : 300
  return vida - Math.min(300, vida * 0.2)
}

const autenticar = async () => {
  const clientId = process.env.SATRACK_CLIENT_ID
  const clientSecret = process.env.SATRACK_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new ErrorApp(500, 'La integración con Satrack no está configurada en el servidor')
  }

  const params = new URLSearchParams()
  params.append('client_id', clientId)
  params.append('client_secret', clientSecret)
  params.append('grant_type', 'client_credentials')

  let res
  try {
    res = await axios.post(urlAuth(), params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: TIMEOUT_MS,
    })
  } catch (error) {
    console.warn('[satrack] Falló la autenticación:', error?.response?.status || error?.code || error?.message)
    throw new ErrorApp(502, 'No fue posible autenticarse con Satrack. Intente de nuevo en unos minutos.')
  }

  const token = res?.data?.access_token
  if (!token) throw new ErrorApp(502, 'Satrack no entregó el token de acceso. Revise las credenciales.')

  cacheToken = { token, expira: Date.now() + segundosEnCache(res.data.expires_in) * 1000 }
  return token
}

const obtenerToken = async () => {
  if (cacheToken.token && Date.now() < cacheToken.expira) return cacheToken.token
  if (!autenticando) autenticando = autenticar().finally(() => { autenticando = null })
  return autenticando
}

/** Descarta el token solo si sigue siendo el mismo (otra petición pudo haberlo renovado ya) */
const invalidarToken = (token) => {
  if (cacheToken.token === token) cacheToken = { token: null, expira: 0 }
}

// ─────────────── Consulta GraphQL ───────────────

const MENSAJE_SIN_CONEXION = 'No fue posible comunicarse con Satrack. Intente de nuevo en unos minutos.'

// Algunas APIs GraphQL responden 200 con un error de autorización en "errors"
const esErrorDeAutorizacion = (data) =>
  (data?.errors || []).some((e) =>
    /unauthori|not authori|no autoriz|token/i.test(String(e?.message || '')) ||
    /AUTH/i.test(String(e?.extensions?.code || '')))

const enviarConsulta = (token, query) =>
  axios.post(urlLocation(), { query }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: TIMEOUT_MS,
  })

/** Envía la consulta; ante 401 renueva el token y reintenta UNA vez */
const consultarSatrack = async (query) => {
  let token = await obtenerToken()
  let res

  for (let intento = 1; intento <= 2; intento++) {
    try {
      res = await enviarConsulta(token, query)
    } catch (error) {
      if (error?.response?.status === 401 && intento === 1) {
        invalidarToken(token)
        token = await obtenerToken()
        continue
      }
      console.warn('[satrack] Error en la consulta:', error?.response?.status || error?.code || error?.message)
      throw new ErrorApp(502, error?.response?.status === 401
        ? 'Satrack rechazó las credenciales del servidor. Revise SATRACK_CLIENT_ID y SATRACK_CLIENT_SECRET.'
        : MENSAJE_SIN_CONEXION)
    }

    if (esErrorDeAutorizacion(res?.data) && intento === 1) {
      invalidarToken(token)
      token = await obtenerToken()
      continue
    }
    break
  }

  if (res?.data?.errors?.length) {
    console.warn('[satrack] La consulta GraphQL devolvió errores:', JSON.stringify(res.data.errors).slice(0, 500))
    throw new ErrorApp(502, 'Satrack no pudo responder la consulta. Intente de nuevo más tarde.')
  }
  return res?.data?.data || {}
}

// ─────────────── Vehículos con GPS ───────────────

const codigosInvalidosAvisados = new Set()

/** Vehículos activos con service_code válido (placa en mayúscula). Opcionalmente solo los del usuario */
const vehiculosConGps = async (usuario = null) => {
  const vehiculos = (await vehiculoHelper.getVehiculos()) || []
  const lista = []
  for (const v of vehiculos) {
    const placa = normalizarPlaca(v.placa)
    const serviceCode = String(v.service_code ?? '').trim()
    if (!placa || !serviceCode) continue
    if (String(v.estado ?? '').trim().toLowerCase() !== 'activo') continue
    if (!REGEX_SERVICE_CODE.test(serviceCode)) {
      // Se avisa una sola vez por código para no llenar el log en cada consulta
      if (!codigosInvalidosAvisados.has(serviceCode)) {
        codigosInvalidosAvisados.add(serviceCode)
        console.warn(`[satrack] El vehículo ${placa} tiene un service_code inválido ("${serviceCode}"); se omite`)
      }
      continue
    }
    if (usuario && !puedeVerPlaca(usuario, placa)) continue
    lista.push({ placa, service_code: serviceCode })
  }
  return lista
}

const buscarPorServiceCode = (lista, serviceCode) =>
  lista.find((v) => v.service_code.toUpperCase() === String(serviceCode ?? '').trim().toUpperCase())

/**
 * Verifica que el usuario pueda consultar ese service code. Admin: cualquiera.
 * Propietario: solo los de sus placas. Devuelve el vehículo (o null si el admin pide uno que no está en la hoja).
 */
const verificarAccesoServiceCode = async (usuario, serviceCode) => {
  const codigo = validarServiceCode(serviceCode)
  const vehiculo = buscarPorServiceCode(await vehiculosConGps(), codigo)
  if (esAdmin(usuario)) return vehiculo || null
  if (!vehiculo || !puedeVerPlaca(usuario, vehiculo.placa)) {
    throw new ErrorApp(404, 'No tiene un vehículo asignado con ese código de Satrack')
  }
  return vehiculo
}

// ─────────────── Posiciones ───────────────

/**
 * Última posición de cada vehículo activo con GPS.
 * usuario (opcional): si es propietario, solo sus placas. Sin usuario (uso interno) → todas.
 */
const obtenerUltimasPosiciones = async (usuario = null) => {
  const activos = await vehiculosConGps(usuario)
  if (!activos.length) return []

  const codigos = activos.map((v) => literal(v.service_code)).join(',')
  const query = `query { last(serviceCodes:[${codigos}]) { serviceCode latitude longitude address town state direction generationDate speed odometer ignition vehicleStatus description samePlaceMinutes } }`

  const data = await consultarSatrack(query)
  const posiciones = Array.isArray(data.last) ? data.last : []

  return posiciones
    .map((p) => {
      const vehiculo = buscarPorServiceCode(activos, p?.serviceCode)
      return { ...p, placa: vehiculo?.placa || '', generationDate_colombia: aHoraColombia(p?.generationDate) }
    })
    .filter((p) => p.placa) // nunca mostrar un vehículo que no está en la lista del usuario
}

// ─────────────── Historial ───────────────

/** Una página de eventos entre dos Date (ya validadas) */
const consultarPagina = async (serviceCode, inicio, fin, pagina, porPagina = POR_PAGINA) => {
  const query = `query { byDate(serviceCode:${literal(serviceCode)}, currentPage:${Number(pagina)}, itemsPerPage:${Number(porPagina)}, initialDate:${literal(formatoSatrack(inicio))}, endDate:${literal(formatoSatrack(fin))}) { pagination { currentPage } events { serviceCode latitude longitude speed odometer generationDate ignition vehicleStatus description } } }`
  const data = await consultarSatrack(query)
  const byDate = data.byDate || {}
  return {
    pagination: byDate.pagination || {},
    events: Array.isArray(byDate.events) ? byDate.events : [],
  }
}

/**
 * Historial de un service code entre dos fechas (una página).
 * Valida el service code y las fechas: los valores nunca se pegan sin validar en la consulta.
 */
const obtenerHistorial = async (serviceCode, fechaInicio, fechaFin, pagina = 1) => {
  const codigo = validarServiceCode(serviceCode)
  const inicio = fechaInicio instanceof Date ? fechaInicio : leerFechaUsuario(fechaInicio, 'fecha inicial')
  const fin = fechaFin instanceof Date ? fechaFin : leerFechaUsuario(fechaFin, 'fecha final', true)
  validarRango(inicio, fin)

  const resultado = await consultarPagina(codigo, inicio, fin, validarPagina(pagina))
  return {
    ...resultado,
    events: resultado.events.map((e) => ({ ...e, generationDate_colombia: aHoraColombia(e?.generationDate) })),
  }
}

// ─────────────── Cálculos puros del resumen diario ───────────────

const estaEncendido = (v) => v === 1 || v === true || ['1', 'true', 'on', 'encendido'].includes(String(v ?? '').trim().toLowerCase())
const estaApagado = (v) => v === 0 || v === false || ['0', 'false', 'off', 'apagado'].includes(String(v ?? '').trim().toLowerCase())

/** Eventos ordenados del más antiguo al más reciente (Satrack no garantiza el orden) */
const ordenarEventos = (eventos) =>
  (eventos || [])
    .map((e) => ({ e, t: fechaSatrack(e?.generationDate)?.getTime() }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t)
    .map((x) => ({ ...x.e, _t: x.t }))

/**
 * Pide todas las páginas hasta que una llegue incompleta.
 * Corta también si la API repite la misma página (ignora currentPage) o se llega al tope.
 */
const paginarEventos = async (obtenerPagina, porPagina = POR_PAGINA, maxPaginas = MAX_PAGINAS) => {
  const todos = []
  let firmaAnterior = null
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const { events = [] } = (await obtenerPagina(pagina)) || {}
    if (!events.length) break
    const firma = JSON.stringify(events[0]) + JSON.stringify(events[events.length - 1])
    if (firma === firmaAnterior) break
    firmaAnterior = firma
    todos.push(...events)
    if (events.length < porPagina) break
    if (pagina === maxPaginas) console.warn(`[satrack] Se alcanzó el tope de ${maxPaginas} páginas; el resumen puede quedar incompleto`)
  }
  return todos
}

/**
 * Resumen de un día a partir de los eventos (sin importar el orden en que lleguen):
 *  - km: odómetro del último evento − el del primero (ignorando odómetros en 0)
 *  - tiempo_encendido: minutos sumando los tramos que empiezan con el motor encendido
 *  - primer_encendido: el PRIMER evento encendido del día; ultimo_apagado: el ÚLTIMO apagado
 */
const calcularResumenEventos = (eventosCrudos) => {
  const eventos = ordenarEventos(eventosCrudos)

  const odometros = eventos.map((e) => aNumero(e.odometer)).filter((o) => o > 0)
  const km = odometros.length > 1 ? Math.max(0, odometros[odometros.length - 1] - odometros[0]) : 0

  let msEncendido = 0
  for (let i = 0; i < eventos.length - 1; i++) {
    if (estaEncendido(eventos[i].ignition)) msEncendido += eventos[i + 1]._t - eventos[i]._t
  }

  const velocidadMaxima = eventos.reduce((max, e) => Math.max(max, aNumero(e.speed)), 0)

  const primerEncendido = eventos.find((e) => estaEncendido(e.ignition))
  const apagados = eventos.filter((e) => estaApagado(e.ignition))
  const ultimoApagado = apagados[apagados.length - 1]

  return {
    km_recorridos: redondear(km),
    tiempo_encendido: Math.round(msEncendido / 60000),
    velocidad_maxima: redondear(velocidadMaxima),
    primer_encendido: primerEncendido ? isoColombia(new Date(primerEncendido._t)) : '',
    ultimo_apagado: ultimoApagado ? isoColombia(new Date(ultimoApagado._t)) : '',
    primer_encendido_satrack: primerEncendido?.generationDate ?? '',
    ultimo_apagado_satrack: ultimoApagado?.generationDate ?? '',
    eventos: eventos.length,
  }
}

// ─────────────── Resumen diario en la hoja ───────────────

/** La hoja tiene la columna con el error de digitación "km_recorrdidos"; se acepta cualquiera de los dos nombres */
const columnasKm = (encabezados) => ['km_recorrdidos', 'km_recorridos'].filter((c) => encabezados.includes(c))

/** Lee una fila de Satrack_Resumen sin importar cómo se llame la columna de km */
const kmDeFila = (fila) => aNumero(fila.km_recorridos !== undefined && fila.km_recorridos !== '' ? fila.km_recorridos : fila.km_recorrdidos)

/** Guarda las filas: si ya existe (fecha, placa) actualiza esas celdas, si no agrega */
const guardarFilasResumen = (filasNuevas) =>
  conCandado(CANDADO_RESUMEN, async () => {
    const { encabezados, filas } = await leerHoja(HOJA_RESUMEN)
    if (!encabezados.length) throw new ErrorApp(500, `La hoja ${HOJA_RESUMEN} no tiene encabezados`)
    const colsKm = columnasKm(encabezados)
    if (!colsKm.length) console.warn(`[satrack] La hoja ${HOJA_RESUMEN} no tiene la columna km_recorrdidos ni km_recorridos`)

    const resultado = []
    for (const r of filasNuevas) {
      const valores = {
        fecha_registro: r.fecha_registro,
        placa: r.placa,
        service_code: r.service_code,
        tiempo_encendido: r.tiempo_encendido,
        velocidad_maxima: r.velocidad_maxima,
        primer_encendido: r.primer_encendido,
        ultimo_apagado: r.ultimo_apagado,
      }
      colsKm.forEach((c) => { valores[c] = r.km_recorridos })
      const cambios = Object.fromEntries(Object.entries(valores).filter(([c]) => encabezados.includes(c)))

      const existentes = filas.filter((f) =>
        f._fila > 0 && aFechaISO(f.fecha_registro) === r.fecha_registro && normalizarPlaca(f.placa) === r.placa)

      if (existentes.length) {
        for (const f of existentes) await actualizarCampos(HOJA_RESUMEN, encabezados, f._fila, cambios)
        resultado.push({ ...r, accion: 'actualizado' })
      } else {
        await agregarFila(HOJA_RESUMEN, encabezados, cambios)
        resultado.push({ ...r, accion: 'agregado' })
      }
    }
    return resultado
  })

/**
 * Calcula y guarda el resumen de un día para todos los vehículos activos con GPS.
 * fecha: 'AAAA-MM-DD' (u otro formato de fecha). Si no se envía: ayer en hora Colombia.
 * Un vehículo que falle no detiene a los demás (queda en "errores").
 */
const procesarResumenDiario = async (fecha) => {
  const fechaISO = fecha ? aFechaISO(fecha) : sumarDias(hoy(), -1)
  if (!fechaISO) throw new ErrorApp(400, 'La fecha del resumen no es válida. Use el formato AAAA-MM-DD')
  if (fechaISO > hoy()) throw new ErrorApp(400, 'No se puede generar el resumen de una fecha futura')

  // El día completo en hora Colombia
  const inicio = parsearFecha(`${fechaISO}T00:00:00-05:00`)
  const fin = parsearFecha(`${fechaISO}T23:59:59-05:00`)

  const activos = await vehiculosConGps()
  const calculadas = []
  const sinEventos = []
  const errores = []

  for (const v of activos) {
    try {
      const eventos = await paginarEventos((pagina) => consultarPagina(v.service_code, inicio, fin, pagina))
      if (!eventos.length) {
        sinEventos.push(v.placa)
        continue
      }
      calculadas.push({ fecha_registro: fechaISO, placa: v.placa, service_code: v.service_code, ...calcularResumenEventos(eventos) })
    } catch (error) {
      if (!(error instanceof ErrorApp)) console.error(`[satrack] Error en el resumen de ${v.placa}:`, error)
      errores.push({ placa: v.placa, mensaje: error instanceof ErrorApp ? error.message : 'Error inesperado' })
    }
  }

  // Si fallaron todos (credenciales, Satrack caído) se informa como error
  if (activos.length && errores.length === activos.length) throw new ErrorApp(502, errores[0].mensaje)

  const filas = calculadas.length ? await guardarFilasResumen(calculadas) : []
  return { fecha: fechaISO, generado: ahora(), filas, sin_eventos: sinEventos, errores }
}

/** API anterior: devuelve el arreglo de filas guardadas (para el cron / Apps Script) */
const guardarResumenDiario = async (fecha) => (await procesarResumenDiario(fecha)).filas

export const satrackHelper = {
  obtenerUltimasPosiciones,
  obtenerHistorial,
  guardarResumenDiario,
  // Nuevas
  procesarResumenDiario,
  verificarAccesoServiceCode,
  validarServiceCode,
  obtenerToken,
  // Funciones puras (pruebas)
  calcularResumenEventos,
  paginarEventos,
  ordenarEventos,
  aHoraColombia,
  formatoSatrack,
  leerFechaUsuario,
  segundosEnCache,
  kmDeFila,
}

export { guardarResumenDiario }
