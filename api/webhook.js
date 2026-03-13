const fetch = require('node-fetch');

const CREATE_CHAT_URL = "https://carelytics.sdnim.com/api/flows/trigger/0dc3a82d-1e76-408e-b4f9-cced0f5d9fc2";
const SEND_MESSAGE_URL = "https://carelytics.sdnim.com/api/flows/trigger/e33fcc9c-555e-4b1b-af74-ef6f229f46e4";
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const AI_MODEL = "azure~openai.gpt-4o-mini";

const userSessions = {};

// Helper function to show "typing..."
async function sendTypingAction(chatId) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            action: 'typing'
        }),
    });
}

// Add your list of allowed IDs here (numbers, no quotes)
const ALLOWED_USERS = [851642385, 852635840, 929848056, 339501250, 77107711, 20101904];

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('OK');

    const { message } = req.body;
    if (!message || !message.text) return res.status(200).send('OK');
    
    const chatId = message.chat.id;
    const userText = message.text;
    const userId = message.from.id;

    // 🛑 RESTRICTION CHECK
    if (!ALLOWED_USERS.includes(userId)) {
        console.log(`🚫 Unauthorized access attempt by ID: ${userId}`);
        
        // Optional: Send a polite "No access" message
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: "Sorry, you are not authorized to use this bot. Please contact the admin.",
            }),
        });
        
        return res.status(200).send('Unauthorized');
    }

    try {
        // 1. Immediately show "typing..." in Telegram
        await sendTypingAction(chatId);

        // 2. Get or Create AI Session
        let aiChatId = userSessions[chatId];
        if (!aiChatId) {
            aiChatId = await createAIChat();
            userSessions[chatId] = aiChatId;
        }

        // 3. Send message to AI (this part takes time)
        const aiResponse = await sendMessageToAI(aiChatId, userText);

        // 4. Send the actual text response
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
        res.status(200).send('Error');
    }
}

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