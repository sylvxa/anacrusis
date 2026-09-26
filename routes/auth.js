import express from 'express';
import { stringify} from 'node:querystring';
export const router = express.Router();

import { config as load_dotenv } from 'dotenv';
load_dotenv();

const CLIENT_ID = process.env["CLIENT_ID"];
const CLIENT_SECRET = process.env["CLIENT_SECRET"];
const REDIRECT_URI = process.env["REDIRECT_URI"];

const SCOPE = "user-read-private user-read-email user-top-read"

function randomString(length) {
    return Math.round((Math.pow(36, length + 1) - Math.random() * Math.pow(36, length))).toString(36).slice(1);
}

export function currentTimestampSeconds() {
    return Math.round(Date.now() / 1000)
}

export function clearTokens(res) {
    res.clearCookie("access_token");
    res.clearCookie("expires");
}

export function setAccessToken(res, token, lifespan) {
    res.cookie("access_token", token);
    res.cookie("expires", currentTimestampSeconds() + lifespan);
}

router.get('/login', function(req, res) {
  const state = randomString(16);

  res.redirect('https://accounts.spotify.com/authorize?' +
      stringify({
        response_type: 'code',
        client_id: CLIENT_ID,
        scope: SCOPE,
        redirect_uri: REDIRECT_URI,
        state: state
      }));
});

router.get('/logout', function(req, res) {
    clearTokens(res);
    res.redirect("/")
});

router.get('/callback', function(req, res) {
    const code = req.query.code || null;
    const state = req.query.state || null;

    if (state === null) {
        res.redirect('/#' +
            stringify({
                error: 'state_mismatch'
            }));
    } else {
        fetch("https://accounts.spotify.com/api/token", {
            "method": "POST",
            "headers": {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (new Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
            },
            "body": new URLSearchParams({
                code: code,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code'
            })
        }).then(r => r.json()).then(data => {
            setAccessToken(res, data["access_token"], data["expires_in"]);
            res.redirect('/')
        }).catch(err => console.log(err));
    }
});
