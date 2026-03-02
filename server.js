process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("."));

const AUTH_KEY = process.env.AUTH_KEY;
const PIXAZO_KEY = process.env.PIXAZO_API_KEY;

let accessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
    if (accessToken && Date.now() < tokenExpiresAt) {
        return accessToken;
    }
    
    try {
        const response = await axios.post(
            "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
            new URLSearchParams({ scope: "GIGACHAT_API_PERS" }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                    "RqUID": crypto.randomUUID(),
                    "Authorization": `Basic ${AUTH_KEY}`
                }
            }
        );

        accessToken = response.data.access_token;
        tokenExpiresAt = Date.now() + response.data.expires_in * 1000;

        console.log("✅ Новый Access Token получен");
        return accessToken;
    } catch (error) {
        console.error("Ошибка получения токена:", error.response?.data || error.message);
        throw new Error("Не удалось получить access token");
    }
}

async function generateImagesPixazo(prompt) {
    const promises = [1, 2].map(() =>
        axios.post(
            "https://gateway.pixazo.ai/getImage/v1/getSDXLImage",
            {
                prompt: prompt,
                height: 768,
                width: 768,
                num_steps: 50,
                guidance_scale: 7.5,
                seed: Math.floor(Math.random() * 1000)
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "Ocp-Apim-Subscription-Key": PIXAZO_KEY
                }
            }
        )
    );

    const results = await Promise.all(promises);
    return results.map(r => r.data.imageUrl);
}

app.post("/generate", async (req, res) => {
    const { theme } = req.body;

    if (!theme) return res.status(400).json({ error: "Тема не указана" });

    try {
        const token = await getAccessToken();
        const chatResp = await axios.post(
            "https://gigachat.devices.sberbank.ru/api/v1/chat/completions",
            {
                model: "GigaChat",
                messages: [{ role: "user", content: `Напиши короткую сказку (5-10 предложений) на тему: ${theme}` }],
            },
            {
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
            }
        );
        const text = chatResp.data.choices[0].message.content;

        const images = await generateImagesPixazo(theme);

        res.json({ text, images });

    } catch (error) {
        if (error.response) {
            console.error("Ошибка генерации:", error.response.status, error.response.data);
        } else {
            console.error("Ошибка генерации:", error.message);
        }
        res.status(500).json({ error: "Ошибка генерации сказки или картинок" });
    }
});

app.listen(3000, () => console.log("🚀 Сервер запущен: http://localhost:3000"));