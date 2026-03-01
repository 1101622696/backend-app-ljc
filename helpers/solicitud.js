import { google } from 'googleapis';
import path from 'path';
import stream from 'stream';
import { prevueloHelper } from '../helpers/prevuelos.js';
import {postvueloHelper} from '../helpers/postvuelos.js';
import { firebaseHelper } from '../helpers/firebase.js';
import nodemailer from 'nodemailer';

const spreadsheetId = '1sJwTVoeFelYt5QE2Pk8KSYFZ8_3wRQjWr5HlDkhhrso';

const getAuth = () => {
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ],
    });
  } else {
    return new google.auth.GoogleAuth({
      keyFile: './config/credenciales-sheets.json',
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ],
    });
  }
};

const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',  
    auth: {
      user: process.env.EMAIL_USER,       
      pass: process.env.EMAIL_APP_PASSWORD 
    }
  });
};

// Cliente Sheets
const getSheetsClient = async () => {
  const authClient = getAuth();
  const client = await authClient.getClient();
  return google.sheets({ version: 'v4', auth: client });
};

const getDriveClient = async () => {
  const authClient = getAuth();
  const client = await authClient.getClient();
  return google.drive({ version: 'v3', auth: client });
};

const obtenerDatosSolicitud = async (nombreHoja, rango = 'A1:BF1000') => {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${nombreHoja}!${rango}`,
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(row =>
    Object.fromEntries(row.map((val, i) => [headers[i], val]))
  );
};

const getSolicitudesVuelo = async () => {
  const solicitudes = await obtenerDatosSolicitud('SolicitudVuelo');
  
  return solicitudes.sort((a, b) => {
    const numA = parseInt(a.consecutivo.replace(/\D/g, ''), 10);
    const numB = parseInt(b.consecutivo.replace(/\D/g, ''), 10);
    
    return numB - numA;
  });
};

const getSiguienteConsecutivo = async () => {
  const solicitudes = await getSolicitudesVuelo();
  
  const numeros = solicitudes
    .map(item => {
      const match = item.consecutivo?.match(/\d+/); // Extrae los números de SAV-0001
      return match ? parseInt(match[0], 10) : null;
    })
    .filter(n => n !== null);
  
  const max = numeros.length ? Math.max(...numeros) : 0;
  const siguiente = (max + 1).toString().padStart(4, '0');
  
  return `SAV-${siguiente}`;
};

const calcularDuracionSolicitud = (hora_inicio, hora_fin) => {
  if (!hora_inicio || !hora_fin || hora_inicio.trim() === '' || hora_fin.trim() === '') {
    console.warn('calcularDuracion: hora_inicio o hora_fin están vacíos o undefined');
    return 0; 
  }

  try {
    const [horaInicioHoras, horaInicioMinutos] = hora_inicio.split(':').map(Number);
    const [horaFinHoras, horaFinMinutos] = hora_fin.split(':').map(Number);
    
    let minutosInicio = horaInicioHoras * 60 + horaInicioMinutos;
    let minutosFin = horaFinHoras * 60 + horaFinMinutos;
    
    if (minutosFin < minutosInicio) {
      minutosFin += 24 * 60; 
    }
    
    return minutosFin - minutosInicio;
  } catch (error) {
    console.error('Error al calcular duración:', error);
    return 0;
  }
};

// funciona pero sin el envío de correos

// const guardarSolicitud = async ({ useremail, username, tipodeoperacionaerea, empresa, fecha_inicio, hora_inicio, fecha_fin, hora_fin, detalles_cronograma, peso_maximo, municipio, departamento, tipodecontactovisualconlaua, vueloespecial, justificacionvueloespecial, poligononombre, altura_poligono, latitud_poligono_1, longitud_poligono_1, latitud_poligono_2, longitud_poligono_2, latitud_poligono_3, longitud_poligono_3, latitud_poligono_4, longitud_poligono_4, latitud_poligono_5, longitud_poligono_5, tramolinealnombre, altura_tramo, latitud_tramo_1, longitud_tramo_1, latitud_tramo_2, longitud_tramo_2, latitud_tramo_3, longitud_tramo_3, latitud_tramo_4, longitud_tramo_4, latitud_tramo_5, longitud_tramo_5, circuferenciaencoordenadayradionombre, altura_circunferencia, latitud_circunferencia_1, longitud_circunferencia_1, check_kmz, Link, estado, fechadeCreacion, realizado, username_final, useremail_final, duracion }) => {
//   const sheets = await getSheetsClient();
//   const consecutivo = await getSiguienteConsecutivo();
 
//   const duracionestimada = duracion || calcularDuracionSolicitud(hora_inicio, hora_fin);

//   const nuevaFila = [consecutivo, useremail === null ? '' : useremail, username === null ? '' : username, tipodeoperacionaerea, empresa, fecha_inicio, hora_inicio, fecha_fin, hora_fin, detalles_cronograma, peso_maximo, municipio, departamento, tipodecontactovisualconlaua, vueloespecial, justificacionvueloespecial, poligononombre, altura_poligono, latitud_poligono_1, longitud_poligono_1, latitud_poligono_2, longitud_poligono_2, latitud_poligono_3, longitud_poligono_3, latitud_poligono_4, longitud_poligono_4, latitud_poligono_5, longitud_poligono_5, tramolinealnombre, altura_tramo, latitud_tramo_1, longitud_tramo_1, latitud_tramo_2, longitud_tramo_2, latitud_tramo_3, longitud_tramo_3, latitud_tramo_4, longitud_tramo_4, latitud_tramo_5, longitud_tramo_5, circuferenciaencoordenadayradionombre, altura_circunferencia, latitud_circunferencia_1, longitud_circunferencia_1, check_kmz, Link, estado, fechadeCreacion, realizado, username_final, useremail_final, "", "", "", "", "", duracionestimada];

//   await sheets.spreadsheets.values.append({
//     spreadsheetId,
//     range: 'SolicitudVuelo!A1',
//     valueInputOption: 'RAW',
//     insertDataOption: 'INSERT_ROWS',
//     requestBody: { values: [nuevaFila] },
//   });

//   return { consecutivo };
// };

const guardarSolicitud = async ({ useremail, username, tipodeoperacionaerea, empresa, fecha_inicio, hora_inicio, fecha_fin, hora_fin, detalles_cronograma, peso_maximo, municipio, departamento, tipodecontactovisualconlaua, vueloespecial, justificacionvueloespecial, poligononombre, altura_poligono, latitud_poligono_1, longitud_poligono_1, latitud_poligono_2, longitud_poligono_2, latitud_poligono_3, longitud_poligono_3, latitud_poligono_4, longitud_poligono_4, latitud_poligono_5, longitud_poligono_5, tramolinealnombre, altura_tramo, latitud_tramo_1, longitud_tramo_1, latitud_tramo_2, longitud_tramo_2, latitud_tramo_3, longitud_tramo_3, latitud_tramo_4, longitud_tramo_4, latitud_tramo_5, longitud_tramo_5, circuferenciaencoordenadayradionombre, altura_circunferencia, latitud_circunferencia_1, longitud_circunferencia_1, check_kmz, Link, estado, fechadeCreacion, realizado, username_final, useremail_final, sucursal, duracion }) => {
  const sheets = await getSheetsClient();
  const consecutivo = await getSiguienteConsecutivo();
 
  const duracionestimada = duracion || calcularDuracionSolicitud(hora_inicio, hora_fin);

  const nuevaFila = [consecutivo, useremail === null ? '' : useremail, username === null ? '' : username, tipodeoperacionaerea, empresa, fecha_inicio, hora_inicio, fecha_fin, hora_fin, detalles_cronograma, peso_maximo, municipio, departamento, tipodecontactovisualconlaua, vueloespecial, justificacionvueloespecial, poligononombre, altura_poligono, latitud_poligono_1, longitud_poligono_1, latitud_poligono_2, longitud_poligono_2, latitud_poligono_3, longitud_poligono_3, latitud_poligono_4, longitud_poligono_4, latitud_poligono_5, longitud_poligono_5, tramolinealnombre, altura_tramo, latitud_tramo_1, longitud_tramo_1, latitud_tramo_2, longitud_tramo_2, latitud_tramo_3, longitud_tramo_3, latitud_tramo_4, longitud_tramo_4, latitud_tramo_5, longitud_tramo_5, circuferenciaencoordenadayradionombre, altura_circunferencia, latitud_circunferencia_1, longitud_circunferencia_1, check_kmz, Link, estado, fechadeCreacion, realizado, username_final, useremail_final, sucursal, "", "", "", "", duracionestimada];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'SolicitudVuelo!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [nuevaFila] },
  });

      try {
    const destinatario = "apinto@sevicol.com.co";
    // const destinatario = "cardenasdiegom6@gmail.com";
    
    await enviarNotificacionSolicitud({
      destinatario,
      consecutivo: consecutivo,
      solicitante: username_final,
      fecha: fecha_inicio,
      empresa,
    });
    
    console.log(`Notificación enviada para la solicitud ${consecutivo}`);
  } catch (error) {
    console.error('Error al enviar notificación:', error);
  }

  return { consecutivo };
};

const enviarNotificacionSolicitud = async (datos) => {
  try {
    const transporter = createTransporter();

    const urlBase = "https://script.google.com/macros/s/AKfycbzoGLCKAxvDny6qhIMze-cGaaitGPt9yIhByUKYY1aI41gwysmisEIvn0UEP6qg7SH6/exec";
    const linkFormulario = `${urlBase}?solicitud=${datos.consecutivo}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #ffffff; color: white; padding: 10px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center;">
            <img src="https://docs.google.com/drawings/d/e/2PACX-1vQw98R1ZTlOAY_mVURreLAh0eGVKAodHN9VVuOk8wBHQ_WZmveIAn6e9588ix1u-NqmnH6rrYjPEzes/pub?w=480&h=360" 
                 alt="Logo SVA" 
                 style="width: 150px; height: auto; margin-right: 10px;">
            <div>
              <h2 style="color: black; font-size: 24px; font-weight: bold; margin: 0;">Nueva Solicitud Registrada</h2>
              <p style="margin: 5px 0;">SVA SEVICOL LTDA</p>
            </div>
          </div>
        </div>
        
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p>Se ha registrado una nueva solicitud con la siguiente información:</p>
          
          <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Consecutivo:</strong> ${datos.consecutivo}</p>
            <p style="margin: 5px 0;"><strong>Solicitante:</strong> ${datos.solicitante}</p>
            <p style="margin: 5px 0;"><strong>Fecha:</strong> ${datos.fecha}</p>
            <p style="margin: 5px 0;"><strong>Empresa:</strong> ${datos.empresa}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${linkFormulario}"
                style="background-color: #28a745;
                       color: white;
                       padding: 12px 25px;
                       text-decoration: none;
                       border-radius: 5px;
                       display: inline-block;
                       font-weight: bold;">
              Aprobar Solicitud
            </a>
          </div>
          
          <p style="color: #666; font-size: 0.9em;">Si el botón no funciona, copie y pegue el siguiente enlace en su navegador:</p>
          <p style="color: #666; font-size: 0.9em;">${linkFormulario}</p>
        </div>
        
        <div style="padding: 20px; text-align: center; color: #666;">
          <p>Saludos cordiales,<br>
          Sistema de Gestión de Vuelos<br>
          SVA SEVICOL LTDA</p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: '"Sistema de Vuelos" <dcardenas@sevicol.com.co>',
      to: datos.destinatario,
      subject: `Nueva Solicitud Registrada - Consecutivo: ${datos.consecutivo}`,
      html: htmlBody
    });

    console.log('Correo enviado:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error al enviar correo de notificación:', error);
    throw error;
  }
};

