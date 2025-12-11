// server.js (Ваш головний файл бекенду для App Platform)
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser'; // Якщо використовуєте
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 8080; // App Platform надасть порт через змінну ENV


// Отримуємо значення зі змінних середовища (на DigitalOcean)
const CLIENT_ID = process.env.HUBSPOT_CLIENT_ID; 
const CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const HUBSPOT_BASE_URL = process.env.HUBSPOT_BASE_URL;
const HUBSPOT_TOKEN_ENDPOINT = HUBSPOT_BASE_URL + '/oauth/v1/token';
const HUBSPOT_CONTACTS_ENDPOINT = HUBSPOT_BASE_URL + '/crm/v3/objects/contacts';

/**
 * Використовує refresh_token для отримання нової пари access_token/refresh_token.
 *
 * @param currentRefreshToken - Поточний токен оновлення.
 * @returns Promise<HubspotTokenResponse>
 */
export async function refreshAccessToken(currentRefreshToken) {
    
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('Server configuration error: Client ID or Client Secret is missing.');
    }
    
    // Параметри для запиту
    const body = new URLSearchParams({
        'grant_type': 'refresh_token',
        'client_id': '38d93d7d-c66c-41fa-8f9d-2848d3b357ce',
        'client_secret': '7c3db07d-512b-4204-982d-232370c14d25',
        'refresh_token': currentRefreshToken,
        // redirect_uri НЕ потрібен для grant_type=refresh_token
    })

    
    try {
        const response = await axios.post(
            HUBSPOT_TOKEN_ENDPOINT, 
            body, 
            {headers: {'Content-Type': 'application/x-www-form-urlencoded'}}
        );

        return response.data;
        
    } catch (error) {
        const axiosError = error ;

        if (axiosError.response) {
            const status = axiosError.response.status;
            const message = axiosError.response.data?.error_description || axiosError.response.data?.message || 'Unknown error';
            
            console.error(`HubSpot Token Refresh failed (Status ${status}): ${message}`);
            // Важливо: кидати нову помилку, щоб фронтенд міг її обробити
            throw new Error(`Token Refresh failed: [${status}] ${message}`);
        }
        
        throw new Error('Failed to refresh HubSpot access token due to network error.' + error);
    }
}

/**
 * Створює новий контакт безпосередньо в HubSpot (через проксі).
 * @param fields - Дані контакту (email, firstname, etc.).
 * @param TOKEN - Access Token.
 */
async function createHubspotContact(fields, TOKEN) {
    // Формування тіла запиту, як вимагає HubSpot
    const payload = {
        properties: fields,
    };

    if (!TOKEN) {
        throw new Error('HubSpot Access Token is missing from the request.');
    }

    try {
        const response = await axios.post(HUBSPOT_CONTACTS_ENDPOINT, payload, {
            headers: {
                // Використання токена
                Authorization: `Bearer ${TOKEN}`,
                'Content-Type': 'application/json',
            },
        });

        return response.data;
    } catch (error) {
        const axiosError = error;

        if (axiosError.response) {
            const status = axiosError.response.status;
            const message = axiosError.response.data?.message || 'Unknown error';
            console.error(`HubSpot Contact Creation failed (Status ${status}): ${message}`);
            throw new Error(`Contact creation failed: [${status}] ${message}`);
        }
        throw new Error('Failed to create HubSpot contact due to network error: ' + error.message);
    }
}

app.use(cors({ 
    // Це дозволить будь-який запит з http://localhost:3000
    origin: '*', 
    methods: ['POST', 'GET'], // Вказуємо дозволені методи
}));
app.use(bodyParser.json());

app.get('/health', (req, res) => {
    return res.status(200).json({message: 'ok!'});
})

// --- Ендпойнт Проксі для Оновлення Токена ---
app.post('/api/hubspot/refresh-token', async (req, res) => {
    // 1. Отримуємо refresh_token від фронтенду (у тілі запиту)
    const { refreshToken } = req.body; 

    if (!refreshToken) {
        return res.status(400).send({ message: 'Missing refresh token in request body.' });
    }

    try {
        // 2. Викликаємо функцію, яка робить запит до HubSpot (безпечно, з секретами з ENV)
        const newTokens = await refreshAccessToken(refreshToken);

        // 3. Повертаємо нові токени фронтенду
        // (Фронтенд оновить своє сховище токенів)
        res.status(200).json(newTokens);
        
    } catch (error) {
        // Обробка помилок (наприклад, недійсний refresh token)
        console.error('API Error:', error.message);
        res.status(500).send({ message: error.message || 'Internal server error during token refresh.' });
    }
});

// --- 2. НОВИЙ Ендпойнт для СТВОРЕННЯ КОНТАКТА ---
app.post('/api/hubspot/create-contact', async (req, res) => {
    // Очікуємо access_token та поля контакту від фронтенду
    const { fields, accessToken } = req.body; 

    if (!fields || !accessToken) {
        return res.status(400).send({ message: 'Missing contact fields or access token.' });
    }

    try {
        // Викликаємо функцію, яка робить запит до HubSpot
        const newContact = await createHubspotContact(fields, accessToken);

        // Повертаємо новий контакт клієнту
        res.status(201).json(newContact);
        
    } catch (error) {
        console.error('API Error:', error.message);
        res.status(500).send({ message: error.message || 'Internal server error during contact creation.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});