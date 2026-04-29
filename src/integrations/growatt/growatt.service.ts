import { env } from '@/config/env.js';
import { logger } from '@/utils/logger.js';
import { growattAuth } from './growatt.auth.js';
import { GrowattPlant, GrowattInverter, GrowattPlantData } from './growatt.types.js';

class GrowattService {
  async getPlantList(): Promise<GrowattPlant[]> {
    await growattAuth.login();

    try {
      logger.info(`📡 Fetching ALL plant list from Growatt...`);

      const response = await fetch(`${env.GROWATT_BASE_URL}/index/getPlantListTitle`, {
        method: 'POST',
        headers: growattAuth.getHeaders(),
        body: new URLSearchParams({
          userId: growattAuth.getUserId() || '',
        }).toString(),
      });

      const text = await response.text();
      const data = JSON.parse(text);

      // CONFIRMED: response is a plain array [{ id, plantName, timezone }]
      const plants = Array.isArray(data) ? data : [];

      if (plants.length === 0) {
        logger.warn('⚠️ No plants found in Growatt response');
        return [];
      }

      // Enrich each plant with detail (city, nominalPower, lat, lng)
      const mappedPlants: GrowattPlant[] = await Promise.all(
        plants.map(async (p: any) => {
          const plantId = String(p.id || p.plantId);
          const detail = await this.getPlantDetail(plantId);

          return {
            plantId,
            plantName:    p.plantName || detail?.plantName || 'Unknown',
            location:     detail?.city || detail?.country || 'Unknown Location',
            nominalPower: parseFloat(detail?.nominalPower || '0'),
            lat:          detail?.lat ? parseFloat(detail.lat) : null,
            lng:          detail?.lng ? parseFloat(detail.lng) : null,
            eTotal:       parseFloat(detail?.eTotal || '0'),
            status:       this.parseStatus(p),
          };
        })
      );

      logger.info(`✅ Successfully fetched ${mappedPlants.length} plants from Growatt`);
      mappedPlants.forEach(p =>
        logger.info(`  📍 ${p.plantName} — ${p.location} (${p.nominalPower}W, eTotal:${p.eTotal}kWh)`)
      );

      return mappedPlants;
    } catch (error) {
      logger.error('❌ Failed to fetch plant list:', error);
      throw error;
    }
  }

  private parseStatus(plant: any): number {
    if (plant.plantStatus === '1' || plant.plantStatus === 1) return 1;
    if (plant.status === '1' || plant.status === 1) return 1;
    if (plant.isOnline === true || plant.isOnline === 1) return 1;
    return 1;
  }

  async getDeviceList(plantId: string): Promise<GrowattInverter[]> {
    await growattAuth.login();

    try {
      logger.info(`📡 Fetching inverters for plant: ${plantId}`);

      const response = await fetch(`${env.GROWATT_BASE_URL}/panel/getDevicesByPlant`, {
        method: 'POST',
        headers: growattAuth.getHeaders(),
        body: new URLSearchParams({ plantId, currPage: '1' }).toString(),
      });

      const text = await response.text();
      const data = JSON.parse(text);
      const obj = data.obj || {};

      // CONFIRMED structure: obj.storage = [[serialNum, alias, statusCode], ...]
      // status code "5" = normal/online for storage devices
      // Other possible keys: obj.mix, obj.inv, obj.tlx, obj.sph, obj.spa
      const parseDeviceArray = (arr: any[][], type: string): GrowattInverter[] =>
        (arr || []).map((d: any[]) => ({
          serialNum:  d[0] || `${type.toUpperCase()}-${plantId}`,
          capacity:   5000, // populated from plant nominalPower in sync service
          status:     d[2] === '5' || d[2] === 5 ? 1 : 0,
          deviceType: type,
        }));

      const allDevices = [
        ...parseDeviceArray(obj.storage || [], 'storage'),
        ...parseDeviceArray(obj.mix     || [], 'mix'),
        ...parseDeviceArray(obj.inv     || [], 'inv'),
        ...parseDeviceArray(obj.tlx     || [], 'tlx'),
        ...parseDeviceArray(obj.sph     || [], 'sph'),
        ...parseDeviceArray(obj.spa     || [], 'spa'),
      ];

      logger.info(`✅ Found ${allDevices.length} devices for plant ${plantId}`);
      return allDevices;
    } catch (error) {
      logger.error(`❌ Failed to fetch inverters for plant ${plantId}:`, error);
      return [];
    }
  }

  async getPlantData(plantId: string): Promise<GrowattPlantData> {
    await growattAuth.login();

    try {
      const obj = await this.getPlantDetail(plantId);
      if (!obj) throw new Error(`No data for plant ${plantId}`);

      // CONFIRMED fields from obj:
      // city, country, nominalPower, eTotal, lat, lng, co2, coal, tree
      // NOTE: this endpoint returns static plant info, NOT real-time power output.
      // pac will be 0 — real-time power requires querying each device individually.
      const result: GrowattPlantData = {
        pac:              0,   // requires per-device query (getStorageData)
        vac1:             230, // requires per-device query
        batteryPercentage: null,
        temperature:      null,
        // Enriched fields
        eTotal:       parseFloat(obj.eTotal       || '0'),
        nominalPower: parseFloat(obj.nominalPower || '0'),
        city:         obj.city    || null,
        country:      obj.country || null,
        lat:          obj.lat     ? parseFloat(obj.lat) : null,
        lng:          obj.lng     ? parseFloat(obj.lng) : null,
      };

      logger.info(`📊 Plant ${plantId}: City=${result.city}, Capacity=${result.nominalPower}W, Total=${result.eTotal}kWh`);
      return result;
    } catch (error) {
      logger.error(`❌ Failed to fetch plant data for ${plantId}:`, error);
      throw error;
    }
  }

  // Fetches plant detail obj — used internally by getPlantList and getPlantData
  async getPlantDetail(plantId: string): Promise<any> {
    await growattAuth.login();

    try {
      const response = await fetch(`${env.GROWATT_BASE_URL}/panel/getPlantData`, {
        method: 'POST',
        headers: growattAuth.getHeaders(),
        body: new URLSearchParams({ plantId }).toString(),
      });

      const text = await response.text();
      const data = JSON.parse(text);
      return data.obj || null;
    } catch (error) {
      logger.error(`Failed to fetch plant detail for ${plantId}:`, error);
      return null;
    }
  }

  // Fetch real-time data from a storage device
  async getStorageData(serialNum: string, plantId: string): Promise<{ pac: number; vac: number; soc: number | null }> {
    await growattAuth.login();

    try {
      const response = await fetch(`${env.GROWATT_BASE_URL}/panel/storage/getStorageInfo`, {
        method: 'POST',
        headers: growattAuth.getHeaders(),
        body: new URLSearchParams({ storageSn: serialNum, plantId }).toString(),
      });

      const text = await response.text();
      const data = JSON.parse(text);
      const obj = data.obj || data.data || {};

      console.log(`🔍 STORAGE DATA (${serialNum}):`, JSON.stringify(obj, null, 2));

      return {
        pac: parseFloat(obj.pac || obj.power || obj.ppv || obj.currentPower || 0),
        vac: parseFloat(obj.vac1 || obj.vGrid || obj.gridVoltage || 230),
        soc: parseFloat(obj.capacity || obj.soc || obj.batterySoc || 0) || null,
      };
    } catch (error) {
      logger.error(`Failed to fetch storage data for ${serialNum}:`, error);
      return { pac: 0, vac: 230, soc: null };
    }
  }
}

export const growattService = new GrowattService();