const getSolicitudesByConsecutivo = async (consecutivo) => {
  const solicitudes = await getSolicitudesVuelo();
  return solicitudes.find(solicitud => 
    solicitud.consecutivo && solicitud.consecutivo.toLowerCase() === consecutivo.toLowerCase()
  );
};

const obtenerTodasLasHojas = async () => {
  const sheets = await getSheetsClient();
  
  const batchRequest = {
    spreadsheetId,
    ranges: [
      'SolicitudVuelo!A1:BF1000',
      'Prevuelo!A1:AK1000', 
      'PostVuelo!A1:S1000'
    ],
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING'
  };

  const response = await sheets.spreadsheets.values.batchGet(batchRequest);
  
  return {
    solicitudVuelo: response.data.valueRanges[0].values || [],
    prevuelo: response.data.valueRanges[1].values || [],
    postVuelo: response.data.valueRanges[2].values || []
  };
};

const getSolicitudesConEstadosGenerales = async () => {
  try {
    const { solicitudVuelo, prevuelo, postVuelo } = await obtenerTodasLasHojas();

    if (!solicitudVuelo.length || !prevuelo.length || !postVuelo.length) {
      throw new Error('No se pudieron obtener los datos de las hojas');
    }

    const mapaPrevuelo = {};
    const mapaPostVuelo = {};

    for (let i = 1; i < prevuelo.length; i++) {
      if (prevuelo[i].length > 35) {
        const email = prevuelo[i][1];
        const consecutivo = prevuelo[i][2];
        const estado = prevuelo[i][35];
        
        if (email && consecutivo) {
          mapaPrevuelo[`${consecutivo}-${email}`] = estado || "No iniciado";
        }
      }
    }

    for (let i = 1; i < postVuelo.length; i++) {
      if (postVuelo[i].length > 16) {
        const prevueloAsociado = postVuelo[i][1];
        const estado = postVuelo[i][16];
        
        if (prevueloAsociado) {
          mapaPostVuelo[prevueloAsociado] = estado || "No iniciado";
        }
      }
    }

    const resultados = [];

    for (let i = 1; i < solicitudVuelo.length; i++) {
      if (solicitudVuelo[i].length > 46) {
        const fila = solicitudVuelo[i];
        const consecutivo = fila[0];
        const email = fila[1];
        const piloto = fila[2];
        const cliente = fila[4];
        const fecha = fila[5];
        const estadoSolicitud = fila[46];

        if (consecutivo) {
          let estadoPrevuelo = "No iniciado";
          let estadoPostVuelo = "No iniciado";

          if (email) {
            const clave = `${consecutivo}-${email}`;
            estadoPrevuelo = mapaPrevuelo[clave] || "No iniciado";
            estadoPostVuelo = mapaPostVuelo[consecutivo] || "No iniciado";
          } else {
            // Si no hay email, buscar solo por consecutivo en postvuelo
            estadoPostVuelo = mapaPostVuelo[consecutivo] || "No iniciado";
            
            // Para prevuelo sin email, buscar cualquier entrada con ese consecutivo
            for (const [clave, estado] of Object.entries(mapaPrevuelo)) {
              if (clave.startsWith(`${consecutivo}-`)) {
                estadoPrevuelo = estado;
                break;
              }
            }
          }

          if (estadoSolicitud === "Cancelado") {
            estadoPrevuelo = "Cancelado";
            estadoPostVuelo = "Cancelado";
          }

          // Formatear fecha si es necesario
          let fechaFormateada = fecha;
          if (fecha instanceof Date) {
            fechaFormateada = fecha.toISOString().split('T')[0];
          } else if (typeof fecha === 'string' && fecha.includes('T')) {
            fechaFormateada = fecha.split('T')[0];
          }

          resultados.push({
            consecutivo,
            email: email || '',
            cliente: cliente || '',
            fecha: fechaFormateada || '',
            piloto: piloto || '',
            estadoSolicitud: estadoSolicitud || 'Pendiente',
            estadoPrevuelo,
            estadoPostVuelo,
            estadoGeneral: determinarEstadoGeneral(estadoSolicitud, estadoPrevuelo, estadoPostVuelo)
          });
        }
      }
    }

    // Ordenar por consecutivo (más reciente primero)
    return resultados.sort((a, b) => {
      const numA = parseInt(a.consecutivo.replace(/\D/g, ''), 10);
      const numB = parseInt(b.consecutivo.replace(/\D/g, ''), 10);
      return numB - numA;
    });

  } catch (error) {
    console.error('Error al obtener solicitudes con estados generales:', error);
    throw error;
  }
};

const determinarEstadoGeneral = (estadoSolicitud, estadoPrevuelo, estadoPostVuelo) => {
  if (estadoSolicitud === "Cancelado") {
    return "Cancelado";
  }
  
  if (estadoSolicitud === "Pendiente") {
    return "Solicitud Pendiente";
  }
  
  if (estadoSolicitud === "Enespera") {
    return "Solicitud en Espera";
  }
  
  if (estadoSolicitud === "Denegado" || estadoPrevuelo === "Denegado" || estadoPostVuelo === "Denegado") {
    return "Denegado";
  }
  
  if (estadoSolicitud === "Aprobado") {
    if (estadoPrevuelo === "Aprobado" && estadoPostVuelo === "Aprobado") {
      return "Completado";
    }
    if (estadoPostVuelo === "Pendiente") {
      return "Postvuelo Pendiente";
    }
    if (estadoPrevuelo === "Pendiente") {
      return "Prevuelo Pendiente";
    }
    if (estadoPrevuelo === "No iniciado") {
      return "Prevuelo no iniciado";
    }
    if (estadoPrevuelo === "Cancelado") {
      return "Prevuelo Cancelado";
    }
    
    return "Sin Postvuelo";
  }
  
  return "Estado Desconocido";
};

const getSolicitudesConEstadosGeneralesSolicitante = async () => {
  try {
    const { solicitudVuelo, prevuelo, postVuelo } = await obtenerTodasLasHojas();

    if (!solicitudVuelo.length || !prevuelo.length || !postVuelo.length) {
      throw new Error('No se pudieron obtener los datos de las hojas');
    }

    const mapaPrevuelo = {};
    const mapaPostVuelo = {};

    for (let i = 1; i < prevuelo.length; i++) {
      const consecutivo = prevuelo[i][2]; // Columna 3 (índice 2)
      const estado = prevuelo[i][35];
      
      if (consecutivo && estado) {
        mapaPrevuelo[consecutivo] = estado; // Solo usar consecutivo como clave
      }
    }

    for (let i = 1; i < postVuelo.length; i++) {
      if (postVuelo[i].length > 16) {
        const consecutivo = postVuelo[i][1]; // Columna 2 (índice 1)
        const estado = postVuelo[i][16];
        
        if (consecutivo) {
          mapaPostVuelo[consecutivo] = estado || "No iniciado";
        }
      }
    }

    const resultados = [];

    for (let i = 1; i < solicitudVuelo.length; i++) {
      if (solicitudVuelo[i].length > 50) {
        const fila = solicitudVuelo[i];
        const consecutivo = fila[0]; // Columna 1 (índice 0)
        const email = fila[50]; // Email del solicitante
        const piloto = fila[2];
        const cliente = fila[4];
        const fecha = fila[5];
        const estadoSolicitud = fila[46];

        if (consecutivo && email) {
          const estadoPrevuelo = mapaPrevuelo[consecutivo] || "No iniciado";
          const estadoPostVuelo = mapaPostVuelo[consecutivo] || "No iniciado";

          let fechaFormateada = fecha;
          if (fecha instanceof Date) {
            fechaFormateada = fecha.toISOString().split('T')[0];
          } else if (typeof fecha === 'string' && fecha.includes('T')) {
            fechaFormateada = fecha.split('T')[0];
          }

          resultados.push({
            consecutivo,
            email,
            cliente: cliente || '',
            fecha: fechaFormateada || '',
            piloto: piloto || '',
            estadoSolicitud: estadoSolicitud || 'Pendiente',
            estadoPrevuelo,
            estadoPostVuelo,
            estadoGeneral: determinarEstadoGeneral(estadoSolicitud, estadoPrevuelo, estadoPostVuelo)
          });
        }
      }
    }

    return resultados.sort((a, b) => {
      const numA = parseInt(a.consecutivo.replace(/\D/g, ''), 10);
      const numB = parseInt(b.consecutivo.replace(/\D/g, ''), 10);
      return numB - numA;
    });

  } catch (error) {
    console.error('Error al obtener solicitudes con estados generales:', error);
    throw error;
  }
};

