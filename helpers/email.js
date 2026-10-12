import { getGmailClient } from '../services/google.js';

// Envío de correos.
//   EMAIL_PROVIDER=gmail_api (por defecto): Gmail API por HTTPS con el mismo OAuth de Drive/Sheets.
//     Funciona en el plan gratis de Render (que bloquea SMTP). Requiere que el REFRESH_TOKEN
//     tenga el permiso https://www.googleapis.com/auth/gmail.send
//   EMAIL_PROVIDER=smtp: nodemailer con EMAIL_USER / EMAIL_PASS (útil en local).
//
// EMAIL_FROM (opcional): 'LJC Transportes <correo@gmail.com>'. Si no se pone, Gmail usa la
// dirección de la cuenta autorizada.

const proveedor = () => String(process.env.EMAIL_PROVIDER || 'gmail_api').toLowerCase();

const escaparHtml = (texto) =>
  String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Asunto con tildes/ñ en encabezado MIME
const codificarAsunto = (asunto) => `=?UTF-8?B?${Buffer.from(asunto, 'utf8').toString('base64')}?=`;

async function enviarConGmailApi({ para, asunto, html }) {
  const lineas = [
    process.env.EMAIL_FROM ? `From: ${process.env.EMAIL_FROM}` : null,
    `To: ${para}`,
    `Subject: ${codificarAsunto(asunto)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
  ].filter((l) => l !== null);

  const raw = Buffer.from(lineas.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    await getGmailClient().users.messages.send({ userId: 'me', requestBody: { raw } });
  } catch (error) {
    const sinPermiso = error?.code === 403 || /insufficient/i.test(error?.message || '');
    if (sinPermiso) {
      console.error(
        '[email] El REFRESH_TOKEN no tiene permiso para enviar correos. ' +
          'Genérelo de nuevo agregando el scope https://www.googleapis.com/auth/gmail.send'
      );
    }
    throw error;
  }
}

let transportadorSmtp = null;
async function enviarConSmtp({ para, asunto, html }) {
  if (!transportadorSmtp) {
    const nodemailer = (await import('nodemailer')).default;
    transportadorSmtp = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  await transportadorSmtp.sendMail({
    from: process.env.EMAIL_FROM || `LJC Transportes <${process.env.EMAIL_USER}>`,
    to: para,
    subject: asunto,
    html,
  });
}

/** Envía un correo HTML. Lanza error si no se pudo enviar */
export async function enviarCorreo({ para, asunto, html }) {
  if (!para) throw new Error('Falta el destinatario del correo');
  if (proveedor() === 'smtp') return enviarConSmtp({ para, asunto, html });
  return enviarConGmailApi({ para, asunto, html });
}

export const enviarCodigoRecuperacion = async (email, nombre, codigo) => {
  await enviarCorreo({
    para: email,
    asunto: 'Código de recuperación de contraseña - LJC',
    html: `
      <p>Hola ${escaparHtml(nombre)},</p>
      <p>Tu código de recuperación es:</p>
      <h2 style="letter-spacing: 4px">${escaparHtml(codigo)}</h2>
      <p>Este código vence en <strong>15 minutos</strong>.</p>
      <p>Si no solicitaste esto, ignora este mensaje.</p>
    `,
  });
};

export const emailHelper = { enviarCorreo, enviarCodigoRecuperacion, escaparHtml };
