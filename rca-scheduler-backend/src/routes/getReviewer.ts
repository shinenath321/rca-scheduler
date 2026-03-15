import express from "express";
import reviewersMap from "../utils/reviewersMap";

const router = express.Router();

router.post("/getReviewer", (req, res) => {
  const { ownerBU } = req.body;

  if (!ownerBU) {
    return res.status(400).json({ message: "ownerBU is required" });
  }

  // Filter eligible BUs (exclude same BU)
  const eligibleBUs = Object.keys(reviewersMap).filter(bu => bu !== ownerBU);

  // Pick a random eligible BU
  const chosenBU: any =
    eligibleBUs.length > 0
      ? eligibleBUs[Math.floor(Math.random() * eligibleBUs.length)]
      : Object.keys(reviewersMap)[0]; // fallback

  // reviewersMap[chosenBU] is now an array of { email, name }
  const reviewers: any = reviewersMap[chosenBU];
  const reviewer =
    reviewers[Math.floor(Math.random() * reviewers.length)];

  res.json({
    reviewerEmail: reviewer.email,
    reviewerName: reviewer.name,
    reviewerBU: chosenBU
  });
});

export default router;