const getResumenSolicitudesPorEmail = async (email) => {
  try {
    const todasLasSolicitudes = await getSolicitudesConEstadosGenerales();
    const solicitudesFiltradas = todasLasSolicitudes.filter(s => s.email === email);

    const mapConDatos = (lista) => {
      return lista.map(r => ({
        consecutivo: r.consecutivo,
        cliente: r.cliente || '',
        piloto: r.piloto || '',
        fecha: r.fecha || '',
        estadoSolicitud: r.estadoSolicitud,
        estadoPrevuelo: r.estadoPrevuelo,
        estadoPostVuelo: r.estadoPostVuelo,
        estadoGeneral: r.estadoGeneral
      }));
    };

    return {
      total: {
        count: solicitudesFiltradas.length,
        consecutivos: mapConDatos(solicitudesFiltradas)
      },
      pendientes: {
        count: solicitudesFiltradas.filter(r => 
          r.estadoSolicitud === "Pendiente" || 
          r.estadoPrevuelo === "Pendiente" || 
          r.estadoPostVuelo === "Pendiente"
        ).length,
        consecutivos: mapConDatos(solicitudesFiltradas.filter(r => 
          r.estadoSolicitud === "Pendiente" || 
          r.estadoPrevuelo === "Pendiente" || 
          r.estadoPostVuelo === "Pendiente"
        ))
      },
      enespera: {
        count: solicitudesFiltradas.filter(r => r.estadoSolicitud === "Enespera").length,
        consecutivos: mapConDatos(solicitudesFiltradas.filter(r => r.estadoSolicitud === "Enespera"))
      },
      sinprevuelos: {
        count: solicitudesFiltradas.filter(r => r.estadoPrevuelo === "No iniciado").length,
        consecutivos: mapConDatos(solicitudesFiltradas.filter(r => r.estadoPrevuelo === "No iniciado"))
      },
      sinpostvuelos: {
        count: solicitudesFiltradas.filter(r => r.estadoPostVuelo === "No iniciado").length,
        consecutivos: mapConDatos(solicitudesFiltradas.filter(r => r.estadoPostVuelo === "No iniciado"))
      },
      aprobados: {
        count: solicitudesFiltradas.filter(r => 
          r.estadoSolicitud === "Aprobado" || 
          r.estadoPrevuelo === "Aprobado" || 
          r.estadoPostVuelo === "Aprobado"
        ).length,
        consecutivos: mapConDatos(solicitudesFiltradas.filter(r => 
          r.estadoSolicitud === "Aprobado" || 
          r.estadoPrevuelo === "Aprobado" || 
          r.estadoPostVuelo === "Aprobado"
        ))
      },
      completados: {
        count: solicitudesFiltradas.filter(r => 
          r.estadoSolicitud === "Aprobado" && 
          r.estadoPrevuelo === "Aprobado" && 
          r.estadoPostVuelo === "Aprobado"
        ).length,
        consecutivos: mapConDatos(solicitudesFiltradas.filter(r => 
          r.estadoSolicitud === "Aprobado" && 
          r.estadoPrevuelo === "Aprobado" && 
          r.estadoPostVuelo === "Aprobado"
        ))
      },
      cancelados: {
        count: solicitudesFiltradas.filter(r => r.estadoSolicitud === "Cancelado").length,
        consecutivos: mapConDatos(solicitudesFiltradas.filter(r => r.estadoSolicitud === "Cancelado"))
      }
    };
  } catch (error) {
    console.error('Error al obtener resumen de solicitudes por email:', error);
    throw error;
  }
};

const getResumenSolicitudesPorSolicitante = async (email) => {
  try {
    const todasLasSolicitudes = await getSolicitudesConEstadosGeneralesSolicitante();
    const solicitudesFiltradas = todasLasSolicitudes.filter(s => s.email === email);

    const mapConDatos = (lista) => {
      return lista.map(r => ({
        consecutivo: r.consecutivo,
        cliente: r.cliente || '',
        piloto: r.piloto || '',
        fecha: r.fecha || '',
        estadoSolicitud: r.estadoSolicitud,
        estadoPrevuelo: r.estadoPrevuelo,
        estadoPostVuelo: r.estadoPostVuelo,
        estadoGeneral: r.estadoGeneral
      }));
    };

    return {
      total: {
        count: solicitudesFiltradas.length,
        consecutivos: mapConDatos(solicitudesFiltradas)
      },
      pendientes: {
        count: solicitudesFiltradas.filter(r => 
          r.estadoSolicitud === "Pendiente" || 
          r.estadoPrevuelo === "Pendiente" || 
          r.estadoPostVuelo === "Pendiente"
        ).length,
        consecutivos: mapConDatos(solicitudesFiltradas.filter(r => 
          r.estadoSolicitud === "Pendiente" || 
          r.estadoPrevuelo === "Pendiente" || 
          r.estadoPostVuelo === "Pendiente"
        ))
      },
      enespera: {
        count: solicitudesFiltradas.filter(r => r.estadoSolicitud === "Enespera").length,
        consecutivos: mapConDatos(solicitudesFiltradas.filter(r => r.estadoSolicitud === "Enespera"))
      },
      sinprevuelos: {
        count: solicitudesFiltradas.filter(r => r.estadoPrevuelo === "No iniciado").length,
        consecutivos: mapConDatos(solicitudesFiltradas.filter(r => r.estadoPrevuelo === "No iniciado"))
      },
      sinpostvuelos: {
        count: solicitudesFiltradas.filter(r => r.estadoPostVuelo === "No iniciado").length,
        consecutivos: mapConDatos(solicitudesFiltradas.filter(r => r.estadoPostVuelo === "No iniciado"))
      },
      aprobados: {
        count: solicitudesFiltradas.filter(r => 
          r.estadoSolicitud === "Aprobado" || 
          r.estadoPrevuelo === "Aprobado" || 
          r.estadoPostVuelo === "Aprobado"
        ).length,
        consecutivos: mapConDatos(solicitudesFiltradas.filter(r => 
          r.estadoSolicitud === "Aprobado" || 
          r.estadoPrevuelo === "Aprobado" || 
          r.estadoPostVuelo === "Aprobado"
        ))
      },
      completados: {
        count: solicitudesFiltradas.filter(r => 
          r.estadoSolicitud === "Aprobado" && 
          r.estadoPrevuelo === "Aprobado" && 
          r.estadoPostVuelo === "Aprobado"
        ).length,
        consecutivos: mapConDatos(solicitudesFiltradas.filter(r => 
          r.estadoSolicitud === "Aprobado" && 
          r.estadoPrevuelo === "Aprobado" && 
          r.estadoPostVuelo === "Aprobado"
        ))
      },
      cancelados: {
        count: solicitudesFiltradas.filter(r => r.estadoSolicitud === "Cancelado").length,
        consecutivos: mapConDatos(solicitudesFiltradas.filter(r => r.estadoSolicitud === "Cancelado"))
      }
    };
  } catch (error) {
    console.error('Error al obtener resumen de solicitudes por email:', error);
    throw error;
  }
};

const getResumenSolicitudesGeneral = async () => {
  try {
    const todasLasSolicitudes = await getSolicitudesConEstadosGenerales();

    const mapConDatos = (lista) => {
      return lista.map(r => ({
        consecutivo: r.consecutivo,
        cliente: r.cliente || '',
        piloto: r.piloto || '',
        fecha: r.fecha || '',
        estadoSolicitud: r.estadoSolicitud,
        estadoPrevuelo: r.estadoPrevuelo,
        estadoPostVuelo: r.estadoPostVuelo,
        estadoGeneral: r.estadoGeneral
      }));
    };

    return {
      total: {
        count: todasLasSolicitudes.length,
        consecutivos: mapConDatos(todasLasSolicitudes)
      },
      pendientes: {
        count: todasLasSolicitudes.filter(r => 
          r.estadoSolicitud === "Pendiente" || 
          r.estadoPrevuelo === "Pendiente" || 
          r.estadoPostVuelo === "Pendiente"
        ).length,
        consecutivos: mapConDatos(todasLasSolicitudes.filter(r => 
          r.estadoSolicitud === "Pendiente" || 
          r.estadoPrevuelo === "Pendiente" || 
          r.estadoPostVuelo === "Pendiente"
        ))
      },
      enespera: {
        count: todasLasSolicitudes.filter(r => r.estadoSolicitud === "Enespera").length,
        consecutivos: mapConDatos(todasLasSolicitudes.filter(r => r.estadoSolicitud === "Enespera"))
      },
      sinprevuelos: {
        count: todasLasSolicitudes.filter(r => r.estadoPrevuelo === "No iniciado").length,
        consecutivos: mapConDatos(todasLasSolicitudes.filter(r => r.estadoPrevuelo === "No iniciado"))
      },
      sinpostvuelos: {
        count: todasLasSolicitudes.filter(r => r.estadoPostVuelo === "No iniciado").length,
        consecutivos: mapConDatos(todasLasSolicitudes.filter(r => r.estadoPostVuelo === "No iniciado"))
      },
      aprobados: {
        count: todasLasSolicitudes.filter(r => 
          r.estadoSolicitud === "Aprobado" || 
          r.estadoPrevuelo === "Aprobado" || 
          r.estadoPostVuelo === "Aprobado"
        ).length,
        consecutivos: mapConDatos(todasLasSolicitudes.filter(r => 
          r.estadoSolicitud === "Aprobado" || 
          r.estadoPrevuelo === "Aprobado" || 
          r.estadoPostVuelo === "Aprobado"
        ))
      },
      completados: {
        count: todasLasSolicitudes.filter(r => 
          r.estadoSolicitud === "Aprobado" && 
          r.estadoPrevuelo === "Aprobado" && 
          r.estadoPostVuelo === "Aprobado"
        ).length,
        consecutivos: mapConDatos(todasLasSolicitudes.filter(r => 
          r.estadoSolicitud === "Aprobado" && 
          r.estadoPrevuelo === "Aprobado" && 
          r.estadoPostVuelo === "Aprobado"
        ))
      },
      cancelados: {
        count: todasLasSolicitudes.filter(r => r.estadoSolicitud === "Cancelado").length,
        consecutivos: mapConDatos(todasLasSolicitudes.filter(r => r.estadoSolicitud === "Cancelado"))
      }
    };
  } catch (error) {
    console.error('Error al obtener resumen de solicitudes por email:', error);
    throw error;
  }
};

