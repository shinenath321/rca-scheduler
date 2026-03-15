import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { google } from "googleapis";
import dotenv from "dotenv";
import { getGoogleClient } from './googleService';
import axios from 'axios';
import OpenAI from 'openai';
import verifyGoogleToken from "./routes/verifyGoogleToken";
import getRCAInfo from "./routes/getRCAInfo";
import getReviewer from "./routes/getReviewer";
import getReviewerAvailability from "./routes/getReviewerAvailability";
import findAvailableSlot from "./routes/findAvailableSlot";
import scheduleEvent from "./routes/scheduleEvent";
import scheduleRCA from "./routes/scheduleRCA";

//Random Code to Test GIt
dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 4000;

app.get("/", (req, res) => {
  res.send("✅ RCA Scheduler API is running");
});

// Register routes under /api
app.use("/api", verifyGoogleToken);
app.use("/api", getRCAInfo);
app.use("/api", getReviewer);
app.use("/api", getReviewerAvailability);
app.use("/api", findAvailableSlot);
app.use("/api", scheduleEvent);
app.use("/api", scheduleRCA);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Endpoint not found" });
});

// Global error handler (optional but helpful)
app.use((err: any, req: any, res: any, next: any) => {
  console.error("❌ Error:", err.stack);
  res.status(500).json({ message: "Internal Server Error", error: err.message });
});


