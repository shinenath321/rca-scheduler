import express from "express";
import { google } from "googleapis";

const router = express.Router();

router.post("/scheduleEvent", async (req, res) => {
  const {
    googleAccessToken,
    ownerEmail,
    ownerName,
    authorEmail,
    authorName,
    reviewerEmail,
    reviewerName,
    chosenSlot,
    incidentId,
    rcaDocLink,
    rcaPriority,
  } = req.body;

  if (!googleAccessToken || !ownerEmail || !authorEmail || !reviewerEmail || !chosenSlot) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {    
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: googleAccessToken });
    const calendar = google.calendar({ version: "v3", auth });

    const rcaIncidentLink = `https://app.devrev.ai/razorpay/incidents/${incidentId}`;

    const startTime = new Date(chosenSlot.start).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    const endTime = new Date(chosenSlot.end).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });


    const uniqueAttendees = Array.from(
      
new Set([ownerEmail,
   authorEmail,
   reviewerEmail,
    "incident-management-team@razorpay.com",
    ])
    ).map(email => ({ email }));

    const description = `Hello All,
    
Please join the RCA Review Meeting for ${rcaPriority}: ${incidentId}

Incident: ${rcaPriority}: <a href="${rcaIncidentLink}">${incidentId}</a> | <a href="${rcaDocLink}">RCA Document</a>
RCA Owner: ${ownerName}
RCA Reviewer: ${reviewerName}
Time: ${startTime} - ${endTime}

Please Note:
1. We have included the RCA authors along with the 
RCA Owner as per the recent request(s) from the 
Leaders.
2. We have included the impacted POD EM as well.

PS: Please nominate a PoC if you are unavailable.

Regards,
Shine S Nath
Incident Management Team`.trim();

    const event = {
      summary: `RCA Review - ${incidentId}`,
      description,
      start: {
        dateTime: new Date(chosenSlot.start).toISOString(),
        timeZone: "Asia/Kolkata",
      },
      end: {
        dateTime: new Date(chosenSlot.end).toISOString(),
        timeZone: "Asia/Kolkata",
      },
      attendees: uniqueAttendees,
      
      guestsCanSeeOtherGuests: true,
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 30 },
          { method: "popup", minutes: 10 },
        ],
      },
    };

    const insertRes = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: "all",
      requestBody: event,
    });

    const startDateTime: any = insertRes.data.start?.dateTime; 
    const date = new Date(startDateTime);
    const scheduledDate = date.toISOString().split("T")[0]; // "2025-02-12"

    const scheduledStartTime = date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit"
    }); // "10:00 AM"

    res.json({
      message: "Event created successfully",
      eventId: insertRes.data.id,
      scheduledDate,
      scheduledStartTime
    });

  } catch (err: any) {
    console.error("Error scheduling event:", err.message);
    res.status(500).json({
      message: "Error scheduling event",
      error: err.message,
    });
  }
});

export default router;