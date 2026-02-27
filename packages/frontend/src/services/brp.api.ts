import axios, { AxiosInstance } from 'axios';
import keycloak from './keycloak';
import type { PersonState, BRPPersonenResponse } from '../types/brp.types';

// Use backend proxy instead of direct BRP API call
const isProduction =
  typeof window !== 'undefined' && window.location.hostname === 'mijn.open-regels.nl';
const API_BASE_URL = isProduction ? 'https://api.open-regels.nl/v1' : 'http://localhost:3002/v1';

/**
 * BRP API Service for fetching person data
 * Routes through backend proxy to avoid CORS issues
 */
class BRPApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add JWT token to requests
    this.client.interceptors.request.use(async (config) => {
      if (keycloak.token) {
        config.headers.Authorization = `Bearer ${keycloak.token}`;
      }
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('BRP API error:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
        });
        throw error;
      }
    );
  }

  /**
   * Fetch person data by BSN (Burgerservicenummer)
   * Routes through backend at /v1/brp/personen
   */
  async getPersonByBSN(bsn: string): Promise<PersonState | null> {
    try {
      // Call backend proxy endpoint
      const response = await this.client.post<{ success: boolean; data: BRPPersonenResponse }>(
        '/brp/personen',
        {
          type: 'RaadpleegMetBurgerservicenummer',
          burgerservicenummer: [bsn],
          fields: ['burgerservicenummer', 'geboorte', 'kinderen', 'leeftijd', 'naam', 'partners'],
        }
      );

      if (
        response.data.success &&
        response.data.data.personen &&
        response.data.data.personen.length > 0
      ) {
        return response.data.data.personen[0];
      }

      return null;
    } catch (error) {
      console.error(`Failed to fetch person with BSN ${bsn}:`, error);
      throw error;
    }
  }

  /**
   * Get API base URL for debugging
   */
  getBaseUrl(): string {
    return API_BASE_URL;
  }
}

export const brpApi = new BRPApiService();
