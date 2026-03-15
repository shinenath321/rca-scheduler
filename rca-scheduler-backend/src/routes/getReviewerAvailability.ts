import express from "express";
import { google } from "googleapis";

const router = express.Router();

router.post("/getReviewerAvailability", async (req, res) => {
  const { googleAccessToken, reviewerEmail } = req.body;
  if (!googleAccessToken || !reviewerEmail)
    return res.status(400).json({ message: "googleAccessToken and reviewerEmail required" });

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: googleAccessToken });
    const calendar = google.calendar({ version: "v3", auth });

    const now = new Date();
    const rangeEnd = new Date();
    rangeEnd.setDate(now.getDate() + 7);

    const reviewerEvents = await calendar.events.list({
      calendarId: reviewerEmail,
      timeMin: now.toISOString(),
      timeMax: rangeEnd.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const busySlots = (reviewerEvents.data.items || [])
      .filter(e => {
        if (e.status === "cancelled") return false;
        const att = e.attendees?.find(a => a.email?.toLowerCase() === reviewerEmail.toLowerCase());
        if (!att) return false;
        return ["accepted", "tentative"].includes(att.responseStatus?.toLowerCase() || "");
      })
      .map(e => ({
        start: new Date(e.start?.dateTime || e.start?.date || ""),
        end: new Date(e.end?.dateTime || e.end?.date || ""),
      }));

    res.json({ busySlots });
  } catch (err: any) {
    res.status(500).json({ message: "Error fetching reviewer availability", error: err.message });
  }
});

export default router;
