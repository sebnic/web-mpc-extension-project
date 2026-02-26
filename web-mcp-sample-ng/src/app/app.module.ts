import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';

import { AppComponent } from './app.component';
import { TopbarComponent } from './components/topbar/topbar.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { ActivityLogComponent } from './components/activity-log/activity-log.component';

@NgModule({
  declarations: [
    AppComponent,
    TopbarComponent,
    SidebarComponent,
    DashboardComponent,
    ActivityLogComponent,
  ],
  imports: [
    BrowserModule,
    CommonModule,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
