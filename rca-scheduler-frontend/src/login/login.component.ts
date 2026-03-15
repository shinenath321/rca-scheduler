import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../environments/environment';


declare const google: any;

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class LoginComponent implements OnInit {
  tokenClient: any;

  constructor(private router: Router) {}

  ngOnInit() {
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: environment.GOOGLE_CLIENT_ID,
      scope:
        'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/documents.readonly https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      callback: (resp: any) => {
        if (resp.access_token) {
          localStorage.setItem('googleAccessToken', resp.access_token);
          this.router.navigate(['/schedule']);
        }
      },
    });
  }

  signIn() {
    this.tokenClient.requestAccessToken({ prompt: 'consent' });
  }
}