app.post("/api/scheduleRCA", async (req, res) => {
  try {
    const {
      googleAccessToken,
      devrevApiKey,
      incidentId,
      reviewersMap = {
        DevOps: "reviewer-devops@company.com",
        Platform: "reviewer-platform@company.com",
        SRE: "reviewer-sre@company.com",
      },
    } = req.body;

    if (!googleAccessToken || !devrevApiKey || !incidentId) {
      return res.status(400).json({
        message: "googleAccessToken, devrevApiKey, and incidentId are required.",
      });
    }

    // 1️⃣ Verify Google token first
    try {
      const verifyResp = await axios.get(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${googleAccessToken}`
      );
      if (!verifyResp.data.email) {
        throw new Error("Invalid Google token");
      }
    } catch (err) {
      return res.status(401).json({ message: "Token expired or invalid" });
    }

    // 2️⃣ Get DevRev incident details
    const devrevResponse = await axios.post(
      "https://api.devrev.ai/incidents.get",
      { id: incidentId },
      {
        headers: {
          Authorization: `Bearer ${devrevApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const incident = devrevResponse.data?.incidents?.[0];
    if (!incident) return res.status(404).json({ message: "Incident not found" });

    const ownerEmail = incident.owner?.email || null;
    const authorEmail =
      incident.authors?.[0]?.email || incident.created_by?.email || null;
    const ownerBU =
      incident.custom_fields?.BU || incident.BU || incident.owner?.BU || null;

    if (!ownerEmail || !authorEmail)
      return res
        .status(400)
        .json({ message: "Missing owner or author email from DevRev incident." });

    // 3️⃣ Cross-BU reviewer
    const reviewerEmail =
      Object.entries(reviewersMap).find(([bu]) => bu !== ownerBU)?.[1] ||
      Object.values(reviewersMap)[0];

    // 4️⃣ Initialize Google client with OAuth token
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: googleAccessToken });
    const calendar = google.calendar({ version: "v3", auth });

    // 5️⃣ Reviewer availability (next 7 days)
    const now = new Date();
    const rangeEnd = new Date();
    rangeEnd.setDate(now.getDate() + 7);

    const reviewerEvents = await calendar.events.list({
      calendarId: reviewerEmail as string,
      timeMin: now.toISOString(),
      timeMax: rangeEnd.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const busySlots = (reviewerEvents.data.items || [])
      .filter((e) => {
        if (e.status === "cancelled") return false;
        const att = e.attendees?.find(
          (a) => a.email?.toLowerCase() === (reviewerEmail as string).toLowerCase()
        );
        if (!att) return false;
        // only accepted/tentative count as busy
        return ["accepted", "tentative"].includes(
          att.responseStatus?.toLowerCase() || ""
        );
      })
      .map((e) => ({
        start: new Date(e.start?.dateTime || e.start?.date || ""),
        end: new Date(e.end?.dateTime || e.end?.date || ""),
      }));

    // 6️⃣ Find slot (10–18, skip 13–14)
    const duration = 30;
    const candidateSlots = generateCandidateSlots(now, rangeEnd, duration);
    const chosenSlot = candidateSlots.find((slot) =>
      isSlotFree(slot, busySlots)
    );

    if (!chosenSlot)
      return res.status(404).json({ message: "No free slot available" });

    // 7️⃣ Create event
    const event = {
      summary: `RCA Review - ${incidentId}`,
      description: "Auto-scheduled RCA review meeting.",
      start: { dateTime: chosenSlot.start.toISOString(), timeZone: "Asia/Kolkata" },
      end: { dateTime: chosenSlot.end.toISOString(), timeZone: "Asia/Kolkata" },
      attendees: [
        { email: ownerEmail },
        { email: authorEmail },
        { email: reviewerEmail },
      ],
      sendUpdates: "all",
    };

    const insertRes = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    res.json({
      message: "Event created successfully",
      participants: { ownerEmail, authorEmail, reviewerEmail },
      chosenSlot,
      eventId: insertRes.data.id,
    });
  } catch (err: any) {
    console.error("scheduleRCA error:", err.response?.data || err.message);
    res.status(500).json({
      message: "Internal error",
      error: err.response?.data || err.message,
    });
  }
});

// ---------- Helpers ----------

function generateCandidateSlots(rangeStart: Date, rangeEnd: Date, duration: number) {
  const slots: { start: Date; end: Date }[] = [];
  const cur = new Date(rangeStart);
  while (cur < rangeEnd) {
    const dayStart = new Date(cur);
    dayStart.setHours(10, 0, 0, 0);
    const dayEnd = new Date(cur);
    dayEnd.setHours(18, 0, 0, 0);

    const lunchStart = new Date(cur);
    lunchStart.setHours(13, 0, 0, 0);
    const lunchEnd = new Date(cur);
    lunchEnd.setHours(14, 0, 0, 0);

    let slot = new Date(dayStart);
    while (slot.getTime() + duration * 60000 <= dayEnd.getTime()) {
      const slotEnd = new Date(slot.getTime() + duration * 60000);
      if (!(slotEnd <= lunchStart || slot >= lunchEnd)) {
        // skip lunch overlap
      } else {
        slots.push({ start: new Date(slot), end: new Date(slotEnd) });
      }
      slot = new Date(slot.getTime() + 30 * 60000);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return slots;
}

function isSlotFree(slot: { start: Date; end: Date }, busyList: { start: Date; end: Date }[]) {
  return busyList.every((b) => slot.end <= b.start || slot.start >= b.end);
}


app.post('/api/extract-rca-owners', async (req, res) => {
  const { rcaLink } = req.body;

  if (!rcaLink) {
    return res.status(400).json({ message: 'Missing RCA link' });
  }

  try {
    const { accessToken, rcaLink } = req.body;
    if (!accessToken || !rcaLink)
      return res.status(400).json({ message: 'Missing accessToken or rcaLink' });

    // Extract the Google Doc ID from the link
    const match = rcaLink.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      return res.status(400).json({ message: 'Invalid Google Doc link' });
    }
    const docId = match[1];
    const { drive } = getGoogleClient(accessToken);
    const docResponse = await drive.files.export(
      {
        fileId: docId,
        mimeType: 'text/plain',
      },
      { responseType: 'text' }
    );
    const docText = docResponse.data as string;
    if (!docText || docText.trim().length === 0) {
      return res.status(400).json({ message: 'No readable content found in document' });
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    /// 🔍 Ask OpenAI to extract owners and reviewers
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that explains what is in the text text.',
        },
        {
          role: 'user',
          content: `Extract the details from the following text:\n\n${docText}`,
        },
      ],
    });

    const aiResponse = completion.choices?.[0]?.message?.content || '';

    res.json({
      message: 'RCA owners extracted successfully',
      aiResponse,
    });
  } catch (error: any) {
    console.error('Error extracting RCA owners:', error);
    res.status(500).json({
      message: 'Error extracting RCA owners',
      error: error.message,
    });
  
  }});

app.post('/api/select-reviewer', async (req, res) => {
  const { accessToken, sheetId, incidentNumber } = req.body;

  try {
    // const sheets = google.sheets({ version: 'v4', auth: accessToken });
    const { sheets } = getGoogleClient(accessToken);

    // 1️⃣ Read first sub-sheet (RCA Details)
    const sheet1Res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'RCA Details!A1:F', // Assuming A:F covers your columns
    });

    const values = sheet1Res.data.values as string[][] | undefined;

    if (!values || values.length === 0) {
      return res.status(400).json({ message: 'No data found in RCA Details sheet' });
    }

    const headers = values[0] ?? [];
    const rows = values.length > 1 ? values.slice(1) : [];

    const headerMap = Object.fromEntries(
      headers.map((h: string, i: number) => [h.trim(), i])
    );

    const incidentIndex = headerMap['Incident Ticket Number'];

    if (incidentIndex === undefined) {
      return res.status(400).json({ message: 'Column "Incident Ticket Number" not found in RCA Details sheet' });
    }

    const incidentRow = rows.find(row => row[incidentIndex] === incidentNumber);

    if (!incidentRow) {
      return res.status(404).json({ message: 'Incident not found' });
    }

    function getValue(row: string[], headerMap: { [key: string]: number }, column: string): string {
      const index = headerMap[column];
      if (index === undefined) {
        throw new Error(`Column "${column}" not found in RCA Details sheet`);
      }
      return row[index] ?? '';
    }

  let rcaStatus: string, readyForReview: string, ownerName: string, ownerBU: string, rcaLink: string;

  try {
    rcaStatus = getValue(incidentRow, headerMap, 'RCA Status');
    readyForReview = getValue(incidentRow, headerMap, 'Ready For Review');
    ownerName = getValue(incidentRow, headerMap, 'RCA Owner/BU Leader');
    ownerBU = getValue(incidentRow, headerMap, 'BU');
    rcaLink = getValue(incidentRow, headerMap, 'Internal RCA Link');
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }

    if (rcaStatus !== 'RCA Review Pending') {
      return res.status(400).json({ message: 'RCA already reviewed or not pending' });
    }

    if (readyForReview?.toLowerCase() !== 'yes') {
      return res.status(400).json({ message: 'RCA not ready for review' });
    }

    // 2️⃣ Read second sub-sheet (RCA Reviewers)
    const sheet2Res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'RCA Reviewers!A1:B', // Assuming A:RCA Reviewers Name, B:BU
    });

    const revValues = sheet2Res.data.values as string[][] | undefined;

    if (!revValues || revValues.length === 0) {
      return res.status(400).json({ message: 'No data found in RCA Reviewers sheet' });
    }

    // Tell TypeScript that revValues[0] is definitely defined
    const revHeaders: string[] = revValues[0]!; 
    const revRows: string[][] = revValues.slice(1);

    const revHeaderMap = Object.fromEntries(
      revHeaders.map((h: string, i: number) => [h.trim(), i])
    );

    const buIndex = revHeaderMap['BU'];
    if (buIndex === undefined) {
      return res.status(400).json({ message: 'Column "BU" not found in RCA Reviewers sheet' });
    }

    // Now TypeScript knows buIndex is a number
    const eligibleReviewers = revRows.filter(row => row[buIndex] !== ownerBU);


    if (!eligibleReviewers.length) {
      return res.status(400).json({ message: 'No eligible reviewers found' });
    }

    const randomReviewer = eligibleReviewers[Math.floor(Math.random() * eligibleReviewers.length)];
    if (!randomReviewer) {
      return res.status(400).json({ message: 'No eligible reviewers found' });
    }

    // Now safe to access columns
    const reviewerNameIndex = revHeaderMap['RCA Reviewers Name'];
    const reviewerBUIndex = revHeaderMap['BU'];

    if (reviewerNameIndex === undefined || reviewerBUIndex === undefined) {
      return res.status(400).json({ message: 'Required column missing in RCA Reviewers sheet' });
    }

    const reviewerName = randomReviewer[reviewerNameIndex];
    const reviewerBU = randomReviewer[reviewerBUIndex];

    // Respond with details for now (we’ll extend to calendar + AI later)
    res.json({
      incidentNumber,
      ownerName,
      ownerBU,
      reviewerName,
      reviewerBU,
      rcaLink,
      message: 'Reviewer selected successfully',
    });

  } catch (error: any) {
    console.error('Error selecting reviewer:', error);
    res.status(500).json({ message: 'Error selecting reviewer', error: error.message });
  }
});



