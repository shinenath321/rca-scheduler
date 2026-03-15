import express from "express";
import { google } from "googleapis";

const router = express.Router();

router.post("/verifyGoogleToken", async (req, res) => {
  const { googleAccessToken } = req.body;
  if (!googleAccessToken)
    return res.status(400).json({ message: "googleAccessToken is required" });

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: googleAccessToken });

    const oauth2 = google.oauth2({ version: "v2", auth });
    const { data } = await oauth2.userinfo.get();

    if (!data.email) throw new Error("Could not retrieve user info");
    res.json({ email: data.email, name: data.name });
  } catch (err: any) {
    console.error("❌ Token verification error:", err.message);
    res.status(401).json({ message: "Token invalid or expired" });
  }
});

export default router;
