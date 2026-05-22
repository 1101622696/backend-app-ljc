import axios from 'axios'
import { getSheetsClient } from '../services/google.js'
import { vehiculoHelper } from '../helpers/vehiculos.js'

const spreadsheetId = process.env.SPREADSHEET_ID

// ── Caché del token ──
let satrackToken = null
let tokenExpira = null

const obtenerToken = async () => {
  if (satrackToken && Date.now() < tokenExpira) return satrackToken

  const params = new URLSearchParams()
  params.append('client_id', process.env.SATRACK_CLIENT_ID)
  params.append('client_secret', process.env.SATRACK_CLIENT_SECRET)
  params.append('grant_type', 'client_credentials')

  const res = await axios.post(
    'https://externalsecurityapi.satrack.com/api/v1/Keycloak/authenticate',
    params,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  satrackToken = res.data.access_token
  tokenExpira = Date.now() + (res.data.expires_in - 300) * 1000
  return satrackToken
}

// ── Obtener últimas posiciones de todas las placas activas ──
const obtenerUltimasPosiciones = async () => {
  const token = await obtenerToken()

  // Traer placas activas con su serviceCode de la hoja Vehiculos
  const vehiculos = await vehiculoHelper.getVehiculos()
  const activos = vehiculos.filter(v => 
    v.estado?.toLowerCase() === 'activo' && v.service_code
  )

  if (!activos.length) return []

  const serviceCodes = activos.map(v => `"${v.service_code}"`).join(',')

  const query = `query { last(serviceCodes:[${serviceCodes}]) { serviceCode latitude longitude address town state direction generationDate speed odometer ignition vehicleStatus description samePlaceMinutes } }`

  const res = await axios.post(
    'http://locationintegrationapi.satrack.com/api/location',
    { query },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  )

  const posiciones = res.data?.data?.last || []

  // Enriquecer con la placa del sistema
  return posiciones.map(p => {
    const vehiculo = activos.find(v => v.service_code === p.serviceCode)
    return {
      ...p,
      placa: vehiculo?.placa || p.serviceCode
    }
  })
}

// ── Historial por placa y fechas ──
const obtenerHistorial = async (serviceCode, fechaInicio, fechaFin, pagina = 1) => {
  const token = await obtenerToken()

  const query = `query { byDate(serviceCode:"${serviceCode}", currentPage:${pagina}, itemsPerPage:100, initialDate:"${fechaInicio}", endDate:"${fechaFin}") { pagination { currentPage } events { serviceCode latitude longitude speed odometer generationDate ignition vehicleStatus description } } }`

  const res = await axios.post(
    'http://locationintegrationapi.satrack.com/api/location',
    { query },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  )

  return res.data?.data?.byDate || { pagination: {}, events: [] }
}

// ── Guardar resumen diario en Sheets ──
const guardarResumenDiario = async (fecha) => {
  const token = await obtenerToken()
  const vehiculos = await vehiculoHelper.getVehiculos()
  const activos = vehiculos.filter(v => 
    v.estado?.toLowerCase() === 'activo' && v.service_code
  )

  const sheets = getSheetsClient()
  const filas = []

  for (const vehiculo of activos) {
    const fechaInicio = `${fecha} 00:00:00`
    const fechaFin = `${fecha} 23:59:59`
    const fechaFormato = fecha.replace(/-/g, '/')

    const historial = await obtenerHistorial(
      vehiculo.service_code,
      fechaFormato.replace(/-/g, '/') + ' 00:00:00',
      fechaFormato.replace(/-/g, '/') + ' 23:59:59'
    )

    const eventos = historial.events || []
    if (!eventos.length) continue

    const velocidadMax = Math.max(...eventos.map(e => e.speed || 0))
const odoInicio = parseFloat(eventos[0]?.odometer) || 0
const odoFin = parseFloat(eventos[eventos.length - 1]?.odometer) || 0

const kmRecorridos = Math.max(0, odoFin - odoInicio)
    const encendidos = eventos.filter(e => e.ignition === 1)

    const primerEvento = new Date(encendidos[0]?.generationDate)
const ultimoEvento = new Date(encendidos[encendidos.length - 1]?.generationDate)

const tiempoEncendidoMin = encendidos.length
  ? Math.round((ultimoEvento - primerEvento) / 1000 / 60)
  : 0

    const primerEncendido = eventos.filter(e => e.ignition === 1).pop()?.generationDate || ''
    const ultimoApagado = eventos.find(e => e.ignition === 0)?.generationDate || ''

    filas.push([
      fecha,
      vehiculo.placa,
      vehiculo.service_code,
      kmRecorridos.toFixed(2),
      tiempoEncendidoMin,
      velocidadMax,
      primerEncendido,
      ultimoApagado
    ])
  }

  if (filas.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Satrack_Resumen!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: filas }
    })
  }

  return filas
}

export const satrackHelper = {
  obtenerUltimasPosiciones,
  obtenerHistorial,
  guardarResumenDiario
}