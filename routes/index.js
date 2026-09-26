import express from 'express';
import {currentTimestampSeconds} from "./auth.js";

export const router = express.Router();

router.use((req, res, next) => {
  if ((!req.cookies.access_token || req.cookies.expires < currentTimestampSeconds()) && !req.path.startsWith("/spotify")) {
    res.redirect('/spotify/login');
    return
  }

  next()
})

router.get("/", (req, res) => {
  res.sendFile('views/app.html', {root: "." })
});