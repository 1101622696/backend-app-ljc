import 'dotenv/config';
import { google } from 'googleapis';
import readline from 'readline';

const oAuth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    'http://localhost'
);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent select_account',
  scope: ['https://www.googleapis.com/auth/drive']
});

console.log('Autoriza aquí:\n', authUrl);
console.log('CLIENT_ID:', process.env.CLIENT_ID);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('\nPega el código aquí: ', async (code) => {
  const { tokens } = await oAuth2Client.getToken(code);
  console.log('\nTOKENS:\n', tokens);
  rl.close();
});
