import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { User, UserStatus } from '../models/user.model';
import { MOCK_USERS } from '../data/mock-data';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly users: User[] = JSON.parse(JSON.stringify(MOCK_USERS)) as User[];
  private readonly _users$ = new BehaviorSubject<User[]>([...this.users]);

  readonly users$: Observable<User[]> = this._users$.asObservable();

  findById(userId: string): User | undefined {
    return this.users.find(u => u.id === userId);
  }

  findByName(name: string): User | undefined {
    return this.users.find(u => u.name.toLowerCase().includes(name.toLowerCase()));
  }

  getAll(): User[] {
    return [...this.users];
  }

  updateStatus(userId: string, status: UserStatus): { oldStatus: UserStatus; user: User } | null {
    const user = this.users.find(u => u.id === userId);
    if (!user) return null;
    const oldStatus = user.status;
    user.status = status;
    this._users$.next([...this.users]);
    return { oldStatus, user };
  }
}
