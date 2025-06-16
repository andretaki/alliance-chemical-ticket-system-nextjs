// src/services/slaService.ts
import { db, slaPolicies, businessHours as businessHoursSchema } from '@/lib/db';
import { eq } from 'drizzle-orm';

interface BusinessHours {
  dayOfWeek: number;
  startTime: string; // HH:mm:ss
  endTime: string; // HH:mm:ss
}

class SlaService {
  private businessHours: BusinessHours[] = [];

  constructor() {
    this.loadBusinessHours();
  }

  private async loadBusinessHours() {
    this.businessHours = await db.query.businessHours.findMany({ where: eq(businessHoursSchema.isActive, true) });
    if (this.businessHours.length === 0) {
      console.warn("SLA Service: No active business hours configured. SLA calculations will be 24/7.");
    }
  }

  public async calculateDueDate(startDate: Date, minutesToAdd: number): Promise<Date> {
    if (this.businessHours.length === 0) {
      return new Date(startDate.getTime() + minutesToAdd * 60 * 1000);
    }

    let remainingMinutes = minutesToAdd;
    let currentDate = new Date(startDate.getTime());

    while (remainingMinutes > 0) {
      const dayConfig = this.businessHours.find(bh => bh.dayOfWeek === currentDate.getDay());

      if (dayConfig) {
        const startTime = new Date(currentDate);
        const [startH, startM] = dayConfig.startTime.split(':').map(Number);
        startTime.setHours(startH, startM, 0, 0);

        const endTime = new Date(currentDate);
        const [endH, endM] = dayConfig.endTime.split(':').map(Number);
        endTime.setHours(endH, endM, 0, 0);

        if (currentDate < startTime) {
          currentDate = startTime; // Move to start of business day
        }

        if (currentDate < endTime) {
          const minutesLeftInDay = (endTime.getTime() - currentDate.getTime()) / (1000 * 60);
          const minutesToProcess = Math.min(remainingMinutes, minutesLeftInDay);
          
          currentDate.setMinutes(currentDate.getMinutes() + minutesToProcess);
          remainingMinutes -= minutesToProcess;
        }
      }
      
      if (remainingMinutes > 0) {
        // Move to the start of the next day
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(0, 0, 0, 0);
      }
    }

    return currentDate;
  }
}

export const slaService = new SlaService(); 