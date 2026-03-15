import { Component, OnInit } from '@angular/core';
import { environment } from '../environments/environment';
import { SchedulerService } from './services/scheduler.service';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { RouterOutlet } from '@angular/router';

declare const google: any;

@Component({
  selector: 'app-root',
  imports: [FormsModule, RouterOutlet, HttpClientModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  userEmail = '';
  rcaLink = '';
  incidentNumber = '';
  sheet1Id = 'YOUR_SHEET1_ID';
  sheet2Id = 'YOUR_SHEET2_ID';

  tokenClient: any;
  accessToken: string | null = null;

  constructor(private schedulerService: SchedulerService) {}

  ngOnInit() {
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: environment.GOOGLE_CLIENT_ID,
      scope:
        'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      callback: (resp: any) => {
        if (resp.access_token) {
          this.accessToken = resp.access_token;
          console.log(this.accessToken);
        }
      },
    });
  }

  signIn() {
    this.tokenClient.requestAccessToken({ prompt: 'consent' });
  }

  scheduleMeeting() {
    if (!this.accessToken) {
      alert('Please sign in first!');
      return;
    }

    const payload = {
      accessToken: this.accessToken,
      sheet1Id: this.sheet1Id,
      sheet2Id: this.sheet2Id,
      incidentNumber: this.incidentNumber,
      rcaLink: this.rcaLink,
      organizerEmail: this.userEmail,
    };

    this.schedulerService.scheduleRCA(payload).subscribe({
      next: (res) => alert(res.message),
      error: (err) => alert('Error: ' + err.message),
    });
  }
}
