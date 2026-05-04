import { env } from '@/config/env.js';
import { logger } from '@/utils/logger.js';
import { growattAuth } from './growatt.auth.js';
import { GrowattPlant, GrowattInverter, GrowattPlantData } from './growatt.types.js';



class GrowattService {
  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Parses a response body as JSON. If the server returned HTML (session
   * redirect, 404 page, etc.) it logs the first 300 chars so you can see
   * exactly what Growatt sent back, then throws a typed error.
   */
  private parseJsonOrThrow(text: string, context: string): unknown {
    if (text.trimStart().startsWith('<')) {
      // Grab the page title if present, otherwise show raw snippet
      const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i);
      const snippet = titleMatch
        ? `page title: "${titleMatch[1].trim()}"`
        : `raw: ${text.substring(0, 300).replace(/\s+/g, ' ')}`;
      logger.warn(`⚠️  [${context}] Got HTML instead of JSON — ${snippet}`);
      throw new Error('HTML_RESPONSE');
    }
    return JSON.parse(text);
  }

  private parseStatus(_plant: unknown): number {
    // Growatt doesn't reliably expose online/offline in the plant list payload.
    // Real status comes from per-device polling. Default to 1 (online) here;
    // monitoring.service will override based on pac/soc readings.
    return 1;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async getPlantList(): Promise<GrowattPlant[]> {
    await growattAuth.login();

    try {
      logger.info('📡 Fetching ALL plant list from Growatt...');

      const response = await fetch(`${env.GROWATT_BASE_URL}/index/getPlantListTitle`, {
        method: 'POST',
        headers: growattAuth.getHeaders(),
        body: new URLSearchParams({
          userId: growattAuth.getUserId() ?? '',
        }).toString(),
      });

      const text = await response.text();
      const data = this.parseJsonOrThrow(text, 'getPlantListTitle') as unknown[];

      const plants = Array.isArray(data) ? data : [];

      if (plants.length === 0) {
        logger.warn('⚠️  No plants found in Growatt response');
        return [];
      }

      const mappedPlants: GrowattPlant[] = await Promise.all(
        plants.map(async (p: unknown) => {
          const plant = p as Record<string, unknown>;
          const plantId = String(plant['id'] ?? plant['plantId']);
          const detail = await this.getPlantDetail(plantId);

          return {
            plantId,
            plantName:    String(plant['plantName'] ?? detail?.plantName ?? 'Unknown'),
            location:     String(detail?.city ?? detail?.country ?? 'Unknown Location'),
            nominalPower: parseFloat(String(detail?.nominalPower ?? '0')),
            lat:          detail?.lat != null ? parseFloat(String(detail.lat)) : null,
            lng:          detail?.lng != null ? parseFloat(String(detail.lng)) : null,
            eTotal:       parseFloat(String(detail?.eTotal ?? '0')),
            status:       this.parseStatus(plant),
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
      const data = this.parseJsonOrThrow(text, `getDevicesByPlant:${plantId}`) as Record<string, unknown>;
      const obj = (data['obj'] ?? {}) as Record<string, unknown[][]>;

      // CONFIRMED structure: obj.storage = [[serialNum, alias, statusCode], ...]
      // Status code "5" = normal/online for storage devices.
      const parseDeviceArray = (arr: unknown[][], type: string): GrowattInverter[] =>
        arr.map((d) => ({
          serialNum:  String((d as unknown[])[0] ?? `${type.toUpperCase()}-${plantId}`),
          capacity:   5000, // overridden from plant nominalPower in sync service
          status:     (d as unknown[])[2] === '5' || (d as unknown[])[2] === 5 ? 1 : 0,
          deviceType: type,
        }));

      const allDevices: GrowattInverter[] = [
        ...parseDeviceArray((obj['storage'] as unknown[][]) ?? [], 'storage'),
        ...parseDeviceArray((obj['mix']     as unknown[][]) ?? [], 'mix'),
        ...parseDeviceArray((obj['inv']     as unknown[][]) ?? [], 'inv'),
        ...parseDeviceArray((obj['tlx']     as unknown[][]) ?? [], 'tlx'),
        ...parseDeviceArray((obj['sph']     as unknown[][]) ?? [], 'sph'),
        ...parseDeviceArray((obj['spa']     as unknown[][]) ?? [], 'spa'),
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

      const result: GrowattPlantData = {
        pac:               0,    // real-time value requires per-device query (getStorageData)
        vac1:              230,  // real-time value requires per-device query
        batteryPercentage: null,
        temperature:       null,
        eTotal:       parseFloat(String(obj['eTotal']       ?? '0')),
        nominalPower: parseFloat(String(obj['nominalPower'] ?? '0')),
        city:         (obj['city']    as string | null) ?? null,
        country:      (obj['country'] as string | null) ?? null,
        lat:          obj['lat'] != null ? parseFloat(String(obj['lat'])) : null,
        lng:          obj['lng'] != null ? parseFloat(String(obj['lng'])) : null,
      };

      logger.info(
        `📊 Plant ${plantId}: City=${result.city}, Capacity=${result.nominalPower}W, Total=${result.eTotal}kWh`
      );
      return result;
    } catch (error) {
      logger.error(`❌ Failed to fetch plant data for ${plantId}:`, error);
      throw error;
    }
  }

  /** Fetches static plant detail — used internally by getPlantList and getPlantData. */
  async getPlantDetail(plantId: string): Promise<Record<string, unknown> | null> {
    await growattAuth.login();

    try {
      const response = await fetch(`${env.GROWATT_BASE_URL}/panel/getPlantData`, {
        method: 'POST',
        headers: growattAuth.getHeaders(),
        body: new URLSearchParams({ plantId }).toString(),
      });

      const text = await response.text();
      const data = this.parseJsonOrThrow(text, `getPlantData:${plantId}`) as Record<string, unknown>;
      return (data['obj'] as Record<string, unknown> | null) ?? null;
    } catch (error) {
      logger.error(`Failed to fetch plant detail for ${plantId}:`, error);
      return null;
    }
  }
async getPlantEnergyData(plantId: string): Promise<{
  pac: number;
  eToday: number;
  eTotal: number;
  eMonth: number;
  status: number;
}> {
  await growattAuth.login();

  // Try plant-level energy endpoints — these work regardless of device type
  const endpoints = [
    { path: '/panel/getPlantData',         key: 'obj' },
    { path: '/index/getEnergyStorageData', key: 'obj' },
    { path: '/panel/getEnergyData',        key: 'obj' },
  ];

  for (const ep of endpoints) {
    try {
      const response = await fetch(`${env.GROWATT_BASE_URL}${ep.path}`, {
        method: 'POST',
        headers: growattAuth.getHeaders(),
        body: new URLSearchParams({ plantId }).toString(),
      });

      const text = await response.text();
      if (text.trimStart().startsWith('<')) continue;

      const data = JSON.parse(text) as Record<string, unknown>;
      const obj = (data[ep.key] ?? {}) as Record<string, unknown>;

      const pac    = parseFloat(String(obj['pac']    ?? obj['currentPower'] ?? '0'));
      const eToday = parseFloat(String(obj['eToday'] ?? obj['todayEnergy']  ?? '0'));
      const eTotal = parseFloat(String(obj['eTotal'] ?? obj['totalEnergy']  ?? '0'));
      const eMonth = parseFloat(String(obj['eMonth'] ?? obj['monthEnergy']  ?? '0'));
      const status = parseInt(String(obj['status']   ?? obj['plantStatus']  ?? '0'), 10);

      logger.info(`⚡ Plant ${plantId}: pac=${pac}W eToday=${eToday}kWh eTotal=${eTotal}kWh status=${status}`);
      return { pac, eToday, eTotal, eMonth, status };
    } catch {
      continue;
    }
  }

  logger.warn(`⚠️  Could not fetch energy data for plant ${plantId} — returning zeros`);
  return { pac: 0, eToday: 0, eTotal: 0, eMonth: 0, status: 0 };
}
}

export const growattService = new GrowattService();