const getSolicitudPorConsecutivo = async (consecutivo, email = null) => {
  try {
    const todasLasSolicitudes = await getSolicitudesConEstadosGenerales();
    
    if (email) {
      // Si se proporciona email, buscar coincidencia exacta
      return todasLasSolicitudes.find(s => s.consecutivo === consecutivo && s.email === email);
    } else {
      // Si no se proporciona email, buscar solo por consecutivo
      return todasLasSolicitudes.find(s => s.consecutivo === consecutivo);
    }
  } catch (error) {
    console.error('Error al obtener solicitud por consecutivo:', error);
    throw error;
  }
};

const getSolicitudesPorEstadoGeneral = async (estadoGeneral, email = null) => {
  try {
    const todasLasSolicitudes = await getSolicitudesConEstadosGenerales();
    let solicitudesFiltradas = todasLasSolicitudes.filter(s => s.estadoGeneral === estadoGeneral);
    
    if (email) {
      solicitudesFiltradas = solicitudesFiltradas.filter(s => s.email === email);
    }
    
    return solicitudesFiltradas;
  } catch (error) {
    console.error('Error al obtener solicitudes por estado general:', error);
    throw error;
  }
};

const editarSolicitudPorConsecutivo = async (consecutivo, nuevosDatos) => {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'SolicitudVuelo!A2:N', 
  });

  const filas = response.data.values;
  const filaIndex = filas.findIndex(fila => fila[0]?.toLowerCase() === consecutivo.toLowerCase());

  if (filaIndex === -1) {
    return null; 
  }

  const filaActual = filas[filaIndex];
  
  const filaEditada = [
    filaActual[0], 
    nuevosDatos.pilotoemail !== undefined ? nuevosDatos.pilotoemail : filaActual[1],
    nuevosDatos.pilotonombre !== undefined ? nuevosDatos.pilotonombre : filaActual[2],
    nuevosDatos.tipodeoperacionaerea || filaActual[3], 
    nuevosDatos.empresa || filaActual[4],
    nuevosDatos.fecha_inicio || filaActual[5], 
    nuevosDatos.hora_inicio || filaActual[6], 
    nuevosDatos.fecha_fin || filaActual[7], 
    nuevosDatos.hora_fin || filaActual[8], 
    nuevosDatos.detalles_cronograma || filaActual[9], 
    nuevosDatos.peso_maximo || filaActual[10], 
    nuevosDatos.municipio || filaActual[11], 
    nuevosDatos.departamento || filaActual[12], 
    nuevosDatos.tipodecontactovisualconlaua || filaActual[13], 
    nuevosDatos.vueloespecial || filaActual[14], 
    nuevosDatos.justificacionvueloespecial || filaActual[15], 
    nuevosDatos.poligononombre || filaActual[16], 
    nuevosDatos.altura_poligono || filaActual[17], 
    nuevosDatos.latitud_poligono_1 || filaActual[18], 
    nuevosDatos.longitud_poligono_1 || filaActual[19], 
    nuevosDatos.latitud_poligono_2 || filaActual[20], 
    nuevosDatos.longitud_poligono_2 || filaActual[21], 
    nuevosDatos.latitud_poligono_3 || filaActual[22], 
    nuevosDatos.longitud_poligono_3 || filaActual[23], 
    nuevosDatos.latitud_poligono_4 || filaActual[24], 
    nuevosDatos.longitud_poligono_4 || filaActual[25], 
    nuevosDatos.latitud_poligono_5 || filaActual[26], 
    nuevosDatos.longitud_poligono_5 || filaActual[27], 
    nuevosDatos.tramolinealnombre || filaActual[28], 
    nuevosDatos.altura_tramo || filaActual[29], 
    nuevosDatos.latitud_tramo_1 || filaActual[30], 
    nuevosDatos.longitud_tramo_1 || filaActual[31], 
    nuevosDatos.latitud_tramo_2 || filaActual[32], 
    nuevosDatos.longitud_tramo_2 || filaActual[33], 
    nuevosDatos.latitud_tramo_3 || filaActual[34], 
    nuevosDatos.longitud_tramo_3 || filaActual[35], 
    nuevosDatos.latitud_tramo_4 || filaActual[36], 
    nuevosDatos.longitud_tramo_4 || filaActual[37], 
    nuevosDatos.latitud_tramo_5 || filaActual[38], 
    nuevosDatos.longitud_tramo_5 || filaActual[39], 
    nuevosDatos.circuferenciaencoordenadayradionombre || filaActual[40], 
    nuevosDatos.altura_circunferencia || filaActual[41], 
    nuevosDatos.latitud_circunferencia_1 || filaActual[42], 
    nuevosDatos.longitud_circunferencia_1 || filaActual[43], 
    filaActual[44], 
    nuevosDatos.Link || filaActual[45], 
    filaActual[46], 
    filaActual[47], 
    nuevosDatos.realizado || filaActual[48], 
    filaActual[49], 
    filaActual[50],  
  ];

  const filaEnHoja = filaIndex + 2; 

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `SolicitudVuelo!A${filaEnHoja}:AY${filaEnHoja}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [filaEditada],
    },
  });

  return true;
};

const crearCarpeta = async (nombreCarpeta, parentFolderId) => {
  const drive = await getDriveClient();
  
  const fileMetadata = {
    name: nombreCarpeta,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentFolderId ? [parentFolderId] : []
  };
  
  const respuesta = await drive.files.create({
    resource: fileMetadata,
    fields: 'id, webViewLink'
  });
  
  return respuesta.data;
};

const subirArchivo = async (archivo, carpetaId) => {
  const drive = await getDriveClient();
  
  const fileMetadata = {
    name: archivo.originalname,
    parents: [carpetaId]
  };
  
  const bufferStream = new stream.PassThrough();
  bufferStream.end(archivo.buffer);
  
  const media = {
    mimeType: archivo.mimetype,
    body: bufferStream
  };
  
  const respuesta = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id, webViewLink'
  });
  
  return respuesta.data.webViewLink;
};

const procesarArchivos = async (archivos, consecutivo) => {
  if (!archivos || archivos.length === 0) {
    return null;
  }
  
  const carpetaPadreId = '1iaCvCuKoK-uMelKCg2OREkFBQj8bq5fW';
  
  let carpeta = await buscarCarpetaPorNombre(consecutivo, carpetaPadreId);
  
  if (!carpeta) {
    carpeta = await crearCarpeta(consecutivo, carpetaPadreId);
  }
  
  const enlaces = [];
  for (const archivo of archivos) {
    const enlace = await subirArchivo(archivo, carpeta.id);
    enlaces.push(enlace);
  }
  
  return carpeta.webViewLink;
};

const actualizarEstadoEnSheets = async (consecutivo, nuevoEstado = "aprobado") => {
  try {
    const sheets = await getSheetsClient();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'SolicitudVuelo',
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      throw new Error('No se encontraron datos en la hoja');
    }
    
    const headers = rows[0];
    const consecutivoIndex = headers.findIndex(header => 
      header.toLowerCase() === 'consecutivo');
    const estadoIndex = headers.findIndex(header => 
      header.toLowerCase() === 'estado');
    
    if (consecutivoIndex === -1 || estadoIndex === -1) {
      throw new Error('No se encontraron las columnas necesarias');
    }
    
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][consecutivoIndex] && 
          rows[i][consecutivoIndex].toLowerCase() === consecutivo.toLowerCase()) {
        rowIndex = i;
        break;
      }
    }
    
    if (rowIndex === -1) {
      throw new Error(`No se encontró el consecutivo ${consecutivo}`);
    }
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `SolicitudVuelo!${getColumnLetter(estadoIndex + 1)}${rowIndex + 1}`,
      valueInputOption: 'RAW',
      resource: {
        values: [[nuevoEstado]]
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error al actualizar el estado en Google Sheets:', error);
    throw error;
  }
};

function getColumnLetter(columnNumber) {
  let columnLetter = '';
  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    columnLetter = String.fromCharCode(65 + remainder) + columnLetter;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }
  return columnLetter;
}

const putSolicitudByStatus = async (consecutivo, nuevoEstado = "aprobado") => {
  return await actualizarEstadoEnSheets(consecutivo, nuevoEstado);
};

const subirArchivosACarpetaExistente = async (archivos, carpetaId) => {
  if (!archivos || archivos.length === 0) {
    return null;
  }
  
  const enlaces = [];
  for (const archivo of archivos) {
    const enlace = await subirArchivo(archivo, carpetaId);
    enlaces.push(enlace);
  }
  
  const drive = await getDriveClient();
  const carpeta = await drive.files.get({
    fileId: carpetaId,
    fields: 'webViewLink'
  });
  
  return carpeta.data.webViewLink;
};

const buscarCarpetaPorNombre = async (nombreCarpeta, parentFolderId) => {
  const drive = await getDriveClient();
  
  let query = `name = '${nombreCarpeta}' and mimeType = 'application/vnd.google-apps.folder'`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  }
  
  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive'
  });
  
  return response.data.files.length > 0 ? response.data.files[0] : null;
};

// const generarValidacionPrevuelo = async (consecutivo, numeroserie, piloto, notas = '', estado = 'Aprobado') => {
//   try {
//     const sheets = await getSheetsClient();
    
//     const solicitudResponse = await sheets.spreadsheets.values.get({
//       spreadsheetId,
//       range: 'SolicitudVuelo',
//     });
    
//     const rowsSolicitud = solicitudResponse.data.values;
//     if (!rowsSolicitud || rowsSolicitud.length === 0) {
//       throw new Error('No se encontraron datos en la hoja SolicitudVuelo');
//     }
    
//     const headersSolicitud = rowsSolicitud[0];
//     const consecutivoIndex = headersSolicitud.findIndex(header => 
//       header.toLowerCase() === 'consecutivo');
//     const empresaIndex = headersSolicitud.findIndex(header => 
//       header.toLowerCase() === 'empresa');
//     const fechaIndex = headersSolicitud.findIndex(header => 
//       header.toLowerCase() === 'fecha_inicio');
//     const nombreCompletoIndex = headersSolicitud.findIndex(header => 
//       header.toLowerCase() === 'nombre_completo');
//     const usuarioIndex = headersSolicitud.findIndex(header => 
//       header.toLowerCase() === 'usuario');
      
//     if (consecutivoIndex === -1) {
//       throw new Error('No se encontró la columna consecutivo');
//     }
    
//     let rowSolicitud = null;
//     let rowIndex = -1;
//     for (let i = 1; i < rowsSolicitud.length; i++) {
//       if (rowsSolicitud[i][consecutivoIndex] && 
//           rowsSolicitud[i][consecutivoIndex].toLowerCase() === consecutivo.toLowerCase()) {
//         rowSolicitud = rowsSolicitud[i];
//         rowIndex = i;
//         break;
//       }
//     }
    
//     if (!rowSolicitud) {
//       throw new Error(`No se encontró el consecutivo ${consecutivo}`);
//     }

//     const estadoIndex = headersSolicitud.findIndex(header => 
//   header.toLowerCase() === 'estado');

// if (estadoIndex !== -1 && rowIndex !== -1) {
//   await sheets.spreadsheets.values.update({
//     spreadsheetId,
//     range: `SolicitudVuelo!${String.fromCharCode(65 + estadoIndex)}${rowIndex + 1}`,
//     valueInputOption: 'RAW',
//     resource: {
//       values: [[estado]]
//     }
//   });
// }
//     // Obtener empresa y fecha de la solicitud
//     const empresa = empresaIndex !== -1 ? rowSolicitud[empresaIndex] : '';
//     const fechaSolicitud = fechaIndex !== -1 ? rowSolicitud[fechaIndex] : '';
    
//     // Verificar si ya existe un piloto asignado (nombre_completo) cuando no se recibe piloto
//     const nombreCompletoPiloto = nombreCompletoIndex !== -1 ? rowSolicitud[nombreCompletoIndex] || '' : '';
//     const usuarioAsignado = usuarioIndex !== -1 ? rowSolicitud[usuarioIndex] || '' : '';
    
//     // Si no se recibió piloto y existe un usuario asignado, usamos el nombre_completo
// // Si viene piloto del frontend, usar ese; si no, usar el existente en la solicitud
// let pilotoValor;
// let usarNombreCompleto = false;

// if (piloto) {
//   // Priorizar el piloto que viene del frontend
//   pilotoValor = typeof piloto === 'object' && piloto !== null
//     ? piloto.valor || piloto.label || JSON.stringify(piloto)
//     : piloto;
//   usarNombreCompleto = false;
// } else if (usuarioAsignado.trim() !== '') {
//   // Si no viene piloto del frontend, usar el existente
//   pilotoValor = nombreCompletoPiloto.trim();
//   usarNombreCompleto = true;
// } else {
//   pilotoValor = '';
// }
    
//     // Calcular fecha un día antes (si existe fecha en el registro)
//     let fechaAnterior = '';
//     if (fechaSolicitud) {
//       try {
//         const fecha = new Date(fechaSolicitud);
//         fecha.setDate(fecha.getDate() - 1);
//         fechaAnterior = fecha.toLocaleDateString('es-ES');
//       } catch (e) {
//         console.error('Error al calcular fecha anterior:', e);
//       }
//     }
    
//     // Obtener el último código consecutivo de la hoja 2.ValidacionPrevuelo
//     const validacionResponse = await sheets.spreadsheets.values.get({
//       spreadsheetId,
//       range: '2.ValidacionPrevuelo',
//     });
    
//     const rowsValidacion = validacionResponse.data.values || [];
    
//     // Generar nuevo código consecutivo (AV-X)
//     let ultimoNumero = 0;
//     if (rowsValidacion.length > 1) {  // Si hay al menos un registro (además de la cabecera)
//       const codigoColumna = 0; // Asumimos que el código está en la primera columna
      
//       // Buscar todos los códigos y obtener el número más alto
//       for (let i = 1; i < rowsValidacion.length; i++) {
//         if (rowsValidacion[i] && rowsValidacion[i][codigoColumna]) {
//           const codigo = rowsValidacion[i][codigoColumna];
//           const match = codigo.match(/AV-(\d+)/);
//           if (match && match[1]) {
//             const num = parseInt(match[1], 10);
//             if (num > ultimoNumero) {
//               ultimoNumero = num;
//             }
//           }
//         }
//       }
//     }
    
//     const nuevoCodigo = `AV-${ultimoNumero + 1}`;
//     const fechaActual = new Date().toLocaleDateString('es-ES');
    
//     // Extraer valores simples de los objetos si son objetos
//     const numeroSerieValor = typeof numeroserie === 'object' && numeroserie !== null 
//       ? numeroserie.valor || numeroserie.label || JSON.stringify(numeroserie) 
//       : numeroserie;
    
//     let emailPiloto = '';
//     let nombrePiloto = '';
    
//     // Solo buscar en la hoja de pilotos si no estamos usando el nombre_completo
//     if (!usarNombreCompleto && pilotoValor) {
//       // Obtener datos de la hoja de pilotos
//       const pilotosResponse = await sheets.spreadsheets.values.get({
//         spreadsheetId,
//         range: '3.Pilotos',
//       });
      
//       const pilotosRows = pilotosResponse.data.values || [];
//       if (pilotosRows.length <= 1) {
//         console.warn('No hay datos de pilotos disponibles');
//       } else {
//         // Encontrar los índices de las columnas que necesitamos
//         const identidadIndex = 5; // Columna F (índice 5 - basado en 0)
//         const nombresIndex = 1;   // Columna B (índice 1)
//         const apellidosIndex = 2; // Columna C (índice 2)
//         const emailIndex = 20;    // Columna U (índice 20)
        
//         // Buscar el piloto por identificación
//         let pilotoEncontrado = null;
        
//         for (let i = 1; i < pilotosRows.length; i++) {
//           const row = pilotosRows[i];
//           if (row[identidadIndex] && 
//               row[identidadIndex].toString().toLowerCase() === pilotoValor.toString().toLowerCase()) {
//             pilotoEncontrado = row;
//             break;
//           }
//         }
        
//         if (pilotoEncontrado) {
//           // Obtener el email del piloto (columna U)
//           emailPiloto = pilotoEncontrado[emailIndex] || '';
          
//           // Combinar nombres y apellidos (columnas B y C)
//           const nombres = pilotoEncontrado[nombresIndex] || '';
//           const apellidos = pilotoEncontrado[apellidosIndex] || '';
//           nombrePiloto = `${nombres} ${apellidos}`.trim();
          
//           // ACTUALIZAR la solicitud en la hoja SolicitudVuelo
//           if (rowIndex !== -1) {
//             // Actualizar email en la columna 2 (B)
//             await sheets.spreadsheets.values.update({
//               spreadsheetId,
//               range: `SolicitudVuelo!B${rowIndex + 1}`,
//               valueInputOption: 'RAW',
//               resource: {
//                 values: [[emailPiloto]]
//               }
//             });
            
//             // Actualizar nombre en la columna 3 (C)
//             await sheets.spreadsheets.values.update({
//               spreadsheetId,
//               range: `SolicitudVuelo!C${rowIndex + 1}`,
//               valueInputOption: 'RAW',
//               resource: {
//                 values: [[nombrePiloto]]
//               }
//             });
//           }
//         } else {
//           console.warn(`No se encontró un piloto con la identificación: ${pilotoValor}`);
//         }
//       }
//     }
    
// if (estado === 'Aprobado') {
//   // Actualizar estado del dron
//   const dronesResponse = await sheets.spreadsheets.values.get({
//     spreadsheetId,
//     range: '3.Drones',
//   });
  
//   const droneRows = dronesResponse.data.values || [];
//   if (droneRows.length > 1) {
//     // Buscar el dron por número de serie en la columna 2 (B - índice 1)
//     const numeroSerieIndex = 1; // Columna B (índice 1)
//     const disponibilidadCol = 'V'; // Columna V para disponibilidad
    
//     let droneRowIndex = -1;
//     for (let i = 1; i < droneRows.length; i++) {
//       if (droneRows[i][numeroSerieIndex] && 
//           droneRows[i][numeroSerieIndex].toString().toLowerCase() === numeroSerieValor.toString().toLowerCase()) {
//         droneRowIndex = i;
//         break;
//       }
//     }
    
//     // Si encontramos el dron, actualizamos la columna V a "si" (ocupado)
//     if (droneRowIndex !== -1) {
//       await sheets.spreadsheets.values.update({
//         spreadsheetId,
//         range: `3.Drones!${disponibilidadCol}${droneRowIndex + 1}`,
//         valueInputOption: 'RAW',
//         resource: {
//           values: [["si"]]
//         }
//       });
//     } else {
//       console.warn(`No se encontró un dron con el número de serie: ${numeroSerieValor}`);
//     }
//   } else {
//     console.warn('No hay datos de drones disponibles');
//   }
// }
    
//     const nuevoRegistro = [
//       nuevoCodigo,              // Código consecutivo
//       consecutivo,              // ID del registro de SolicitudVuelo
//       estado,               // Estado
//       numeroSerieValor,         // Valor extraído del objeto número serie del dron
//       pilotoValor,              // Valor del piloto (puede ser el ID o el nombre_completo)
//       empresa,                  // Empresa
//       fechaActual,              // Fecha actual
//       notas,                    // Notas
//       fechaAnterior             // Fecha un día antes
//     ];
    
//     // Anexar el nuevo registro a la hoja 2.ValidacionPrevuelo
//     await sheets.spreadsheets.values.append({
//       spreadsheetId,
//       range: '2.ValidacionPrevuelo',
//       valueInputOption: 'USER_ENTERED',
//       insertDataOption: 'INSERT_ROWS',
//       resource: {
//         values: [nuevoRegistro]
//       }
//     });
    
//     const emailUsuarioSolicitante = 'apinto@sevicol.com.co';
//     const emailUsuarioquerecibe = emailPiloto;
    
// if (estado === 'Aprobado') {
//   await firebaseHelper.enviarNotificacion(
//     emailUsuarioSolicitante,
//     'Solicitud de vuelo aprobada',
//     `La solicitud #${consecutivo} ha sido aprobada`,
//     { 
//       tipo: "aprobacion_solicitud", 
//       consecutivo: consecutivo 
//     }
//   );

