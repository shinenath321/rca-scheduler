import { Component, OnInit } from '@angular/core';
import { SchedulerService } from '../app/services/scheduler.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-scheduler',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scheduler.component.html',
})
export class SchedulerComponent implements OnInit {
  incidentId = '';
  ownerBU = ''; // bound to dropdown
  ownerBUs = [
    'i18n',
    'SecOps',
    'DevOps',
    'Engage',
    'Razorpay1',
    'Checkout',
    'DataEngineering',
    'Payments',
    'RazorpayX'
  ];

  constructor(private schedulerService: SchedulerService) {}

  ngOnInit() {
    const googleAccessToken = localStorage.getItem('googleAccessToken');
    if (!googleAccessToken) {
      window.location.href = '/login';
    }
  }

  scheduleRCA() {
    const googleAccessToken = localStorage.getItem('googleAccessToken');
    if (!googleAccessToken) {
      alert('Please login first');
      window.location.href = '/login';
      return;
    }

    if (!this.incidentId) {
      alert('Please fill the incident ID');
      return;
    }

    if (!this.ownerBU) {
      alert('Please select an Owner BU');
      return;
    }

    const payload = {
      googleAccessToken,
      incidentId: this.incidentId,
      ownerBU: this.ownerBU // ✅ new field
    };

    this.schedulerService.scheduleRCA(payload).subscribe({
      next: (res) => {
        
const date = res.event.scheduledDate;
        const time = res.event.scheduledStartTime;

        alert(`RCA meeting has been successfully scheduled on ${date} at ${time}`);
        this.logout();
      },
      error: (err) => {
        alert('Error: ' + err.message);
      },
    });
  }

  logout() {
    localStorage.removeItem('googleAccessToken');
    window.location.href = '/login';
  }
}