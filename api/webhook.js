import fetch from 'node-fetch';

// Your constants
const CREATE_CHAT_URL = "https://carelytics.sdnim.com/api/flows/trigger/0dc3a82d-1e76-408e-b4f9-cced0f5d9fc2";
const SEND_MESSAGE_URL = "https://carelytics.sdnim.com/api/flows/trigger/e33fcc9c-555e-4b1b-af74-ef6f229f46e4";
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const AI_MODEL = "azure~openai.gpt-4o-mini";

// In-memory session store (Note: Vercel functions are stateless, 
// so for a production app, use a database like Redis/Upstash)
const userSessions = {};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(200).send('Please use POST');
    }

    const { message } = req.body;
    if (!message || !message.text) return res.status(200).send('OK');
   
    const chatId = message.chat.id;
    const userText = message.text;

    try {
        // 1. Get or Create AI Session
        let aiChatId = userSessions[chatId];
        if (!aiChatId) {
            aiChatId = await createAIChat();
            userSessions[chatId] = aiChatId;
        }

        // 2. Send message to AI
        const aiResponse = await sendMessageToAI(aiChatId, userText);

        // 3. Send response back to Telegram
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: aiResponse,
            }),
        });

        res.status(200).send('OK');
    } catch (error) {
        console.error('Error:', error);
        res.status(200).send('Error handled');
    }
}

// --- YOUR AI FUNCTIONS ---
async function createAIChat() {
    const response = await fetch(CREATE_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: AI_MODEL })
    });
    const data = await response.json();
    return data.id;
}

async function sendMessageToAI(chatId, message) {
    const response = await fetch(SEND_MESSAGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message, chat_id: chatId })
    });
    const data = await response.json();
    return data.response?.content || data.response || "No response from AI.";
}