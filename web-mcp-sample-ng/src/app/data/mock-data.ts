import { User } from '../models/user.model';
import { Document } from '../models/document.model';
import { Notification } from '../models/notification.model';
import { DashboardStats } from '../models/dashboard-stats.model';

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Alice Dupont',   email: 'alice@demo.fr',   role: 'Admin',       status: 'active',   avatar: '👩‍💼', lastLogin: '2026-02-20T09:14:00Z' },
  { id: 'u2', name: 'Bob Martin',     email: 'bob@demo.fr',     role: 'Développeur', status: 'active',   avatar: '👨‍💻', lastLogin: '2026-02-19T17:42:00Z' },
  { id: 'u3', name: 'Clara Lebrun',   email: 'clara@demo.fr',   role: 'Designer',    status: 'active',   avatar: '👩‍🎨', lastLogin: '2026-02-18T11:30:00Z' },
  { id: 'u4', name: 'David Petit',    email: 'david@demo.fr',   role: 'Manager',     status: 'pending',  avatar: '👨‍💼', lastLogin: '2026-02-15T08:00:00Z' },
  { id: 'u5', name: 'Emma Bernard',   email: 'emma@demo.fr',    role: 'Analyste',    status: 'inactive', avatar: '👩‍🔬', lastLogin: '2026-01-30T14:20:00Z' },
];

export const MOCK_DOCUMENTS: Document[] = [
  { id: 'd1', title: 'Rapport Q4 2025',            category: 'Finance',   author: 'Alice Dupont', date: '2026-01-15', size: '2.4 MB' },
  { id: 'd2', title: 'Spécifications API v3',      category: 'Technique', author: 'Bob Martin',   date: '2026-02-01', size: '840 KB' },
  { id: 'd3', title: 'Charte graphique 2026',      category: 'Design',    author: 'Clara Lebrun', date: '2026-02-10', size: '5.1 MB' },
  { id: 'd4', title: 'Plan stratégique 2026',      category: 'Direction', author: 'David Petit',  date: '2026-02-12', size: '1.2 MB' },
  { id: 'd5', title: 'Bilan de formation S1',      category: 'RH',        author: 'Emma Bernard', date: '2026-02-18', size: '380 KB' },
  { id: 'd6', title: 'Architecture microservices', category: 'Technique', author: 'Bob Martin',   date: '2026-02-19', size: '1.8 MB' },
];

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 'n1', type: 'info',    message: 'Mise à jour système prévue le 25/02',           read: false, date: '2026-02-20T08:00:00Z' },
  { id: 'n2', type: 'warning', message: '3 utilisateurs en attente de validation',        read: false, date: '2026-02-19T14:30:00Z' },
  { id: 'n3', type: 'success', message: 'Déploiement v3.2.1 effectué avec succès',        read: true,  date: '2026-02-18T16:00:00Z' },
  { id: 'n4', type: 'info',    message: 'Nouveau document partagé par Alice Dupont',      read: true,  date: '2026-02-17T10:15:00Z' },
];

export const DASHBOARD_STATS: DashboardStats = {
  totalUsers: 142,
  activeUsers: 98,
  documentsCount: 1247,
  openTickets: 14,
  serverLoad: '23%',
  lastBackup: '2026-02-20T03:00:00Z',
  uptime: '99.97%',
  storageUsed: '68%',
};
