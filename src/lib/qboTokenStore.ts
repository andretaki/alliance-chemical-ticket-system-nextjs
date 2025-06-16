import fs from 'fs/promises';
import path from 'path';

// This is a simple file-based token store.
// In a production multi-user environment, you would use a database.
const tokenPath = path.join(process.cwd(), '.qbo-token.json');

export interface QboToken {
    access_token: string;
    refresh_token: string;
    token_type: 'bearer';
    expires_in: number;
    x_refresh_token_expires_in: number;
    createdAt: number; // Timestamp of creation
    realmId: string;
}

export const getToken = async (): Promise<QboToken | null> => {
    try {
        const data = await fs.readFile(tokenPath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // If file doesn't exist or is invalid, return null
        return null;
    }
};

export const setToken = async (token: object): Promise<void> => {
    try {
        const tokenData = {
            ...token,
            createdAt: Date.now(),
        };
        await fs.writeFile(tokenPath, JSON.stringify(tokenData, null, 2));
    } catch (error) {
        console.error('Failed to write QBO token:', error);
        throw new Error('Could not save QBO token.');
    }
}; 