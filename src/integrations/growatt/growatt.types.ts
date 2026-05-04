export interface GrowattPlant {
  plantId: string;
  plantName: string;
  location: string;
  nominalPower: number;
  lat: number | null;
  lng: number | null;
  eTotal: number;
  status: number;
}

export interface GrowattPlantListResponse {
  success: boolean;
  msg: string;
  data: GrowattPlant[];
}

export interface GrowattInverter {
  serialNum: string;
  capacity: number;
  status: number;
}

export interface GrowattDeviceListResponse {
  success: boolean;
  msg: string;
  data: GrowattInverter[];
}

export interface GrowattPlantData {
  pac: number;
  vac1: number;
  batteryPercentage: number | null;
  temperature: number | null;
  eTotal: number;
  nominalPower: number;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
}

export interface GrowattPlantDataResponse {
  success: boolean;
  msg: string;
  data: GrowattPlantData;
}