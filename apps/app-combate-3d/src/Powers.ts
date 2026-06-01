export interface PowerState {
  dash: number;
  shield: number;
  attract: number;
  repel: number;
  invis: number;
  teleport: number;
}

const COOLDOWNS: PowerState = {
  dash: 3,
  shield: 10,
  attract: 8,
  repel: 6,
  invis: 10,
  teleport: 7,
};

const DURATIONS: Partial<PowerState> = {
  shield: 3,
  attract: 2.5,
  invis: 4,
};

export type PowerKey = keyof PowerState;

export class Powers {
  private timers: PowerState = { dash: 0, shield: 0, attract: 0, repel: 0, invis: 0, teleport: 0 };
  private activeTimers: Partial<PowerState> = {};

  shieldActive = false;
  attractActive = false;
  invisActive = false;

  update(dt: number) {
    for (const key of Object.keys(this.timers) as PowerKey[]) {
      if (this.timers[key] > 0) this.timers[key] = Math.max(0, this.timers[key] - dt);
    }
    for (const key of Object.keys(this.activeTimers) as PowerKey[]) {
      if (this.activeTimers[key] !== undefined) {
        this.activeTimers[key] = Math.max(0, this.activeTimers[key]! - dt);
        if (this.activeTimers[key]! <= 0) this.deactivate(key);
      }
    }
  }

  canUse(key: PowerKey): boolean {
    return this.timers[key] <= 0;
  }

  use(key: PowerKey): boolean {
    if (!this.canUse(key)) return false;
    this.timers[key] = COOLDOWNS[key];
    const dur = DURATIONS[key];
    if (dur !== undefined) {
      this.activeTimers[key] = dur;
    }
    switch (key) {
      case 'shield': this.shieldActive = true; break;
      case 'attract': this.attractActive = true; break;
      case 'invis': this.invisActive = true; break;
    }
    return true;
  }

  private deactivate(key: PowerKey) {
    delete this.activeTimers[key];
    switch (key) {
      case 'shield': this.shieldActive = false; break;
      case 'attract': this.attractActive = false; break;
      case 'invis': this.invisActive = false; break;
    }
  }

  getCooldown(key: PowerKey): number {
    return Math.ceil(this.timers[key] * 10) / 10;
  }

  getCooldownFraction(key: PowerKey): number {
    if (this.timers[key] <= 0) return 0;
    const total = COOLDOWNS[key];
    return this.timers[key] / total;
  }

  isActive(key: PowerKey): boolean {
    return this.activeTimers[key] !== undefined && this.activeTimers[key]! > 0;
  }
}