//   if (emailUsuarioquerecibe) {
//     await firebaseHelper.enviarNotificacion(
//       emailUsuarioquerecibe,
//       'Tienes una nueva asignación de vuelo',
//       `Has sido asignado al vuelo #${consecutivo}`,
//       { 
//         tipo: "asignacion_piloto", 
//         consecutivo: consecutivo 
//       }
//     );
//   }
// } else if (estado === 'Denegado') {
//   await firebaseHelper.enviarNotificacion(
//     emailUsuarioSolicitante,
//     'Solicitud de vuelo denegada',
//     `La solicitud #${consecutivo} ha sido denegada`,
//     { 
//       tipo: "denegacion_solicitud", 
//       consecutivo: consecutivo 
//     }
//   );
// } else if (estado === 'Enespera') {
//   await firebaseHelper.enviarNotificacion(
//     emailUsuarioSolicitante,
//     'Solicitud de vuelo en espera',
//     `La solicitud #${consecutivo} está en espera`,
//     { 
//       tipo: "espera_solicitud", 
//       consecutivo: consecutivo 
//     }
//   );
// }

// if (emailUsuarioquerecibe) {
//   await firebaseHelper.enviarNotificacion(
//     emailUsuarioquerecibe,
//     'Tienes una nueva asignación de vuelo',
//     `Has sido asignado al vuelo #${consecutivo}`,
//     { 
//       tipo: "asignacion_piloto", 
//       consecutivo: consecutivo 
//     }
//   );
// }

