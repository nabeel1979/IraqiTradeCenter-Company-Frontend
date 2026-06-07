import { api } from './client';

export interface CountryDto {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  isActive: boolean;
}

export interface CityDto {
  id: number;
  countryId: number;
  countryName: string;
  nameAr: string;
  nameEn?: string | null;
  isActive: boolean;
}

export interface UpsertCountryPayload {
  code: string;
  nameAr: string;
  nameEn?: string;
  isActive: boolean;
}

export interface UpsertCityPayload {
  countryId: number;
  nameAr: string;
  nameEn?: string;
  isActive: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
}

export const geographyApi = {
  listCountries: async () => {
    const res = await api.get<ApiResponse<CountryDto[]>>('/system/countries');
    return res.data.data ?? [];
  },

  createCountry: async (payload: UpsertCountryPayload) => {
    const res = await api.post<ApiResponse<CountryDto>>('/system/countries', payload);
    return res.data.data!;
  },

  updateCountry: async (id: number, payload: UpsertCountryPayload) => {
    await api.put(`/system/countries/${id}`, payload);
  },

  deleteCountry: async (id: number) => {
    await api.delete(`/system/countries/${id}`);
  },

  listCities: async (countryId?: number) => {
    const res = await api.get<ApiResponse<CityDto[]>>('/system/cities', {
      params: countryId ? { countryId } : undefined,
    });
    return res.data.data ?? [];
  },

  createCity: async (payload: UpsertCityPayload) => {
    const res = await api.post<ApiResponse<CityDto>>('/system/cities', payload);
    return res.data.data!;
  },

  updateCity: async (id: number, payload: UpsertCityPayload) => {
    await api.put(`/system/cities/${id}`, payload);
  },

  deleteCity: async (id: number) => {
    await api.delete(`/system/cities/${id}`);
  },
};
