const fetch = require('node-fetch');
const { google } = require('googleapis');

const CREATE_CHAT_URL = "https://carelytics.sdnim.com/api/flows/trigger/0dc3a82d-1e76-408e-b4f9-cced0f5d9fc2";
const SEND_MESSAGE_URL = "https://carelytics.sdnim.com/api/flows/trigger/e33fcc9c-555e-4b1b-af74-ef6f229f46e4";
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const AI_MODEL = "azure~anthropic.claude-4-sonnet";
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

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
const ALLOWED_USERS = [851642385, 852635840, 929848056, 339501250, 77107711, 20101904, 332431087, 25290327, 45630449, 196888109];

// Helper to log to Google Sheets
async function logToSheet(chatId, userId, userMsg, aiMsg) {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                // The replace here is CRUCIAL for Vercel to read the key correctly
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Raw_data!A:E', // Make sure your tab is named Sheet1
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[
                    chatId.toString(), 
                    userId.toString(), 
                    userMsg, 
                    aiMsg, 
                    new Date().toLocaleString("en-SG", { timeZone: "Asia/Singapore" })
                ]],
            },
        });
        console.log("✅ Logged to Google Sheets");
    } catch (error) {
        console.error("❌ Google Sheets Error:", error);
    }
}

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

        // 3. Log to Sheet (Run this in background)
        logToSheet(chatId, userId, userText, aiResponse);

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