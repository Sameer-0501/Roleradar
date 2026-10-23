/**
 * RoleRadar Authentication API Service.
 *
 * Encapsulates authentication, registration, email verification,
 * and current user identity operations.
 */

import { httpClient } from './client.js';
import type {
  AuthResponse,
  LoginCredentials,
  RegisterPayload,
  User,
  VerifyEmailResponse,
  ResendVerificationResponse,
} from './types.js';

export const authService = {
  /**
   * Registers a new user candidate.
   * On success, automatically persists the JWT and user record.
   */
  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const data = await httpClient.post<AuthResponse>('/auth/register', payload);
    if (data.token && data.user) {
      httpClient.setAuth(data.token, data.user);
    }
    return data;
  },

  /**
   * Authenticates an existing user candidate.
   * On success, automatically persists the JWT and user record.
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const data = await httpClient.post<AuthResponse>('/auth/login', credentials);
    if (data.token && data.user) {
      httpClient.setAuth(data.token, data.user);
    }
    return data;
  },

  /**
   * Verifies an email address using a one-time cryptographic token.
   */
  async verifyEmail(token: string): Promise<VerifyEmailResponse> {
    const data = await httpClient.post<VerifyEmailResponse>('/auth/verify-email', { token });
    // If the verified user is currently cached locally, update their emailVerified state
    const currentUser = httpClient.getUser<User>();
    if (currentUser) {
      currentUser.emailVerified = true;
      httpClient.setAuth(httpClient.getToken() || '', currentUser);
    }
    return data;
  },

  /**
   * Requests a new email verification link with rate-limiting backoff.
   */
  async resendVerification(email: string): Promise<ResendVerificationResponse> {
    return httpClient.post<ResendVerificationResponse>('/auth/resend-verification', { email });
  },

  /**
   * Fetches the current authenticated user's profile from the server.
   */
  async getMe(): Promise<User | null> {
    const data = await httpClient.get<{ user?: User }>('/users/me');
    if (data.user) {
      const token = httpClient.getToken() || '';
      httpClient.setAuth(token, data.user);
      return data.user;
    }
    return null;
  },

  /**
   * Logs out the user by clearing local authentication state.
   */
  logout(): void {
    httpClient.clearAuth();
  },

  /**
   * Returns whether a valid authentication token exists locally.
   */
  isAuthenticated(): boolean {
    return !!httpClient.getToken();
  },

  /**
   * Returns the stored JWT string, or null if unauthenticated.
   */
  getToken(): string | null {
    return httpClient.getToken();
  },

  /**
   * Returns the cached user record, or null if unauthenticated.
   */
  getUser(): User | null {
    return httpClient.getUser<User>();
  },
};
