function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

let ACCESS_TOKEN = getCookie("access_token");
if (!ACCESS_TOKEN) {
    alert("Not logged in, how are you here?")
}

async function apiGet(url) {
    return fetch(url, {
        "headers": {
            Authorization: "Bearer " + getCookie("access_token")
        }
    }).then(r => r.json());
}

async function fetchImage(url) {
    return new Promise((resolve, reject) => {
        let img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    })
}

const workingCanvas = new OffscreenCanvas(1, 1);
const workingCtx = workingCanvas.getContext("2d", {
    willReadFrequently: true,
});

function getDominantColor(imageObject) {
    workingCtx.drawImage(imageObject, 0, 0, 1, 1);

    const i = workingCtx.getImageData(0, 0, 1, 1).data;
    return [i[0], i[1], i[2]]
}

// https://gist.github.com/mjackson/5311256
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l;
    h = s = l = (max + min) / 2;

    if (max == min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }

        h /= 6;
    }

    return [ h, s, l ];
}

function getDistance3d(x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

async function collectImages(time_range = "medium_term", iterations = Infinity) {
    let imagePromises = []
    let collectedAlbums = new Set()

    let url = "https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=" + time_range;
    let i = 0;
    while (url) {
        let top = await apiGet(url);
        for (let item of top.items) {
            let album = item.album;
            if (collectedAlbums.has(album.id)) continue

            let image = album.images[album.images.length - 1]; // Ordered largest to smallest
            imagePromises.push(fetchImage(image.url));
            collectedAlbums.add(album.id);
        }
        if (i++ < iterations) url = top.next;
        else break;
    }

    return Promise.all(imagePromises);
}

function tagWithPalette(images) {
    for (let image of images) {
        let color = getDominantColor(image);
        image._color = rgbToHsl(...color);
    }
}

const canvas = document.querySelector(".output");
const ctx = canvas.getContext("2d");

const [TILE_WIDTH, TILE_HEIGHT] = [16, 16];
const [INPUT_WIDTH, INPUT_HEIGHT] = [64, 64]
const [OUTPUT_WIDTH, OUTPUT_HEIGHT] = [INPUT_WIDTH * TILE_WIDTH, INPUT_HEIGHT * TILE_HEIGHT]
function findClosestImage(h, s, l, palette) {
    let closestDistance = Infinity;
    let closestImage = null;
    for (let image of palette) {
        let [ih, is, il] = image._color;

        let dist = getDistance3d(ih, is, il, h, s, l);
        if (dist < closestDistance) {
            closestDistance = dist;
            closestImage = image;
        }
    }

    return closestImage;
}

function drawPaletted(inImage, palette) {
    const sourceCanvas = new OffscreenCanvas(INPUT_WIDTH, INPUT_HEIGHT);
    const sourceCtx = sourceCanvas.getContext("2d");
    sourceCtx.drawImage(inImage, 0, 0, INPUT_WIDTH, INPUT_HEIGHT);
    const sourceData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const pixelData = sourceData.data;

    canvas.width = OUTPUT_WIDTH;
    canvas.height = OUTPUT_HEIGHT;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixelData.length; i += 4) {
        const [r, g, b] = [pixelData[i], pixelData[i + 1], pixelData[i + 2]]
        let [h, s, l] = rgbToHsl(r, g, b);
        let image = findClosestImage(h, s, l, palette);

        let pixelI = i / 4;
        let y = Math.floor(pixelI / INPUT_WIDTH);
        let x = pixelI % INPUT_WIDTH;

        let ox = x * TILE_WIDTH;
        let oy = y * TILE_HEIGHT;

        console.log(ox, oy)
        ctx.drawImage(image, ox, oy, TILE_WIDTH, TILE_HEIGHT);
    }
}

(async function() {
    let images = await collectImages("medium_term");
    let inImage = await fetchImage("/img/test.jpg");

    document.title = "Tagging palette";
    tagWithPalette(images);

    document.title = "Drawing with palette";
    drawPaletted(inImage, images);
})();