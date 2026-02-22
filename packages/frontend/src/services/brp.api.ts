import axios, { AxiosInstance } from 'axios';
import type { PersonState, BRPPersonenResponse } from '../types/brp.types';

const BRP_API_BASE_URL = 'https://brp-api-mock.open-regels.nl/haalcentraal/api/brp';

/**
 * BRP API Service for fetching person data
 * Uses the Haal Centraal BRP test API
 */
class BRPApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BRP_API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
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
   */
  async getPersonByBSN(bsn: string): Promise<PersonState | null> {
    try {
      const response = await this.client.post<BRPPersonenResponse>('/personen', {
        type: 'RaadpleegMetBurgerservicenummer',
        burgerservicenummer: [bsn],
        fields: ['burgerservicenummer', 'geboorte', 'kinderen', 'leeftijd', 'naam', 'partners'],
      });

      if (response.data.personen && response.data.personen.length > 0) {
        return response.data.personen[0];
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
    return BRP_API_BASE_URL;
  }
}

export const brpApi = new BRPApiService();
