import { google } from 'googleapis';

const getAuth = () => {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    'http://localhost'
  );

  oAuth2Client.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN
  });

  return oAuth2Client;
};

export const getDriveClient = () => {
  const auth = getAuth();
  return google.drive({ version: 'v3', auth });
};

export const getSheetsClient = () => {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
};