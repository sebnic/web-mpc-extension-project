export type DeviceConnectivity = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
export type DeviceType = 'MQTT' | 'LORA' | 'LWM2M';
export type LogLevel = 'INFO' | 'WARNING' | 'ERROR';

export interface Device {
  id: string;
  name: string;
  group: string;
  tags: string[];
  type: DeviceType;
  status: {
    connectivity: {
      value: DeviceConnectivity;
      since: string;
    };
  };
  interfaces: { connector: string; nodeId: string }[];
  properties: {
    firmware: string;
    model: string;
    location: string;
  };
  lastSeen: string;
  created: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  type: string;
  level: LogLevel;
  message: string;
  details: Record<string, unknown>;
}

export interface DeviceMessage {
  id: string;
  timestamp: string;
  streamId: string;
  value: Record<string, unknown>;
}
