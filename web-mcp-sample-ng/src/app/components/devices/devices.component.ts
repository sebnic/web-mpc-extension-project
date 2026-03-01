import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { Device, AuditLog, DeviceMessage } from '../../models/device.model';
import { LoDeviceService } from '../../services/lo-device.service';

@Component({
  selector: 'app-devices',
  templateUrl: './devices.component.html',
  styleUrls: ['./devices.component.css'],
})
export class DevicesComponent implements OnInit {

  devices: Device[] = [];
  selectedDevice$!: Observable<Device | null>;

  constructor(private readonly loDeviceService: LoDeviceService) {}

  ngOnInit(): void {
    this.devices = this.loDeviceService.getAll();
    this.selectedDevice$ = this.loDeviceService.selectedDevice$;
  }

  selectDevice(device: Device): void {
    this.loDeviceService.selectDevice(device.id);
  }

  isSelected(device: Device): boolean {
    return this.loDeviceService.getSelectedDevice()?.id === device.id;
  }

  getAuditLogs(deviceId: string): AuditLog[] {
    return this.loDeviceService.getAuditLogs(deviceId);
  }

  getMessages(deviceId: string): DeviceMessage[] {
    return this.loDeviceService.getMessages(deviceId);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  payloadString(value: Record<string, unknown>): string {
    return JSON.stringify(value, null, 2);
  }
}
