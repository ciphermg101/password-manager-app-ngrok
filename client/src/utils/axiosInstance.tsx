import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';
import { getAuthToken, getCsrfToken } from './authTokenUtils';

const baseURL: string = import.meta.env.REACT_APP_BACKEND_URL || 'https://witty-tadpole-generally.ngrok-free.app/api';

const axiosInstance: AxiosInstance = axios.create({
    baseURL,
    timeout: 5000,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: AxiosError) => void }> = [];

/**
 * Process requests in the queue after a token refresh.
 */
const processQueue = (token: string | null, error?: AxiosError) => {
    failedQueue.forEach(({ resolve, reject }) => (token ? resolve(token) : reject(error ?? new AxiosError('Unknown error'))));
    failedQueue = [];
};

interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
    _retry?: boolean;
}

/**
 * Axios request interceptor to add CSRF and Authorization tokens.
 */
axiosInstance.interceptors.request.use(
    async (config: ExtendedAxiosRequestConfig) => {
        try {
            let csrfToken = await getCsrfToken();
            console.log("Header csrfToken: " + csrfToken);

            // Retry fetching CSRF token if it’s missing
            if (!csrfToken) {
                console.warn('[CSRF] Token missing, retrying...');
                csrfToken = await getCsrfToken(); // Retry fetching the CSRF token
            }

            const authToken = await getAuthToken();

            // Add CSRF and Auth tokens to headers
            if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken;
            if (authToken) config.headers['Authorization'] = `Bearer ${authToken}`;

            console.log('[Axios] Headers set:', config.headers);
        } catch (error) {
            console.error('[Axios] Request Interceptor Error:', error);
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

/**
 * Axios response interceptor to handle token refresh and retry failed requests.
 */
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as ExtendedAxiosRequestConfig;

        // Check for 498 (invalid/expired token) and retry if necessary
        if (error.response?.status === 498 && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => failedQueue.push({ resolve, reject }));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                console.warn('[Auth] Token expired, refreshing...');
                const { data } = await axios.post<{ token: string }>(`${baseURL}/auth/refresh-token`, {}, { withCredentials: true });
                
                // Set new auth token to header
                axiosInstance.defaults.headers['Authorization'] = `Bearer ${data.token}`;
                processQueue(data.token, undefined);

                // Retry the original request with new token
                return axiosInstance(originalRequest);
            } catch (err) {
                console.error('[Auth] Token refresh failed:', err);
                processQueue(null, error);
                window.location.href = '/login'; // Redirect to login if refresh fails
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error); // Reject if not 498 or another error occurs
    }
);

export default axiosInstance;
export { getCsrfToken, getAuthToken };