//     return {
//       codigo: nuevoCodigo,
//       fechaValidacion: fechaActual,
//     };
//   } catch (error) {
//     console.error('Error al generar validación de prevuelo:', error);
//     throw error;
//   }
// };

const generarValidacionPrevuelo = async (consecutivo, numeroserie, piloto, notas = '', estado = 'Aprobado') => {
  try {
    const sheets = await getSheetsClient();
    
    const solicitudResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'SolicitudVuelo',
    });
    
    const rowsSolicitud = solicitudResponse.data.values;
    if (!rowsSolicitud || rowsSolicitud.length === 0) {
      throw new Error('No se encontraron datos en la hoja SolicitudVuelo');
    }
    
    const headersSolicitud = rowsSolicitud[0];
    const consecutivoIndex = headersSolicitud.findIndex(header => 
      header.toLowerCase() === 'consecutivo');
    const empresaIndex = headersSolicitud.findIndex(header => 
      header.toLowerCase() === 'empresa');
    const fechaIndex = headersSolicitud.findIndex(header => 
      header.toLowerCase() === 'fecha_inicio');
    const nombreCompletoIndex = headersSolicitud.findIndex(header => 
      header.toLowerCase() === 'nombre_completo');
    const usuarioIndex = headersSolicitud.findIndex(header => 
      header.toLowerCase() === 'usuario');
      
    if (consecutivoIndex === -1) {
      throw new Error('No se encontró la columna consecutivo');
    }
    
    let rowSolicitud = null;
    let rowIndex = -1;
    for (let i = 1; i < rowsSolicitud.length; i++) {
      if (rowsSolicitud[i][consecutivoIndex] && 
          rowsSolicitud[i][consecutivoIndex].toLowerCase() === consecutivo.toLowerCase()) {
        rowSolicitud = rowsSolicitud[i];
        rowIndex = i;
        break;
      }
    }
    
    if (!rowSolicitud) {
      throw new Error(`No se encontró el consecutivo ${consecutivo}`);
    }

//     const estadoIndex = headersSolicitud.findIndex(header => 
//   header.toLowerCase() === 'estado');

// if (estadoIndex !== -1 && rowIndex !== -1) {
//   await sheets.spreadsheets.values.update({
//     spreadsheetId,
//     range: `SolicitudVuelo!${String.fromCharCode(65 + estadoIndex)}${rowIndex + 1}`,
//     valueInputOption: 'RAW',
//     resource: {
//       values: [[estado]]
//     }
//   });
// }
    // Obtener empresa y fecha de la solicitud
    const empresa = empresaIndex !== -1 ? rowSolicitud[empresaIndex] : '';
    const fechaSolicitud = fechaIndex !== -1 ? rowSolicitud[fechaIndex] : '';
    
    // Verificar si ya existe un piloto asignado (nombre_completo) cuando no se recibe piloto
    const nombreCompletoPiloto = nombreCompletoIndex !== -1 ? rowSolicitud[nombreCompletoIndex] || '' : '';
    const usuarioAsignado = usuarioIndex !== -1 ? rowSolicitud[usuarioIndex] || '' : '';
    
    // Si no se recibió piloto y existe un usuario asignado, usamos el nombre_completo
// Si viene piloto del frontend, usar ese; si no, usar el existente en la solicitud
let pilotoValor;
let usarNombreCompleto = false;

if (piloto) {
  // Priorizar el piloto que viene del frontend
  pilotoValor = typeof piloto === 'object' && piloto !== null
    ? piloto.valor || piloto.label || JSON.stringify(piloto)
    : piloto;
  usarNombreCompleto = false;
} else if (usuarioAsignado.trim() !== '') {
  // Si no viene piloto del frontend, usar el existente
  pilotoValor = nombreCompletoPiloto.trim();
  usarNombreCompleto = true;
} else {
  pilotoValor = '';
}
    
    // Calcular fecha un día antes (si existe fecha en el registro)
    let fechaAnterior = '';
    if (fechaSolicitud) {
      try {
        const fecha = new Date(fechaSolicitud);
        fecha.setDate(fecha.getDate() - 1);
        fechaAnterior = fecha.toLocaleDateString('es-ES');
      } catch (e) {
        console.error('Error al calcular fecha anterior:', e);
      }
    }
    
    // Obtener el último código consecutivo de la hoja 2.ValidacionPrevuelo
    const validacionResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '2.ValidacionPrevuelo',
    });
    
    const rowsValidacion = validacionResponse.data.values || [];
    
    // Generar nuevo código consecutivo (AV-X)
    let ultimoNumero = 0;
    if (rowsValidacion.length > 1) {  // Si hay al menos un registro (además de la cabecera)
      const codigoColumna = 0; // Asumimos que el código está en la primera columna
      
      // Buscar todos los códigos y obtener el número más alto
      for (let i = 1; i < rowsValidacion.length; i++) {
        if (rowsValidacion[i] && rowsValidacion[i][codigoColumna]) {
          const codigo = rowsValidacion[i][codigoColumna];
          const match = codigo.match(/AV-(\d+)/);
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (num > ultimoNumero) {
              ultimoNumero = num;
            }
          }
        }
      }
    }
    
    const nuevoCodigo = `AV-${ultimoNumero + 1}`;
    const fechaActual = new Date().toLocaleDateString('es-ES');
    
    // Extraer valores simples de los objetos si son objetos
    const numeroSerieValor = typeof numeroserie === 'object' && numeroserie !== null 
      ? numeroserie.valor || numeroserie.label || JSON.stringify(numeroserie) 
      : numeroserie;
    
    let emailPiloto = '';
    let nombrePiloto = '';
    
    // Solo buscar en la hoja de pilotos si no estamos usando el nombre_completo
    if (!usarNombreCompleto && pilotoValor) {
      // Obtener datos de la hoja de pilotos
      const pilotosResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: '3.Pilotos',
      });
      
      const pilotosRows = pilotosResponse.data.values || [];
      if (pilotosRows.length <= 1) {
        console.warn('No hay datos de pilotos disponibles');
      } else {
        // Encontrar los índices de las columnas que necesitamos
        const identidadIndex = 5; // Columna F (índice 5 - basado en 0)
        const nombresIndex = 1;   // Columna B (índice 1)
        const apellidosIndex = 2; // Columna C (índice 2)
        const emailIndex = 20;    // Columna U (índice 20)
        
        // Buscar el piloto por identificación
        let pilotoEncontrado = null;
        
        for (let i = 1; i < pilotosRows.length; i++) {
          const row = pilotosRows[i];
          if (row[identidadIndex] && 
              row[identidadIndex].toString().toLowerCase() === pilotoValor.toString().toLowerCase()) {
            pilotoEncontrado = row;
            break;
          }
        }
        
        if (pilotoEncontrado) {
          // Obtener el email del piloto (columna U)
          emailPiloto = pilotoEncontrado[emailIndex] || '';
          
          // Combinar nombres y apellidos (columnas B y C)
          const nombres = pilotoEncontrado[nombresIndex] || '';
          const apellidos = pilotoEncontrado[apellidosIndex] || '';
          nombrePiloto = `${nombres} ${apellidos}`.trim();
          
          // ACTUALIZAR la solicitud en la hoja SolicitudVuelo
          if (rowIndex !== -1) {
            // Actualizar email en la columna 2 (B)
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `SolicitudVuelo!B${rowIndex + 1}`,
              valueInputOption: 'RAW',
              resource: {
                values: [[emailPiloto]]
              }
            });
            
            // Actualizar nombre en la columna 3 (C)
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `SolicitudVuelo!C${rowIndex + 1}`,
              valueInputOption: 'RAW',
              resource: {
                values: [[nombrePiloto]]
              }
            });
          }
        } else {
          console.warn(`No se encontró un piloto con la identificación: ${pilotoValor}`);
        }
      }
    }
    