app.post('/api/test-sheet', async (req, res) => {
  try {
    const { accessToken, sheetId } = req.body;
    const { sheets } = getGoogleClient(accessToken);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'A1:C10', // test range
    });

    res.json({ data: response.data.values });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: 'Error reading sheet', error: error.message });
  }
});

app.post("/schedule-meeting", async (req, res) => {
  try {
    const { accessToken, sheet1Id, sheet2Id, incidentNumber, rcaLink, organizerEmail } = req.body;

    // Authenticate Google API with user’s access token
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: "v4", auth });
    const calendar = google.calendar({ version: "v3", auth });

    // STEP 1️⃣: Get owner info from first sheet
    const sheet1 = await sheets.spreadsheets.values.get({
      spreadsheetId: sheet1Id,
      range: "Sheet1!A:C", // adjust as per your layout
    });

    const ownerRow = sheet1.data.values?.find((r: any) => r[0] === incidentNumber);
    if (!ownerRow) {
      return res.status(404).json({ message: "Incident not found in first sheet" });
    }

    const [incident, ownerEmail, ownerPosition] = ownerRow;

    // STEP 2️⃣: Choose reviewer from second sheet
    const sheet2 = await sheets.spreadsheets.values.get({
      spreadsheetId: sheet2Id,
      range: "Sheet1!A:B",
    });

    const reviewers = sheet2.data.values?.filter((r: any) => r[1] !== ownerPosition);
    if (!reviewers?.length) {
      return res.status(404).json({ message: "No reviewer found with a different position" });
    }

    const randomReviewer = reviewers[Math.floor(Math.random() * reviewers.length)];
    const [reviewerEmail, reviewerPosition] = randomReviewer || [];

    // STEP 3️⃣: Check free time slots (simplified)
    const now = new Date();
    const startHour = 11;
    const endHour = 17.5; // 5:30 PM

    // Example: pick a fixed time slot tomorrow at 11:00 AM
    const startTime = new Date();
    startTime.setDate(now.getDate() + 1);
    startTime.setHours(11, 0, 0, 0);

    const endTime = new Date(startTime.getTime() + 30 * 60000);

    // STEP 4️⃣: Create Google Calendar event
    const event = {
      summary: `RCA Review Meeting - ${incidentNumber}`,
      description: `RCA Document: ${rcaLink}`,
      start: { dateTime: startTime.toISOString(), timeZone: "Asia/Kolkata" },
      end: { dateTime: endTime.toISOString(), timeZone: "Asia/Kolkata" },
      attendees: [
        { email: ownerEmail },
        { email: reviewerEmail },
        { email: organizerEmail },
      ],
    };

    await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
      sendUpdates: "all",
    });

    res.json({
      message: "✅ Meeting scheduled successfully",
      owner: ownerEmail,
      reviewer: reviewerEmail,
      time: startTime.toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error scheduling meeting", error: err });
  }
});

