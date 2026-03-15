
import { google } from 'googleapis';

export const getGoogleClient = (accessToken: string) => {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const sheets = google.sheets({ version: 'v4', auth });
  const calendar = google.calendar({ version: 'v3', auth });
  const drive = google.drive({ version: 'v3', auth });

  return { sheets, calendar, drive };
};