if (estado === 'Aprobado') {
  // Actualizar estado del dron
  const dronesResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: '3.Drones',
  });
  
  const droneRows = dronesResponse.data.values || [];
  if (droneRows.length > 1) {
    // Buscar el dron por número de serie en la columna 2 (B - índice 1)
    const numeroSerieIndex = 1; // Columna B (índice 1)
    const pesodronIndex = 4; //peso del dron
    const disponibilidadCol = 'V'; // Columna V para disponibilidad
    
    let droneRowIndex = -1;
    let pesoDron = "";

    for (let i = 1; i < droneRows.length; i++) {
      if (droneRows[i][numeroSerieIndex] && 
          droneRows[i][numeroSerieIndex].toString().toLowerCase() === numeroSerieValor.toString().toLowerCase()) {
        droneRowIndex = i;
        pesoDron = droneRows[i][pesodronIndex] || '';
        break;
      }
    }
    
    // Si encontramos el dron, actualizamos la columna V a "si" (ocupado)
    if (droneRowIndex !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `3.Drones!${disponibilidadCol}${droneRowIndex + 1}`,
        valueInputOption: 'RAW',
        resource: {
          values: [["si"]]
        }
      });

           if (pesoDron && rowIndex !== -1) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `SolicitudVuelo!K${rowIndex + 1}`, // Columna K (índice 10)
          valueInputOption: 'RAW',
          resource: {
            values: [[pesoDron]]
          }
        });
      }

    } else {
      console.warn(`No se encontró un dron con el número de serie: ${numeroSerieValor}`);
    }
  } else {
    console.warn('No hay datos de drones disponibles');
  }
}
    
    // const nuevoRegistro = [
    //   nuevoCodigo,              // Código consecutivo
    //   consecutivo,              // ID del registro de SolicitudVuelo
    //   estado,               // Estado
    //   numeroSerieValor || "",         // Valor extraído del objeto número serie del dron
    //   // pilotoValor,              // Valor del piloto (puede ser el ID o el nombre_completo)
    //   nombrePiloto || nombreCompletoPiloto || "",              // Valor del piloto (puede ser el ID o el nombre_completo)
    //   empresa,                  // Empresa
    //   fechaActual,              // Fecha actual
    //   notas,                    // Notas
    //   fechaAnterior             // Fecha un día antes
    // ];

    // Cambia esta línea (alrededor de la línea donde defines nuevoRegistro):
const nuevoRegistro = [
  nuevoCodigo,              // Código consecutivo (columna A)
  consecutivo,              // ID del registro de SolicitudVuelo (columna B)
  estado,                   // Estado (columna C)
  numeroSerieValor || "",   // Valor extraído del objeto número serie del dron (columna D)
  nombrePiloto || nombreCompletoPiloto || "", // Piloto (columna E)
  empresa,                  // Empresa (columna F)
  fechaActual,              // Fecha actual (columna G)
  estado === 'Denegado' ? notas : "", // Notas en columna H solo si es denegado
  estado === 'Denegado' ? "" : notas, // Notas en columna I si no es denegado
  fechaAnterior             // Fecha un día antes (columna J)
];
    
    // Anexar el nuevo registro a la hoja 2.ValidacionPrevuelo
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: '2.ValidacionPrevuelo',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [nuevoRegistro]
      }
    });
    
    const emailUsuarioSolicitante = 'apinto@sevicol.com.co';
    const emailUsuarioquerecibe = emailPiloto;
    
if (estado === 'Aprobado') {
        try {
    // const destinatario = "cardenasdiegom6@gmail.com";
    
    await enviarNotificacionAprobacion({
      destinatario: emailPiloto || usuarioAsignado,
      consecutivo: consecutivo,
      notas: notas,
      fecha: fechaSolicitud,
      cliente: empresa 
    });
    
    console.log(`Notificación enviada para la solicitud ${consecutivo}`);
  } catch (error) {
    console.error('Error al enviar notificación de aprobación:', error);
  }
  
  await firebaseHelper.enviarNotificacion(
    emailUsuarioSolicitante,
    'Solicitud de vuelo aprobada',
    `La solicitud #${consecutivo} ha sido aprobada`,
    { 
      tipo: "aprobacion_solicitud", 
      consecutivo: consecutivo 
    }
  );

  if (emailUsuarioquerecibe) {
    await firebaseHelper.enviarNotificacion(
      emailUsuarioquerecibe,
      'Tienes una nueva asignación de vuelo',
      `Has sido asignado al vuelo #${consecutivo}`,
      { 
        tipo: "asignacion_piloto", 
        consecutivo: consecutivo 
      }
    );
  }
} else if (estado === 'Denegado') {

  try {
    
    await enviarNotificacionDenegado({
      destinatario: emailPiloto,
      consecutivo: consecutivo,
      notas: notas,
      fecha: fechaSolicitud,
      cliente: empresa 
    });
    
    console.log(`Notificación enviada para la solicitud ${consecutivo}`);
  } catch (error) {
    console.error('Error al enviar notificación de denegacion:', error);
  }

  await firebaseHelper.enviarNotificacion(
    emailUsuarioSolicitante,
    'Solicitud de vuelo denegada',
    `La solicitud #${consecutivo} ha sido denegada`,
    { 
      tipo: "denegacion_solicitud", 
      consecutivo: consecutivo 
    }
  );
} else if (estado === 'Enespera') {
    try {
    
    await enviarNotificacionEnespera({
      destinatario: emailPiloto,
      consecutivo: consecutivo,
    });
    
    console.log(`Notificación enviada para la solicitud ${consecutivo}`);
  } catch (error) {
    console.error('Error al enviar notificación de espera:', error);
  }

  await firebaseHelper.enviarNotificacion(
    emailUsuarioSolicitante,
    'Solicitud de vuelo en espera',
    `La solicitud #${consecutivo} está en espera`,
    { 
      tipo: "espera_solicitud", 
      consecutivo: consecutivo 
    }
  );
}

if (emailUsuarioquerecibe) {
  await firebaseHelper.enviarNotificacion(
    emailUsuarioquerecibe,
    'Tienes una nueva asignación de vuelo',
    `Has sido asignado al vuelo #${consecutivo}`,
    { 
      tipo: "asignacion_piloto", 
      consecutivo: consecutivo 
    }
  );
}

    return {
      codigo: nuevoCodigo,
      fechaValidacion: fechaActual,
    };
  } catch (error) {
    console.error('Error al generar validación de prevuelo:', error);
    throw error;
  }
};

const generarCancelacionPrevuelo = async (consecutivo, notas = '') => {
  try {
    const sheets = await getSheetsClient();
    
    const solicitudes = await getSolicitudesVuelo();
    
    if (!solicitudes || solicitudes.length === 0) {
      throw new Error('No se encontraron solicitudes');
    }
    
    const solicitud = solicitudes.find(s => 
      s.consecutivo && s.consecutivo.toLowerCase() === consecutivo.toLowerCase()
    );
    
    if (!solicitud) {
      throw new Error(`No se encontró el consecutivo ${consecutivo}`);
    }
    
    const tipoOperacion = solicitud.tipodeoperacionaerea || '';
    const empresa = solicitud.empresa || '';
    const fecha = solicitud.fecha_inicio || '';
    const useremail = solicitud.usuario || '';
    const username = solicitud.nombre_completo || '';
    const usernamesolicitante = solicitud.nombredelcoordinador || '';
    
    const validacionResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: '2.ValidacionPrevuelo',
    });
    
    const rowsValidacion = validacionResponse.data.values || [];
    
    let ultimoNumero = 0;
    if (rowsValidacion.length > 1) {
      const codigoColumna = 0; 
      
      for (let i = 1; i < rowsValidacion.length; i++) {
        if (rowsValidacion[i] && rowsValidacion[i][codigoColumna]) {
          const codigo = rowsValidacion[i][codigoColumna];
          const match = codigo.match(/AV-(\d+)/);
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (num > ultimoNumero) {
              ultimoNumero = num;
            }
          }
        }
      }
    }
    
    const nuevoCodigo = `AV-${ultimoNumero + 1}`;
    const fechaActual = new Date().toLocaleDateString('es-ES');
    
    const nuevoRegistro = [
      nuevoCodigo,              
      consecutivo,              
      "Cancelado",                            
      "Cancelado",                            
      username,
      empresa,
      fechaActual,              
      notas,                              
    ];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: '2.ValidacionPrevuelo',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [nuevoRegistro]
      }
    });
    
    const prevuelosResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Prevuelo!A:AK',
    });
    
    const prevuelosRows = prevuelosResponse.data.values || [];
    const prevuelosHeaders = prevuelosRows[0].map(h => h.trim().toLowerCase());
    
    const solicitudesAprobadasIndex = prevuelosHeaders.findIndex(h => 
      h === 'solicitudesaprobadas');
    const estadoPrevueloIndex = prevuelosHeaders.findIndex(h => 
      h === 'estado del prevuelo');
    
    if (solicitudesAprobadasIndex === -1) {
      throw new Error('No se encontró la columna solicitudesaprobadas en la hoja Prevuelo');
    }
    
    if (estadoPrevueloIndex === -1) {
      throw new Error('No se encontró la columna estado del prevuelo en la hoja Prevuelo');
    }
    
    let prevueloExiste = false;
    let prevueloRowIndex = -1;
    
    for (let i = 1; i < prevuelosRows.length; i++) {
      if (prevuelosRows[i][solicitudesAprobadasIndex] && 
          prevuelosRows[i][solicitudesAprobadasIndex].toLowerCase() === consecutivo.toLowerCase()) {
        prevueloExiste = true;
        prevueloRowIndex = i;
        break;
      }
    }
    
    if (prevueloExiste) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Prevuelo!${getColumnLetter(estadoPrevueloIndex + 1)}${prevueloRowIndex + 1}`,
        valueInputOption: 'RAW',
        resource: {
          values: [['Cancelado']]
        }
      });
    } else {
      const consecutivoPrevuelo = await prevueloHelper.getSiguienteConsecutivoPrevuelo();
      
      const nuevaFilaPrevuelo = [
        consecutivoPrevuelo,
        useremail,
        consecutivo, 
        username,
        nuevoCodigo,
        fecha,
        '',
        '',
        tipoOperacion,
        empresa,
        '', 
        '', 
        '',
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        '', 
        notas, 
        'Cancelado', 
        fechaActual 
      ];
      
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Prevuelo!A1',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { 
          values: [nuevaFilaPrevuelo]
        },
      });
    }
    
    const postvuelosResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Postvuelo!A:S',
    });
    
    const postvuelosRows = postvuelosResponse.data.values || [];
    const postvuelosHeaders = postvuelosRows[0].map(h => h.trim().toLowerCase());
    
    const consecutivoSolicitudIndex = postvuelosHeaders.findIndex(h => 
      h === 'consecutivo-solicitud');
    const estadoPostvueloIndex = postvuelosHeaders.findIndex(h => 
      h === 'estado del postvuelo');
    
    if (consecutivoSolicitudIndex === -1) {
      throw new Error('No se encontró la columna consecutivo-solicitud en la hoja Postvuelo');
    }
    
    if (estadoPostvueloIndex === -1) {
      throw new Error('No se encontró la columna estado del postvuelo en la hoja Postvuelo');
    }
    
    let postvueloExiste = false;
    let postvueloRowIndex = -1;
    
    for (let i = 1; i < postvuelosRows.length; i++) {
      if (postvuelosRows[i][consecutivoSolicitudIndex] && 
          postvuelosRows[i][consecutivoSolicitudIndex].toLowerCase() === consecutivo.toLowerCase()) {
        postvueloExiste = true;
        postvueloRowIndex = i;
        break;
      }
    }
    
    if (postvueloExiste) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Postvuelo!${getColumnLetter(estadoPostvueloIndex + 1)}${postvueloRowIndex + 1}`,
        valueInputOption: 'RAW',
        resource: {
          values: [['Cancelado']]
        }
      });
    } else {
      const idPostvuelo = await postvueloHelper.getSiguienteConsecutivo();
      
      const nuevaFilaPostvuelo = [
        idPostvuelo,
        consecutivo, 
        username,
        'Cancelado', 
        fecha,
        'Cancelado',
        'Cancelado',
        'Cancelado', 
        'Cancelado',
        'Cancelado',
        'Cancelado',
        'Cancelado',
        'Cancelado',
        fechaActual, 
        'Cancelado',
        useremail,
        'Cancelado',
        tipoOperacion,
        empresa,
      ];
      
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Postvuelo!A1',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { 
          values: [nuevaFilaPostvuelo]
        },
      });
    }
    
        try {
    const destinatario = "apinto@sevicol.com.co";
    
const pilotoParaNotificacion = username || usernamesolicitante;

await enviarNotificacionCancelacion({
  destinatario,
  piloto: pilotoParaNotificacion,
  consecutivo: consecutivo,
  notas: notas,
});
    
    console.log(`Notificación enviada para la solicitud ${consecutivo}`);
  } catch (error) {
    console.error('Error al enviar notificación de cancelacion:', error);
  }

    return {
      codigo: nuevoCodigo,
      fechaValidacion: fechaActual
    };
  } catch (error) {
    console.error('Error al generar cancelación de prevuelo/postvuelo:', error);
    throw error;
  }
};