app.post("/dev-rev-details", async (req, res) => {
  const { incidentNumber } = req.body;

  if (!incidentNumber) {
    return res.status(400).json({ message: "incidentNumber is required" });
  }

  try {
    const response = await axios.get(
      `https://api.devrev.ai/v1/incidents?display_id=${incidentNumber}`,
      {
        headers: {
          Authorization: `Bearer eyJhbGciOiJSUzI1NiIsImlzcyI6Imh0dHBzOi8vYXV0aC10b2tlbi5kZXZyZXYuYWkvIiwia2lkIjoic3RzX2tpZF9yc2EiLCJ0eXAiOiJKV1QifQ.eyJhdWQiOlsiamFudXMiXSwiYXpwIjoiZG9uOmlkZW50aXR5OmR2cnYtaW4tMTpkZXZvLzJzUkk2SGVweno6ZGV2dS85OTU5IiwiZXhwIjoxNzkxOTYyMDcwLCJodHRwOi8vZGV2cmV2LmFpL2F1dGgwX3VpZCI6ImRvbjppZGVudGl0eTpkdnJ2LXVzLTE6ZGV2by9zdXBlcjphdXRoMF91c2VyL3NhbWxwfHJhem9ycGF5fHNoaW5lLm5hdGhAcmF6b3JwYXkuY29tIiwiaHR0cDovL2RldnJldi5haS9hdXRoMF91c2VyX2lkIjoic2FtbHB8cmF6b3JwYXl8c2hpbmUubmF0aEByYXpvcnBheS5jb20iLCJodHRwOi8vZGV2cmV2LmFpL2Rldm9fZG9uIjoiZG9uOmlkZW50aXR5OmR2cnYtaW4tMTpkZXZvLzJzUkk2SGVwenoiLCJodHRwOi8vZGV2cmV2LmFpL2Rldm9pZCI6IkRFVi0yc1JJNkhlcHp6IiwiaHR0cDovL2RldnJldi5haS9kZXZ1aWQiOiJERVZVLTk5NTkiLCJodHRwOi8vZGV2cmV2LmFpL2Rpc3BsYXluYW1lIjoiU2hpbmUgUyBOYXRoIiwiaHR0cDovL2RldnJldi5haS9lbWFpbCI6InNoaW5lLm5hdGhAcmF6b3JwYXkuY29tIiwiaHR0cDovL2RldnJldi5haS9mdWxsbmFtZSI6IlNoaW5lIFMgTmF0aCIsImh0dHA6Ly9kZXZyZXYuYWkvaXNfdmVyaWZpZWQiOnRydWUsImh0dHA6Ly9kZXZyZXYuYWkvdG9rZW50eXBlIjoidXJuOmRldnJldjpwYXJhbXM6b2F1dGg6dG9rZW4tdHlwZTpwYXQiLCJpYXQiOjE3NjA0MjYwNzAsImlzcyI6Imh0dHBzOi8vYXV0aC10b2tlbi5kZXZyZXYuYWkvIiwianRpIjoiZG9uOmlkZW50aXR5OmR2cnYtaW4tMTpkZXZvLzJzUkk2SGVweno6dG9rZW4vMUVNbzNHdDBoIiwib3JnX2lkIjoib3JnX3BGSTlRT2tLY3dSS0xwYmMiLCJzdWIiOiJkb246aWRlbnRpdHk6ZHZydi1pbi0xOmRldm8vMnNSSTZIZXB6ejpkZXZ1Lzk5NTkifQ.ssA9PVNcNTkOzKWvveQy3IC58zCHXtHydIcax8oBljGp6DzSbnjeI9_8ornW0H5hWtq-fLb873cTsMgt4Hw1Fl-URB4GaMBSyCDpVTU5FYsz7ewwuaAQMvuio8LYN6vZG0dr55uhWEeSQZSdlVhUmfA_lXEtIw5ZcoCTCldxedJjYO3Pp6hi3a35GvXD_FSIcEDv5xTPEBKaPEDgn8q6mT0KVSyDQ8boy7Y9IfyjxRPUba7QaEcI5lMFKy5qjmpi2gzuYbUL8eQo21RhKG8e8ASK_tC_WvdWGbHvS5JAgedY-32Cg4rZsT4VQAqqWAzpdIROzFzxebkL7R2QsJFJrw`,
          'Content-Type': 'application/json',
        },
      }
    );

    const incident = response.data.items?.[0];
    if (!incident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    const rcaOwner = incident?.owned_by?.display_name || 'N/A';
    const rcaAuthor = incident?.created_by?.display_name || 'N/A';
    const title = incident?.title;
    const status = incident?.status;

    return res.json({
      incidentNumber,
      title,
      status,
      rcaOwner,
      rcaAuthor
    });
  } catch (error: any) {
    console.error("Error fetching DevRev incident:", error.response?.data || error.message);
    return res.status(500).json({
      message: "Error fetching incident from DevRev",
      error: error.response?.data || error.message
    });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
