import express from "express";
import axios from "axios";
import dotenv from "dotenv";

const router = express.Router();

dotenv.config();

router.post("/getRCAInfo", async (req, res) => {
  const { incidentId } = req.body;

  const devrevApiKey = process.env.DEVREV_API_KEY;

  if (!devrevApiKey || !incidentId)
    return res.status(400).json({ message: "devrevApiKey and incidentId are required" });

  try {
    const devrevResponse = await axios.get(
      "https://api.devrev.ai/incidents.get",
      {
        params: { id: incidentId }, // incidentId sent as query param
        headers: {
          Authorization: `Bearer ${devrevApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    // console.log(devrevResponse.data);
    const incident = devrevResponse.data?.incident;
    if (!incident) return res.status(404).json({ message: "Incident not found" });

    const ownerEmail = incident.owned_by[0].email;
    const ownerName = incident.owned_by[0].full_name;
    const rcaLink = incident.custom_fields.tnt__internal_rca_doc_link;
    const rcaSeverity = incident.severity.label;
    const severityNumber = Number(rcaSeverity.split("-")[1]);
    var rcaPriority: any = null;

    rcaPriority = severityNumber != null ?
    `${incident.custom_fields.tnt__priority}|S${severityNumber}` :
    incident.custom_fields.tnt__priority;
    
    if (!rcaLink || rcaLink.trim() === "") return res.status(404).json({ message: "Internal RCA Link not found" });

    res.json({ ownerName , ownerEmail , rcaLink , rcaPriority });
  } catch (err: any) {
    res.status(500).json({ message: "DevRev fetch failed", error: err.response?.data || err.message });
  }
});

export default router;
