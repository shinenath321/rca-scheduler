import express from "express";
import axios from "axios";
import reviewersMap from "../utils/reviewersMap";

const router = express.Router();

router.post("/scheduleRCA", async (req, res) => {
  try {
    const { googleAccessToken, incidentId, ownerBU } = req.body;

    // Call your modular APIs internally
    const base = "http://localhost:4000/api"; // adjust if needed

    const { data: rcaInfo } = await axios.post(`${base}/getRCAInfo`, { incidentId });

    const { data: reviewer } = await axios.post(`${base}/getReviewer`, {
      ownerBU: ownerBU,
      reviewersMap,
    });

    const { data: availability } = await axios.post(`${base}/getReviewerAvailability`, {
      googleAccessToken,
      reviewerEmail: reviewer.reviewerEmail,
    });

    const { data: slot } = await axios.post(`${base}/findAvailableSlot`, {
      busySlots: availability.busySlots,
    });

    const { data: event } = await axios.post(`${base}/scheduleEvent`, {
      googleAccessToken,
      ownerEmail: rcaInfo.ownerEmail,
      ownerName: rcaInfo.ownerName,
      authorEmail: "shine.nath@razorpay.com",
      authorName: "Shine S Nath",
      reviewerEmail: reviewer.reviewerEmail,
      reviewerName: reviewer.reviewerName,
      chosenSlot: slot.chosenSlot,
      incidentId,
      rcaDocLink: rcaInfo.rcaLink,
      rcaPriority: rcaInfo.rcaPriority
    });

    res.json({ message: "RCA Scheduled Successfully", event });
  } catch (err: any) {
    res.status(500).json({ message: "RCA Scheduling Failed", error: err.message });
  }
});

export default router;