const enviarNotificacionAprobacion = async (datos) => {
try {
    const transporter = createTransporter();

    const urlBase = "https://script.google.com/macros/s/AKfycbzoGLCKAxvDny6qhIMze-cGaaitGPt9yIhByUKYY1aI41gwysmisEIvn0UEP6qg7SH6/exec";
    const linkFormulario = `${urlBase}?solicitud=${datos.consecutivo}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #ffffff; color: white; padding: 10px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center;">
            <img src="https://docs.google.com/drawings/d/e/2PACX-1vQw98R1ZTlOAY_mVURreLAh0eGVKAodHN9VVuOk8wBHQ_WZmveIAn6e9588ix1u-NqmnH6rrYjPEzes/pub?w=480&h=360" 
                 alt="Logo SVA" 
                 style="width: 150px; height: auto; margin-right: 10px;">
            <div>
              <h2 style="color: black; font-size: 24px; font-weight: bold; margin: 0;">Solicitud de vuelo Aprobada</h2>
              <p style="margin: 5px 0;">SVA SEVICOL LTDA</p>
            </div>
          </div>
        </div>
        
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p>Su solicitud de vuelo ha sido Aprobada</p>
          
          <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Consecutivo:</strong> ${datos.consecutivo}</p>
            <p style="margin: 5px 0;"><strong>Notas:</strong> ${datos.notas}</p>
            <p style="margin: 5px 0;"><strong>Fecha:</strong> ${datos.fecha}</p>
            <p style="margin: 5px 0;"><strong>Cliente:</strong> ${datos.cliente}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${linkFormulario}"
                style="background-color: #28a745;
                       color: white;
                       padding: 12px 25px;
                       text-decoration: none;
                       border-radius: 5px;
                       display: inline-block;
                       font-weight: bold;">
              Realizar Pre-vuelo
            </a>
          </div>
          
          <p style="color: #666; font-size: 0.9em;">Si el botón no funciona, copie y pegue el siguiente enlace en su navegador:</p>
          <p style="color: #666; font-size: 0.9em;">${linkFormulario}</p>
        </div>
        
        <div style="padding: 20px; text-align: center; color: #666;">
          <p>Saludos cordiales,<br>
          Sistema de Gestión de Vuelos<br>
          SVA SEVICOL LTDA</p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: '"Sistema de Vuelos" <dcardenas@sevicol.com.co>',
      to: datos.destinatario,
      subject: `Solicitud de Vuelo Aprobada - Consecutivo: ${datos.consecutivo}`,
      html: htmlBody
    });

    console.log('Correo enviado:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error al enviar correo de notificación:', error);
    throw error;
  }
};

const enviarNotificacionDenegado = async (datos) => {
try {
    const transporter = createTransporter();

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #ffffff; color: white; padding: 10px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center;">
            <img src="https://docs.google.com/drawings/d/e/2PACX-1vQw98R1ZTlOAY_mVURreLAh0eGVKAodHN9VVuOk8wBHQ_WZmveIAn6e9588ix1u-NqmnH6rrYjPEzes/pub?w=480&h=360" 
                 alt="Logo SVA" 
                 style="width: 150px; height: auto; margin-right: 10px;">
            <div>
              <h2 style="color: black; font-size: 24px; font-weight: bold; margin: 0;">Solicitud de vuelo Denegada</h2>
              <p style="margin: 5px 0;">SVA SEVICOL LTDA</p>
            </div>
          </div>
        </div>
        
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p>Su solicitud de vuelo ha sido denegada por parte del jefe de pilotos</p>
          
          <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Consecutivo:</strong> ${datos.consecutivo}</p>
            <p style="margin: 5px 0;"><strong>Notas:</strong> ${datos.notas}</p>
            <p style="margin: 5px 0;"><strong>Fecha:</strong> ${datos.fecha}</p>
            <p style="margin: 5px 0;"><strong>cliente:</strong> ${datos.cliente}</p>
          </div>
          
        </div>
        
        <div style="padding: 20px; text-align: center; color: #666;">
          <p>Saludos cordiales,<br>
          Sistema de Gestión de Vuelos<br>
          SVA SEVICOL LTDA</p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: '"Sistema de Vuelos" <dcardenas@sevicol.com.co>',
      to: datos.destinatario,
      subject: `Solicitud de Vuelo Denegada - Consecutivo: ${datos.consecutivo}`,
      html: htmlBody
    });

    console.log('Correo enviado:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error al enviar correo de notificación:', error);
    throw error;
  }
};

const enviarNotificacionEnespera = async (datos) => {
try {
    const transporter = createTransporter();

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #ffffff; color: white; padding: 10px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center;">
            <img src="https://docs.google.com/drawings/d/e/2PACX-1vQw98R1ZTlOAY_mVURreLAh0eGVKAodHN9VVuOk8wBHQ_WZmveIAn6e9588ix1u-NqmnH6rrYjPEzes/pub?w=480&h=360" 
                 alt="Logo SVA" 
                 style="width: 150px; height: auto; margin-right: 10px;">
            <div>
              <h2 style="color: black; font-size: 24px; font-weight: bold; margin: 0;">Solicitud de vuelo En espera</h2>
              <p style="margin: 5px 0;">SVA SEVICOL LTDA</p>
            </div>
          </div>
        </div>
        
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p>Su solicitud de vuelo ha sido puesta en espera por parte del jefe de pilotos</p>
          
          <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Consecutivo:</strong> ${datos.consecutivo}</p>
          </div>
          
        </div>
        
        <div style="padding: 20px; text-align: center; color: #666;">
          <p>Saludos cordiales,<br>
          Sistema de Gestión de Vuelos<br>
          SVA SEVICOL LTDA</p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: '"Sistema de Vuelos" <dcardenas@sevicol.com.co>',
      to: datos.destinatario,
      subject: `Solicitud de Vuelo En espera - Consecutivo: ${datos.consecutivo}`,
      html: htmlBody
    });

    console.log('Correo enviado:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error al enviar correo de notificación:', error);
    throw error;
  }
};


const enviarNotificacionCancelacion = async (datos) => {
try {
    const transporter = createTransporter();

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #ffffff; color: white; padding: 10px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center;">
            <img src="https://docs.google.com/drawings/d/e/2PACX-1vQw98R1ZTlOAY_mVURreLAh0eGVKAodHN9VVuOk8wBHQ_WZmveIAn6e9588ix1u-NqmnH6rrYjPEzes/pub?w=480&h=360" 
                 alt="Logo SVA" 
                 style="width: 150px; height: auto; margin-right: 10px;">
            <div>
              <h2 style="color: black; font-size: 24px; font-weight: bold; margin: 0;">Solicitud de vuelo Cancelada</h2>
              <p style="margin: 5px 0;">SVA SEVICOL LTDA</p>
            </div>
          </div>
        </div>
        
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p>solicitud de vuelo cancelada por ${datos.piloto}</p>
          
          <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Consecutivo:</strong> ${datos.consecutivo}</p>
            <p style="margin: 5px 0;"><strong>Motivo:</strong> ${datos.notas}</p>
          </div>
          
        </div>
        
        <div style="padding: 20px; text-align: center; color: #666;">
          <p>Saludos cordiales,<br>
          Sistema de Gestión de Vuelos<br>
          SVA SEVICOL LTDA</p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: '"Sistema de Vuelos" <dcardenas@sevicol.com.co>',
      to: datos.destinatario,
      subject: `Solicitud de Vuelo Cancelada - Consecutivo: ${datos.consecutivo}`,
      html: htmlBody
    });

    console.log('Correo enviado:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error al enviar correo de notificación:', error);
    throw error;
  }
};


export const solicitudHelper = {
  getSolicitudesVuelo,
  guardarSolicitud,
  getSiguienteConsecutivo,  
  obtenerTodasLasHojas,
  getSolicitudesByConsecutivo,
  getSolicitudesConEstadosGenerales,
  getSolicitudesPorEstadoGeneral,
  getSolicitudPorConsecutivo,
  getResumenSolicitudesGeneral,
  getResumenSolicitudesPorEmail,
  getResumenSolicitudesPorSolicitante,
  editarSolicitudPorConsecutivo,
  procesarArchivos,
  putSolicitudByStatus,
  subirArchivosACarpetaExistente,
  buscarCarpetaPorNombre,
  generarValidacionPrevuelo,
  generarCancelacionPrevuelo
};