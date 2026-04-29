import { growattService } from './growatt.service.js';
import { createCircuitBreaker } from './circuitBreaker.js';

class EnhancedGrowattService {
  private getPlantListBreaker = createCircuitBreaker(
    growattService.getPlantList.bind(growattService),
    'growatt-plant-list'
  );

  private getDeviceListBreaker = createCircuitBreaker(
    growattService.getDeviceList.bind(growattService),
    'growatt-device-list'
  );

  private getPlantDataBreaker = createCircuitBreaker(
    growattService.getPlantData.bind(growattService),
    'growatt-plant-data'
  );

  async getPlantList() {
    return await this.getPlantListBreaker.fire();
  }

  async getDeviceList(plantId: string) {
    return await this.getDeviceListBreaker.fire(plantId);
  }

  async getPlantData(plantId: string) {
    return await this.getPlantDataBreaker.fire(plantId);
  }

  
}

export const enhancedGrowattService = new EnhancedGrowattService();