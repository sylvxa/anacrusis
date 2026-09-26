import express from 'express';
import cookieParser from 'cookie-parser';

import { router as appRouter } from './routes/index.js';
import { router as authRouter } from './routes/auth.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static('public'));

app.use("/", appRouter);
app.use("/spotify", authRouter);

const PORT = process.env["PORT"] || 3000;
app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});
