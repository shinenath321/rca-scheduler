import { Routes } from '@angular/router';
import { SchedulerComponent } from '../scheduler/scheduler.component';
import { LoginComponent } from '../login/login.component';
import { AuthGuard } from './auth.guard';

export const routes: Routes = [
    { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'schedule', component: SchedulerComponent, canActivate: [AuthGuard] },    
];
