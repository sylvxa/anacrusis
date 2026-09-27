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

const workingCanvas = new OffscreenCanvas(64, 64);
const workingCtx = workingCanvas.getContext("2d", {
    willReadFrequently: true,
});

// https://matkl.github.io/average-color/
function getDominantColor(img) {
    workingCtx.drawImage(img, 0, 0, workingCanvas.width, workingCanvas.height);

    const imageData = workingCtx.getImageData(0, 0, workingCanvas.width, workingCanvas.height);
    const data = imageData.data;
    let r = 0;
    let g = 0;
    let b = 0;

    for (let i = 0, l = data.length; i < l; i += 4) {
        r += data[i];
        g += data[i+1];
        b += data[i+2];
    }

    r = Math.floor(r / (data.length / 4));
    g = Math.floor(g / (data.length / 4));
    b = Math.floor(b / (data.length / 4));

    return [r, g, b];
}

// https://gist.github.com/mjackson/5311256
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l;
    h = s = l = (max + min) / 2;

    if (max === min) {
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

let tileSize = 16;
const DOWNSCALE_SIZE = 64;

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

function normalize(width, height) {
    if (width > height) {
        return [DOWNSCALE_SIZE, Math.floor((height / width) * DOWNSCALE_SIZE)];
    } else {
        return [Math.floor((width / height) * DOWNSCALE_SIZE), DOWNSCALE_SIZE];
    }
}

function drawPaletted(inImage, palette) {
    let [inWidth, inHeight] = normalize(inImage.width, inImage.height);
    let [outWidth, outHeight] = [inWidth * tileSize, inHeight * tileSize];

    const sourceCanvas = new OffscreenCanvas(inWidth, inHeight);
    const sourceCtx = sourceCanvas.getContext("2d");
    sourceCtx.drawImage(inImage, 0, 0, inWidth, inHeight);

    const sourceData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const pixelData = sourceData.data;

    canvas.width = outWidth;
    canvas.height = outHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixelData.length; i += 4) {
        const [r, g, b] = [pixelData[i], pixelData[i + 1], pixelData[i + 2]]
        let [h, s, l] = rgbToHsl(r, g, b);
        let image = findClosestImage(h, s, l, palette);

        let pixelI = i / 4;
        let y = Math.floor(pixelI / inWidth);
        let x = pixelI % inWidth;

        let ox = x * tileSize;
        let oy = y * tileSize;

        ctx.drawImage(image, ox, oy, tileSize, tileSize);
    }
}

const loader = document.querySelector(".loader");
const loaderMessage = loader.querySelector(".message");

function setLoadingMessage(message) {
    loaderMessage.innerText = message;
}

let lastDrawnImage = null;
function loadingScreenAndDraw(inImage, palette, highRes = false, onFinished = () => {}) {
    setLoadingMessage("Generating image...")
    startLoading();

    tileSize = highRes ? 64 : 16;

    lastDrawnImage = inImage;
    setTimeout(() => {
        drawPaletted(inImage, palette)
        endLoading()
        onFinished()
    }, 1000);
}

function startLoading() {
    loader.classList.remove("done-loading");
}

function endLoading() {
    loader.classList.add("done-loading");
}

const nav = document.querySelector("nav");
const fileInput = nav.querySelector("input");
const exportButton = nav.querySelector("#export");
(async function() {
    setLoadingMessage("Fetching user data...");
    let images = await collectImages("medium_term");

    setLoadingMessage("Fetching examples...");
    let example = null;
    for (let button of nav.children) {
        if (!(button.dataset.image)) continue;

        let url = button.dataset.image;
        let image = await fetchImage(url);
        if (!example) example = image;
        button.addEventListener("click", async () => {
            loadingScreenAndDraw(image, images);
        })
    }

    fileInput.addEventListener("change", () => {
        if (fileInput.files.length === 1) {
            const img = new Image();
            img.onload = () => {
                loadingScreenAndDraw(img, images)
            }
            img.src = window.URL.createObjectURL(fileInput.files[0]);
        }
    });

    exportButton.addEventListener("click", async () => {
        loadingScreenAndDraw(lastDrawnImage, images, true, () => {
            let downloadLink = document.createElement('a');
            downloadLink.setAttribute('download', 'mosaic.png');

            let dataURL = canvas.toDataURL('image/png');
            let url = dataURL.replace(/^data:image\/png/,'data:application/octet-stream');
            downloadLink.setAttribute('href', url);
            downloadLink.click();
        });
    })

    setLoadingMessage("Generating palette...");
    tagWithPalette(images);

    loadingScreenAndDraw(example, images);
})();