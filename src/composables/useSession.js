// src/composables/useSession.js

export function useSession() {
    // Save data to the session
    const saveSession = (key, data) => {
        try {
            sessionStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error("Error saving to session", e);
        }
    };

    // Load data from the session
    const loadSession = (key) => {
        try {
            const stored = sessionStorage.getItem(key);
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            console.error("Error loading from session", e);
            return null;
        }
    };

    // Clear specific data
    const clearSession = (key) => {
        sessionStorage.removeItem(key);
    };

    return {
        saveSession,
        loadSession,
        clearSession,
    };
}
