import axios from 'axios';

const baseURL: string = import.meta.env.REACT_APP_BACKEND_URL || 'https://witty-tadpole-generally.ngrok-free.app/api';

/**
 * Fetch the CSRF token from the server. 
 */
let cachedCsrfToken: string | null = null;

const getCsrfToken = async (): Promise<string | null> => {
  if (cachedCsrfToken) {
    console.log('Using cached CSRF token:', cachedCsrfToken);
    return cachedCsrfToken;
  }

  try {
    const { data } = await axios.get<{ csrfToken: string }>(`${baseURL}/csrf-token`, { withCredentials: true });

    cachedCsrfToken = data.csrfToken; // Cache the token for future use
    console.log('Retrieved CSRF token from server:', cachedCsrfToken);
    return cachedCsrfToken;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('[CSRF] Error fetching CSRF token from server:', error.message, { error });
    } else {
      console.error('[CSRF] Unknown error occurred while fetching CSRF token from server', error);
    }
    return null;
  }
};

/**
 * Fetch the Auth token, ensuring CSRF protection.
 */
const getAuthToken = async (): Promise<string | null> => {
  try {
    const csrfToken = await getCsrfToken();

    const headers = { 'X-CSRF-Token': csrfToken };
    const { data } = await axios.get<{ token: string }>(`${baseURL}/auth/get-token`, {
      withCredentials: true,
      headers,
    });

    // Return the auth token
    return data.token;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('[Auth] Error fetching auth token:', error.message, { error });
    } else {
      console.error('[Auth] Unknown error occurred while fetching auth token', error);
    }
    return null;
  }
};

export { getAuthToken, getCsrfToken };
