import { google } from 'googleapis';

// Un solo cliente OAuth para toda la app.
// Antes se creaba uno nuevo en cada llamada y cada uno pedía su propio token de acceso a Google
// (8 a 10 renovaciones por cada "cerrar viaje"). Ahora el token se renueva solo cuando vence.

let auth = null;
let drive = null;
let sheets = null;
let gmail = null;

export const getAuth = () => {
  if (!auth) {
    auth = new google.auth.OAuth2(
      process.env.CLIENT_ID,
      process.env.CLIENT_SECRET,
      'http://localhost'
    );
    auth.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
  }
  return auth;
};

export const getDriveClient = () => {
  if (!drive) drive = google.drive({ version: 'v3', auth: getAuth() });
  return drive;
};

export const getSheetsClient = () => {
  if (!sheets) sheets = google.sheets({ version: 'v4', auth: getAuth() });
  return sheets;
};

// Requiere que el REFRESH_TOKEN se haya generado con el permiso
// https://www.googleapis.com/auth/gmail.send
export const getGmailClient = () => {
  if (!gmail) gmail = google.gmail({ version: 'v1', auth: getAuth() });
  return gmail;
};
