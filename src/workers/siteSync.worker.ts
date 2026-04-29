import { Job } from 'bullmq';
import { supabaseAdmin } from '@/config/supabase.js';
import { logger } from '@/utils/logger.js';
import { enhancedGrowattService } from '@/integrations/growatt/growatt.service.enhanced.js';

interface SiteSyncJob {
  // Empty for now - sync all sites
}

export async function processSiteSync(job: Job<SiteSyncJob>): Promise<void> {
  try {
    logger.info('🔄 Starting site synchronization from Growatt...');

    // Fetch all plants from Growatt
    const plants = await enhancedGrowattService.getPlantList();
    logger.info(`Found ${plants.length} plants in Growatt`);

    let syncedSites = 0;
    let syncedInverters = 0;

    for (const plant of plants) {
      try {
        // FETCH REAL-TIME STATUS FROM GROWATT
        let actualStatus = 'offline';
        let power = 0;
        
        try {
          const plantData = await enhancedGrowattService.getPlantData(plant.plantId);
          power = plantData.pac;
          
          if (power > 100) {
            actualStatus = 'online';
          } else if (power > 0) {
            actualStatus = 'warning';
          }
          
          logger.info(`${plant.plantName}: Power=${power}W, Status=${actualStatus}`);
        } catch (error) {
          logger.warn(`Could not fetch real-time data for ${plant.plantName}, defaulting to offline`);
        }

        // Check if site exists
        const { data: existingSite } = await supabaseAdmin
          .from('sites')
          .select('id')
          .eq('growatt_site_id', plant.plantId)
          .maybeSingle();

        let siteId: string;

        if (existingSite) {
          // Update existing site WITH REAL STATUS
          const { error: updateError } = await supabaseAdmin
            .from('sites')
            .update({
              name: plant.plantName,
              location: plant.location,
              status: actualStatus,
              last_online_at: actualStatus === 'online' ? new Date().toISOString() : undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingSite.id);

          if (updateError) {
            logger.error(`Error updating site ${plant.plantName}:`, updateError);
            continue;
          }

          siteId = existingSite.id;
          logger.info(`✅ Updated site: ${plant.plantName} (${actualStatus})`);
        } else {
          // Create new site WITH REAL STATUS
          const { data: newSite, error: insertError } = await supabaseAdmin
            .from('sites')
            .insert({
              growatt_site_id: plant.plantId,
              name: plant.plantName,
              location: plant.location,
              status: actualStatus,
              last_online_at: actualStatus === 'online' ? new Date().toISOString() : null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (insertError || !newSite) {
            logger.error(`❌ Error creating site ${plant.plantName}:`, insertError);
            continue;
          }

          siteId = newSite.id;
          logger.info(`✅ Created new site: ${plant.plantName} (${actualStatus}, ${power}W)`);
        }

        syncedSites++;

        // Fetch and sync inverters
        try {
          const inverters = await enhancedGrowattService.getDeviceList(plant.plantId);
          logger.info(`📡 Found ${inverters.length} inverters for ${plant.plantName}`);

          for (const inverter of inverters) {
            const { data: existingInverter } = await supabaseAdmin
              .from('inverters')
              .select('id')
              .eq('serial', inverter.serialNum)
              .maybeSingle();

            if (existingInverter) {
              await supabaseAdmin
                .from('inverters')
                .update({
                  site_id: siteId,
                  capacity: inverter.capacity,
                  status: inverter.status === 1 ? 'online' : 'offline',
                })
                .eq('id', existingInverter.id);

              logger.debug(`✅ Updated inverter: ${inverter.serialNum}`);
            } else {
              const { error: inverterError } = await supabaseAdmin
                .from('inverters')
                .insert({
                  site_id: siteId,
                  serial: inverter.serialNum,
                  capacity: inverter.capacity,
                  status: inverter.status === 1 ? 'online' : 'offline',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });

              if (!inverterError) {
                logger.info(`✅ Created inverter: ${inverter.serialNum}`);
                syncedInverters++;
              }
            }
          }
        } catch (inverterError) {
          logger.error(`Error fetching inverters for ${plant.plantName}:`, inverterError);
        }

        await job.updateProgress({
          current: syncedSites,
          total: plants.length,
        });
      } catch (error) {
        logger.error(`Error syncing plant ${plant.plantName}:`, error);
      }
    }

    logger.info(`✅ Site sync complete: ${syncedSites} sites synced, ${syncedInverters} inverters synced`);
  } catch (error) {
    logger.error('❌ Site synchronization failed:', error);
    throw error;
  }
}