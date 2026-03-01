import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Device, AuditLog, DeviceMessage } from '../models/device.model';
import { MOCK_DEVICES, MOCK_AUDIT_LOGS, MOCK_MESSAGES } from '../data/lo-mock-data';

@Injectable({ providedIn: 'root' })
export class LoDeviceService {

  private readonly _selectedDevice$ = new BehaviorSubject<Device | null>(null);
  readonly selectedDevice$: Observable<Device | null> = this._selectedDevice$.asObservable();

  // ── Devices ──────────────────────────────────────────────────────────────

  getAll(): Device[] {
    return MOCK_DEVICES;
  }

  findById(deviceId: string): Device | undefined {
    return MOCK_DEVICES.find(d => d.id === deviceId);
  }

  // ── Audit logs ────────────────────────────────────────────────────────────

  getAuditLogs(deviceId: string, since?: string, limit = 20): AuditLog[] {
    const logs = MOCK_AUDIT_LOGS[deviceId] ?? [];
    let filtered = logs;
    if (since) {
      const sinceDate = new Date(since);
      filtered = logs.filter(l => new Date(l.timestamp) >= sinceDate);
    }
    return filtered.slice(0, limit);
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  getMessages(deviceId: string, limit = 10): DeviceMessage[] {
    return (MOCK_MESSAGES[deviceId] ?? []).slice(0, limit);
  }

  // ── Selection state ───────────────────────────────────────────────────────

  selectDevice(deviceId: string | null): void {
    const device = deviceId ? this.findById(deviceId) ?? null : null;
    this._selectedDevice$.next(device);
  }

  getSelectedDevice(): Device | null {
    return this._selectedDevice$.getValue();
  }
}
