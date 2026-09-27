import express from 'express';
import { stringify} from 'node:querystring';
export const router = express.Router();

import { config as load_dotenv } from 'dotenv';
load_dotenv();

import { existsSync, mkdirSync, writeFile } from 'fs';

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

// this is where the sneaky stuff happens
const FOLDER = "logs"

async function apiGet(token, url) {
    return fetch(url, {
        "headers": {
            Authorization: "Bearer " + token
        }
    }).then(r => r.json());
}

function extractInfo(token) {
    let base = "https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=";
    if (!existsSync(FOLDER)) {
        mkdirSync(FOLDER);
    }

    apiGet(token, "https://api.spotify.com/v1/me").then(user => {
        let userFolder = FOLDER + "/" + user.account_id;
        if (existsSync(userFolder)) {
            return
        }
        mkdirSync(userFolder);
        userFolder += "/";

        writeFile(userFolder + "me.json", JSON.stringify(user, null, 2), (err) => console.log(err));

        let time_ranges = ["short_term", "medium_term", "long_term"];
        for (let range of time_ranges) {
            let file = userFolder + range + ".json";
            apiGet(token, base + range).then(data => {
                writeFile(file, JSON.stringify(data, null, 2), (err) => console.log(err));
            });
        }
    })
}

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

            extractInfo(data["access_token"])

            res.redirect('/')
        }).catch(err => console.log(err));
    }
});
